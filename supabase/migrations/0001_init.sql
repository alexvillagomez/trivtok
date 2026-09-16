-- TrivTok schema (v0). Four tables + pgvector for 64-D embeddings.
-- Run against your Supabase Postgres (SQL editor or `supabase db push`).

create extension if not exists vector;

-- Question bank ------------------------------------------------------------
create table questions (
  id            uuid primary key default gen_random_uuid(),
  text          text not null,
  choices       text[] not null,            -- 4 choices
  correct_index smallint not null,          -- 0..3
  difficulty    real not null,              -- 0..1 (logit-scaled at scoring time)
  embedding     vector(64) not null,        -- e_i, normalized
  like_count    int not null default 0,
  dislike_count int not null default 0,
  created_at    timestamptz not null default now()
);

-- ANN index. Embeddings are unit length, so inner product = cosine similarity.
-- Retrieval: SELECT ... ORDER BY embedding <#> $p_t LIMIT 150
create index questions_embedding_idx on questions using hnsw (embedding vector_ip_ops);

-- Users ---------------------------------------------------------------------
-- Bayesian ability: a diagonal Gaussian over the 64-D ability vector.
create table users (
  id               uuid primary key default gen_random_uuid(),
  ability_mean     vector(64) not null,     -- θ mean (starts at 0)
  ability_variance vector(64) not null,     -- per-dim uncertainty (starts at 1)
  created_at       timestamptz not null default now()
);

-- One row per semantic interest cluster ------------------------------------
create table user_interests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  centroid       vector(64) not null,       -- c_m, normalized
  strength       real not null default 1,
  positive_count int  not null default 0,
  last_used_at   timestamptz not null default now()
);
create index user_interests_user_idx on user_interests(user_id);

-- Append-only interaction log (training data) ------------------------------
create table interactions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references users(id),
  question_id   uuid not null references questions(id),
  shown_at      timestamptz not null,
  answered      boolean not null default false,
  correct       boolean,                    -- null when not answered
  liked         boolean not null default false,
  disliked      boolean not null default false,
  skipped       boolean not null default false,
  response_time int,                        -- ms, nullable
  session_id    uuid not null,
  created_at    timestamptz not null default now()
);
create index interactions_user_idx on interactions(user_id, created_at);
