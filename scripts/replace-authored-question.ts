import "./loadEnv";
import { readFile } from "node:fs/promises";
import { embedAndCompress, embedDedup, embeddingInput } from "../lib/embeddings/embed";
import { sql } from "../lib/db/client";
import { validateAuthoredQuestion, type QuestionShape } from "../lib/questions/validate";

// Replace one already-inserted question in place, preserving its ID and
// interaction history. The old stem must identify exactly one database row;
// choices and answer position must be unchanged so old responses remain valid.
// Usage: node --import tsx scripts/replace-authored-question.ts <file.json> <one-based-index> <old-stem>
async function main() {
  const [file, number, oldStem] = process.argv.slice(2);
  const index = Number(number) - 1;
  if (!file || !Number.isInteger(index) || index < 0 || !oldStem) {
    throw new Error("usage: replace-authored-question.ts <file.json> <one-based-index> <old-stem>");
  }

  const questions = JSON.parse(await readFile(file, "utf8")) as QuestionShape[];
  const question = questions[index];
  if (!question) throw new Error(`Question ${number} is absent from ${file}.`);
  const invalid = validateAuthoredQuestion(question);
  if (invalid) throw new Error(`Replacement question is invalid: ${invalid}`);
  if (question.text === oldStem) throw new Error("The stem has not changed.");

  const matches = await sql<{ id: string; choices: string[]; correct_index: number }[]>`
    select id, choices, correct_index from questions where text = ${oldStem}
  `;
  if (matches.length !== 1) {
    throw new Error(`Expected one database row for the old stem; found ${matches.length}.`);
  }
  const row = matches[0];
  if (JSON.stringify(row.choices) !== JSON.stringify(question.choices) ||
      row.correct_index !== question.correctIndex) {
    throw new Error("The database choices or answer position differ; refusing an in-place replacement.");
  }
  const duplicate = await sql`select id from questions where text = ${question.text} limit 1`;
  if (duplicate.length) throw new Error("The replacement stem is already in the database.");

  const input = embeddingInput(question);
  const [[embedding], [dedup]] = await Promise.all([
    embedAndCompress([input]),
    embedDedup([input]),
  ]);
  await sql`
    update questions
    set text = ${question.text},
        embedding = ${JSON.stringify(embedding)}::vector,
        embedding_256 = ${JSON.stringify(dedup)}::vector
    where id = ${row.id}
  `;
  console.log(`Updated question ${row.id} from ${file} #${number}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
