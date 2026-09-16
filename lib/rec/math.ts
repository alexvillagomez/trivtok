// Small numeric helpers for the recommendation engine. Pure and synchronous.

/** Softmax over raw scores with temperature tau. Lower tau = greedier. */
export function softmax(scores: number[], tau: number): number[] {
  if (scores.length === 0) return [];
  const scaled = scores.map((s) => s / tau);
  const max = Math.max(...scaled); // subtract max for numerical stability
  const exps = scaled.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

/**
 * Sample one index from a probability distribution.
 * `rand` is injectable so tests can be deterministic; defaults to Math.random.
 */
export function sampleIndex(probs: number[], rand: () => number = Math.random): number {
  const r = rand();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r < acc) return i;
  }
  return probs.length - 1; // floating-point fallback
}
