import "./loadEnv"; // must be first: loads keys before clients are built
import { embedDedup, embeddingInput } from "../lib/embeddings/embed";
import { sql } from "../lib/db/client";

// One-time (resumable) backfill of the 256-D `embedding_256` near-dup vector
// (migration 0014) for questions that predate it. Embeds the SAME
// "stem + correct answer" text used everywhere else. Safe to re-run: it only
// touches rows where embedding_256 is still NULL, so an interrupted run just
// continues. The only API call is the embedding.
//
// Usage: npx tsx scripts/backfill-dedup-embeddings.ts

const CHUNK = 256; // matches the OpenAI embed batch size

type Row = { id: string; text: string; choices: string[]; correct_index: number };

async function main() {
  const [{ total }] = await sql<{ total: number }[]>`
    select count(*)::int as total from questions where embedding_256 is null
  `;
  console.log(`Rows needing embedding_256: ${total}`);
  if (total === 0) {
    await sql.end();
    return;
  }

  let done = 0;
  // Always pull the next NULL rows; each committed chunk shrinks the pending set.
  for (;;) {
    const rows = await sql<Row[]>`
      select id, text, choices, correct_index
      from questions
      where embedding_256 is null
      order by created_at asc
      limit ${CHUNK}
    `;
    if (rows.length === 0) break;

    const vecs = await embedDedup(
      rows.map((r) =>
        embeddingInput({ text: r.text, choices: r.choices, correctIndex: r.correct_index }),
      ),
    );

    // One set-based UPDATE per chunk (join id -> vector via unnest) instead of a
    // round-trip per row — the DB write, not the API, is the bottleneck.
    const ids = rows.map((r) => r.id);
    const payloads = vecs.map((v) => JSON.stringify(v));
    await sql`
      update questions q
      set embedding_256 = data.vec::vector
      from (
        select unnest(${ids}::uuid[]) as id, unnest(${payloads}::text[]) as vec
      ) as data
      where q.id = data.id
    `;

    done += rows.length;
    console.log(`  ${done}/${total} (${((done / total) * 100).toFixed(1)}%)`);
  }

  console.log("Backfill complete.");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
