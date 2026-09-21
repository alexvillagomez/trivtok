import OpenAI from "openai";
import type { Question } from "../types";
import { compressTo64 } from "./compress";
import { normalize } from "../vector";

// The ONE place the embedding provider lives. Everything else calls
// embedTexts()/embedAndCompress() and never imports OpenAI directly, so
// switching providers (Voyage, a local model, etc.) is a change to this file
// only. The pipeline is: text → provider embedding → compressTo64 → 64-D unit.

const MODEL = "text-embedding-3-small"; // 1536-D
const BATCH_SIZE = 256; // OpenAI accepts arrays; batch to stay well within limits

// Near-duplicate detection lives in its own vector space (see migration 0014):
// a Matryoshka truncation of the SAME "stem + correct answer" text to 256-D.
// Finer than the 64-D recommendation vector, ~6x cheaper than full 1536-D.
export const DEDUP_DIM = 256;
// Near-dup gate uses a DOUBLE LEVER (see lib/db/dedup.ts):
//   reject if  cosine >= DEDUP_THRESHOLD
//          or  (cosine >= DEDUP_THRESHOLD_SAME_ANSWER AND the correct answers match)
// The hard cutoff catches rewordings regardless of answer; the softer,
// answer-gated cutoff reaches down into the 0.75–0.80 band to catch heavier
// paraphrases of the same fact (which share their answer) without flagging
// same-template/different-answer "cousins" (compass bearings, coin-flip variants,
// D-major vs F#-major), which sit in the same band but have DIFFERENT answers.
export const DEDUP_THRESHOLD = 0.8;
export const DEDUP_THRESHOLD_SAME_ANSWER = 0.75;

const client = new OpenAI(); // reads OPENAI_API_KEY from the environment

/**
 * The text we embed for a question: the stem plus the correct answer choice.
 * This is the semantic "what is this question about" signal used for retrieval.
 */
export function embeddingInput(q: Pick<Question, "text" | "choices" | "correctIndex">): string {
  return `${q.text} ${q.choices[q.correctIndex]}`;
}

/** Raw provider embeddings (full dimension), in the same order as `texts`. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const chunk = texts.slice(start, start + BATCH_SIZE);
    const res = await client.embeddings.create({ model: MODEL, input: chunk });
    // Place by returned index to be safe about ordering within the batch.
    for (const item of res.data) out[start + item.index] = item.embedding;
  }
  return out;
}

/** Provider embeddings compressed to normalized 64-D vectors. */
export async function embedAndCompress(texts: string[]): Promise<number[][]> {
  const raw = await embedTexts(texts);
  return raw.map(compressTo64);
}

/**
 * DEDUP_DIM (256-D) unit vectors for near-duplicate detection. Uses OpenAI's
 * `dimensions` parameter (Matryoshka) so the reduction is trained, not random,
 * then normalizes so a pgvector inner-product (`<#>`) equals cosine similarity.
 */
export async function embedDedup(texts: string[]): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const chunk = texts.slice(start, start + BATCH_SIZE);
    const res = await client.embeddings.create({
      model: MODEL,
      input: chunk,
      dimensions: DEDUP_DIM,
    });
    for (const item of res.data) out[start + item.index] = normalize(item.embedding);
  }
  return out;
}
