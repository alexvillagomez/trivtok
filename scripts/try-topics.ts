import "./loadEnv"; // MUST be first: DB client reads env at import time.

import { sql } from "../lib/db/client";
import { dot } from "../lib/vector";

// Smoke test for the seeded topics: every centroid should be unit-length, and a
// sample question should map to a sensible nearest topic. Read-only.
//
// Run (after seed-topics.ts): npx tsx scripts/try-topics.ts

async function main() {
  const topics = await sql<{ id: string; label: string; centroid: string }[]>`
    select id, label, centroid from topics order by sort_order
  `;
  console.log(`topics: ${topics.length}`);
  if (topics.length === 0) throw new Error("no topics — run seed-topics.ts first");

  for (const t of topics) {
    const c = JSON.parse(t.centroid) as number[];
    const norm = Math.sqrt(dot(c, c));
    const ok = Math.abs(norm - 1) < 1e-6 ? "ok" : "BAD";
    console.log(`  ${t.id.padEnd(14)} ‖c‖=${norm.toFixed(6)} ${ok}`);
  }

  // Nearest-topic sanity check for a few sample questions.
  const samples = await sql<{ text: string; embedding: string }[]>`
    select text, embedding from questions order by random() limit 5
  `;
  console.log("\nnearest topic for 5 random questions:");
  for (const q of samples) {
    const e = JSON.parse(q.embedding) as number[];
    let best = topics[0];
    let bestSim = -Infinity;
    for (const t of topics) {
      const sim = dot(JSON.parse(t.centroid) as number[], e);
      if (sim > bestSim) {
        bestSim = sim;
        best = t;
      }
    }
    console.log(`  [${best.label}] (${bestSim.toFixed(3)})  ${q.text.slice(0, 70)}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
