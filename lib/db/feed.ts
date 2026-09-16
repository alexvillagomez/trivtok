import type { PublicQuestion } from "../types";
import { sql } from "./client";

// The feed loop is now a SINGLE in-DB call: next_question() records the answered
// card (interest + ability + difficulty updates), builds p_t, retrieves + scores
// + samples the next card, logs the impression, and returns ONLY the stem. One
// round-trip; nothing but the ~130-byte result leaves Postgres. The rec math
// lives in lib/rec (the oracle) and, in production, in supabase/migrations
// 0004/0005 — golden-tested equal by scripts/try-sql-parity.ts.

export type FeedInteractionInput = {
  userId: string;
  sessionId: string;
  questionId: string;
  impressionId: string | null; // the impression this outcome answers
  shownAt: string; // kept for validation/telemetry; the DB stamps its own time
  selectedIndex: number | null;
  liked: boolean;
  responseTimeMs: number;
  excludeIds?: string[]; // ids already queued in the client's preload buffer
};

export type NextCard = {
  nextQuestion: PublicQuestion;
  impressionId: string;
  recommendationMode: "interest" | "explore" | "cold";
  interestCount: number;
  cycleComplete: boolean;
};

export type FeedInteractionResult = NextCard;

type NextRow = {
  question_id: string;
  stem: string;
  choices: string[];
  correct_index: number;
  difficulty: number;
  impression_id: string;
  mode: "interest" | "explore" | "cold";
  interest_count: number;
};

function toCard(row: NextRow): NextCard {
  return {
    nextQuestion: {
      id: row.question_id,
      text: row.stem,
      choices: row.choices,
      correctIndex: row.correct_index,
      difficulty: row.difficulty,
    },
    impressionId: row.impression_id,
    recommendationMode: row.mode,
    interestCount: row.interest_count,
    cycleComplete: false, // the function recycles the bank internally
  };
}

/** Open a feed session: pick and log the first card (routed through the recommender). */
export async function startFeed(
  userId: string,
  sessionId: string,
  excludeIds: string[] = [],
): Promise<NextCard> {
  const [row] = await sql<NextRow[]>`
    select * from next_question(
      ${userId}::uuid, ${sessionId}::uuid,
      null, null, null, false, null,
      ${excludeIds}::uuid[])`;
  if (!row) throw new Error("No questions are available");
  return toCard(row);
}

/** Record one completed card and get the next — the whole loop in one DB call. */
export async function recordInteractionAndSelectNext(
  input: FeedInteractionInput,
): Promise<FeedInteractionResult> {
  const responseTimeMs = Math.max(0, Math.min(input.responseTimeMs, 3_600_000));
  const [row] = await sql<NextRow[]>`
    select * from next_question(
      ${input.userId}::uuid, ${input.sessionId}::uuid, ${input.questionId}::uuid,
      ${input.impressionId}::bigint, ${input.selectedIndex}::int, ${input.liked}::boolean,
      ${responseTimeMs}::int, ${input.excludeIds ?? []}::uuid[])`;
  if (!row) throw new Error("No questions are available");
  return toCard(row);
}
