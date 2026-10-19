-- TrivTok migration 0016 — "serve only the new questions" switch.
--
-- A single global on/off toggle that restricts the feed to the newest authoring
-- batch (imported on/after `new_since`) and hides everything older. It lives in a
-- one-row config table the recommender reads on every swipe, so it flips with ONE
-- statement — no redeploy, no new migration:
--
--   serve NEW ONLY (default):   update app_config set serve_only_new = true;
--   serve THE WHOLE BANK:       update app_config set serve_only_new = false;
--   move the new/old boundary:  update app_config set new_since = '<timestamptz>';
--
-- "New" here = the 2026-09-22 production batch. The bank has a clean ~33h gap
-- (last older row 2026-09-20 22:25Z, first new row 2026-09-22 07:24Z), so the
-- 2026-09-21 boundary isolates that batch and is stable as more 09-22 rows import.
--
-- Only next_question's four candidate scans gain the filter (the ANN window, the
-- cold/explore direction pick, and the two unseen/recycle fallbacks). The answered
-- card is still fetched unfiltered for its stat/ability updates, so a card served
-- while the switch was off still records correctly after it's flipped on. Nothing
-- else changes — the whole function is carried over verbatim from 0015.

-- ---- the switch -----------------------------------------------------------
-- Singleton: id is a boolean PK fixed at true, so there is exactly one row.
create table if not exists app_config (
  id             boolean primary key default true,
  serve_only_new boolean     not null default true,
  new_since      timestamptz not null default '2026-09-21T00:00:00Z',
  constraint app_config_singleton check (id)
);

insert into app_config (id, serve_only_new, new_since)
values (true, true, '2026-09-21T00:00:00Z')
on conflict (id) do nothing;

-- ---- next_question (redefined from 0015, + the new-only filter) ------------
create or replace function next_question(
  p_user       uuid,
  p_session    uuid,
  p_answered   uuid    default null,  -- card just completed; NULL = open session
  p_impression bigint  default null,  -- impression being answered (join key)
  p_selected   int     default null,  -- NULL if not answered
  p_liked      boolean default false,
  p_response_ms int    default null,
  p_exclude    uuid[]  default '{}'
) returns table (
  question_id uuid, stem text, choices text[], correct_index int,
  difficulty real, impression_id bigint, mode text, interest_count int
) language plpgsql as $$
#variable_conflict use_column
declare
  -- tuned constants, mirrored from lib/rec DEFAULT_PARAMS / interest.ts / select.ts
  c_spawn_sim   float8 := 0.5;  c_strength_lr float8 := 0.3;  c_centroid_lr float8 := 0.1;
  c_fresh_w     float8 := 0.3;  c_fresh_hours float8 := 24;   c_tau_primary float8 := 1.0;
  c_fatigue_w   float8 := 0.4;  c_like_w      float8 := 0.5;  c_like_prior  float8 := 5;
  c_mom_lr      float8 := 0.4;  c_mom_tau     float8 := 168;  c_mom_w       float8 := 3.0;
  c_alpha       float8 := 0.2;  c_top_sec     int    := 3;
  c_expl_skip_w float8 := 0.3;  c_expl_like_w float8 := 0.2;
  c_k           int    := 150;  c_tau_select  float8 := 1.5;

  -- per-user settings (0015), read from the users row below
  v_explore_level float8;  v_target_p float8;

  -- global serve-only-new switch (0016), read from app_config below
  v_only_new boolean;  v_new_since timestamptz;

  v_e        float8[];  v_qdiff  float8;  v_correct_index int;
  v_answered boolean;   v_correct boolean;  v_eng float8;
  v_mean float8[];  v_var float8[];
  v_has_int boolean;  v_near_id uuid;  v_near_sim float8;  v_near_c float8[];  v_near_str float8;  v_near_pc int;
  v_strong boolean;
  v_mode text;  v_primary uuid;  v_primary_c float8[];  v_pt float8[];  v_ptvec vector;
  v_position int;  v_gm float8;  v_like_rate float8;  v_skip_rate float8;
  v_qid uuid;  v_text text;  v_choices text[];  v_ci int;  v_qd real;  v_prop float8;  v_imp bigint;
  v_sec record;  d int;
