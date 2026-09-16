import { EMBEDDING_DIM, type Ability, type Embedding } from "../types";

// Difficulty via Bayesian multidimensional IRT. Ability is a diagonal Gaussian
// N(mean, diag(variance)) over 64 dimensions. For a question with embedding e
// and stored difficulty d (mapped to a logit-scale offset b):
//
//   s      = mean·e − b                 (mean margin)
//   totVar = Σ e_d² · variance_d        (predictive variance along e)
//   P(correct) = Φ( s / √(β² + totVar) )   (probit, confidence-moderated)
//
// When we're uncertain (large variance), the denominator grows and P is pulled
// toward 0.5 — so a new user gets middling-difficulty questions until we know
// them. The update (Gaussian assumed-density filtering, AdPredictor-style) is
// closed-form and O(64): variance only ever shrinks as we learn. This is the
// automatic, principled replacement for a fixed learning rate.

export const TARGET_P = 0.7; // aim to show questions the user gets right ~70%
export const PRIOR_VARIANCE = 1.0; // σ₀² for a fresh user (max uncertainty)
export const BETA = 1.0; // observation noise; larger = each answer moves less
export const DIFFICULTY_LR = 0.02; // small: difficulty stabilizes across many users

// --- standard normal helpers -------------------------------------------------

// The probit link is replaced by its LOGISTIC APPROXIMATION, Φ(x) ≈ σ(1.702·x).
// This removes erf / normPdf entirely: the whole ADF update reduces to
// elementary logistic expressions, so the exact same model ports cleanly into
// SQL/PL-pgSQL (the in-DB serving function) with nothing but exp(). Accuracy
// loss vs the true Gaussian is negligible for recommendation, and the update
// multiplier v is now bounded (gentler on extreme surprises) instead of
// diverging as Φ→0.
const PROBIT_LOGISTIC_SCALE = 1.702; // best L∞ match of σ(a·x) to the N(0,1) CDF

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Standard-normal CDF — logistic approximation. */
function normCdf(z: number): number {
  return sigmoid(PROBIT_LOGISTIC_SCALE * z);
}

// ADF update multipliers under the logistic surrogate:
//   v(t) = φ(t)/Φ(t) ≈ a·(1 − σ(a·t)) = a·σ(−a·t)
//   w(t) = v(t)·(v(t) + t)
function vFunc(t: number): number {
  return PROBIT_LOGISTIC_SCALE * sigmoid(-PROBIT_LOGISTIC_SCALE * t);
}

function wFunc(t: number): number {
  const v = vFunc(t);
  return v * (v + t);
}

// --- model -------------------------------------------------------------------

/** Map stored difficulty (0..1) onto a logit-scale offset b (~ -2..+2), and back. */
export function difficultyToLogit(d01: number): number {
  return (d01 - 0.5) * 4;
}
function logitToDifficulty(b: number): number {
  return Math.min(1, Math.max(0, b / 4 + 0.5));
}

/** Mean margin and predictive variance of (e·θ − b) under the Gaussian ability. */
function margin(ability: Ability, embedding: Embedding, difficulty01: number) {
  let s = 0;
  let totVar = 0;
  for (let i = 0; i < embedding.length; i++) {
    s += ability.mean[i] * embedding[i];
    totVar += embedding[i] * embedding[i] * ability.variance[i];
  }
  s -= difficultyToLogit(difficulty01);
  return { s, totVar };
}

/** Confidence-moderated P(correct): pulled toward 0.5 while ability is uncertain. */
export function pCorrect(
  ability: Ability,
  embedding: Embedding,
  difficulty01: number,
  beta: number = BETA,
): number {
  const { s, totVar } = margin(ability, embedding, difficulty01);
  return normCdf(s / Math.sqrt(beta * beta + totVar));
}

/** Difficulty suitability factor in (0,1]: highest when P is exactly at target. */
export function difficultyFactor(p: number): number {
  return 1 - Math.abs(p - TARGET_P);
}

/**
 * Bayesian update after an ANSWERED question (Gaussian ADF). Moves the mean
 * toward/away from the question's direction and shrinks variance there. Joint
 * across all 64 dims, self-pacing (big when uncertain, tiny when confident).
 */
export function updateAbility(
  ability: Ability,
  embedding: Embedding,
  difficulty01: number,
  correct: boolean,
  beta: number = BETA,
): Ability {
  const { s, totVar } = margin(ability, embedding, difficulty01);
  const c = Math.sqrt(beta * beta + totVar);
  const y = correct ? 1 : -1;
  const t = (y * s) / c;
  const v = vFunc(t);
  const w = wFunc(t);

  const mean = ability.mean.slice();
  const variance = ability.variance.slice();
  for (let i = 0; i < embedding.length; i++) {
    const e = embedding[i];
    mean[i] += y * ((e * ability.variance[i]) / c) * v;
    variance[i] *= 1 - ((e * e * ability.variance[i]) / (c * c)) * w;
  }
  return { mean, variance };
}

/**
 * Update a question's difficulty from the same correctness error that updates
 * ability: b ← b − η_b(y − P). Unexpectedly-correct → easier; unexpectedly-wrong
 * → harder. Small lr so difficulty stabilizes across many users. Uses the
 * pre-update ability so ability and difficulty share the same prediction error.
 * Stays in 0..1.
 */
export function updateDifficulty(
  difficulty01: number,
  ability: Ability,
  embedding: Embedding,
  correct: boolean,
  lr: number = DIFFICULTY_LR,
): number {
  const p = pCorrect(ability, embedding, difficulty01);
  const y = correct ? 1 : 0;
  const newLogit = difficultyToLogit(difficulty01) - lr * (y - p);
  return logitToDifficulty(newLogit);
}

/** A fresh user's ability: mean 0, maximum prior variance in every direction. */
export function newAbility(priorVariance: number = PRIOR_VARIANCE): Ability {
  return {
    mean: new Array(EMBEDDING_DIM).fill(0),
    variance: new Array(EMBEDDING_DIM).fill(priorVariance),
  };
}
