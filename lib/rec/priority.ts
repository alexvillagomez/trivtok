import type { Embedding, UserInterest } from "../types";
import { dot, normalize } from "../vector";
import { sampleIndex, softmax } from "./math";

// The priority system: user interests → p_t, the semantic direction we want to
// show right now. Pure and synchronous — no DB, no async, no I/O. The backend
// loads interests, calls buildPriorityVector(), and passes p_t to retrieval.
//
// Pipeline (Steps 1–3 of the rec spec):
//   1. cold start        (no interests yet)
//   2. exploration roll  (ε chance to ignore interests)
//   3. activation A_m    → softmax → sample primary m*
//   4. secondary blend   → p_t = normalize(c_m* + α Σ β_j c_j)

export type PriorityParams = {
  tau: number; // softmax temperature over activations
  alpha: number; // how much secondary interests bend the primary
  topSecondary: number; // how many secondary interests to blend
  epsilon: number; // exploration probability
  freshWeight: number; // bonus for interests not used recently
  freshHours: number; // hours until the freshness bonus saturates
  fatigueWeight: number; // penalty for interests shown a lot this session
};

export const DEFAULT_PARAMS: PriorityParams = {
  tau: 0.5,
  alpha: 0.2,
  topSecondary: 3,
  epsilon: 0.1,
  freshWeight: 0.3,
  freshHours: 24,
  fatigueWeight: 0.4,
};

export type PriorityContext = {
  /** Primary interest ids chosen recently this session (most recent last). */
  recentInterestIds?: string[];
  /** Predefined topic embeddings for exploration (Step 3). Never random. */
  exploreDirections?: Embedding[];
  /** Injectable RNG for deterministic tests. Defaults to Math.random. */
  rand?: () => number;
  /** Wall-clock "now" in ms; injectable for tests. Defaults to Date.now(). */
  now?: number;
  params?: Partial<PriorityParams>;
};

export type PriorityResult = {
  vector: Embedding; // p_t, normalized
  mode: "interest" | "explore" | "cold";
  primaryInterestId: string | null;
  secondaryIds: string[];
  /** Full activation trace for debugging + future training data. */
  activations: { id: string; A: number; p: number }[];
};

/** Build the priority vector p_t from a user's interests. */
export function buildPriorityVector(
  interests: UserInterest[],
  ctx: PriorityContext = {},
): PriorityResult {
  const p = { ...DEFAULT_PARAMS, ...ctx.params };
  const rand = ctx.rand ?? Math.random;
  const now = ctx.now ?? Date.now();
  const recent = ctx.recentInterestIds ?? [];
  const explore = ctx.exploreDirections ?? [];

  // Step 1 — Cold start: no interests yet, so explore.
  if (interests.length === 0) {
    return {
      vector: pickExploreDirection(explore, interests, rand),
      mode: "cold",
      primaryInterestId: null,
      secondaryIds: [],
      activations: [],
    };
  }

  // Step 2 — Exploration roll: occasionally ignore known interests.
  if (explore.length > 0 && rand() < p.epsilon) {
    return {
      vector: pickExploreDirection(explore, interests, rand),
      mode: "explore",
      primaryInterestId: null,
      secondaryIds: [],
      activations: [],
    };
  }

  // Step 3 — Activation score per interest, then softmax, then sample.
  const scores = interests.map((it) => activation(it, recent, now, p));
  const probs = softmax(scores, p.tau);
  const activations = interests.map((it, i) => ({
    id: it.id,
    A: scores[i],
    p: probs[i],
  }));

  const primaryIdx = sampleIndex(probs, rand);
  const primary = interests[primaryIdx];

  // Step 4 — Blend in a few compatible secondary interests.
  const { vector, secondaryIds } = blendSecondaries(primary, interests, primaryIdx, p);

  return {
    vector,
    mode: "interest",
    primaryInterestId: primary.id,
    secondaryIds,
    activations,
  };
}

// --- internals ---------------------------------------------------------------

/** A_m = strength + freshness − fatigue. */
function activation(
  interest: UserInterest,
  recent: string[],
  now: number,
  p: PriorityParams,
): number {
  const hours = (now - Date.parse(interest.lastUsedAt)) / 3_600_000;
  const freshness = p.freshWeight * Math.min(Math.max(hours, 0) / p.freshHours, 1);

  const fatigue =
    recent.length === 0
      ? 0
      : p.fatigueWeight *
        (recent.filter((id) => id === interest.id).length / recent.length);

  return interest.strength + freshness - fatigue;
}

/**
 * p_t = normalize(c_m* + α Σ β_j c_j), where secondaries are the top few
 * interests most compatible with the primary. If nothing is compatible,
 * p_t is just the primary centroid.
 */
function blendSecondaries(
  primary: UserInterest,
  interests: UserInterest[],
  primaryIdx: number,
  p: PriorityParams,
): { vector: Embedding; secondaryIds: string[] } {
  const scored = interests
    .map((it, i) => ({ it, B: Math.max(0, dot(primary.centroid, it.centroid)) * it.strength, i }))
    .filter((s) => s.i !== primaryIdx && s.B > 0)
    .sort((a, b) => b.B - a.B)
    .slice(0, p.topSecondary);

  if (scored.length === 0) {
    return { vector: primary.centroid.slice(), secondaryIds: [] };
  }

  const totalB = scored.reduce((sum, s) => sum + s.B, 0);
  const blended = primary.centroid.slice();
  for (const { it, B } of scored) {
    const beta = B / totalB;
    for (let d = 0; d < blended.length; d++) {
      blended[d] += p.alpha * beta * it.centroid[d];
    }
  }

  return { vector: normalize(blended), secondaryIds: scored.map((s) => s.it.id) };
}

/**
 * Pick an exploration direction, biased toward regions FAR from what the user
 * already likes (so exploring shows something genuinely new). Never generates a
 * random vector — always returns one of the predefined topic embeddings.
 */
function pickExploreDirection(
  directions: Embedding[],
  interests: UserInterest[],
  rand: () => number,
): Embedding {
  if (directions.length === 0) {
    // No topic embeddings supplied: fall back to a known centroid rather than
    // inventing a random direction. Callers should always pass exploreDirections.
    if (interests.length > 0) return interests[0].centroid.slice();
    throw new Error("buildPriorityVector: no interests and no exploreDirections");
  }

  // Score each direction by how far it is from the nearest interest centroid.
  const novelty = directions.map((dir) => {
    if (interests.length === 0) return 1;
    const nearest = Math.max(...interests.map((it) => dot(dir, it.centroid)));
    return 1 - nearest; // larger = farther from everything the user likes
  });

  // Softmax-sample so far directions win most of the time but not always.
  const probs = softmax(novelty, 0.5);
  return directions[sampleIndex(probs, rand)].slice();
}
