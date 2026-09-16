import "./loadEnv";
import { readFile } from "node:fs/promises";
import { sql } from "../lib/db/client";

// One-off: the CS-fundamentals batch was authored with every correct answer in
// position 0. Shuffle each row's choice order in place (deterministically by id)
// and move correct_index to match. Embedding = stem+correct answer, so it is
// unaffected by choice ordering.

type Authored = { text: string };

function shuffledOrder(seed: number): number[] {
  // deterministic Fisher-Yates over [0,1,2,3] using a tiny LCG
  const idx = [0, 1, 2, 3];
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function main() {
  const file = process.argv[2];
  const authored = JSON.parse(await readFile(file, "utf8")) as Authored[];
  const texts = authored.map((q) => q.text);

  const rows = await sql<
    { id: string; choices: string[]; correct_index: number }[]
  >`select id, choices, correct_index from questions where text = any(${texts})`;

  let changed = 0;
  const dist: Record<number, number> = {};
  for (const row of rows) {
    const order = shuffledOrder(hash(row.id));
    const newChoices = order.map((k) => row.choices[k]);
    const newCorrect = order.indexOf(row.correct_index);
    dist[newCorrect] = (dist[newCorrect] ?? 0) + 1;
    if (newCorrect !== row.correct_index || order.some((v, i) => v !== i)) {
      await sql`update questions set choices = ${newChoices}, correct_index = ${newCorrect} where id = ${row.id}`;
      changed++;
    }
  }
  console.log(`Matched ${rows.length} rows, updated ${changed}. New correct_index dist:`, dist);
  await sql.end();
}

main();