begin
  -- 0. ensure the user row exists. Fresh-user prior variance is 5.0 (0008): high
  --    uncertainty → easier questions early + fast ability convergence. New
  --    settings columns (0015) take their defaults (explore 0.1, target 0.7).
  insert into users (id, ability_mean, ability_variance)
  values (p_user, rec_arr_to_vec(array_fill(0.0, array[64])), rec_arr_to_vec(array_fill(5.0, array[64])))
  on conflict (id) do update set last_seen_at = now();

  -- 0b. load the global serve-only-new switch (0016). Missing row ⇒ serve all.
  select serve_only_new, new_since into v_only_new, v_new_since from app_config where id;
  v_only_new := coalesce(v_only_new, false);

  -- 1. record the just-answered card (skipped when opening a session)
  if p_answered is not null then
    select rec_vec_to_arr(embedding), difficulty, correct_index
      into v_e, v_qdiff, v_correct_index
    from questions where id = p_answered for update;

    v_answered := p_selected is not null;
    v_correct  := case when v_answered then p_selected = v_correct_index else null end;
    v_eng      := rec_engagement(p_liked, v_answered, p_response_ms);

    -- 1a. interest update ← engagement (nearest / spawn / centroid nudge / momentum)
    v_has_int := exists (select 1 from user_interests where user_id = p_user);
    if v_has_int then
      select id, rec_dot(rec_vec_to_arr(centroid), v_e), rec_vec_to_arr(centroid), strength, positive_count
        into v_near_id, v_near_sim, v_near_c, v_near_str, v_near_pc
      from user_interests where user_id = p_user
      order by rec_dot(rec_vec_to_arr(centroid), v_e) desc limit 1;
    end if;
    v_strong := v_eng >= 1.0;

    if v_strong and (not v_has_int or v_near_sim < c_spawn_sim) then
      -- fresh cluster: seed momentum from this like via rec_momentum(0, 0, e)
      insert into user_interests (id, user_id, centroid, strength, momentum, positive_count, last_used_at)
      values (gen_random_uuid(), p_user, rec_arr_to_vec(rec_normalize(v_e)), 1.0,
              rec_momentum(0, 0, v_eng, c_mom_lr, c_mom_tau), 1, now());
    elsif v_has_int then
      -- momentum: decay by idle hours (old last_used_at, read pre-update) then EMA
      -- toward v_eng. RHS sees the row's pre-update columns, so last_used_at below
      -- is the OLD timestamp even though we overwrite it in the same statement.
      update user_interests set
        strength = greatest(0, v_near_str + c_strength_lr * v_eng),
        momentum = rec_momentum(momentum, extract(epoch from now() - last_used_at) / 3600,
                                v_eng, c_mom_lr, c_mom_tau),
        centroid = case when v_strong
                        then rec_arr_to_vec(rec_normalize(
                               (select array_agg((1 - c_centroid_lr) * v_near_c[i] + c_centroid_lr * v_e[i])
                                from generate_subscripts(v_e, 1) i)))
                        else centroid end,
        positive_count = v_near_pc + case when v_eng > 0 then 1 else 0 end,
        last_used_at = now()
      where id = v_near_id;
    end if;

    -- 1b. ability + difficulty ← correctness error (only when answered)
    if v_answered then
      select rec_vec_to_arr(ability_mean), rec_vec_to_arr(ability_variance)
        into v_mean, v_var from users where id = p_user for update;
      update users set
        ability_mean = rec_arr_to_vec((rec_update_ability(v_mean, v_var, v_e, v_qdiff, v_correct)).new_mean),
        ability_variance = rec_arr_to_vec((rec_update_ability(v_mean, v_var, v_e, v_qdiff, v_correct)).new_variance)
      where id = p_user;
      update questions set difficulty = rec_update_difficulty(v_qdiff, v_mean, v_var, v_e, v_correct)
      where id = p_answered;
    end if;

    update questions set
      like_count = like_count + case when p_liked then 1 else 0 end,
      dislike_count = dislike_count + case when (not p_liked and not v_answered and coalesce(p_response_ms, 0) >= 1500) then 1 else 0 end
    where id = p_answered;

    insert into interactions (
      user_id, question_id, impression_id, shown_at, answered, correct, liked, disliked, skipped, response_time, session_id
    ) values (
      p_user, p_answered, p_impression, now(), v_answered, v_correct, p_liked,
      (not p_liked and not v_answered and coalesce(p_response_ms, 0) >= 1500),
      (not p_liked and not v_answered and coalesce(p_response_ms, 0) < 1500),
      coalesce(p_response_ms, 0), p_session
    );
  end if;

  -- 2. load current ability + interest count + the user's settings (0015)
  select rec_vec_to_arr(ability_mean), rec_vec_to_arr(ability_variance),
         explore_level, target_p
    into v_mean, v_var, v_explore_level, v_target_p
  from users where id = p_user;
  select count(*) into interest_count from user_interests where user_id = p_user;

  -- 2b. session engagement rates (over ALL interactions this session) — drive the
  --     adaptive exploration roll and center the per-interest like feature.
  select
    coalesce(count(x.id) filter (where x.liked)::float8   / nullif(count(x.id), 0), 0),
    coalesce(count(x.id) filter (where x.skipped)::float8 / nullif(count(x.id), 0), 0)
    into v_like_rate, v_skip_rate
  from impressions i left join interactions x on x.impression_id = i.id
  where i.session_id = p_session;

  -- 3. priority vector p_t — the exploration roll is centered on the user's setting
  if interest_count = 0 then
    v_mode := 'cold';
  elsif random() < rec_explore_prob(v_skip_rate, v_like_rate,
                     v_explore_level, c_expl_skip_w, c_expl_like_w) then
    v_mode := 'explore';
  else
    v_mode := 'interest';
  end if;

  if v_mode = 'interest' then
    -- Gumbel-max sample of the primary over the widened activation
    -- A_j = strength + w_f·freshRaw − w_x·fatigue + w_l·likeAdj + w_m·momentum.
    -- momentum is the stored trace decayed by idle hours (same window freshness
    -- uses), so a topic worn out and then left dormant recovers over ~τ.
    -- One extra scan: this session's impressions ⟕ interactions grouped by
    -- primary_interest_id gives picks (fatigue) and likes/interactions (likeAdj).
    -- U guarded into [1e-12, 1−1e-12] so BOTH ln's stay finite.
    select id, rec_vec_to_arr(centroid) into v_primary, v_primary_c
    from (
      with sess as (
        select i.primary_interest_id                  as iid,
               count(distinct i.id)                   as picks,
               count(x.id) filter (where x.liked)     as likes,
               count(x.id)                            as interactions
        from impressions i
        left join interactions x on x.impression_id = i.id
        where i.session_id = p_session and i.primary_interest_id is not null
        group by i.primary_interest_id
      ),
      tot as (select coalesce(sum(picks), 0) as total_picks from sess)
      select ui.id, ui.centroid,
        rec_activation(
          ui.strength,
          least(greatest(extract(epoch from now() - ui.last_used_at) / 3600, 0) / c_fresh_hours, 1),
          case when tot.total_picks = 0 then 0
               else coalesce(s.picks, 0)::float8 / tot.total_picks end,
          rec_like_adj(coalesce(s.likes, 0)::int, coalesce(s.interactions, 0)::int, v_like_rate, c_like_prior),
          rec_momentum_decay(ui.momentum, extract(epoch from now() - ui.last_used_at) / 3600, c_mom_tau),
          c_fresh_w, c_fatigue_w, c_like_w, c_mom_w
        ) as a
      from user_interests ui
      cross join tot
      left join sess s on s.iid = ui.id
      where ui.user_id = p_user
    ) s
    order by a / c_tau_primary - ln(-ln(random() * (1 - 2e-12) + 1e-12)) desc limit 1;

    -- blend top secondaries: p_t = normalize(primary + α Σ (B_j/ΣB) c_j)
    v_pt := v_primary_c;
    for v_sec in
      select rec_vec_to_arr(centroid) as c,
             greatest(0, rec_dot(rec_vec_to_arr(centroid), v_primary_c)) * strength as b
      from user_interests where user_id = p_user and id <> v_primary
      order by b desc limit c_top_sec
    loop
      if v_sec.b > 0 then
        -- accumulate α·B·c now; divide by ΣB after the loop via renormalize (α·B/ΣB scaling
        -- is absorbed because we normalize p_t at the end, and ΣB is a positive constant)
        for d in 1..64 loop v_pt[d] := v_pt[d] + c_alpha * v_sec.b * v_sec.c[d]; end loop;
      end if;
    end loop;
    v_ptvec := rec_arr_to_vec(rec_normalize(v_pt));
  else
    -- cold / explore: pick a direction biased toward novelty (far from interests)
    -- U guarded into [1e-12, 1−1e-12] so BOTH ln's stay finite. Draw only from the
    -- served set (new-only when the switch is on).
    select embedding into v_ptvec
    from (
      select q.embedding,
        coalesce(1 - (select max(rec_dot(rec_vec_to_arr(ui.centroid), rec_vec_to_arr(q.embedding)))
                      from user_interests ui where ui.user_id = p_user), 1) as nov
      from questions q
      where (not v_only_new or q.created_at >= v_new_since)
      order by random() limit 24
    ) d
    order by nov / 0.5 - ln(-ln(random() * (1 - 2e-12) + 1e-12)) desc limit 1;
  end if;

  -- 4. position within the session (for the impression log)
  select count(*) into v_position from impressions where session_id = p_session;

  -- 5. retrieve + score + Gumbel-max sample, excluding seen + queued ids.
  --    rec_score uses the user's target_p so the difficulty setting steers which
  --    P(correct) counts as "ideal" (higher target = easier questions surface).
  --    The (not v_only_new or created_at >= new_since) predicate is the 0016 switch.
  select id, text, choices, correct_index, difficulty, propensity
    into v_qid, v_text, v_choices, v_ci, v_qd, v_prop
  from (
    with cand as (
      select id, text, choices, correct_index, difficulty, embedding, like_count, dislike_count,
             -(embedding <#> v_ptvec) as semantic
      from questions q
      where id <> all(coalesce(p_exclude, '{}'::uuid[]))
        and (p_answered is null or id <> p_answered)
        and (not v_only_new or q.created_at >= v_new_since)
        and not exists (select 1 from impressions i where i.user_id = p_user and i.question_id = q.id)
      order by embedding <#> v_ptvec
      limit c_k
    ),
    gm as (
      select case when sum(like_count + dislike_count) = 0 then 0.5
                  else sum(like_count)::float8 / sum(like_count + dislike_count) end as global_mean
      from cand
    ),
    scored as (
      select c.id, c.text, c.choices, c.correct_index, c.difficulty,
             rec_score(greatest(1e-6, c.semantic),
                       rec_pcorrect(v_mean, v_var, rec_vec_to_arr(c.embedding), c.difficulty::float8, 1.0),
                       c.like_count, c.dislike_count, gm.global_mean, 1.0, 1.0, 0.3, v_target_p) as score
      from cand c, gm
    ),
    normd as (
      select *, exp((score - max(score) over ()) / c_tau_select) as w from scored
    )
    -- Gumbel-max sample; U guarded into [1e-12, 1−1e-12] so BOTH ln's stay finite.
    select id, text, choices, correct_index, difficulty,
           w / nullif(sum(w) over (), 0) as propensity,
           score / c_tau_select - ln(-ln(random() * (1 - 2e-12) + 1e-12)) as gkey
    from normd
    order by gkey desc limit 1
  ) pick;

  -- fallback #1: the K-window emptied out but unseen questions remain elsewhere —
  -- serve the nearest UNSEEN across the served set (carried over from 0010).
  if v_qid is null then
    select id, text, choices, correct_index, difficulty, null::float8
      into v_qid, v_text, v_choices, v_ci, v_qd, v_prop
    from questions q
    where (p_answered is null or id <> p_answered)
      and id <> all(coalesce(p_exclude, '{}'::uuid[]))
      and (not v_only_new or q.created_at >= v_new_since)
      and not exists (select 1 from impressions i where i.user_id = p_user and i.question_id = q.id)
    order by embedding <#> v_ptvec limit 1;
  end if;

  -- fallback #2 (recycle): only when EVERY served question has been seen (carried over).
  if v_qid is null then
    select id, text, choices, correct_index, difficulty, null::float8
      into v_qid, v_text, v_choices, v_ci, v_qd, v_prop
    from questions q
    where (p_answered is null or id <> p_answered)
      and id <> all(coalesce(p_exclude, '{}'::uuid[]))
      and (not v_only_new or q.created_at >= v_new_since)
    order by embedding <#> v_ptvec limit 1;
  end if;

  if v_qid is null then
    raise exception 'No questions are available';
  end if;

  -- 6. log the impression and return the stem only
  insert into impressions (
    user_id, question_id, session_id, position, recommendation_mode,
    is_exploration, primary_interest_id, propensity, difficulty_at_show
  ) values (
    p_user, v_qid, p_session, v_position, v_mode,
    v_mode = 'explore', v_primary, v_prop, v_qd
  ) returning id into v_imp;

  question_id := v_qid; stem := v_text; choices := v_choices;
  correct_index := v_ci; difficulty := v_qd; impression_id := v_imp; mode := v_mode;
  return next;
end;
$$;

-- Re-attach 0012's hnsw.iterative_scan GUC (CREATE OR REPLACE reset the SET clause).
-- The 8-arg signature is unchanged from 0011/0013/0015 — the switch rides on
-- app_config, not as a new argument — so this still targets the right function.
do $$
begin
  alter function next_question(uuid, uuid, uuid, bigint, integer, boolean, integer, uuid[])
    set hnsw.iterative_scan = relaxed_order;
exception
  when insufficient_privilege then
    raise notice 'skipping hnsw.iterative_scan (insufficient privilege); retrieval relies on 0010 unseen-scan fallback';
end $$;
