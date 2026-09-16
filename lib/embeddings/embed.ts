import OpenAI from "openai";
import type { Question } from "../types";
import { compressTo64 } from "./compress";

// The ONE place the embedding provider lives. Everything else calls
// embedTexts()/embedAndCompress() and never imports OpenAI directly, so
// switching providers (Voyage, a local model, etc.) is a change to this file
// only. The pipeline is: text → provider embedding → compressTo64 → 64-D unit.

const MODEL = "text-embedding-3-small"; // 1536-D
const BATCH_SIZE = 256; // OpenAI accepts arrays; batch to stay well within limits

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
