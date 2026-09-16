import type { Ability, Embedding, UserInterest } from "../types";
import { updateAbility, updateDifficulty } from "./difficulty";
import { updateInterests } from "./interest";

// The feedback loop after a question is shown. Three SEPARATE updates from two
// different signals:
//
//   interest state  ← engagement signal   (what does the user want to see?)
//   user ability    ← correctness error   (how hard should the next one be?)
//   question difficulty ← correctness error
//
// They stay decoupled on purpose. Engagement never touches ability; correctness
// never touches interest.

export const QUICK_SKIP_MS = 1500; // swiping away faster than this = a quick skip

/** The observed outcome for one shown question. */
export type Interaction = {
  liked: boolean;
  answered: boolean;
  correct: boolean | null; // null when not answered
  responseTimeMs: number | null;
};

/**
 * Engagement signal r_t. A "dislike" is a lingered swipe-away without answering;
 * a "quick skip" is swiping away almost immediately (weaker negative).
 *   like +1 · answer +0.1 · quick skip −0.5 · dislike −1
 */
export function engagementSignal(x: Interaction): number {
  if (x.liked) return 1;
  if (x.answered) return 0.1;
  if (x.responseTimeMs != null && x.responseTimeMs < QUICK_SKIP_MS) return -0.5;
  return -1;
}

export type UpdateInput = {
  ability: Ability;
  interests: UserInterest[];
  userId: string;
  question: { embedding: Embedding; difficulty: number };
  interaction: Interaction;
  now?: string;
};

export type UpdateResult = {
  ability: Ability;
  interests: UserInterest[];
  difficulty: number; // new difficulty for the shown question
  engagement: number; // r_t, for logging / training
};

export function applyInteraction(input: UpdateInput): UpdateResult {
  const now = input.now ?? new Date().toISOString();
  const { embedding, difficulty } = input.question;
  const engagement = engagementSignal(input.interaction);

  // 1. interest state ← engagement (never correctness)
  const interests = updateInterests(input.interests, embedding, engagement, input.userId, now);

  // 2 & 3. ability + difficulty ← correctness error (only when answered).
  // Both read the PRE-update ability so they share the same prediction error.
  let ability = input.ability;
  let nextDifficulty = difficulty;
  if (input.interaction.answered && input.interaction.correct !== null) {
    const correct = input.interaction.correct;
    ability = updateAbility(input.ability, embedding, difficulty, correct);
    nextDifficulty = updateDifficulty(difficulty, input.ability, embedding, correct);
  }

  return { ability, interests, difficulty: nextDifficulty, engagement };
}
