import type { Ability, Embedding, Question } from "../types";
import { difficultyFactor, pCorrect, TARGET_P } from "./difficulty";
import { sampleIndex, softmax } from "./math";
import { globalLikeRate, likeRating } from "./rating";
import { retrieveCandidates } from "./retrieve";

// Step 5 — turn candidates into the next question. Three factors, combined as a
// WEIGHTED GEOMETRIC MEAN (a weighted sum of logs), then softmax + sample:
//
//   priority_i   = max(ε, p_t·e_i)      semantic alignment
//   difficulty_i = 1 − |P_i − 0.70|     difficulty match (Bayesian P)
//   rating_i     = Beta like-rate       crowd preference (shrunk to global mean)
//
//   score_i = w_s·ln(priority_i) + w_f·ln(difficulty_i) + w_r·ln(rating_i)
//   serve  ∝ softmax(score_i / τ)
//
// Weights control each factor's INFLUENCE (rating is a tiebreaker, w_r < 1);
// τ is the single peakiness knob. This keeps the "must satisfy all" gating of
// the product while stopping any one factor from steamrolling the rest.

const EPS = 1e-6; // floor for priority + rating so ln() stays finite when they hit 0
// (rating can be 0 when the global like-rate is 0 and a candidate has no likes)

export type SelectionParams = {
  k: number; // candidates to retrieve
  tau: number; // final softmax temperature (lower = greedier)
  targetP: number; // target P(correct) — the user's difficulty setting
  wSemantic: number;
  wDifficulty: number;
  wRating: number;
};

export const DEFAULT_SELECTION: SelectionParams = {
  k: 150,
  tau: 1.5, // high temperature → nearly flat softmax over candidates, so the feed
            // varies broadly within a topic (was 0.2, which served the top card)
  targetP: TARGET_P, // 0.70 by default; the difficulty slider moves this per-user
  wSemantic: 1.0,
  wDifficulty: 1.0,
  wRating: 0.3, // rating nudges, doesn't dominate
};

export type ScoredCandidate = {
  question: Question;
  semantic: number; // raw p_t·e_i
  pCorrect: number;
  priorityFactor: number;
  difficultyFactor: number;
  ratingFactor: number;
  score: number; // weighted sum of logs
  prob: number; // softmax probability
};

export type SelectionResult = {
  chosen: Question;
  scored: ScoredCandidate[];
};

/**
 * Pick the next question given the priority vector p_t and the user's Bayesian
 * ability. Pure and synchronous.
 */
export function selectNextQuestion(
  priority: Embedding,
  ability: Ability,
  questions: Question[],
  opts: { params?: Partial<SelectionParams>; rand?: () => number } = {},
): SelectionResult {
  const params = { ...DEFAULT_SELECTION, ...opts.params };
  const rand = opts.rand ?? Math.random;
  const globalMean = globalLikeRate(questions);

  const candidates = retrieveCandidates(priority, questions, params.k);

  const partial = candidates.map((c) => {
    const p = pCorrect(ability, c.question.embedding, c.question.difficulty);
    const priorityFactor = Math.max(EPS, c.semantic);
    const dFactor = difficultyFactor(p, params.targetP);
    const rFactor = likeRating(c.question.likeCount, c.question.dislikeCount, globalMean);
    const score =
      params.wSemantic * Math.log(priorityFactor) +
      params.wDifficulty * Math.log(dFactor) +
      params.wRating * Math.log(Math.max(EPS, rFactor));
    return {
      question: c.question,
      semantic: c.semantic,
      pCorrect: p,
      priorityFactor,
      difficultyFactor: dFactor,
      ratingFactor: rFactor,
      score,
    };
  });

  const probs = softmax(
    partial.map((x) => x.score),
    params.tau,
  );
  const idx = sampleIndex(probs, rand);

  const scored: ScoredCandidate[] = partial.map((x, i) => ({ ...x, prob: probs[i] }));
  return { chosen: scored[idx].question, scored };
}
