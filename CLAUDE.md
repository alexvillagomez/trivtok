# TrivTok

An infinite-scroll trivia app (TikTok-style feed) with a semantic recommendation
engine. Users swipe through trivia questions; the system learns what they want to
see and how hard to make it.

## Stack

- **Next.js** (App Router) + **TypeScript** + plain CSS (no UI/animation libs)
- **Supabase / Postgres** with **pgvector** for 64-D embeddings
- **postgres.js** (`postgres`) for raw SQL — server-side only
- **OpenAI** `text-embedding-3-small` for embeddings (the ONLY runtime LLM API call)

## Engineering principles (do not violate)

This is v0. Prioritize readability, simple functions, obvious data flow, easy
debugging, and clean separation between recommendation logic / UI / DB. Avoid
unnecessary classes, complex abstractions, microservices, queues, and premature
optimization. Pure functions over classes. Keep it simple.

## The recommendation pipeline

```
user interests → p_t → semantic candidates (ANN) → difficulty adjustment → next question
```

All rec logic lives in `lib/rec/` as **pure, synchronous functions** — no DB, no
async, no I/O. In **production the hot path runs entirely inside Postgres** as
`next_question()` (a PL/pgSQL function, migrations `0004`/`0005`): one round-trip
per swipe, and only the ~130-byte question stem ever leaves the DB (state and
embeddings never egress, so cost is flat regardless of interest count). `lib/rec/*`
is the **golden-tested oracle** the SQL port must match — `scripts/try-sql-parity.ts`
asserts they agree to 1e-9. Any model change must land in BOTH lib/rec and the SQL
(no config drift; keep constants mirrored).

- **Step 1–3 — priority** (`rec/priority.ts`): each user has semantic interest
  vectors `c_m ∈ R^64` with a strength. Activation `A_m = strength + freshness −
  fatigue` → softmax → **sample** one primary interest (not argmax) → blend a few
  compatible secondaries → `p_t = normalize(c_* + α Σ β_j c_j)`. ~10% of the time
  it explores a predefined topic direction instead (never a random vector).
- **Step 4 — retrieval** (`rec/retrieve.ts` offline; the HNSW query inside
  `next_question()` in prod): top-K questions by `p_t · e_i`, the HNSW
  inner-product index (`ORDER BY embedding <#> p_t`).
- **Step 5 — difficulty + selection** (`rec/difficulty.ts`, `rec/rating.ts`,
  `rec/select.ts`): ability is **Bayesian** — a diagonal Gaussian `N(mean,
  variance)` over 64 dims (AdPredictor-style ADF update; confidence-moderated
  `P = Φ(s/√(β²+totVar))`, pulled toward 0.5 when uncertain). Φ is the **logistic
  approximation** `σ(1.702·x)` (not erf) — so the whole ADF update is elementary
  and ports to SQL with just `exp()`; `v(t)=1.702·σ(−1.702·t)`, `w=v(v+t)`. Three factors
  combined as a **weighted geometric mean** then softmax-sampled:
  `score = w_s·ln(priority) + w_f·ln(difficultyFactor) + w_r·ln(rating)`, target
  P(correct) = 0.70, rating = Beta posterior shrunk to the global like-rate.
- **Step 6 — updates** (`rec/interest.ts`, `rec/update.ts`): after each answer,
  three SEPARATE updates. Interest state ← engagement signal (like/skip/dislike);
  ability + question difficulty ← correctness error. Engagement never touches
  ability; correctness never touches interest. `applyInteraction()` orchestrates
  all three.

Difficulty is stored 0..1 and mapped to a logit at scoring time. Ability `θ` mean
is NOT normalized — its magnitude carries information.

## File map

