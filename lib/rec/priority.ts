import type { Embedding, UserInterest } from "../types";
import { dot, normalize } from "../vector";
import { momentumDecay } from "./interest";
import { sampleIndex, softmax } from "./math";

// The priority system: user interests → p_t, the semantic direction we want to
// show right now. Pure and synchronous — no DB, no async, no I/O. The backend
// loads interests, calls buildPriorityVector(), and passes p_t to retrieval.
//
// Pipeline (Steps 1–3 of the rec spec):
//   1. cold start        (no interests yet)
//   2. exploration roll  (adaptive p_explore, up when skipped / down when liked)
//   3. activation A_j    = strength + freshness − fatigue + like-pref → softmax → sample
//   4. secondary blend   → p_t = normalize(c_m* + α Σ β_j c_j)

export type PriorityParams = {
  tau: number; // softmax temperature over activations
  alpha: number; // how much secondary interests bend the primary
  topSecondary: number; // how many secondary interests to blend
  freshWeight: number; // bonus for interests not used recently
  freshHours: number; // hours until the freshness bonus saturates
  fatigueWeight: number; // penalty for interests shown a lot this session
  likeWeight: number; // weight on the within-interest like adjustment
  likePrior: number; // shrinkage of the like rate toward the session mean
  momentumWeight: number; // weight on recent-engagement momentum (dominates by design)
  exploreBase: number; // base exploration probability (neutral session)
  exploreSkipWeight: number; // ↑ explore when the session is being skipped
  exploreLikeWeight: number; // ↓ explore when the session is landing likes
  exploreMin: number; // clamp: never explore less than this
  exploreMax: number; // clamp: never explore more than this
};

export const DEFAULT_PARAMS: PriorityParams = {
  tau: 0.5,
  alpha: 0.2,
  topSecondary: 3,
  freshWeight: 0.3,
  freshHours: 24,
  fatigueWeight: 0.4,
  likeWeight: 0.5,
  likePrior: 5,
  // Momentum is deliberately the loudest term: at ±1 it moves activation by ±3,
  // which under tau=0.5 is an e^±6 swing in the softmax — enough for a currently
  // worn-out topic to lose to a freshly-liked one regardless of long-term strength.
  momentumWeight: 3.0,
  exploreBase: 0.1,
  exploreSkipWeight: 0.3,
  exploreLikeWeight: 0.2,
  exploreMin: 0.02,
  exploreMax: 0.4,
};

export type PriorityContext = {
  /** Primary interest ids chosen recently this session (most recent last). */
  recentInterestIds?: string[];
  /** Per-interest engagement this session, keyed by interest id (drives the like feature). */
  interestSessionStats?: Record<string, { likes: number; interactions: number }>;
  /** Session-wide like rate (liked / interactions). Centers the like feature + adapts explore. */
  sessionLikeRate?: number;
  /** Session-wide skip rate (skipped / interactions). Adapts exploration. */
  sessionSkipRate?: number;
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
  const stats = ctx.interestSessionStats ?? {};
  const sessionMean = ctx.sessionLikeRate ?? 0;

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

  // Step 2 — Exploration roll: an adaptive chance to ignore known interests,
  // rising when the session is being skipped and falling when it lands likes.
  const pExplore = exploreProbability(ctx.sessionSkipRate ?? 0, sessionMean, p);
  if (explore.length > 0 && rand() < pExplore) {
    return {
      vector: pickExploreDirection(explore, interests, rand),
      mode: "explore",
      primaryInterestId: null,
      secondaryIds: [],
      activations: [],
    };
  }

  // Step 3 — Activation score per interest, then softmax, then sample.
  const scores = interests.map((it) => activation(it, recent, now, stats, sessionMean, p));
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

/**
 * Shrunk, session-mean-centered within-interest like rate. Small-sample clusters
 * are pulled toward the session mean by `prior`, and the result is centered so a
 * cluster performing at the session average contributes exactly 0 (neutral).
 */
export function likeAdjustment(
  likes: number,
  interactions: number,
  sessionMean: number,
  prior: number,
): number {
  const rate = (likes + prior * sessionMean) / (interactions + prior);
  return rate - sessionMean;
}

/**
 * A_j = strength + w_f·freshRaw − w_x·fatigue + w_l·likeAdj + w_m·momentum — the
 * per-interest activation as a fixed-weight linear readout (P_jᵀ S_t with hand-set
 * weights). `freshRaw` and `fatigue` are unweighted feature values in [0,1];
 * `momentum` is the recent-engagement trace already decayed to now (~[-1,1]).
 */
export function interestActivation(
  strength: number,
  freshRaw: number,
  fatigue: number,
  likeAdj: number,
  momentum: number,
  p: PriorityParams,
): number {
  return (
    strength +
    p.freshWeight * freshRaw -
    p.fatigueWeight * fatigue +
    p.likeWeight * likeAdj +
    p.momentumWeight * momentum
  );
}

/** Adaptive exploration probability, clamped to [exploreMin, exploreMax]. */
export function exploreProbability(
  skipRate: number,
  likeRate: number,
  p: PriorityParams,
): number {
  const raw = p.exploreBase + p.exploreSkipWeight * skipRate - p.exploreLikeWeight * likeRate;
  return Math.min(p.exploreMax, Math.max(p.exploreMin, raw));
}

/** A_j = strength + freshness − fatigue + like-preference (fixed-weight readout). */
function activation(
  interest: UserInterest,
  recent: string[],
  now: number,
  stats: Record<string, { likes: number; interactions: number }>,
  sessionMean: number,
  p: PriorityParams,
): number {
  const hours = (now - Date.parse(interest.lastUsedAt)) / 3_600_000;
  const freshRaw = Math.min(Math.max(hours, 0) / p.freshHours, 1);

  const fatigue =
    recent.length === 0
      ? 0
      : recent.filter((id) => id === interest.id).length / recent.length;

  const s = stats[interest.id];
  const likeAdj = s ? likeAdjustment(s.likes, s.interactions, sessionMean, p.likePrior) : 0;

  // Decay the stored momentum over the same idle window freshness measures, so a
  // topic dormant for days has its "worn-out" penalty relax back toward neutral.
  const momentum = momentumDecay(interest.momentum, hours);

  return interestActivation(interest.strength, freshRaw, fatigue, likeAdj, momentum, p);
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
