import "./loadEnv";
import { sql } from "../lib/db/client";

async function main() {
  const groups = await sql<{ normalizedText: string; count: number }[]>`
    select
      lower(regexp_replace(btrim(text), '\\s+', ' ', 'g')) as "normalizedText",
      count(*)::int as count
    from questions
    group by lower(regexp_replace(btrim(text), '\\s+', ' ', 'g'))
    having count(*) > 1
    order by count(*) desc
  `;

  console.log(
    JSON.stringify(
      {
        duplicateGroups: groups.length,
        surplusRows: groups.reduce((total, group) => total + group.count - 1, 0),
      },
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
