import { EMBEDDING_DIM } from "../types";
import { normalize } from "../vector";

// Compress a high-dimensional embedding down to EMBEDDING_DIM (64), then
// normalize to unit length so dot products equal cosine similarity.
//
// v0 method: a fixed random linear projection (Johnson–Lindenstrauss). It is
// deterministic (seeded), provider-agnostic, and preserves relative distances
// well enough for a first recommendation loop. This is the "doesn't matter yet"
// step — swap it for a trained autoencoder / PCA later without touching anything
// upstream or downstream. The only contract is: number[] in → 64 unit floats out.

const SEED = 1337;

/** Deterministic PRNG so the projection matrix is identical every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller. */
function gaussian(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// The projection matrix depends on the source dimension, so build (and cache)
// one lazily per source size. Keyed by srcDim → EMBEDDING_DIM × srcDim matrix.
const matrixCache = new Map<number, number[][]>();

function projectionMatrix(srcDim: number): number[][] {
  const cached = matrixCache.get(srcDim);
  if (cached) return cached;

  const rand = mulberry32(SEED);
  const matrix: number[][] = [];
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const row = new Array<number>(srcDim);
    for (let j = 0; j < srcDim; j++) row[j] = gaussian(rand);
    matrix.push(row);
  }
  matrixCache.set(srcDim, matrix);
  return matrix;
}

/** Project a vector of any dimension down to a normalized 64-D embedding. */
export function compressTo64(vec: number[]): number[] {
  const matrix = projectionMatrix(vec.length);
  const out = new Array<number>(EMBEDDING_DIM).fill(0);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const row = matrix[i];
    let sum = 0;
    for (let j = 0; j < vec.length; j++) sum += row[j] * vec[j];
    out[i] = sum;
  }
  return normalize(out);
}
