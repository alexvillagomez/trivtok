"use server";

import {
  recordInteractionAndSelectNext,
  startFeed,
  type FeedInteractionInput,
  type FeedInteractionResult,
  type NextCard,
} from "@/lib/db/feed";
import { linkAnonymousToAccount } from "@/lib/db/accounts";
import {
  insertQuestionReport,
  isReportReason,
  type ReportReason,
} from "@/lib/db/reports";
import {
  getFavoriteTopics,
  getLifetimeStats,
  getStrongestAreas,
  listTopics,
  setStartingInterests,
} from "@/lib/db/topics";
import type { PublicTopic } from "@/lib/types";
import { verifyAccessToken } from "@/lib/supabase/server";

type SubmitInteractionResult =
  | ({ ok: true } & FeedInteractionResult)
  | { ok: false; error: string };

type StartFeedResult =
  | ({ ok: true } & NextCard)
  | { ok: false; error: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValid(input: FeedInteractionInput): boolean {
  return (
    UUID.test(input.userId) &&
    UUID.test(input.sessionId) &&
    UUID.test(input.questionId) &&
    (input.impressionId === null || /^\d+$/.test(input.impressionId)) &&
    !Number.isNaN(Date.parse(input.shownAt)) &&
    (input.selectedIndex === null ||
      (Number.isInteger(input.selectedIndex) &&
        input.selectedIndex >= 0 &&
        input.selectedIndex <= 3)) &&
    typeof input.liked === "boolean" &&
    Number.isFinite(input.responseTimeMs) &&
    input.responseTimeMs >= 0
  );
}

/** Open a feed session and get (and log) the first card. */
export async function beginFeed(
  userId: string,
  sessionId: string,
  excludeIds: string[] = [],
): Promise<StartFeedResult> {
  if (!UUID.test(userId) || !UUID.test(sessionId)) {
    return { ok: false, error: "Invalid session" };
  }
  const validExcludeIds = excludeIds.filter((id) => UUID.test(id));
  try {
    const card = await startFeed(userId, sessionId, validExcludeIds);
    return { ok: true, ...card };
  } catch (error) {
    console.error("beginFeed failed", error);
    return { ok: false, error: "Could not start the feed" };
  }
}

type LinkAccountResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Link the current anonymous id to a signed-in Supabase account and return the
 * canonical user id the client should use going forward. Verifies the access
 * token server-side before touching any data.
 */
export async function linkAccount(
  anonId: string,
  accessToken: string,
): Promise<LinkAccountResult> {
  if (!UUID.test(anonId)) return { ok: false, error: "Invalid id" };
  if (typeof accessToken !== "string" || accessToken.length < 10) {
    return { ok: false, error: "Missing access token" };
  }
  try {
    const authed = await verifyAccessToken(accessToken);
    if (!authed) return { ok: false, error: "Not authenticated" };
    const userId = await linkAnonymousToAccount(anonId, authed.id, authed.email);
    return { ok: true, userId };
  } catch (error) {
    console.error("linkAccount failed", error);
    return { ok: false, error: "Could not link account" };
  }
}

type ReportQuestionInput = {
  questionId: string;
  userId: string | null;
  sessionId: string | null;
  reason: string;
  detail?: string | null;
};

type ReportQuestionResult = { ok: true } | { ok: false; error: string };

const MAX_DETAIL = 500;

/**
 * Flag a question the viewer thinks is broken (gives away its answer, wrong
 * key, offensive, …). The report is a triage signal for a human — it does not
 * remove the question from the feed on its own.
 */
export async function reportQuestion(
  input: ReportQuestionInput,
): Promise<ReportQuestionResult> {
  if (!UUID.test(input.questionId)) {
    return { ok: false, error: "Invalid question" };
  }
  const reason: ReportReason = isReportReason(input.reason)
    ? input.reason
    : "other";
  const userId =
    input.userId && UUID.test(input.userId) ? input.userId : null;
  const sessionId =
    input.sessionId && UUID.test(input.sessionId) ? input.sessionId : null;
  const detail =
    typeof input.detail === "string" && input.detail.trim().length > 0
      ? input.detail.trim().slice(0, MAX_DETAIL)
      : null;

  try {
    await insertQuestionReport({
      questionId: input.questionId,
      userId,
      sessionId,
      reason,
      detail,
    });
    return { ok: true };
  } catch (error) {
    console.error("reportQuestion failed", error);
    return { ok: false, error: "Could not submit report" };
  }
}

// --- Interests onboarding + profile ----------------------------------------

const TOPIC_ID = /^[a-z0-9-]{1,40}$/;

/** The preset broad interests for the onboarding picker (display fields only). */
export async function getTopics(): Promise<PublicTopic[]> {
  try {
    return await listTopics();
  } catch (error) {
    console.error("getTopics failed", error);
    return [];
  }
}

type SaveInterestsResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

/** Seed the user's starting interests from the topics they picked. */
export async function saveInterests(
  userId: string,
  topicIds: string[],
): Promise<SaveInterestsResult> {
  if (!UUID.test(userId)) return { ok: false, error: "Invalid id" };
  if (!Array.isArray(topicIds)) return { ok: false, error: "Invalid selection" };
  const ids = Array.from(new Set(topicIds.filter((id) => TOPIC_ID.test(id))));
  if (ids.length === 0) return { ok: false, error: "Pick at least one interest" };
  try {
    const inserted = await setStartingInterests(userId, ids);
    return { ok: true, inserted };
  } catch (error) {
    console.error("saveInterests failed", error);
    return { ok: false, error: "Could not save your interests" };
  }
}

export type ProfileData = {
  favoriteTopics: { label: string; strength: number }[];
  strongestAreas: { label: string; score: number }[];
  lifetime: {
    seen: number;
    answered: number;
    correct: number;
    accuracy: number;
    liked: number;
  };
};

type GetProfileResult =
  | ({ ok: true } & ProfileData)
  | { ok: false; error: string };

/**
 * Everything the profile page shows about the user: favorite topics (from
 * interest strength), strongest areas (from Bayesian ability), and lifetime
 * stats. Returns only plain display rows — no centroids/embeddings/ability.
 */
export async function getProfile(userId: string): Promise<GetProfileResult> {
  if (!UUID.test(userId)) return { ok: false, error: "Invalid id" };
  try {
    const [favoriteTopics, strongestAreas, lifetime] = await Promise.all([
      getFavoriteTopics(userId),
      getStrongestAreas(userId),
      getLifetimeStats(userId),
    ]);
    return { ok: true, favoriteTopics, strongestAreas, lifetime };
  } catch (error) {
    console.error("getProfile failed", error);
    return { ok: false, error: "Could not load your profile" };
  }
}

export async function submitInteraction(
  input: FeedInteractionInput,
): Promise<SubmitInteractionResult> {
  if (!isValid(input)) return { ok: false, error: "Invalid interaction" };

  try {
    const result = await recordInteractionAndSelectNext(input);
    return { ok: true, ...result };
  } catch (error) {
    console.error("submitInteraction failed", error);
    return { ok: false, error: "Could not save interaction" };
  }
}
