// End-to-end offline smoke test of the FULL closed loop. No keys, no DB.
// Simulates a live feed: build priority p_t from interests → retrieve →
// select → apply the user's reaction → repeat. Verifies the two behaviors
// that matter most: (1) liking a concept makes that concept keep showing up,
// and (2) IRT/ability tracks skill so difficulty homes in on the target.
//
// Run: npx tsx scripts/try-e2e.ts
import { buildPriorityVector } from "../lib/rec/priority";
import { selectNextQuestion } from "../lib/rec/select";
import { applyInteraction } from "../lib/rec/update";
import { newAbility, pCorrect, TARGET_P } from "../lib/rec/difficulty";
import { normalize } from "../lib/vector";
import type { Ability, Embedding, Question, UserInterest } from "../lib/types";

// --- deterministic RNG so the run is reproducible ---------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

// --- a synthetic question bank across 4 disjoint "concepts" -----------------
// Each concept is its own axis in R^64, so dot(concept_a, concept_b)=0 and we
// can cleanly measure "which concept is the feed serving?"
const CONCEPTS = ["space", "history", "music", "biology"] as const;
type Concept = (typeof CONCEPTS)[number];

function axis(i: number): Embedding {
  const v = new Array(64).fill(0);
  v[i] = 1;
  return normalize(v);
}
const conceptAxis: Record<Concept, Embedding> = {
  space: axis(0),
  history: axis(1),
  music: axis(2),
  biology: axis(3),
};

// N questions per concept, difficulties spread across the range.
const PER_CONCEPT = Number(process.env.PER_CONCEPT ?? 20);
const bank: Question[] = [];
const questionConcept = new Map<string, Concept>();
CONCEPTS.forEach((concept, ci) => {
  for (let j = 0; j < PER_CONCEPT; j++) {
    const id = `${concept}-${j}`;
    // jitter the embedding slightly off-axis so retrieval isn't a perfect tie
    const emb = conceptAxis[concept].map((c, d) => c + (d < 4 && d !== ci ? 0 : (rand() - 0.5) * 0.02));
    bank.push({
      id,
      text: `${concept} question ${j}`,
      choices: ["a", "b", "c", "d"],
      correctIndex: 0,
      difficulty: 0.1 + (j / (PER_CONCEPT - 1)) * 0.8, // 0.1 .. 0.9
      embedding: normalize(emb),
      likeCount: 0,
      dislikeCount: 0,
    });
    questionConcept.set(id, concept);
  }
});

// --- the simulated user -----------------------------------------------------
// Loves "space", indifferent to the rest. True latent skill is high on the
// space axis, so they get hard space questions right — lets us watch IRT climb.
const LOVED: Concept = "space";
const trueSkill = axis(0).map((c) => c * 3); // strong ability along space

function userAnswersCorrectly(q: Question): boolean {
  // logistic on (skill·e − difficultyLogit)
  let s = 0;
  for (let i = 0; i < 64; i++) s += trueSkill[i] * q.embedding[i];
  const b = (q.difficulty - 0.5) * 4;
  const p = 1 / (1 + Math.exp(-(s - b)));
  return rand() < p;
}

function reactionFor(q: Question) {
  const concept = questionConcept.get(q.id)!;
  const answered = true; // the user always attempts
  const correct = answered ? userAnswersCorrectly(q) : null;
  // likes the loved concept, skips others
  const liked = concept === LOVED;
  return { liked, answered, correct, responseTimeMs: liked ? 4000 : 800 };
}

// --- run the feed loop ------------------------------------------------------
let ability: Ability = newAbility();
let interests: UserInterest[] = [];
const seen = new Set<string>();
const exploreDirections = CONCEPTS.map((c) => conceptAxis[c]);

const STEPS = Number(process.env.STEPS ?? 120);
const servedConcept: Concept[] = [];
let now = Date.parse("2026-08-27T12:00:00Z");

