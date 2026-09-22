import "./loadEnv"; // must be first: loads keys before clients are built
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { embedAndCompress, embedDedup, embeddingInput } from "../lib/embeddings/embed";
import { insertQuestions, type QuestionSeed } from "../lib/db/questions";
import { inBatchDuplicates, findExistingDuplicate } from "../lib/db/dedup";
import { validateAuthoredQuestion } from "../lib/questions/validate";
import { sql } from "../lib/db/client";

// Batch importer for the periodic job: import EVERY data/production/*-001.json
// that isn't already recorded in the state file, in ONE node process (no shell
// loop around npx). Reuses the exact insert-authored gate: structural/giveaway
// validation -> OpenAI embed (64d + 256d) -> in-batch + bank near-dup lever ->
// insert. Idempotent: a file is recorded only after it inserts without throwing,
// and the bank-dup lever protects against accidental re-import.

type Authored = { text: string; choices: string[]; correctIndex: number; difficulty: number };

const PROD_DIR = resolve(process.cwd(), "data/production");
const STATE = process.argv[2] ?? resolve(process.cwd(), ".import-state.txt");

async function loadState(): Promise<Set<string>> {
  try {
    const txt = await readFile(STATE, "utf8");
    return new Set(txt.split("\n").map((s) => s.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function importFile(path: string): Promise<{ inserted: number; skipped: number }> {
  const raw = JSON.parse(await readFile(path, "utf8")) as Authored[];
  const valid = raw.filter((q, i) => {
    const reason = validateAuthoredQuestion(q);
    if (reason) console.warn(`  dropped #${i} — ${reason}`);
    return reason === null;
  });
  if (valid.length === 0) return { inserted: 0, skipped: 0 };

  const inputs = valid.map(embeddingInput);
  const [embeddings, dedupVecs] = await Promise.all([embedAndCompress(inputs), embedDedup(inputs)]);
  const answers = valid.map((q) => q.choices[q.correctIndex]);
  const droppedInBatch = inBatchDuplicates(dedupVecs, answers);

  const seeds: QuestionSeed[] = [];
  let skipped = 0;
  for (let i = 0; i < valid.length; i++) {
    if (droppedInBatch.get(i) !== undefined) { skipped++; continue; }
    const hit = await findExistingDuplicate(dedupVecs[i], answers[i]);
    if (hit) { skipped++; continue; }
    seeds.push({
      text: valid[i].text,
      choices: valid[i].choices,
      correctIndex: valid[i].correctIndex,
      difficulty: valid[i].difficulty,
      embedding: embeddings[i],
      embedding256: dedupVecs[i],
    });
  }
  const inserted = await insertQuestions(seeds);
  return { inserted, skipped };
}

/** Basenames Codex already marked `inserted` in its ledger — skip WITHOUT embedding. */
async function ledgerInserted(): Promise<string[]> {
  try {
    const led = JSON.parse(await readFile(resolve(PROD_DIR, "assignment-ledger.json"), "utf8"));
    return (led.assignments ?? [])
      .filter((a: { status?: string }) => a.status === "inserted")
      .map((a: { file: string }) => a.file.split(/[\\/]/).pop() as string);
  } catch {
    return [];
  }
}

async function main() {
  const done = await loadState();
  // Cooperate with Codex's own importer: fold its ledger-inserted files into our
  // done-set so we never pay embeddings to rediscover an already-imported file.
  const codexDone = await ledgerInserted();
  const before = done.size;
  for (const b of codexDone) done.add(b);
  if (done.size !== before) {
    await writeFile(STATE, [...done].sort().join("\n") + "\n", "utf8");
    console.log(`Folded ${done.size - before} ledger-inserted file(s) into state (skipped free).`);
  }

  const files = readdirSync(PROD_DIR)
    .filter((f) => f.endsWith("-001.json"))
    .sort();
  const pending = files.filter((f) => !done.has(f));

  if (pending.length === 0) {
    console.log(`[${new Date().toISOString()}] no new files (state has ${done.size}).`);
    await sql.end();
    return;
  }

  console.log(`[${new Date().toISOString()}] ${pending.length} pending file(s).`);
  let totalIns = 0;
  for (const base of pending) {
    const path = resolve(PROD_DIR, base);
    try {
      const { inserted, skipped } = await importFile(path);
      done.add(base);
      await writeFile(STATE, [...done].sort().join("\n") + "\n", "utf8");
      totalIns += inserted;
      console.log(`  ✓ ${base}: inserted ${inserted}, skipped ${skipped}`);
    } catch (e) {
      console.error(`  ✗ ${base}: ${(e as Error).message} (will retry next pass)`);
    }
  }
  console.log(`Done. Inserted ${totalIns} this pass; state has ${done.size} files.`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await sql.end(); } catch {}
  process.exit(1);
});
