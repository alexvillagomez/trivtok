// Offline simulation for interest momentum (migration 0011 / lib/rec). No DB, no
// API keys — pure engine. It drives a synthetic user through three phases and
// prints baseball's exposure share so you can SEE the worn-out → recover arc and
// tune MOMENTUM_LR / MOMENTUM_TAU_HOURS / momentumWeight on simulated data.
//
//   Phase A  baseball is loved            → it dominates the feed
//   Phase B  baseball is now skipped      → momentum crashes, exposure collapses
//   (3 days pass)
//   Phase C  user returns, likes it again → suppressed at first, then re-tested
//            (sampling) and recovers as the stale penalty decays over ~τ
//
// Run: npx tsx scripts/try-momentum.ts
import { buildPriorityVector, type PriorityContext } from "../lib/rec/priority";
import { updateInterests, MOMENTUM_TAU_HOURS } from "../lib/rec/interest";
import { engagementSignal } from "../lib/rec/update";
import { normalize } from "../lib/vector";
import type { Embedding, UserInterest } from "../lib/types";

function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each "topic" is a near-orthogonal unit vector, so the nearest interest to a
// topic's centroid is itself — the retrieval loop stays clean and on-topic.
function axisVector(axis: number): Embedding {
  const v = new Array(64).fill(0).map((_, i) => (i === axis ? 1 : 0.02));
  return normalize(v);
}

const TOPICS = {
  baseball: axisVector(0),
  cooking: axisVector(1),
  space: axisVector(2),
  history: axisVector(3),
};
const exploreDirections = [axisVector(20), axisVector(30), axisVector(40)];

const START = "2026-09-01T12:00:00Z";
let now = Date.parse(START);
const rand = seededRand(2026);

// A user who has loved baseball for a long time (high strength), plus a few
// milder interests. Momentum starts neutral.
function mk(id: string, centroid: Embedding, strength: number): UserInterest {
  return { id, userId: "u", centroid, strength, momentum: 0, positiveCount: 5, lastUsedAt: START };
}
let interests: UserInterest[] = [
  mk("baseball", TOPICS.baseball, 3.0),
  mk("cooking", TOPICS.cooking, 1.0),
  mk("space", TOPICS.space, 1.0),
  mk("history", TOPICS.history, 0.8),
];

// Per-phase probability that the user LIKES a shown topic (else they skip it).
type Prefs = Record<string, number>;
function runPhase(label: string, steps: number, minutesPerStep: number, likeProb: Prefs) {
  // baseball's exposure share within each quarter of the phase, to show the arc.
  const q = steps / 4;
  const bbSeen = [0, 0, 0, 0];
  const qTotal = [0, 0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const quarter = Math.min(3, Math.floor(i / q));
    const nowIso = new Date(now).toISOString();
    const ctx: PriorityContext = {
      exploreDirections,
      rand,
      now,
      // disable exploration so the phase measures the interest sampler directly
      params: { exploreLevel: 0 },
    };
    const p = buildPriorityVector(interests, ctx);
    const topicId = p.mode === "interest" ? p.primaryInterestId! : "explore";
    qTotal[quarter]++;
    if (topicId === "baseball") bbSeen[quarter]++;

    if (p.mode === "interest") {
      const centroid = interests.find((it) => it.id === topicId)!.centroid;
      const liked = rand() < (likeProb[topicId] ?? 0.3);
      // like → +1; otherwise a lingered dislike (−1). engagementSignal maps it.
      const engagement = engagementSignal(
        liked
          ? { liked: true, answered: false, correct: null, responseTimeMs: null }
          : { liked: false, answered: false, correct: null, responseTimeMs: 3000 },
      );
      interests = updateInterests(interests, centroid, engagement, "u", nowIso);
    }
    now += minutesPerStep * 60_000;
  }
  const bb = interests.find((it) => it.id === "baseball")!;
  const arc = bbSeen.map((n, i) => pct(n, qTotal[i])).join(" → ");
  console.log(
    `${label.padEnd(26)} ${arc}   [mom ${bb.momentum.toFixed(2).padStart(5)}  str ${bb.strength.toFixed(1)}]`,
  );
}
function pct(n: number, total: number) {
  return `${((n / Math.max(1, total)) * 100).toFixed(0).padStart(3)}%`;
}

console.log(`τ = ${MOMENTUM_TAU_HOURS}h (~${((MOMENTUM_TAU_HOURS * Math.LN2) / 24).toFixed(1)}d half-life)\n`);
console.log("phase                      baseball exposure by quarter   end state");
console.log("-".repeat(74));

runPhase("A  baseball loved", 120, 3, { baseball: 0.85, cooking: 0.4, space: 0.4, history: 0.35 });
runPhase("B  baseball worn out", 120, 3, { baseball: 0.05, cooking: 0.7, space: 0.7, history: 0.6 });

// 3 days pass before the user comes back.
now += 72 * 3_600_000;
console.log(`\n... 72h pass (momentum decays by ×${Math.exp(-72 / MOMENTUM_TAU_HOURS).toFixed(3)}) ...\n`);

runPhase("C  returns, likes it again", 200, 3, { baseball: 0.8, cooking: 0.5, space: 0.5, history: 0.4 });

console.log(
  "\nExpected: A high → B collapses (momentum negative) → C starts suppressed then\n" +
    "recovers as the stale penalty decays and the occasional re-test lands likes.",
);
