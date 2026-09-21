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
  vectors `c_m ∈ R^64` with a strength. Activation is a fixed-weight linear
  readout (`P_jᵀ S_t` with hand-set weights — the learnable form is the ML
  roadmap): `A_j = strength + w_f·freshRaw − w_x·fatigue + w_l·likeAdj + w_m·momentum`,
  where `likeAdj` is the shrunk, session-mean-centered within-interest like rate (how
  well cluster j is landing *this session* vs the user's session average, neutral
  when there's no signal). `momentum` is the **worn-out mechanism** (`0011`): a
  recent-engagement trace, the short-timescale counterpart to `strength`. Strength
  stays high to remember a long-term preference (so a topic can return), so it
  can't also encode "I'm tired of this now" — momentum carries that, EMA'd toward
  each interaction's engagement (`MOMENTUM_LR`) and decayed toward 0 over wall-clock
  idle time (`MOMENTUM_TAU_HOURS ≈ 168h`, ~4.85-day half-life). Its weight is
  deliberately loud (`w_m = 3.0`): a currently-skipped topic goes negative and loses
  the sample regardless of strength, then, left dormant, the penalty decays so the
  topic re-surfaces for a re-test "at a better time". Tune it offline on synthetic
  love→worn-out→recovery data with `scripts/try-momentum.ts`.
  Softmax → **sample** one primary interest (not argmax)
  → blend a few compatible secondaries → `p_t = normalize(c_* + α Σ β_j c_j)`.
  Exploration is an **adaptive** roll — `p_explore = clamp(base + w_s·skipRate −
  w_l·likeRate, 0.02, 0.4)`, up when the session is skipped, down when it lands
  likes — and picks a predefined topic direction (never a random vector). Widening
  the per-interest state + adaptive exploration are mirrored in the SQL
  (`0007`); the like/fatigue signals come from ONE bounded in-DB scan of this
  session's `impressions ⟕ interactions` (see [Latency architecture]).
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
  page.tsx           server component: loads questions, strips embeddings, renders
                     <Home/> (gate+feed) + <Profile/> (top-right). Home before
                     Profile so the "change interests" picker stacks over the feed.
  actions.ts         "use server" — beginFeed()/submitInteraction() → lib/db/feed;
                     getTopics()/saveInterests()/getProfile() → lib/db/topics;
                     getSettings()/saveSettings() → lib/db/settings
                     (beginFeed takes excludeIds so the client can preload w/o dupes)
  layout.tsx, globals.css   9:16 phone frame; TikTok slide/qbox/translucent-rail CSS
components/
  Home.tsx           client gate: first visit (no `trivtok-onboarded` flag) shows
                     InterestPicker, else Feed. Flag set on save OR skip → shows once.
  InterestPicker.tsx client: pick broad interests → saveInterests seeds user_interests.
                     mode="onboard" (Skip) or "edit" (Cancel, re-opened from Profile).
  Profile.tsx        client: top-right avatar → sheet with lifetime accuracy + counts
                     (getProfile, DB truth), favorite topics, strongest areas, auth
                     (email+password, absorbed from the old AuthPanel), a Settings
                     section (exploration + difficulty sliders + blur toggle, via
                     get/saveSettings — debounced writes; blur broadcasts SETTINGS_EVENT
                     to the live Feed), and change interests.
  Feed.tsx           client: TikTok vertical feed. Full-frame slides move together
                     under a press-drag (pointer events + CSS transforms), snap on
                     release/flick. Swipe UP = next, DOWN = back through history
                     (free, client-side). Keeps a 1-ahead PRELOAD buffer so no
                     spinner ever shows: mount preloads 2 cards; each forward swipe
                     records the card you leave and appends its returned card as the
                     new lookahead (recorded-once via a per-slot flag). Double-tap
                     the question to like; a three-dot menu holds like/report. No
                     wheel/keyboard nav.
  QuestionCard.tsx   pure presentational card: question + four choices, a
                     double-tap-to-like zone above the choices, and a three-dot
                     menu (like/report). No right-hand rail; no difficulty shown.
                     With blurAnswers on, the choices start blurred behind a
                     "tap to reveal" overlay (first tap reveals, doesn't answer).
lib/
  types.ts           domain types. PublicQuestion / PublicTopic = what the browser may
                     see (NO embedding / NO centroid). Map with toPublic*() before crossing.
  vector.ts          dot, normalize
  clientId.ts        client-only: the anon user id (localStorage) + session id
                     (sessionStorage), shared by Feed/InterestPicker/Profile; also
                     SETTINGS_EVENT (in-tab blur-toggle broadcast Profile→Feed)
  rec/               the engine — pure functions + the golden-tested ORACLE for the SQL port
  db/                postgres.js access: client, questions (bank load/seed), feed (thin
                     wrapper over next_question()), accounts (anon↔auth linking), reports,
                     dedup (near-dup gate: findExistingDuplicate ANN probe +
                     inBatchDuplicates, double-lever isDuplicateHit predicate),
                     topics (listTopics, setStartingInterests, + profile read models:
                     favorite topics / strongest areas / lifetime stats),
                     settings (getUserSettings/setUserSettings: the exploration /
                     difficulty / blur knobs on the users row — migration 0015)
  supabase/          browser.ts + server.ts (Supabase Auth: email+password)
  embeddings/        embed.ts (OpenAI provider seam: embedAndCompress → 64-D rec vector,
                     embedDedup → 256-D Matryoshka near-dup vector) + compress.ts
                     (1536→64 random projection)
scripts/
  migrate.ts         apply pending supabase/migrations/*.sql (tracked in schema_migrations)
  insert-authored.ts import Haiku-authored question JSON → embed (64-D + 256-D) →
                     near-dup gate (double lever: reject vs the batch or the bank at
                     cosine ≥ 0.80, or ≥ 0.75 when correct answers match) → insert
  backfill-dedup-embeddings.ts  one-time/resumable: populate embedding_256 (0014)
                     for pre-existing questions (set-based UPDATE per chunk)
  seed-topics.ts     populate the topics table: each centroid = AVERAGE of its families'
                     real question embeddings (matched by text via data/topic-families.json;
                     falls back to embedding data/topics.json `description`). Idempotent.
  loadEnv.ts         MUST be the first import in any script touching DB/API clients
  try-*.ts           offline engine smoke tests; try-momentum (worn-out→recovery
                     sim for tuning momentum), try-sql-parity (SQL==oracle),
                     try-next-question (in-DB pipeline end-to-end), try-topics (centroid
                     norms + nearest-topic), try-topic-retrieval (what a topic surfaces),
                     try-latency (per-swipe network vs in-DB compute)
  (bank maintenance) audit-question-bank (validate + catalog the whole bank, via
                     `npm run audit:questions` / `catalog:questions`),
                     rebalance-answer-positions (`npm run rebalance:questions`),
                     dedup-questions / report-question-duplicates, find-question /
                     delete-question, replace-authored-question(s), check-inserted,
                     insert-authored-local (no-API import from existing vectors)
supabase/migrations/
  0001_init            questions, users, user_interests, interactions
  0002_auth_and_logging accounts (auth_id/email), impressions log, session_abandonment view
  0003_question_reports  user-submitted question reports
  0004_rec_math          erf-free IRT/ADF math as SQL functions
  0005_next_question     the whole per-swipe pipeline in ONE in-DB function
  0006_gumbel_guard      map Gumbel-max U off the endpoints so ln(-ln(U)) can't hit ln(0)
  0007_adaptive_priority widened activation (fatigue + like feature) + adaptive
                         exploration; also floors rec_score's rating term (ln(0)
                         guard) and two-sides the Gumbel U map (0006 left U→1 open)
  0008_easier_cold_start fresh-user prior variance 5.0 (easier questions early, fast
                         ability convergence); ensures the user row on every swipe
  0009_topics            broad topics (id/label/emoji/centroid vector(64)) for the
                         onboarding picker + profile; seeded by scripts/seed-topics.ts
  0010_no_reserve_seen   never re-serve a seen question: split next_question()'s
                         fallback so an exhausted ANN window serves the nearest
                         UNSEEN across the whole bank, recycling only once the user
                         has seen everything (0005/0007 re-served the nearest card
                         ignoring the seen filter → the same question every session)
  0011_interest_momentum "worn-out topic" var: per-interest momentum (recent-
                         engagement trace, time-decayed toward 0) added to the
                         activation with a loud weight (3.0), so a once-loved topic
                         being skipped now is suppressed but recovers while dormant.
                         Drops 0007's rec_activation overload (arg-count change);
                         also restores the 0008 cold-start variance 5.0 that 0010
                         had silently reverted to 1.0 (next_question owned here now)
  0012_iterative_scan    attach hnsw.iterative_scan=relaxed_order to next_question
                         via ALTER FUNCTION (index-scan GUC only, no body change) so
                         the filtered ANN keeps pulling past ef_search and finds
                         UNSEEN cards instead of starving into the seen-recycling
                         fallback. Must run after 0011 (which creates the function)
  0013_higher_temperature raise both softmax temperatures for more variety (topic
                         stopped narrowing to one cluster): c_tau_primary 0.5→1.0
                         (spread the primary-interest sample across clusters) +
                         c_tau_select 0.2→1.5 (vary the question within a topic).
                         Mirrors lib/rec priority.ts/select.ts tau; CREATE OR REPLACE
                         so it re-attaches 0012's iterative_scan GUC at the end
  0014_dedup_embedding   second per-question vector for near-dup detection:
                         embedding_256 vector(256) (OpenAI Matryoshka dimensions:256,
                         unit-normalized) + HNSW vector_ip_ops index. The 64-D
                         `embedding` is too lossy to dedup (unrelated pairs hit 0.997
                         cosine); 256-D separates rewordings from same-topic siblings.
                         Nullable (no-API local import inserts NULL); backfilled by
                         scripts/backfill-dedup-embeddings.ts. Import gate = double
                         lever: reject at cosine ≥ 0.80, or ≥ 0.75 when the correct
                         answers also match (catches same-fact paraphrases without
                         flagging different-answer cousins) — see lib/db/dedup.ts
  0015_user_settings     three per-user knobs on the users row, read by next_question
                         each swipe (no new call args — signature unchanged):
                         explore_level real [0,1] (the exploration slider — CENTER of
                         the roll, 0=only known interests…1=always explore; adaptive
                         skip/like nudge scaled by 4·L·(1−L) so endpoints are exact),
                         target_p real (difficulty target for rec_difficulty_factor),
                         blur_answers boolean (pure client render, next_question never
                         reads it). Redefines rec_explore_prob (level replaces
                         base/lo/hi), rec_difficulty_factor (+target overload),
                         rec_score (+target); mirrored in lib/rec (priority.ts
                         exploreLevel/exploreProbability, difficulty.ts
                         difficultyFactor(p,target), select.ts targetP). Re-attaches
                         0012's iterative_scan GUC. Saved via lib/db/settings.ts
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
npx tsx scripts/seed-topics.ts               # seed the topics table (after migrate)
npx tsx scripts/insert-authored.ts <file>   # import authored questions
npx tsx scripts/try-priority.ts  # offline engine smoke tests (also try-score, try-update, try-e2e)
npx tsx scripts/try-momentum.ts  # offline: worn-out→recovery sim for tuning momentum
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
- **Onboarding**: first visit gates the feed behind InterestPicker; picks seed
  `user_interests` (strength = INITIAL_STRENGTH) so the feed opens in `interest`
  mode. Skippable → cold start. Re-openable from the profile ("change interests");
  edit mode does not pre-check current picks (re-picking is idempotent). Topic
  centroids come from real question-embedding averages, so retrieval from a picked
  topic is on-topic (verify with `try-topic-retrieval`); re-run `seed-topics.ts`
  after adding question families so centroids stay representative.
- **Profile**: top-right sheet. Lifetime accuracy/counts are DB truth (from
  `interactions`/`impressions` via `getProfile`); the HUD's streak/XP remain
  client-side in `localStorage["trivtok-stats"]`. "Strongest areas" = topics ranked
  by `dot(centroid, ability_mean)` (empty until θ moves off zero). Known dev-only
  quirk (pre-existing, in `Feed.tsx`, not from this feature): a StrictMode
  double-mount race can zero `trivtok-stats` on a full reload — the DB stats are
  unaffected.