```
app/
  page.tsx           server component: loads questions, strips embeddings, renders Feed
  actions.ts         "use server" — beginFeed()/submitInteraction() → lib/db/feed
                     (beginFeed takes excludeIds so the client can preload w/o dupes)
  layout.tsx, globals.css   9:16 phone frame; TikTok slide/qbox/translucent-rail CSS
components/
  Feed.tsx           client: TikTok vertical feed. Full-frame slides move together
                     under a press-drag (pointer events + CSS transforms), snap on
                     release/flick. Swipe UP = next, DOWN = back through history
                     (free, client-side). Keeps a 1-ahead PRELOAD buffer so no
                     spinner ever shows: mount preloads 2 cards; each forward swipe
                     records the card you leave and appends its returned card as the
                     new lookahead (recorded-once via a per-slot flag). Double-tap
                     the question or tap ♥ to like; ⚑ to report. No wheel/keyboard nav.
  QuestionCard.tsx   pure presentational card: question in a .qbox (double-tap→like)
                     + four choices. No difficulty shown.
lib/
  types.ts           domain types. PublicQuestion = what the browser may see (NO embedding)
  vector.ts          dot, normalize
  rec/               the engine — pure functions + the golden-tested ORACLE for the SQL port
  db/                postgres.js access: client, questions (bank load/seed), feed (thin
                     wrapper over next_question()), accounts (anon↔auth linking), reports
  supabase/          browser.ts + server.ts (Supabase Auth: email+password)
  embeddings/        embed.ts (OpenAI provider seam) + compress.ts (1536→64 random projection)
scripts/
  migrate.ts         apply pending supabase/migrations/*.sql (tracked in schema_migrations)
  insert-authored.ts import Haiku-authored question JSON → embed → insert
  loadEnv.ts         MUST be the first import in any script touching DB/API clients
  try-*.ts           offline engine smoke tests; try-sql-parity (SQL==oracle),
                     try-next-question (in-DB pipeline end-to-end)
supabase/migrations/
  0001_init            questions, users, user_interests, interactions
  0002_auth_and_logging accounts (auth_id/email), impressions log, session_abandonment view
  0003_question_reports  user-submitted question reports
  0004_rec_math          erf-free IRT/ADF math as SQL functions
  0005_next_question     the whole per-swipe pipeline in ONE in-DB function
```

## Hard boundaries (enforce these)

- **Embeddings and all rec math stay server-side.** The browser receives only
  `PublicQuestion` (id/text/choices/correctIndex/difficulty). Map with
  `toPublicQuestion()` before anything crosses to a client component. `lib/rec/*`
  and `lib/db/*` must never be imported by a client component.
- **The only runtime LLM API call is the embedding.** Questions are authored by
  Haiku subagents (see below), never generated by a chat API call at runtime.
- **`scripts/loadEnv.ts` first.** DB/OpenAI clients construct at import time and
  read env then, before a script body runs — import `./loadEnv` before them.

## Question generation

Questions are authored by **Haiku subagents** (Claude Code agents, not an API
call), which write a JSON array of `{text, choices[4], correctIndex, difficulty}`
and run `npx tsx scripts/insert-authored.ts <file.json>`. That script embeds
(stem + correct answer via OpenAI) → compresses to 64-D → inserts. Embedding is
the only API call in the flow.

## Commands

```
npm run dev        # start the app (needs .env.local)
npm run migrate    # apply the schema to Supabase
npx tsx scripts/insert-authored.ts <file>   # import authored questions
npx tsx scripts/try-priority.ts  # offline engine smoke tests (also try-score, try-update, try-e2e)
npx tsx scripts/try-sql-parity.ts    # assert in-DB SQL math == lib/rec oracle (needs DB)
npx tsx scripts/try-next-question.ts # exercise next_question() end-to-end (rolled back)
```

## Environment (.env.local)

- `OPENAI_API_KEY` — embeddings
- `DATABASE_URL` — Supabase **session pooler** URL (host `*.pooler.supabase.com`,
  user `postgres.<ref>`). The direct `db.<ref>.supabase.co` host is IPv6-only; use
  the pooler. For serverless deploy, switch the app to the transaction pooler (6543).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Auth
  (email+password login). Browser-exposed (expected for the anon key).

## Notes / v0 caveats

- **Auth**: Supabase Auth (email+password), anonymous-first — users browse with a
  `localStorage` id and signing in links it to the account (`lib/db/accounts.ts`),
  preserving history. Needs `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` + the Email
  provider enabled. Identity on the wire is still client-supplied (verified only at
  link time) — per-request verification is a later hardening step.
- The 64-D compression is a fixed random projection — deliberately a placeholder
  to be replaced (PCA/autoencoder) later; nothing up/downstream depends on how.
