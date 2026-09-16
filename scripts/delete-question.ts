import "./loadEnv"; // must be first: loads keys before clients are built
import { sql } from "../lib/db/client";

// One-off: delete a question by id, cleaning up its FK references first.
// impressions/interactions reference questions(id) with no ON DELETE CASCADE,
// so remove those rows in the same transaction. Usage:
//   npx tsx scripts/delete-question.ts <uuid>

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: npx tsx scripts/delete-question.ts <uuid>");
    process.exit(1);
  }

  const before = await sql`select id, text from questions where id = ${id}`;
  if (before.length === 0) {
    console.log("No question found with id", id, "— nothing to delete.");
    await sql.end();
    return;
  }

  const [{ interactions }] = await sql<{ interactions: number }[]>`
    select count(*)::int as interactions from interactions where question_id = ${id}
  `;
  const [{ impressions }] = await sql<{ impressions: number }[]>`
    select count(*)::int as impressions from impressions where question_id = ${id}
  `;
  console.log(
    `Deleting question ${id} (${interactions} interaction(s), ${impressions} impression(s) will also be removed).`,
  );

  await sql.begin(async (tx) => {
    await tx`delete from interactions where question_id = ${id}`;
    await tx`delete from impressions where question_id = ${id}`;
    await tx`delete from questions where id = ${id}`;
  });

  console.log("Deleted.");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
