import { newAbility } from "../rec/difficulty";
import { INITIAL_STRENGTH } from "../rec/interest";
import { type PublicTopic } from "../types";
import { sql } from "./client";

// Data access for broad topics + the profile read models. Server-side only
// (never imported by a client component) — centroids, ability vectors, and raw
// embeddings never leave this layer. The profile page consumes only the plain
// { label, ... } rows returned here, via the getProfile() server action.

/** List topics for the onboarding picker (display fields only — no centroid). */
export async function listTopics(): Promise<PublicTopic[]> {
  const rows = await sql<
    { id: string; label: string; emoji: string | null; sort_order: number }[]
  >`
    select id, label, emoji, sort_order
    from topics
    order by sort_order asc, label asc
  `;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    emoji: r.emoji,
    sortOrder: r.sort_order,
  }));
}

/**
 * Seed a user's STARTING interests from the topics they picked. One
 * user_interests row per topic, centroid = the topic centroid, strength =
 * INITIAL_STRENGTH — so the feed goes straight to 'interest' mode. Ensures the
 * user row exists first (same fresh-user prior as next_question / accounts.ts).
 * Idempotent: topics the user already has a near-duplicate interest for are
 * skipped, so re-picking never stacks duplicates. Returns rows inserted.
 */
export async function setStartingInterests(
  userId: string,
  topicIds: string[],
): Promise<number> {
  if (topicIds.length === 0) return 0;

  return sql.begin(async (tx) => {
    // 0. ensure the user row exists (mean 0, prior variance 5.0) — matches the
    //    row next_question() would otherwise create on the first swipe.
    const initial = newAbility();
    await tx`
      insert into users (id, ability_mean, ability_variance)
      values (
        ${userId},
        ${JSON.stringify(initial.mean)}::vector,
        ${JSON.stringify(initial.variance)}::vector
      )
      on conflict (id) do nothing
    `;

    // 1. insert one interest per chosen topic, skipping any topic whose centroid
    //    is already ~covered by an existing interest of this user (idempotency).
    //    SPAWN_SIMILARITY (0.5) is the same "close enough" threshold the engine
    //    uses; <#> is negative inner product, so "closer than 0.5" is <#> < -0.5.
    const inserted = await tx<{ id: string }[]>`
      insert into user_interests (user_id, centroid, strength)
      select ${userId}, t.centroid, ${INITIAL_STRENGTH}
      from topics t
      where t.id in ${tx(topicIds)}
        and not exists (
          select 1 from user_interests ui
          where ui.user_id = ${userId}
            and (ui.centroid <#> t.centroid) < -0.5
        )
      returning id
    `;
    return inserted.length;
  });
}

/**
 * A user's favorite topics: each interest cluster labeled by its nearest topic,
 * ranked by how strongly the user likes it. Deduped to one row per topic label.
 */
export async function getFavoriteTopics(
  userId: string,
  limit = 5,
): Promise<{ label: string; strength: number }[]> {
  const rows = await sql<{ label: string; strength: number }[]>`
    select label, max(strength)::float8 as strength
    from (
      select nearest.label, ui.strength
      from user_interests ui
      cross join lateral (
        select t.label
        from topics t
        order by t.centroid <#> ui.centroid   -- <#> = -inner product; smallest = nearest
        limit 1
      ) nearest
      where ui.user_id = ${userId}
    ) labeled
    group by label
    order by strength desc
    limit ${limit}
  `;
  return rows;
}

/**
 * A user's strongest areas: topics ranked by dot(topic.centroid, ability_mean).
 * A brand-new user (ability θ = 0) scores 0 everywhere; those are filtered out so
 * the profile shows a clean empty state until they've answered some questions.
 */
export async function getStrongestAreas(
  userId: string,
  limit = 5,
): Promise<{ label: string; score: number }[]> {
  const rows = await sql<{ label: string; score: number }[]>`
    select t.label, (-(t.centroid <#> u.ability_mean))::float8 as score
    from topics t, users u
    where u.id = ${userId}
    order by t.centroid <#> u.ability_mean asc   -- most positive inner product first
    limit ${limit}
  `;
  return rows.filter((r) => r.score > 1e-9);
}

/** Lifetime engagement stats for the profile. */
export async function getLifetimeStats(userId: string): Promise<{
  seen: number;
  answered: number;
  correct: number;
  accuracy: number; // 0..1; 0 when nothing answered
  liked: number;
}> {
  const [answers] = await sql<
    { answered: number; correct: number; liked: number }[]
  >`
    select
      count(*) filter (where answered)::int as answered,
      count(*) filter (where correct)::int  as correct,
      count(*) filter (where liked)::int    as liked
    from interactions
    where user_id = ${userId}
  `;
  const [impressions] = await sql<{ seen: number }[]>`
    select count(*)::int as seen from impressions where user_id = ${userId}
  `;

  const answered = answers?.answered ?? 0;
  const correct = answers?.correct ?? 0;
  return {
    seen: impressions?.seen ?? 0,
    answered,
    correct,
    accuracy: answered > 0 ? correct / answered : 0,
    liked: answers?.liked ?? 0,
  };
}
