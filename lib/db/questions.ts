import type { Embedding } from "../types";
import { sql } from "./client";

// Data access for the question bank. pgvector stores/returns vectors as the
// text form "[0.1,0.2,...]", which is exactly JSON — so we JSON.stringify on the
// way in and JSON.parse on the way out.
//
// Retrieval, scoring, and difficulty/like updates all happen inside
// next_question() (0005) in one round-trip, and nothing else reads the bank out
// to the app — so no query here loads question rows (that would egress data,
// including embeddings). This module is just the seed insert.

/** Seed shape: the rows written by the authored-question import scripts. */
export type QuestionSeed = {
  text: string;
  choices: string[];
  correctIndex: number;
  difficulty: number;
  embedding: Embedding;
  // 256-D near-dup vector (migration 0014). Optional: the no-API local import
  // path has no way to compute it, so those rows insert NULL.
  embedding256?: Embedding;
};

/** Append a batch of questions. Safe to call concurrently from many topics. */
export async function insertQuestions(seeds: QuestionSeed[]): Promise<number> {
  if (seeds.length === 0) return 0;
  await sql.begin(async (tx) => {
    for (const q of seeds) {
      const embedding256 = q.embedding256 ? JSON.stringify(q.embedding256) : null;
      await tx`
        insert into questions (text, choices, correct_index, difficulty, embedding, embedding_256)
        values (${q.text}, ${q.choices}, ${q.correctIndex}, ${q.difficulty}, ${JSON.stringify(q.embedding)}::vector, ${embedding256}::vector)
      `;
    }
  });
  return seeds.length;
}
