import { newAbility } from "../rec/difficulty";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../types";
import { sql } from "./client";

// Per-user settings (migration 0015): the exploration + difficulty knobs the
// in-DB recommender reads each swipe, plus the client-only blur flag. Server-side
// only — the plain { number, number, boolean } shape is all that crosses to the
// client via the getSettings()/saveSettings() server actions.

// Difficulty is bounded away from the degenerate 0/1 targets (which would ask for
// impossible / trivial questions the bank can't satisfy). Exploration spans the
// full [0,1] — both endpoints are meaningful.
const TARGET_P_MIN = 0.5;
const TARGET_P_MAX = 0.9;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Read a user's settings, falling back to defaults when the row doesn't exist yet. */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const rows = await sql<
    { explore_level: number; target_p: number; blur_answers: boolean }[]
  >`
    select explore_level, target_p, blur_answers from users where id = ${userId}
  `;
  const row = rows[0];
  if (!row) return { ...DEFAULT_USER_SETTINGS };
  return {
    exploreLevel: row.explore_level,
    targetP: row.target_p,
    blurAnswers: row.blur_answers,
  };
}

/**
 * Persist a user's settings, creating the user row (fresh-user ability prior) if
 * this is the first thing they do. Values are clamped to safe ranges here so the
 * recommender never sees a degenerate target. Returns the stored settings.
 */
export async function setUserSettings(
  userId: string,
  settings: UserSettings,
): Promise<UserSettings> {
  const clean: UserSettings = {
    exploreLevel: clamp(settings.exploreLevel, 0, 1),
    targetP: clamp(settings.targetP, TARGET_P_MIN, TARGET_P_MAX),
    blurAnswers: Boolean(settings.blurAnswers),
  };

  // Ensure the user row exists (mean 0, prior variance 5.0) — same prior
  // next_question() would create on the first swipe — then write the settings.
  const initial = newAbility();
  await sql`
    insert into users (id, ability_mean, ability_variance, explore_level, target_p, blur_answers)
    values (
      ${userId},
      ${JSON.stringify(initial.mean)}::vector,
      ${JSON.stringify(initial.variance)}::vector,
      ${clean.exploreLevel},
      ${clean.targetP},
      ${clean.blurAnswers}
    )
    on conflict (id) do update set
      explore_level = excluded.explore_level,
      target_p      = excluded.target_p,
      blur_answers  = excluded.blur_answers
  `;
  return clean;
}
