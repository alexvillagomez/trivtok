import type { Embedding, Question } from "../types";
import { dot } from "../vector";

// Step 4 — semantic retrieval. Score every question by p_t·e_i and keep the
// top K. This is the "ANN" stand-in: exact brute force over the in-memory bank.
// The interface is deliberately the shape a pgvector query replaces later:
//   SELECT * FROM questions ORDER BY embedding <=> p_t LIMIT k
// so swapping brute force → HNSW touches only this function.

export type Candidate = {
  question: Question;
  semantic: number; // p_t · e_i
};

export function retrieveCandidates(
  priority: Embedding,
  questions: Question[],
  k = 150,
): Candidate[] {
  const scored: Candidate[] = questions.map((question) => ({
    question,
    semantic: dot(priority, question.embedding),
  }));
  scored.sort((a, b) => b.semantic - a.semantic);
  return scored.slice(0, k);
}
