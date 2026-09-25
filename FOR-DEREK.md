# Multi-Interest, Content-Based Recommendation — a walkthrough of TrivTok

Hey Derek 👋

This is a write-up of how TrivTok's recommendation engine works, written to explain
one idea in particular: **multi-interest, content-based recommendation**. It covers
what the idea is in general, how this project actually implements it, and — just as
importantly — where it falls short.

TrivTok is a TikTok-style infinite-scroll trivia app. You swipe through trivia
questions one at a time; the system learns what you want to see *and* how hard to
make it. There's no chat model in the loop at runtime — the only live API call is a
text-embedding call. Everything else is math.

---

## 1. What "content-based" and "multi-interest" mean

**Content-based recommendation** means we recommend items using features *of the
items themselves*, not "people like you also liked…". Every trivia question is turned
into a vector (an embedding) that captures what it's *about*. A user is represented in
that same vector space. To recommend, we find questions whose vectors point in the
direction the user's taste points. No collaborative signal, no other users' histories
— just the geometry of content.

- Pro: works from the first swipe (no cold-start "we need 1000 users first" problem),
  fully explainable, and cheap.
- Con: it can only recommend along axes the embedding actually encodes, and it tends
  to keep showing you *more of the same* unless you deliberately fight that.

**Multi-interest** is the important refinement. Most naive content-based systems
collapse a user into **one** vector — an average of everything they liked. That's a
disaster for anyone with more than one taste. If you like both *marine biology* and
*Formula 1*, averaging those two directions points the vector at some meaningless
midpoint between them, and you get recommended neither — you get bland "halfway"
content that satisfies no actual interest.

The multi-interest fix: represent the user as **several distinct interest vectors**,
each with its own strength, instead of one blurry average. Marine biology is one
cluster; F1 is another. When it's time to recommend, you *pick* an interest to serve
right now rather than averaging them all together.

That single design decision — many interests, sampled, not one interest, averaged —
is the spine of this whole project.

---

## 2. How TrivTok represents a user

Each user has a set of **interest clusters**. In code (`lib/rec/interest.ts`) each one
is a `UserInterest`:

- `centroid` — a 64-dimensional unit vector: the semantic *direction* of this interest.
- `strength` — how much the user cares about this cluster, long-term.
- `momentum` — a short-timescale "am I into this *right now*" trace (more below).
- `lastUsedAt` — when we last served from this cluster (drives freshness/decay).

Interests aren't hand-declared. They **form and drift from behavior**:

- A **strong positive** (a like) that lands far from every existing cluster
  *spawns a new cluster*. That's literally how a new taste is born.
- A like near an existing cluster nudges that cluster's `centroid` toward the liked
  question and raises its `strength`.
- A skip/dislike lowers strength (and momentum) without moving the centroid.

Crucially, **engagement and correctness are separate signals**. Liking a topic and
getting the question right are different things — you can love astronomy and still
bomb the question. Interest state is driven *only* by like/skip/dislike; your ability
estimate is driven *only* by correctness. They never cross-contaminate.

---

## 3. The recommendation pipeline (one swipe)

```
user interests → p_t → semantic candidates (ANN) → difficulty adjustment → next question
```

### Step 1–3: Build the priority vector `p_t` (`lib/rec/priority.ts`)

This is where multi-interest lives. Rather than average the clusters, we score each
one and **sample** one to lead with.

Each interest gets an **activation** score — a fixed-weight linear readout:

```
A_j = strength
    + w_f · freshness        (bonus for clusters not shown recently)
    − w_x · fatigue          (penalty for clusters hammered this session)
    + w_l · likeAdj          (is this cluster landing likes this session vs my average?)
    + w_m · momentum         (recent-engagement trace — the loud one)
```

Then `softmax(A) → sample one primary interest`. Note **sample, not argmax**: even the
strongest interest doesn't win every time, which is what keeps the feed from
collapsing to a single topic. A few compatible secondary interests are blended in
lightly to get the final direction:

```
p_t = normalize(c_primary + α · Σ β_j · c_secondary_j)
```

Two extra mechanisms worth calling out because they're the interesting bits:

- **Momentum (the "worn-out topic" mechanism).** Strength has a job: remember that you
  like a topic *long-term*, so it can come back later. That means strength *can't* also
  encode "I'm sick of this right now" — if it dropped every time you skipped, the app
  would forget you ever liked it. So a separate `momentum` term carries the
  short-term signal: it EMAs toward each interaction's engagement and **decays back
  toward zero over wall-clock idle time** (~4.85-day half-life). Its weight is
  deliberately loud (`w_m = 3.0`), so a topic you're skipping *right now* goes negative
  and drops out of rotation regardless of its long-term strength — then, left alone,
  the penalty relaxes and the topic resurfaces "at a better time". Love → worn-out →
  recovery, without amnesia.

