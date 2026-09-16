-- TrivTok migration 0002 — durable accounts + ML-ready logging.
--
-- Three things, all aimed at making later ML training possible:
--   1. Durable identity: link the app's stable user id to a Supabase Auth
--      account so the same id follows a person across sessions and devices.
--   2. Impression log: one row every time a question is SHOWN, with the
--      serving-decision context (mode, propensity, exploration, difficulty at
--      show time). None of this is reconstructable after the fact — it must be
--      captured at serve time or it's lost.
--   3. Abandonment view: the last question of each session and whether the
--      user acted on it — the per-session churn signal for retention work.

-- 1. Durable identity --------------------------------------------------------
-- public.users.id stays the canonical, stable user id every interaction and
-- impression references. We attach a Supabase Auth user to it. Anonymous users
-- keep a client-generated id with auth_id / email NULL; signing in links the
-- account onto that existing row (anonymous-first), preserving pre-login history.
alter table users add column if not exists auth_id      uuid unique;
alter table users add column if not exists email        text unique;
alter table users add column if not exists last_seen_at timestamptz not null default now();

-- 2. Impression log ----------------------------------------------------------
-- The training data for a learned encoder / policy. Captures WHY a question was
-- shown. Outcomes (like/correct/skip) stay in `interactions` and join back via
-- impression_id.
create table impressions (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references users(id),
  question_id         uuid not null references questions(id),
  session_id          uuid not null,
  shown_at            timestamptz not null default now(),
  position            int  not null,            -- 0-based index of this card within the session
  recommendation_mode text not null,            -- 'interest' | 'explore' | 'cold'
  is_exploration      boolean not null default false,
  primary_interest_id uuid,                      -- interest that drove p_t (null for explore/cold)
  propensity          real,                      -- softmax prob the policy gave the chosen card (off-policy eval)
  difficulty_at_show  real not null,             -- question difficulty AT SHOW TIME (it drifts across users)
  created_at          timestamptz not null default now()
);
create index impressions_user_idx    on impressions(user_id, shown_at);
create index impressions_session_idx on impressions(session_id, shown_at);
create index impressions_question_idx on impressions(question_id);

-- Link each outcome back to the impression that produced it.
alter table interactions add column if not exists impression_id bigint references impressions(id);
create index if not exists interactions_impression_idx on interactions(impression_id);

-- 3. Abandonment / retention view -------------------------------------------
-- The last card each session reached (max shown_at) and whether the user acted
-- on it. interacted_last = false ⇒ they left on that question without acting:
-- the strongest per-session churn signal. cards_in_session = session depth.
create view session_abandonment as
with ranked as (
  select
    imp.id,
    imp.session_id,
    imp.user_id,
    imp.question_id,
    imp.position,
    imp.shown_at,
    row_number() over (partition by imp.session_id order by imp.shown_at desc, imp.id desc) as rn,
    count(*)     over (partition by imp.session_id) as cards_in_session
  from impressions imp
)
select
  r.session_id,
  r.user_id,
  r.question_id                       as last_question_id,
  r.position                          as last_position,
  r.cards_in_session,
  r.shown_at                          as last_shown_at,
  exists (select 1 from interactions i where i.impression_id = r.id) as interacted_last
from ranked r
where r.rn = 1;