for (let step = 0; step < STEPS; step++) {
  const priority = buildPriorityVector(interests, { exploreDirections, rand, now });

  // candidate pool = unseen questions (fall back to all if exhausted)
  let pool = bank.filter((q) => !seen.has(q.id));
  if (pool.length === 0) {
    seen.clear();
    pool = bank.slice();
  }

  const selection = selectNextQuestion(priority.vector, ability, pool, { rand });
  const q = selection.chosen;
  seen.add(q.id);
  const concept = questionConcept.get(q.id)!;
  servedConcept.push(concept);

  const reaction = reactionFor(q);
  const result = applyInteraction({
    ability,
    interests,
    userId: "sim",
    question: { embedding: q.embedding, difficulty: q.difficulty },
    interaction: reaction,
    now: new Date(now).toISOString(),
  });
  ability = result.ability;
  interests = result.interests;

  // reflect the aggregate rating + difficulty drift back into the bank
  const idx = bank.findIndex((b) => b.id === q.id);
  if (reaction.liked) bank[idx].likeCount++;
  bank[idx].difficulty = result.difficulty;

  now += 30_000; // 30s per card
}

// --- report -----------------------------------------------------------------
function pct(arr: Concept[], c: Concept) {
  return ((arr.filter((x) => x === c).length / arr.length) * 100).toFixed(1) + "%";
}

const firstWindow = servedConcept.slice(0, 20);
const lastWindow = servedConcept.slice(-40);
const unseenSpaceAtEnd = bank.filter((b) => questionConcept.get(b.id) === "space" && !seen.has(b.id)).length;

console.log("=== 1. Interest reinforcement: does liking 'space' make it keep showing up? ===");
console.log(`  overall space share (all ${servedConcept.length} cards): ${pct(servedConcept, "space")}`);
console.log(`  first 20 cards (cold):   space=${pct(firstWindow, "space")}`);
console.log(`  last 40 cards (learned): space=${pct(lastWindow, "space")}` +
  `  history=${pct(lastWindow, "history")}  music=${pct(lastWindow, "music")}  biology=${pct(lastWindow, "biology")}`);
console.log(`  unseen space questions remaining at end: ${unseenSpaceAtEnd}/${bank.filter((b) => questionConcept.get(b.id) === "space").length}` +
  ` (0 ⇒ tail was forced off-topic by dedup, not by the algorithm)`);
console.log(`  interests formed: ${interests.map((i) => {
  // name the interest by its dominant axis
  const dom = i.centroid.indexOf(Math.max(...i.centroid.map(Math.abs)));
  return `${CONCEPTS[dom] ?? `dim${dom}`}(strength=${i.strength.toFixed(2)})`;
}).join(", ")}`);

console.log("\n=== 2. IRT / Bayesian ability: does difficulty home in on the target? ===");
console.log(`  ability mean along space axis: 0 → ${ability.mean[0].toFixed(3)} (true skill=3.0)`);
console.log(`  variance along space axis:     1.0 → ${ability.variance[0].toFixed(3)} (shrinks as we learn)`);
// what P(correct) does the engine now predict for space questions across difficulty?
for (const d of [0.2, 0.5, 0.8]) {
  const e = conceptAxis.space;
  const p = pCorrect(ability, e, d);
  console.log(`    predicted P(correct) on space d=${d.toFixed(1)}: ${(p * 100).toFixed(1)}%`);
}
const servedSpace = bank.filter((b) => questionConcept.get(b.id) === "space");
const avgPredP =
  servedSpace.reduce((s, q) => s + pCorrect(ability, q.embedding, q.difficulty), 0) /
  servedSpace.length;
console.log(`  avg predicted P(correct) over space bank: ${(avgPredP * 100).toFixed(1)}% (target ${(TARGET_P * 100).toFixed(0)}%)`);

console.log("\n=== 3. Untouched dims stay at the prior (no cross-contamination) ===");
const untouched = ability.variance.slice(4).every((v) => Math.abs(v - 1.0) < 1e-9);
const meanUntouched = ability.mean.slice(4).every((m) => Math.abs(m) < 1e-9);
console.log(`  dims 4..63 variance still 1.0: ${untouched}   mean still 0: ${meanUntouched}`);
