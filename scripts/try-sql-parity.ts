import "./loadEnv"; // loads DATABASE_URL before the client builds
import { readFile } from "node:fs/promises";
import { sql } from "../lib/db/client";
import {
  pCorrect,
  updateAbility,
  updateDifficulty,
  difficultyFactor,
} from "../lib/rec/difficulty";
import { engagementSignal } from "../lib/rec/update";
import { momentumDecay, momentumStep } from "../lib/rec/interest";
import {
  likeAdjustment,
  interestActivation,
  exploreProbability,
  DEFAULT_PARAMS,
} from "../lib/rec/priority";
import { normalize } from "../lib/vector";
import type { Ability, Embedding } from "../lib/types";

// Golden test: the in-DB rec math (0004_rec_math.sql) must match the TS oracle
// (lib/rec) bit-for-bit-ish. If this passes, the SQL port of the ability/IRT
// math is trustworthy and the orchestrating next_question() can build on it.
// Run: npx tsx scripts/try-sql-parity.ts

const TOL = 1e-9;
let failures = 0;

function rand(n = 1) {
  return (Math.random() * 2 - 1) * n;
}
function randVec(): Embedding {
  return normalize(Array.from({ length: 64 }, () => rand()));
}
function randAbility(): Ability {
  return {
    mean: Array.from({ length: 64 }, () => rand(2)),
    variance: Array.from({ length: 64 }, () => 0.05 + Math.random() * 0.95),
  };
}

function check(label: string, ts: number, db: number) {
  const diff = Math.abs(ts - db);
  if (diff > TOL || Number.isNaN(diff)) {
    failures++;
    console.log(`  ✗ ${label}: ts=${ts} db=${db} Δ=${diff}`);
  }
}
function checkVec(label: string, ts: number[], db: number[]) {
  let maxDiff = 0;
  for (let i = 0; i < ts.length; i++) maxDiff = Math.max(maxDiff, Math.abs(ts[i] - db[i]));
  if (maxDiff > TOL || Number.isNaN(maxDiff)) {
    failures++;
    console.log(`  ✗ ${label}: maxΔ=${maxDiff}`);
  }
}

