# TrivTok

**TikTok, but every swipe is a trivia question — and the feed learns two things at once: *what* you want to see and *how hard* to make it.**

You open the app, pick a few interests, and start swiping. Swipe up for the next question, down to go back. Every answer teaches the system something, and within a handful of swipes the feed is tuned to you — surfacing topics you actually care about, at a difficulty that keeps you thinking but rarely stumped.

---

## The goal

Most trivia apps pick questions from a fixed pool at a fixed difficulty. TrivTok treats the feed as a **recommendation problem with two independent axes**:

1. **Relevance** — which *topics* to show, learned from what you like, skip, and dislike.
2. **Difficulty** — how *hard* to make each question, learned from what you get right and wrong.

Keeping these two separate is the whole idea. Enjoying a topic and being good at it are different facts, so they're learned by different signals and never allowed to contaminate each other. The result is a feed that feels personal *and* stays at the edge of your ability instead of drifting easy or brutal.

## How it works

```
your interests ─▶ priority ─▶ semantic search ─▶ difficulty ─▶ next question
                    ▲                                  ▲
              engagement signal                 correctness signal
             (like / skip / dislike)               (right / wrong)
```

Every question is embedded as a **64-dimensional semantic vector**. Every user carries a set of **interest vectors** describing what they're into. Picking the next question is then just geometry: score your interests, sample one, retrieve the nearest questions by vector similarity, and choose one at the right difficulty.

After each answer, **three separate updates** fire — your interest in that topic, your estimated ability, and the question's own difficulty rating — each from its own signal.

## The ideas that make it interesting

- **A semantic feed, not a category feed.** Recommendations run in embedding space (`pgvector` + approximate-nearest-neighbor search), so "things like what you enjoyed" is a real vector operation, not a hand-maintained tag tree.

- **Difficulty as a Bayesian belief.** Your ability is a probability distribution over 64 dimensions, updated online (an IRT / AdPredictor-style model). It targets a **~70% chance you get the next question right** — the sweet spot where you're learning, not bored or demoralized — and stays cautious while it's still unsure about you.

- **Topics that wear out and come back.** A "momentum" signal separates *long-term* taste from *right-now* fatigue: skip a topic you usually love and it's suppressed immediately, but the penalty decays while it's dormant, so it resurfaces later "at a better time" instead of vanishing forever.

- **Exploration that reads the room.** How often the feed takes a chance on something new adapts to your session — it explores more when you're skipping a lot, and less when you're on a streak of likes.

- **The whole recommender runs *inside* the database.** Each swipe is a single Postgres function call and one round-trip. Your interest state and every embedding stay in the DB — only the ~130-byte question text ever leaves. So serving cost is flat no matter how rich your profile gets, and nothing sensitive egresses.

- **A pure-function core, mirrored and proven against the SQL.** All the recommendation math also exists as plain, synchronous TypeScript with no I/O — easy to read, test, and reason about. It's the golden reference the in-database version is checked against, and a parity test asserts the two agree to within `1e-9`.

## Stack

- **Next.js** (App Router) + **TypeScript**, plain CSS — no UI or animation libraries
- **Supabase / Postgres** with **pgvector** for embeddings and nearest-neighbor retrieval
- **postgres.js** for raw SQL (server-side only)
- **OpenAI** `text-embedding-3-small` for embeddings — the *only* LLM API call at runtime

Trivia questions are authored offline by Claude (Haiku) subagents and pass through a near-duplicate filter before insertion — they're never generated live. The one runtime model call is turning text into a vector.

## Status

This is **v0**, and deliberately so: it prioritizes readable code, obvious data flow, and clean separation between recommendation logic, UI, and storage over premature optimization. A couple of pieces are intentional placeholders — most notably the 1536→64 dimension reduction is a fixed random projection meant to be swapped for something learned (PCA/autoencoder) later, with nothing up- or downstream depending on how it's done.
