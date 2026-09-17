import "./loadEnv";
import { sql } from "../lib/db/client";

// Diagnostic: for each topic centroid, what does the feed's retrieval (the HNSW
// inner-product index, ORDER BY embedding <#> centroid) actually surface? This
// is the real test of whether picking a topic skews the feed. Read-only.
// Run: npx tsx scripts/try-topic-retrieval.ts [topicId ...]

async function main() {
  const only = process.argv.slice(2);
  const topics = await sql<{ id: string; label: string; centroid: string }[]>`
    select id, label, centroid from topics
    ${only.length ? sql`where id in ${sql(only)}` : sql``}
    order by sort_order
  `;

  for (const t of topics) {
    const rows = await sql<{ text: string; sim: number }[]>`
      select text, (-(embedding <#> ${t.centroid}::vector))::float8 as sim
      from questions
      order by embedding <#> ${t.centroid}::vector
      limit 6
    `;
    console.log(`\n=== ${t.label} (${t.id}) ===`);
    for (const r of rows) {
      console.log(`  ${r.sim.toFixed(3)}  ${r.text.slice(0, 78)}`);
    }
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
