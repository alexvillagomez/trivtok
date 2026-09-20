-- TrivTok migration 0012 — make the in-DB retrieval find UNSEEN questions.
--
-- Companion to 0010. Runs after 0011, which owns (creates) next_question(); this
-- migration only ALTERs that function to attach an index-scan setting, so it must
-- come last or the CREATE OR REPLACE in 0011 would reset the GUC. 0010 stopped the fallback from re-serving a seen card, but the
-- deeper cause of "I keep getting this question" is a pgvector HNSW recall problem:
-- with hnsw.iterative_scan = off (the default), a filtered nearest-neighbour search
-- (`ORDER BY embedding <#> p_t ... WHERE not seen LIMIT k`) only examines the
-- ef_search (=40) nodes closest to p_t and applies the seen-filter AFTER. For a user
-- who has ground one interest until its local neighbourhood is exhausted, those ~40
-- nearest are ALL already seen, the filter removes every one, and the scan STOPS —
-- returning zero rows even though tens of thousands of unseen questions sit just
-- past the ef_search horizon. next_question then falls through step 5 (primary) AND
-- 0010's fallback #1 (both filtered) into fallback #2, the seen-recycling last
-- resort — so the same nearest, already-seen card comes back every session.
--
-- Measured on the reported user (strongest cluster ~exhausted): with iterative_scan
-- off, 6/80 open-session calls fell through to the seen-recycling fallback; with
-- relaxed_order, 0/80 — the primary query satisfied every call.
--
-- Fix: attach hnsw.iterative_scan = relaxed_order to next_question via ALTER
-- FUNCTION (scoped to each call, no body change). pgvector 0.8's iterative scan
-- keeps pulling from the index past ef_search until the LIMIT is met (up to
-- hnsw.max_scan_tuples, default 20000), so the seen-filter is satisfied by real
-- unseen neighbours instead of starving. relaxed_order (vs strict_order) is fine:
-- the primary re-scores + Gumbel-samples its candidates anyway, and the fallback
-- only needs *a* near unseen card, not the exact argmin.
--
-- Retrieval-layer only (an index-scan GUC) — the deterministic rec math is
-- untouched and scripts/try-sql-parity.ts is unaffected.

-- Best-effort: hnsw.iterative_scan is a restricted GUC on managed Postgres
-- (Supabase's role gets `permission denied to set parameter`, SQLSTATE 42501).
-- It is a pure retrieval optimization — 0010's fallback already guarantees an
-- UNSEEN card — so if the role can't set it we log a notice and move on rather
-- than poisoning the migration chain. Apply it manually from the Supabase SQL
-- editor as a privileged role to get the optimization.
do $$
begin
  alter function next_question(uuid, uuid, uuid, bigint, integer, boolean, integer, uuid[])
    set hnsw.iterative_scan = relaxed_order;
exception
  when insufficient_privilege then
    raise notice 'skipping hnsw.iterative_scan (insufficient privilege); retrieval relies on 0010 unseen-scan fallback';
end $$;