- **Adaptive exploration.** Before committing to a known interest, we roll a dice on
  *exploring* instead — picking a predefined topic direction that's far from everything
  you already like (never a purely random vector). The probability is
  `clamp(base + w_s·skipRate − w_l·likeRate, …)`: exploration rises when you're
  skipping a lot (we're clearly missing) and falls when you're landing likes (don't
  fix what's working). The user also has an explicit exploration slider that sets the
  center of that roll.

### Step 4: Retrieve candidates (`lib/rec/retrieve.ts`)

Given `p_t`, grab the top-K questions by `p_t · e_i` — the questions whose embeddings
point most in the chosen direction. Offline this is brute-force dot products; in
production it's a pgvector **HNSW** approximate-nearest-neighbor index
(`ORDER BY embedding <#> p_t`).

### Step 5: Difficulty + final selection (`lib/rec/difficulty.ts`, `rating.ts`, `select.ts`)

Content match isn't the only factor. We also want the question to be the *right
difficulty*. The user's ability is modeled as a Bayesian diagonal Gaussian over the
64 dims (an AdPredictor-style update), and we target **P(correct) ≈ 0.70** — hard
enough to be interesting, easy enough to feel good. Three factors — semantic priority,
difficulty fit, and question quality/rating — are combined as a weighted geometric
mean and softmax-sampled for the final pick.

### Step 6: Update (`lib/rec/update.ts`, `interest.ts`)

After you answer, three *separate* updates fire:
1. interest state ← engagement (like/skip/dislike)
2. ability ← correctness error
3. question difficulty ← correctness error

---

## 4. What's genuinely nice about this design

- **Multiple tastes coexist.** No averaging-into-mush. You can like six unrelated
  things and each keeps its own cluster and its own turn in rotation.
- **It's all pure functions.** `lib/rec/*` is synchronous, side-effect-free, and
  golden-tested. The exact same math is *also* ported into Postgres (a PL/pgSQL
  `next_question()` function), so the whole hot path runs in **one DB round-trip per
  swipe** — and a parity test asserts the SQL and the TypeScript agree to 1e-9. The
  pure functions are the oracle; the SQL is the production engine.
- **Privacy/cost by construction.** Because the pipeline runs inside the DB, your
  interest vectors and the question embeddings **never leave the database** — only the
  ~130-byte question text egresses. Cost is flat no matter how many interests you have.
- **Explainable.** Every recommendation traces back to an activation score you can
  print. There's no black box you can't inspect.
- **Sampling everywhere.** Primary interest, difficulty, and final question are all
  *sampled* from distributions, not argmaxed. That's the main defense against the feed
  narrowing to a single rut.

---

## 5. Limitations (the honest part)

This is a v0. The design makes real trade-offs, and a couple of them bite.

1. **The 64-D embedding is the ceiling on everything.** Content-based recs can only
   see the axes the embedding encodes. Worse, in this project the 64-D vector is a
   **fixed random projection** of the full 1536-D OpenAI embedding — a deliberate
   placeholder for a real PCA/autoencoder. At 64 random dims, unrelated question pairs
   can sit at ~0.997 cosine similarity, so the vector often has **only enough
   resolution to tell near-duplicates apart, not genuinely different questions**. That
   directly causes the feed to sometimes collapse toward near-identical questions.
   (This is exactly why dedup uses a *separate* 256-D vector — 64-D is too lossy to
   even detect duplicates reliably.)

2. **Content-based means no serendipity from other people.** There's no collaborative
   filtering, so we can never surface "people with your taste also loved this weird
   thing you'd never search for." Exploration is the only novelty source, and it can
   only explore among *predefined* topic directions.

3. **Drifting point-centroid interests.** Each interest is a single moving point. If a
   cluster's true shape is multi-modal (you like *two kinds* of history), the centroid
   drifts to an unhelpful average of them or thrashes between them. Clusters are also
   never merged or garbage-collected, so they can accumulate.

4. **Cold start is real, just smaller.** Content-based avoids the *system* cold-start,
   but a brand-new user still has no interests. Onboarding seeds a few from a topic
   picker; skip it and you're on pure exploration until your first like spawns a
   cluster.

5. **Hand-tuned weights, not learned.** All those `w_f`, `w_x`, `w_m` weights are
   hand-set. The activation is explicitly a *fixed-weight* linear readout; making it
   learnable is on the roadmap, not in the build. Tuning is done offline against
   synthetic simulations.

6. **Identity is client-supplied.** Anonymous-first: the browser sends its own user id,
   verified only at sign-in link time. Fine for v0, needs per-request verification to
   be real.

7. **Shared single database in dev.** Dev and the deployed app currently point at one
   Postgres instance, so dev-session migrations/imports hit production data. A footgun,
   not a design feature.

---

## 6. TL;DR

TrivTok is a content-based recommender that dodges the classic "average all your tastes
into one bland vector" failure by giving each user **many interest clusters** and
**sampling** one per swipe instead of averaging. It layers on a short-term "worn-out"
momentum signal, adaptive exploration, and a Bayesian difficulty model that targets
~70% correctness — and it runs the whole thing inside Postgres in one round-trip while
keeping embeddings server-side. The big caveat is the embedding itself: a 64-D random
projection that's low-resolution enough to occasionally collapse the feed toward
near-duplicates. Fix the projection (PCA/autoencoder) and most of the "why do I keep
seeing the same thing" complaints go away.

Happy to walk through any part of this live.

— Alex
