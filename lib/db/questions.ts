import type { Embedding, Question } from "../types";
import { sql } from "./client";

// Data access for the question bank. pgvector stores/returns vectors as the
// text form "[0.1,0.2,...]", which is exactly JSON — so we JSON.stringify on the
// way in and JSON.parse on the way out.
//
// Retrieval, scoring, and difficulty/like updates used to live here as separate
// queries; they now happen inside next_question() (0005) in one round-trip, so
// this module is just bank load + seed insert.

type QuestionRow = {
  id: string;
  text: string;
  choices: string[];
  correct_index: number;
  difficulty: number;
  embedding: string | number[];
  like_count: number;
  dislike_count: number;
};

function rowToQuestion(r: QuestionRow): Question {
  return {
    id: r.id,
    text: r.text,
    choices: r.choices,
    correctIndex: r.correct_index,
    difficulty: r.difficulty,
    embedding: typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding,
    likeCount: r.like_count,
    dislikeCount: r.dislike_count,
  };
}

/** Load the question bank for the server-rendered feed (offline fallback bank). */
export async function listQuestions(): Promise<Question[]> {
  const rows = await sql<QuestionRow[]>`
    select id, text, choices, correct_index, difficulty, embedding, like_count, dislike_count
    from questions
    order by created_at asc
  `;
  return rows.map(rowToQuestion);
}

/** Seed shape: the rows written by the authored-question import scripts. */
export type QuestionSeed = {
  text: string;
  choices: string[];
  correctIndex: number;
  difficulty: number;
  embedding: Embedding;
};

/** Append a batch of questions. Safe to call concurrently from many topics. */
export async function insertQuestions(seeds: QuestionSeed[]): Promise<number> {
  if (seeds.length === 0) return 0;
  await sql.begin(async (tx) => {
    for (const q of seeds) {
      await tx`
        insert into questions (text, choices, correct_index, difficulty, embedding)
        values (${q.text}, ${q.choices}, ${q.correctIndex}, ${q.difficulty}, ${JSON.stringify(q.embedding)}::vector)
      `;
    }
  });
  return seeds.length;
}
