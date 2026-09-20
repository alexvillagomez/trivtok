import "./loadEnv";
import { readFile } from "node:fs/promises";
import { embedAndCompress, embeddingInput } from "../lib/embeddings/embed";
import { sql } from "../lib/db/client";
import { validateAuthoredQuestion, type QuestionShape } from "../lib/questions/validate";

type Replacement = { file: string; index: number; oldStem: string };
type Prepared = { id: string; question: QuestionShape; file: string; index: number };

// Apply stem-only corrections in one embedding batch while preserving question IDs,
// answer choices, and existing response history.
// Usage: node --import tsx scripts/replace-authored-questions-batch.ts <manifest.json>
async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error("Expected a replacement manifest path.");
  const entries = JSON.parse(await readFile(manifestPath, "utf8")) as Replacement[];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("The replacement manifest must contain at least one entry.");
  }

  const files = new Map<string, QuestionShape[]>();
  const prepared: Prepared[] = [];
  for (const entry of entries) {
    if (!entry.file || !Number.isInteger(entry.index) || entry.index < 1 || !entry.oldStem) {
      throw new Error(`Invalid replacement entry: ${JSON.stringify(entry)}`);
    }
    if (!files.has(entry.file)) {
      files.set(entry.file, JSON.parse(await readFile(entry.file, "utf8")) as QuestionShape[]);
    }
    const question = files.get(entry.file)?.[entry.index - 1];
    if (!question) throw new Error(`${entry.file} #${entry.index} is absent.`);
    const invalid = validateAuthoredQuestion(question);
    if (invalid) throw new Error(`${entry.file} #${entry.index}: ${invalid}`);
    if (question.text === entry.oldStem) {
      throw new Error(`${entry.file} #${entry.index}: the stem has not changed.`);
    }

    const matches = await sql<{ id: string; choices: string[]; correct_index: number }[]>`
      select id, choices, correct_index from questions where text = ${entry.oldStem}
    `;
    if (matches.length === 0) {
      const alreadyCorrected = await sql`select id from questions where text = ${question.text} limit 1`;
      console.log(`${entry.file} #${entry.index}: ${alreadyCorrected.length ? "already corrected" : "not live"}; skipped.`);
      continue;
    }
    if (matches.length !== 1) {
      throw new Error(`${entry.file} #${entry.index}: expected one old-stem row, found ${matches.length}.`);
    }
    const row = matches[0];
    if (JSON.stringify(row.choices) !== JSON.stringify(question.choices) ||
        row.correct_index !== question.correctIndex) {
      throw new Error(`${entry.file} #${entry.index}: the live choices or answer index differ.`);
    }
    const duplicates = await sql`select id from questions where text = ${question.text} limit 1`;
    if (duplicates.length) {
      throw new Error(`${entry.file} #${entry.index}: replacement stem is already live.`);
    }
    prepared.push({ id: row.id, question, file: entry.file, index: entry.index });
  }

  if (prepared.length === 0) {
    console.log("No live stems required updating.");
    return;
  }
  const embeddings = await embedAndCompress(prepared.map(({ question }) => embeddingInput(question)));
  for (const [index, item] of prepared.entries()) {
    await sql`
      update questions
      set text = ${item.question.text}, embedding = ${JSON.stringify(embeddings[index])}::vector
      where id = ${item.id}
    `;
    console.log(`Updated ${item.file} #${item.index} (${item.id}).`);
  }
  console.log(`Updated ${prepared.length} live stems without changing choices or answer indices.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