async function main() {
  // (Re)create the functions so this harness can iterate without the ledger.
  // 0004 = the ADF/IRT math; 0007 = the adaptive-priority helpers (0005/0006
  // supply the shared helpers + guarded next_question that 0007 builds on).
  await sql.unsafe(await readFile("supabase/migrations/0004_rec_math.sql", "utf8"));
  await sql.unsafe(await readFile("supabase/migrations/0005_next_question.sql", "utf8"));
  await sql.unsafe(await readFile("supabase/migrations/0006_gumbel_guard.sql", "utf8"));
  await sql.unsafe(await readFile("supabase/migrations/0007_adaptive_priority.sql", "utf8"));
  // 0011 = interest momentum: redefines rec_activation (+momentum arg) and adds
  // rec_momentum / rec_momentum_decay. Must load last so its rec_activation wins.
  await sql.unsafe(await readFile("supabase/migrations/0011_interest_momentum.sql", "utf8"));
  // 0015 = user settings: redefines rec_explore_prob (level) and rec_difficulty_factor
  // (target), plus rec_score/next_question. Load last so its signatures win.
  await sql.unsafe(await readFile("supabase/migrations/0015_user_settings.sql", "utf8"));
  // 0016 = serve-only-new switch: creates app_config and re-defines next_question
  // with the new-only candidate filter. It touches no rec_* helper this test checks,
  // but reload it last so running the harness doesn't drop the switch from the DB.
  await sql.unsafe(await readFile("supabase/migrations/0016_new_questions_switch.sql", "utf8"));

  const CASES = 50;
  for (let k = 0; k < CASES; k++) {
    const ability = randAbility();
    const e = randVec();
    const d = Math.random();
    const correct = Math.random() < 0.5;
    const liked = Math.random() < 0.3;
    const answered = Math.random() < 0.7;
    const rt = Math.floor(Math.random() * 4000);

    // adaptive-priority inputs (0006 helpers)
    const likes = Math.floor(Math.random() * 20);
    const inters = likes + Math.floor(Math.random() * 20);
    const sessMean = Math.random();
    const strength = rand(3);
    const freshRaw = Math.random();
    const fatigue = Math.random();
    const likeAdj = rand(1);
    const skipRate = Math.random();
    const likeRate = Math.random();
    const exploreLevel = Math.random(); // the user's exploration setting in [0,1]
    const targetP = 0.5 + Math.random() * 0.4; // the user's difficulty target

    // momentum inputs
    const mom = rand(1); // decayed trace fed into the activation readout
    const momPrev = rand(1); // stored trace before this update
    const momDt = Math.random() * 500; // idle hours since last touch
    const momEng = engagementSignal({ liked, answered, correct: null, responseTimeMs: rt });

    // Everything the DB should compute for this case, in ONE round-trip.
    const [row] = await sql<
      {
        p: number; f: number; g: number; nd: number; nm: number[]; nv: number[];
        la: number; ac: number; ep: number; md: number; mu: number;
      }[]
    >`
      with a as (
        select ${ability.mean}::float8[] as mean, ${ability.variance}::float8[] as variance,
               ${e}::float8[] as e, ${d}::float8 as d, ${correct}::boolean as correct
      ), u as (
        select (rec_update_ability(mean, variance, e, d, correct, 1.0)).* from a
      )
      select
        rec_pcorrect(a.mean, a.variance, a.e, a.d, 1.0)                              as p,
        rec_difficulty_factor(rec_pcorrect(a.mean, a.variance, a.e, a.d, 1.0), ${targetP}::float8) as f,
        rec_engagement(${liked}, ${answered}, ${rt})                                 as g,
        rec_update_difficulty(a.d, a.mean, a.variance, a.e, a.correct, 0.02)         as nd,
        u.new_mean                                                                   as nm,
        u.new_variance                                                               as nv,
        rec_like_adj(${likes}, ${inters}, ${sessMean}::float8)                       as la,
        rec_activation(${strength}::float8, ${freshRaw}::float8, ${fatigue}::float8, ${likeAdj}::float8, ${mom}::float8) as ac,
        rec_explore_prob(${skipRate}::float8, ${likeRate}::float8, ${exploreLevel}::float8) as ep,
        rec_momentum_decay(${momPrev}::float8, ${momDt}::float8)                     as md,
        rec_momentum(${momPrev}::float8, ${momDt}::float8, ${momEng}::float8)        as mu
      from a, u`;

    check(`pCorrect[${k}]`, pCorrect(ability, e, d), row.p);
    check(`difficultyFactor[${k}]`, difficultyFactor(pCorrect(ability, e, d), targetP), row.f);
    check(`engagement[${k}]`, engagementSignal({ liked, answered, correct: null, responseTimeMs: rt }), row.g);
    check(`updateDifficulty[${k}]`, updateDifficulty(d, ability, e, correct), row.nd);
    check(`likeAdj[${k}]`, likeAdjustment(likes, inters, sessMean, DEFAULT_PARAMS.likePrior), row.la);
    check(`activation[${k}]`, interestActivation(strength, freshRaw, fatigue, likeAdj, mom, DEFAULT_PARAMS), row.ac);
    check(
      `exploreProb[${k}]`,
      exploreProbability(skipRate, likeRate, { ...DEFAULT_PARAMS, exploreLevel }),
      row.ep,
    );
    check(`momentumDecay[${k}]`, momentumDecay(momPrev, momDt), row.md);
    check(`momentumStep[${k}]`, momentumStep(momPrev, momDt, momEng), row.mu);
    const tsA = updateAbility(ability, e, d, correct);
    checkVec(`updateAbility.mean[${k}]`, tsA.mean, row.nm);
    checkVec(`updateAbility.variance[${k}]`, tsA.variance, row.nv);
  }

  console.log(
    failures === 0
      ? `\n✅ SQL rec math matches TS oracle across ${CASES} random cases (tol ${TOL}).`
      : `\n❌ ${failures} mismatch(es) — SQL diverges from the TS oracle.`,
  );
  await sql.end();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
