import "./loadEnv";
import { sql } from "../lib/db/client";

// Attribute the per-swipe latency of the new in-DB next_question(): how much is
// network round-trip vs actual in-database compute. Runs in a rolled-back tx.
const ROLLBACK = Symbol("rollback");
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function main() {
  // 1. bare round-trip baseline
  const rtt: number[] = [];
  for (let i = 0; i < 6; i++) { const t = performance.now(); await sql`select 1`; rtt.push(performance.now() - t); }
  console.log(`network round-trip (select 1):      ${avg(rtt).toFixed(0)}ms`);

  try {
    await sql.begin(async (tx) => {
      const user = crypto.randomUUID();
      const session = crypto.randomUUID();
      let [card] = await tx<any[]>`select * from next_question(${user}::uuid, ${session}::uuid)`;

      // 2. wall-clock for a full advance (client-observed: RTT + compute)
      const wall: number[] = [];
      for (let i = 0; i < 6; i++) {
        const t = performance.now();
        [card] = await tx<any[]>`
          select * from next_question(${user}::uuid, ${session}::uuid, ${card.question_id}::uuid,
            ${card.impression_id}::bigint, ${card.correct_index}::int, true, 4000::int, '{}'::uuid[])`;
        wall.push(performance.now() - t);
      }
      console.log(`next_question() wall-clock:          ${avg(wall).toFixed(0)}ms  (RTT + in-DB compute)`);

      // 3. pure in-DB execution time (no network) via EXPLAIN ANALYZE
      const ea = await tx<{ "QUERY PLAN": string }[]>`
        explain (analyze, buffers, timing off, summary on)
        select * from next_question(${user}::uuid, ${session}::uuid, ${card.question_id}::uuid,
          ${card.impression_id}::bigint, ${card.correct_index}::int, true, 4000::int, '{}'::uuid[])`;
      const exec = ea.map((r) => r["QUERY PLAN"]).find((l) => l.includes("Execution Time"));
      console.log(`in-DB execution (EXPLAIN ANALYZE):   ${exec?.trim() ?? "n/a"}`);

      throw ROLLBACK;
    });
  } catch (e) { if (e !== ROLLBACK) throw e; }

  console.log(`\nOld path for comparison: ~15 serial round-trips ≈ ${(avg(rtt) * 15).toFixed(0)}ms + 273KB egress.`);
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
