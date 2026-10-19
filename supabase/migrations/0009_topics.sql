-- TrivTok migration 0009 — broad topics for onboarding + the profile page.
--
-- A small, curated set of broad interests (Sports, Music, History, …) that a new
-- user picks from on their first visit. Each topic carries a 64-D centroid in the
-- SAME embedding space as questions/interests, so it can:
--   1. seed user_interests rows (a running start — feed goes straight to
--      'interest' mode instead of cold/explore),
--   2. label a drifting interest by its nearest topic ("favorite topics"), and
--   3. be ranked by dot(centroid, ability_mean) for "strongest areas".
--
-- The table is created empty here; centroids need the OpenAI embedding pipeline,
-- so they are populated out-of-band by scripts/seed-topics.ts (the same split as
-- the question bank, whose embeddings are computed by the import scripts).

create table topics (
  id         text primary key,        -- slug, e.g. 'sports'
  label      text not null,           -- display label, e.g. 'Sports'
  emoji      text,                    -- optional glyph for the picker
  centroid   vector(64) not null,     -- unit-length; embed(description) -> compressTo64
  sort_order int not null default 0
);
create index topics_sort_idx on topics(sort_order);
