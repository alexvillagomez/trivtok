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

// Questions are authored + stored with the correct answer at index 0 (positions
// get shuffled at serve time, not in the DB). We shuffle the four choice
// "rectangles" here, on the way out, using a permutation derived deterministically
// from the question id: the browser sees a stable, non-index-0 layout, and the
// answer a user taps is translated back to the stored index before it reaches
// next_question() (which still computes correctness against stored correct_index).
//
// `perm[displayPos] = originalIndex`, so displayChoices[d] = original[perm[d]].
function choicePermutation(questionId: string): number[] {
  // Seed a small PRNG from the id's hex, then Fisher-Yates over [0,1,2,3].
  let seed = 0;
  for (const ch of questionId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const perm = [0, 1, 2, 3];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

/** Map a display-space choice index back to the stored (original) index. */
function toStoredIndex(questionId: string, displayIndex: number | null): number | null {
  if (displayIndex === null) return null;
  const perm = choicePermutation(questionId);
  return perm[displayIndex] ?? displayIndex;
}

function toCard(row: NextRow): NextCard {
  const perm = choicePermutation(row.question_id);
  return {
    nextQuestion: {
      id: row.question_id,
      text: row.stem,
      choices: perm.map((original) => row.choices[original]),
      correctIndex: perm.indexOf(row.correct_index),
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
  // The client's selectedIndex is in display (shuffled) space; translate it back
  // to the stored index the DB scored the question at before recording correctness.
  const storedSelectedIndex = toStoredIndex(input.questionId, input.selectedIndex);
  const [row] = await sql<NextRow[]>`
    select * from next_question(
      ${input.userId}::uuid, ${input.sessionId}::uuid, ${input.questionId}::uuid,
      ${input.impressionId}::bigint, ${storedSelectedIndex}::int, ${input.liked}::boolean,
      ${responseTimeMs}::int, ${input.excludeIds ?? []}::uuid[])`;
  if (!row) throw new Error("No questions are available");
  return toCard(row);
}
