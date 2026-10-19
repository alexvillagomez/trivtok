-- TrivTok migration 0014 — semantic near-duplicate detection.
--
-- The 64-D `embedding` column is a random projection (compress.ts): great for
-- coarse recommendation, but far too lossy to tell "reworded duplicate" from
-- "another question on the same subtopic" — calibration showed unrelated pairs
-- sitting at 0.997 cosine there. Near-dup detection needs finer resolution.
--
-- This adds a SECOND vector, `embedding_256`, built with the SAME "stem + correct
-- answer" text but via OpenAI's Matryoshka `dimensions: 256` truncation (a trained
-- reduction, not a random projection), unit-normalized so inner product == cosine.
-- 256-D keeps almost all the fine structure at ~6x less index RAM than full 1536-D,
-- and calibration puts genuine rewordings well above same-topic siblings.
--
-- Nullable so the no-API local import path still works; populated for the existing
-- bank out-of-band by scripts/backfill-dedup-embeddings.ts (same split as the
-- 64-D embeddings, which the import scripts compute).
--
-- Query at import time (one HNSW probe per candidate — O(log n), flat at 100k):
--   select -(embedding_256 <#> :v) as sim
--   from questions order by embedding_256 <#> :v limit 1;
-- Reject the candidate when sim >= the dedup threshold (see lib/embeddings/embed.ts).

alter table questions add column if not exists embedding_256 vector(256);

create index if not exists questions_embedding_256_idx
  on questions using hnsw (embedding_256 vector_ip_ops);
