// Core domain types for TrivTok.
// These mirror the planned Supabase tables so the same shapes flow
// from the database → recommendation engine → UI without translation.

/** Length of every semantic embedding vector. */
export const EMBEDDING_DIM = 64;

/** A normalized semantic embedding in R^64 (unit length). */
export type Embedding = number[];

export type Question = {
  id: string;
  text: string;
  choices: string[]; // exactly 4 for the MVP
  correctIndex: number; // index into `choices`
  difficulty: number; // stored 0..1; logit-scaled at scoring time (b_i)
  embedding: Embedding; // e_i in R^64, normalized
  likeCount: number; // aggregate likes, for the rating factor
  dislikeCount: number; // aggregate dislikes, for the rating factor
};

/**
 * What the browser is allowed to receive: an explicit allow-list of display
 * fields, nothing else. Embeddings, like/dislike counts, and any future
 * server-only stats stay on the server. Map with toPublicQuestion() before
 * sending anything to the client.
 */
export type PublicQuestion = Pick<
  Question,
  "id" | "text" | "choices" | "correctIndex" | "difficulty"
>;

export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    text: q.text,
    choices: q.choices,
    correctIndex: q.correctIndex,
    difficulty: q.difficulty,
  };
}

/**
 * Bayesian ability: a diagonal Gaussian over the 64-D ability vector.
 * `mean` is the point estimate (θ); `variance` is our uncertainty per
 * dimension. Both persist per user (DB: two vector(64) columns).
 */
export type Ability = {
  mean: Embedding;
  variance: Embedding;
};

export type User = {
  id: string;
  ability: Ability;
  createdAt: string;
};

/** One semantic interest cluster for a user. */
export type UserInterest = {
  id: string;
  userId: string;
  centroid: Embedding; // c_m in R^64, normalized
  strength: number; // how much the user likes this cluster
  positiveCount: number; // number of positive interactions seen
  lastUsedAt: string; // ISO timestamp, for the freshness bonus
};

/** The four ways a user can respond to a shown question. */
export type Reaction = "answer" | "like" | "dislike" | "skip";

/** An append-only log row. One per shown question. */
export type Interaction = {
  userId: string;
  questionId: string;
  shownAt: string; // ISO timestamp
  answered: boolean;
  correct: boolean | null; // null when not answered
  liked: boolean;
  disliked: boolean;
  skipped: boolean;
  responseTimeMs: number | null;
  sessionId: string;
};
