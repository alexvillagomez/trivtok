import "./loadEnv"; // must be first: loads DATABASE_URL before the client is built
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "../lib/db/client";

// Apply pending .sql files in supabase/migrations in filename order, exactly
// once each. Applied files are recorded in schema_migrations so re-running is
// safe. Each migration runs in a transaction together with its bookkeeping
// insert, so a failure rolls back cleanly and can be retried.
// Run: npm run migrate
const DIR = "supabase/migrations";

async function main() {
  await sql`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const appliedRows = await sql<{ filename: string }[]>`select filename from schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();

  // Bootstrap: a DB created before migration tracking existed has the init
  // schema but an empty ledger. If the `questions` table is already there,
  // mark the init migration applied instead of trying to recreate it.
  if (applied.size === 0) {
    const [{ t }] = await sql<{ t: string | null }[]>`select to_regclass('public.questions') as t`;
    if (t) {
      const initFile = files.find((f) => /^0001/.test(f));
      if (initFile) {
        await sql`insert into schema_migrations (filename) values (${initFile}) on conflict do nothing`;
        applied.add(initFile);
        console.log(`bootstrap: ${initFile} already present, marking as applied`);
      }
    }
  }

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }
    console.log(`applying ${file}...`);
    const text = await readFile(join(DIR, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (filename) values (${file})`;
    });
    count++;
  }

  console.log(`Done. Applied ${count} new migration(s); ${applied.size} already present.`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
