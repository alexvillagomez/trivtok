import "./loadEnv"; // must be first: loads keys before clients are built
import { sql } from "../lib/db/client";

// One-off: inspect a question by id (read-only).
// Usage: npx tsx scripts/find-question.ts <uuid>

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: npx tsx scripts/find-question.ts <uuid>");
    process.exit(1);
  }
  const rows = await sql`
    select id, text, choices, correct_index, difficulty, like_count, dislike_count, created_at
    from questions where id = ${id}
  `;
  if (rows.length === 0) {
    console.log("No question found with id", id);
  } else {
    const q = rows[0];
    console.log(JSON.stringify(q, null, 2));
    console.log("\nCorrect answer:", q.choices[q.correct_index]);
  }
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
