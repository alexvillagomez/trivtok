import { randomUUID } from "node:crypto";
import type { Embedding, UserInterest } from "../types";
import { dot, normalize } from "../vector";

// Interest state answers "what does this user want to see?" — driven ONLY by
// engagement (like/skip/dislike), never by correct/incorrect. A user can love a
// topic and still miss the question.

export const STRENGTH_LR = 0.3; // η_w: how fast strength reacts to engagement
export const CENTROID_LR = 0.1; // η_c: how far the centroid drifts on a strong positive
export const SPAWN_SIMILARITY = 0.5; // a strong positive farther than this spawns a new cluster
export const INITIAL_STRENGTH = 1.0;
export const STRONG_POSITIVE = 1.0; // engagement ≥ this (a like) counts as strong positive

// Momentum: a recent-engagement trace, the short-timescale counterpart to
// strength. Strength must stay high to remember a long-term preference, so it
// can't also encode "I'm tired of this right now" — momentum carries that.
export const MOMENTUM_LR = 0.4; // η_m: how hard one interaction swings the trace
export const MOMENTUM_TAU_HOURS = 168; // decay time-constant (~4.85-day half-life)

/** Momentum decayed to `now`: m·exp(−Δt/τ). Δt is hours since it was last touched. */
export function momentumDecay(prev: number, dtHours: number): number {
  return prev * Math.exp(-Math.max(dtHours, 0) / MOMENTUM_TAU_HOURS);
}

/**
 * One momentum update: decay the stored trace to now, then EMA it toward this
 * interaction's engagement. A fresh cluster starts from momentumStep(0, 0, e).
 */
export function momentumStep(prev: number, dtHours: number, engagement: number): number {
  const decayed = momentumDecay(prev, dtHours);
  return decayed + MOMENTUM_LR * (engagement - decayed);
}

/**
 * Update the user's interests after one interaction. Finds the nearest interest
 * to the shown question and moves its strength by the engagement signal; on a
 * strong positive it also nudges the centroid toward the question. If a strong
 * positive lands far from every existing interest (or there are none yet), it
 * spawns a new interest — this is how interests first form for a new user.
 * Returns a new array; inputs are not mutated.
 */
export function updateInterests(
  interests: UserInterest[],
  embedding: Embedding,
  engagement: number,
  userId: string,
  now: string,
): UserInterest[] {
  const strongPositive = engagement >= STRONG_POSITIVE;

  let nearestIdx = -1;
  let nearestSim = -Infinity;
  for (let i = 0; i < interests.length; i++) {
    const sim = dot(interests[i].centroid, embedding);
    if (sim > nearestSim) {
      nearestSim = sim;
      nearestIdx = i;
    }
  }

  // Spawn a new interest on a strong positive that's far from everything.
  if (strongPositive && (nearestIdx === -1 || nearestSim < SPAWN_SIMILARITY)) {
    const created: UserInterest = {
      id: randomUUID(),
      userId,
      centroid: normalize(embedding.slice()),
      strength: INITIAL_STRENGTH,
      momentum: momentumStep(0, 0, engagement), // fresh trace from this like
      positiveCount: 1,
      lastUsedAt: now,
    };
    return [...interests, created];
  }

  if (nearestIdx === -1) return interests; // cold user, non-positive: nothing to update

  const dtHours = (Date.parse(now) - Date.parse(interests[nearestIdx].lastUsedAt)) / 3_600_000;

  return interests.map((it, i) => {
    if (i !== nearestIdx) return it;
    const strength = Math.max(0, it.strength + STRENGTH_LR * engagement);
    const momentum = momentumStep(it.momentum, dtHours, engagement);
    const centroid = strongPositive
      ? normalize(it.centroid.map((c, d) => (1 - CENTROID_LR) * c + CENTROID_LR * embedding[d]))
      : it.centroid;
    return {
      ...it,
      strength,
      momentum,
      centroid,
      positiveCount: it.positiveCount + (engagement > 0 ? 1 : 0),
      lastUsedAt: now,
    };
  });
}
