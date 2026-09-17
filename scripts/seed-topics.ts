import "./loadEnv"; // MUST be first: DB/OpenAI clients read env at import time.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { embedAndCompress } from "../lib/embeddings/embed";
import { sql } from "../lib/db/client";
import { normalize } from "../lib/vector";
import { EMBEDDING_DIM } from "../lib/types";

// Populate the `topics` table (migration 0009). Each broad interest's 64-D
// centroid is the AVERAGE of the embeddings of the real questions under its
// families — so the centroid sits inside its question cluster and the feed's
// retrieval (ORDER BY embedding <#> centroid) surfaces on-topic cards. Question
// membership comes from the source files grouped in data/topic-families.json,
// matched to DB rows by text (verified 1:1); embeddings are read straight from
// the DB, so nothing is re-embedded and there is no schema change.
//
// Fallback: a topic that matched no questions is embedded from its keyword
// `description` (OpenAI -> compressTo64) — the only path that hits the API.
//
// Idempotent (upsert by id). Run: npx tsx scripts/seed-topics.ts

type TopicSeed = {
  id: string;
  label: string;
  emoji: string;
  sortOrder: number;
  families: string[];
  description: string;
};

type Family = { id: string; files: string[] };

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), rel), "utf8")) as T;
}

/** Question texts belonging to a topic: union over its families' source files. */
function textsForTopic(topic: TopicSeed, families: Family[]): string[] {
  const prefixes = topic.families;
  const files = new Set<string>();
  for (const fam of families) {
    const prefix = fam.id.split(".")[0];
    if (prefixes.includes(prefix)) fam.files.forEach((f) => files.add(f));
  }
  const texts = new Set<string>();
  for (const file of files) {
    try {
      const qs = readJson<{ text: string }[]>(file);
      for (const q of qs) if (q?.text) texts.add(q.text);
    } catch {
      // a referenced file may be missing; skip it
    }
  }
  return [...texts];
}

/** Average of the DB embeddings of the given question texts, normalized. */
async function centroidFromTexts(texts: string[]): Promise<number[] | null> {
  if (texts.length === 0) return null;
  const rows = await sql<{ embedding: string }[]>`
    select embedding from questions where text in ${sql(texts)}
  `;
  if (rows.length === 0) return null;
  const sum = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const r of rows) {
    const e = JSON.parse(r.embedding) as number[];
    for (let i = 0; i < EMBEDDING_DIM; i++) sum[i] += e[i];
  }
  return normalize(sum);
}

async function main() {
  const { topics } = readJson<{ topics: TopicSeed[] }>("data/topics.json");
  const { families } = readJson<{ families: Family[] }>("data/topic-families.json");
  if (!topics?.length) throw new Error("data/topics.json has no topics");

  // Build centroids: prefer real question averages, fall back to the description.
  const centroids: number[][] = new Array(topics.length);
  const needsEmbed: number[] = [];
  for (let i = 0; i < topics.length; i++) {
    const texts = textsForTopic(topics[i], families);
    const c = await centroidFromTexts(texts);
    if (c) {
      centroids[i] = c;
      console.log(
        `  ${topics[i].id.padEnd(14)} averaged ${texts.length} questions`,
      );
    } else {
      needsEmbed.push(i);
      console.log(`  ${topics[i].id.padEnd(14)} no questions — embedding description`);
    }
  }
  if (needsEmbed.length > 0) {
    const embedded = await embedAndCompress(
      needsEmbed.map((i) => topics[i].description),
    );
    needsEmbed.forEach((i, k) => (centroids[i] = embedded[k]));
  }

  await sql.begin(async (tx) => {
    for (let i = 0; i < topics.length; i++) {
      const t = topics[i];
      await tx`
        insert into topics (id, label, emoji, centroid, sort_order)
        values (
          ${t.id}, ${t.label}, ${t.emoji},
          ${JSON.stringify(centroids[i])}::vector, ${t.sortOrder}
        )
        on conflict (id) do update set
          label = excluded.label,
          emoji = excluded.emoji,
          centroid = excluded.centroid,
          sort_order = excluded.sort_order
      `;
    }
  });

  console.log(`Seeded ${topics.length} topics.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
