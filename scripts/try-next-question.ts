import "./loadEnv";
import { readFile } from "node:fs/promises";
import { sql } from "../lib/db/client";

// End-to-end exercise of the in-DB next_question() pipeline. Applies the
// functions (persisted — they ARE the migration), then runs a simulated
// single-topic-liker session inside ONE transaction that is ROLLED BACK, so the
// real question bank / users are left untouched. Checks: it runs in one round
// trip, interests form, ability moves, and liking concentrates the feed
// (served cards get more similar to the first liked card over time).
// Run: npx tsx scripts/try-next-question.ts

const ROLLBACK = Symbol("rollback");

function uuid() {
  return crypto.randomUUID();
}

async function main() {
  await sql.unsafe(await readFile("supabase/migrations/0004_rec_math.sql", "utf8"));
  await sql.unsafe(await readFile("supabase/migrations/0005_next_question.sql", "utf8"));
  // 0006 CREATE OR REPLACEs next_question() with the Gumbel-max U guard; apply it
  // last so this test exercises the deployed (guarded) function, not the raw 0005.
  await sql.unsafe(await readFile("supabase/migrations/0006_gumbel_guard.sql", "utf8"));
  console.log("functions applied.\n");

  const user = uuid();
  const session = uuid();
  const sims: number[] = [];
  let target: number[] | null = null; // the "topic" this user likes
  let interests = 0;
  let abilityNorm = 0;
  let likeCount = 0;
  let baselineSim = 0;
  const LIKE_THRESHOLD = 0.3; // like cards this close to the target, skip the rest
  const avgLocal = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const embOf = async (tx: any, id: string) => {
    const [{ embedding }] = await tx`select embedding::text as embedding from questions where id = ${id}`;
    return JSON.parse(embedding) as number[];
  };
  const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

  try {
    await sql.begin(async (tx) => {
      let [card] = await tx<any[]>`select * from next_question(${user}::uuid, ${session}::uuid)`;
      target = await embOf(tx, card.question_id); // first card defines the liked topic

      for (let step = 0; step < 60; step++) {
        const emb = await embOf(tx, card.question_id);
        const sim = dot(emb, target);
        sims.push(sim);

        // Single-topic user: like + answer near-target cards; quick-skip the rest.
        const near = sim >= LIKE_THRESHOLD;
        if (near) likeCount++;
        const t0 = performance.now();
        [card] = await tx<any[]>`
          select * from next_question(
            ${user}::uuid, ${session}::uuid, ${card.question_id}::uuid, ${card.impression_id}::bigint,
            ${near ? card.correct_index : null}::int, ${near}::boolean, ${near ? 4000 : 800}::int, '{}'::uuid[])`;
        if (step === 0) console.log(`one next_question() call: ${(performance.now() - t0).toFixed(0)}ms (one round-trip)`);
      }

      // Baseline: how similar is a RANDOM card to the liked topic? (the null hypothesis)
      const randomRows = await tx<{ embedding: string }[]>`select embedding::text as embedding from questions order by random() limit 200`;
      baselineSim = avgLocal(randomRows.map((r) => dot(JSON.parse(r.embedding) as number[], target!)));

      [{ count: interests }] = await tx<any[]>`select count(*)::int as count from user_interests where user_id = ${user}`;
      const [{ n }] = await tx<{ n: number }[]>`
        select sqrt(coalesce(sum(x*x),0)) as n
        from users u, unnest(rec_vec_to_arr(u.ability_mean)) as x where u.id = ${user}`;
      abilityNorm = n;

      throw ROLLBACK; // leave the DB pristine
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }

  const servedSim = avgLocal(sims);
  console.log(`\ninterests formed: ${interests}   liked ${likeCount}/60 cards`);
  console.log(`ability |mean|: ${abilityNorm.toFixed(3)} (0 ⇒ never learned)`);
  console.log(`served-card similarity to the liked topic:`);
  console.log(`  recommender: ${servedSim.toFixed(3)}   random baseline: ${baselineSim.toFixed(3)}   ${servedSim > baselineSim + 0.1 ? "✓ strongly concentrating on the topic" : "✗ no better than random"}`);

  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
