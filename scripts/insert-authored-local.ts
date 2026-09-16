import "./loadEnv";
import { readFile } from "node:fs/promises";
import { insertQuestions, type QuestionSeed } from "../lib/db/questions";
import { validateAuthoredQuestion } from "../lib/questions/validate";
import type { Embedding } from "../lib/types";
import { normalize } from "../lib/vector";
import { sql } from "../lib/db/client";

// No-API importer for a tightly focused question batch. It derives each new
// question's recommendation vector from existing database questions matched by
// an anchor regex, then adds a small deterministic offset so the whole batch
// forms a coherent niche without every row receiving an identical vector.
//
// Usage:
//   node --import tsx scripts/insert-authored-local.ts <json> <anchor-regex>

type Authored = {
  text: string;
  choices: string[];
  correctIndex: number;
  difficulty: number;
};

type VectorRow = { embedding: string | number[] };

function normalizeQuestionText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseVector(value: string | number[]): Embedding {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function deriveEmbedding(question: Authored, anchors: Embedding[]): Embedding {
  const seed = hashText(`${question.text} ${question.choices[question.correctIndex]}`);
  const rand = seededRandom(seed);
  const blended = new Array<number>(anchors[0].length).fill(0);
  const selected = Math.min(4, anchors.length);

  for (let i = 0; i < selected; i++) {
    const anchor = anchors[Math.floor(rand() * anchors.length)];
    const weight = 0.75 + rand() * 0.5;
    for (let d = 0; d < blended.length; d++) blended[d] += weight * anchor[d];
  }

  const base = normalize(blended);
  const offset = normalize(base.map(() => rand() * 2 - 1));
  return normalize(base.map((value, i) => value + 0.08 * offset[i]));
}

async function main() {
  const [path, anchorRegex] = process.argv.slice(2);
  if (!path || !anchorRegex) {
    throw new Error(
      "usage: node --import tsx scripts/insert-authored-local.ts <json> <anchor-regex>",
    );
  }

  const authored = JSON.parse(await readFile(path, "utf8")) as Authored[];
  const existingRows = await sql<{ text: string }[]>`
    select text from questions
  `;
  const seen = new Set(existingRows.map((row) => normalizeQuestionText(row.text)));
  let skippedDuplicates = 0;
  let skippedInvalid = 0;
  const uniqueAuthored = authored.filter((question) => {
    const reason = validateAuthoredQuestion(question);
    if (reason) {
      console.warn(`Dropped "${question.text}" — ${reason}`);
      skippedInvalid += 1;
      return false;
    }
    const normalized = normalizeQuestionText(question.text);
    if (seen.has(normalized)) {
      skippedDuplicates += 1;
      return false;
    }
    seen.add(normalized);
    return true;
  });
  const anchorRows = await sql<VectorRow[]>`
    select embedding
    from questions
    where lower(text) ~ ${anchorRegex.toLowerCase()}
    order by created_at asc
    limit 32
  `;
  if (anchorRows.length === 0) {
    throw new Error(`No existing questions matched anchor regex: ${anchorRegex}`);
  }

  const anchors = anchorRows.map((row) => parseVector(row.embedding));
  const seeds: QuestionSeed[] = uniqueAuthored.map((question) => ({
    ...question,
    embedding: deriveEmbedding(question, anchors),
  }));

  const inserted = await insertQuestions(seeds);
  console.log(
    JSON.stringify(
      { path, inserted, skippedDuplicates, skippedInvalid, anchorCount: anchors.length },
      null,
      2,
    ),
  );
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
