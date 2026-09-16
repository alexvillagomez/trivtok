import "./loadEnv";
import { sql } from "../lib/db/client";

// Remove exact-duplicate questions (same `text`), keeping the earliest-created
// row of each group. Interactions reference questions via FK; we keep the row
// most likely already referenced (oldest) and delete the newer copies.
async function main() {
  const before = await sql`select count(*)::int as n from questions`;
  const deleted = await sql`
    delete from questions q
    using (
      select id from (
        select id, row_number() over (
          partition by text order by created_at asc, id asc
        ) as rn
        from questions
      ) ranked
      where ranked.rn > 1
    ) dup
    where q.id = dup.id
    returning q.id
  `;
  const after = await sql`select count(*)::int as n from questions`;
  console.log(`Before: ${before[0].n}, deleted: ${deleted.length}, after: ${after[0].n}`);
  await sql.end();
}
main();
