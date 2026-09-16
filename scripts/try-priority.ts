// Offline smoke test for the priority system. No API keys, no DB.
// Run: npx tsx scripts/try-priority.ts
import { buildPriorityVector, type PriorityContext } from "../lib/rec/priority";
import { normalize } from "../lib/vector";
import type { Embedding, UserInterest } from "../lib/types";

// A tiny deterministic RNG so runs are reproducible.
function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a 64-D unit vector that points mostly along one axis (a fake "topic").
function axisVector(axis: number): Embedding {
  const v = new Array(64).fill(0).map((_, i) => (i === axis ? 1 : 0.05));
  return normalize(v);
}

const now = Date.parse("2026-08-27T12:00:00Z");

const interests: UserInterest[] = [
  { id: "space", userId: "u", centroid: axisVector(0), strength: 2.0, positiveCount: 10, lastUsedAt: "2026-08-27T11:00:00Z" },
  { id: "history", userId: "u", centroid: axisVector(1), strength: 1.0, positiveCount: 5, lastUsedAt: "2026-08-25T12:00:00Z" },
  { id: "music", userId: "u", centroid: axisVector(2), strength: 0.5, positiveCount: 2, lastUsedAt: "2026-08-27T09:00:00Z" },
];

const exploreDirections = [axisVector(10), axisVector(20), axisVector(30)];

const rand = seededRand(42);
const ctx: PriorityContext = { exploreDirections, rand, now, recentInterestIds: [] };

// --- 1. Activation trace on a single call --------------------------------
const first = buildPriorityVector(interests, ctx);
console.log("mode:", first.mode, "primary:", first.primaryInterestId, "secondary:", first.secondaryIds);
console.log("activations:");
for (const a of first.activations) {
  console.log(`  ${a.id.padEnd(8)} A=${a.A.toFixed(3)}  P=${(a.p * 100).toFixed(1)}%`);
}
const norm = Math.sqrt(first.vector.reduce((s, x) => s + x * x, 0));
console.log("p_t unit length:", norm.toFixed(6));

// --- 2. Distribution over many runs (is it sampling, not argmax?) --------
const counts: Record<string, number> = {};
const N = 2000;
for (let i = 0; i < N; i++) {
  const r = buildPriorityVector(interests, { ...ctx, rand: seededRand(1000 + i) });
  const key = r.mode === "interest" ? r.primaryInterestId! : r.mode;
  counts[key] = (counts[key] ?? 0) + 1;
}
console.log(`\nover ${N} runs:`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(8)} ${((v / N) * 100).toFixed(1)}%`);
}

// --- 3. Fatigue: hammering "space" should shift weight away from it ------
const fatigued = buildPriorityVector(interests, {
  ...ctx,
  rand: seededRand(7),
  recentInterestIds: Array(10).fill("space"),
  params: { epsilon: 0 }, // disable exploration so we always see activations here
});
const spaceA = fatigued.activations.find((a) => a.id === "space")!;
console.log(`\nwith heavy "space" fatigue: space A=${spaceA.A.toFixed(3)} (was ${first.activations.find((a) => a.id === "space")!.A.toFixed(3)})`);

// --- 4. Cold start ------------------------------------------------------
const cold = buildPriorityVector([], ctx);
console.log("\ncold start mode:", cold.mode, "(vector is unit:", Math.abs(Math.sqrt(cold.vector.reduce((s, x) => s + x * x, 0)) - 1) < 1e-6, ")");
