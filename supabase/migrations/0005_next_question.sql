-- TrivTok migration 0005 — the whole per-swipe pipeline, in ONE round-trip.
--
-- next_question() records the just-answered card (interest + ability + difficulty
-- updates), builds the priority vector, retrieves + scores + samples the next
-- card, logs the impression, and returns ONLY the stem. Nothing but the ~130-byte
-- result ever leaves Postgres; egress is flat regardless of interest count.
--
-- The deterministic math is golden-tested against lib/rec (try-sql-parity.ts);
-- the stochastic steps use the Gumbel-max trick — argmax(score/τ − ln(−ln(U))) is
-- an exact softmax(score/τ) sample — and are checked distributionally end-to-end.

-- ---- pure helpers ----------------------------------------------------------

create or replace function rec_vec_to_arr(v vector)
returns float8[] language sql immutable parallel safe as $$
  select string_to_array(trim(both '[]' from v::text), ',')::float8[];
$$;

create or replace function rec_arr_to_vec(a float8[])
returns vector language sql immutable parallel safe as $$
  select ('[' || array_to_string(a, ',') || ']')::vector;
$$;

create or replace function rec_normalize(a float8[])
returns float8[] language sql immutable parallel safe as $$
  select case when n = 0 then a else (select array_agg(x / n) from unnest(a) as x) end
  from (select sqrt(coalesce(sum(x * x), 0)) as n from unnest(a) as x) s;
$$;

-- Beta-posterior like-rating shrunk toward the global mean (rating.ts).
create or replace function rec_like_rating(
  like_count int, dislike_count int, global_mean float8, prior float8 default 10
) returns float8 language sql immutable parallel safe as $$
  select (like_count + prior * global_mean) / (like_count + dislike_count + prior);
$$;

-- Weighted geometric-mean score (select.ts): w_s·ln(priority) + w_f·ln(diff) + w_r·ln(rating).
create or replace function rec_score(
  semantic float8, p float8, like_count int, dislike_count int, global_mean float8,
  w_s float8 default 1.0, w_d float8 default 1.0, w_r float8 default 0.3
) returns float8 language sql immutable parallel safe as $$
  select w_s * ln(greatest(1e-6, semantic))
       + w_d * ln(rec_difficulty_factor(p))
       + w_r * ln(rec_like_rating(like_count, dislike_count, global_mean));
$$;

-- ---- the orchestrator ------------------------------------------------------

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
  -- tuned constants, mirrored from lib/rec DEFAULT_PARAMS / select.ts
  c_spawn_sim   float8 := 0.5;  c_strength_lr float8 := 0.3;  c_centroid_lr float8 := 0.1;
  c_fresh_w     float8 := 0.3;  c_fresh_hours float8 := 24;   c_tau_primary float8 := 0.5;
  c_epsilon     float8 := 0.1;  c_alpha       float8 := 0.2;  c_top_sec     int    := 3;
  c_k           int    := 150;  c_tau_select  float8 := 0.2;

  v_e        float8[];  v_qdiff  float8;  v_correct_index int;
  v_answered boolean;   v_correct boolean;  v_eng float8;
  v_mean float8[];  v_var float8[];
  v_has_int boolean;  v_near_id uuid;  v_near_sim float8;  v_near_c float8[];  v_near_str float8;  v_near_pc int;
  v_strong boolean;
  v_mode text;  v_primary uuid;  v_primary_c float8[];  v_pt float8[];  v_ptvec vector;
  v_position int;  v_gm float8;
  v_qid uuid;  v_text text;  v_choices text[];  v_ci int;  v_qd real;  v_prop float8;  v_imp bigint;
  v_sec record;  d int;
begin
  -- 0. ensure the user row exists
  insert into users (id, ability_mean, ability_variance)
  values (p_user, rec_arr_to_vec(array_fill(0.0, array[64])), rec_arr_to_vec(array_fill(1.0, array[64])))
  on conflict (id) do update set last_seen_at = now();

  -- 1. record the just-answered card (skipped when opening a session)
  if p_answered is not null then
    select rec_vec_to_arr(embedding), difficulty, correct_index
      into v_e, v_qdiff, v_correct_index
    from questions where id = p_answered for update;

    v_answered := p_selected is not null;
    v_correct  := case when v_answered then p_selected = v_correct_index else null end;
    v_eng      := rec_engagement(p_liked, v_answered, p_response_ms);

    -- 1a. interest update ← engagement (nearest / spawn / centroid nudge)
    v_has_int := exists (select 1 from user_interests where user_id = p_user);
    if v_has_int then
      select id, rec_dot(rec_vec_to_arr(centroid), v_e), rec_vec_to_arr(centroid), strength, positive_count
        into v_near_id, v_near_sim, v_near_c, v_near_str, v_near_pc
      from user_interests where user_id = p_user
      order by rec_dot(rec_vec_to_arr(centroid), v_e) desc limit 1;
    end if;
    v_strong := v_eng >= 1.0;

    if v_strong and (not v_has_int or v_near_sim < c_spawn_sim) then
      insert into user_interests (id, user_id, centroid, strength, positive_count, last_used_at)
      values (gen_random_uuid(), p_user, rec_arr_to_vec(rec_normalize(v_e)), 1.0, 1, now());
    elsif v_has_int then
      update user_interests set
        strength = greatest(0, v_near_str + c_strength_lr * v_eng),
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

  -- 2. load current ability + interest count
  select rec_vec_to_arr(ability_mean), rec_vec_to_arr(ability_variance)
    into v_mean, v_var from users where id = p_user;
  select count(*) into interest_count from user_interests where user_id = p_user;

  -- 3. priority vector p_t
  if interest_count = 0 then
    v_mode := 'cold';
  elsif random() < c_epsilon then
    v_mode := 'explore';
  else
    v_mode := 'interest';
  end if;

  if v_mode = 'interest' then
    -- Gumbel-max sample of the primary over activation A = strength + freshness.
    select id, rec_vec_to_arr(centroid) into v_primary, v_primary_c
    from (
      select id, centroid,
        strength + c_fresh_w * least(greatest(extract(epoch from now() - last_used_at) / 3600, 0) / c_fresh_hours, 1) as a
      from user_interests where user_id = p_user
    ) s
    order by a / c_tau_primary - ln(-ln(random())) desc limit 1;

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
    select embedding into v_ptvec
    from (
      select q.embedding,
        coalesce(1 - (select max(rec_dot(rec_vec_to_arr(ui.centroid), rec_vec_to_arr(q.embedding)))
                      from user_interests ui where ui.user_id = p_user), 1) as nov
      from questions q order by random() limit 24
    ) d
    order by nov / 0.5 - ln(-ln(random())) desc limit 1;
  end if;

  -- 4. position within the session (for the impression log)
  select count(*) into v_position from impressions where session_id = p_session;

  -- 5. retrieve + score + Gumbel-max sample, excluding seen + queued ids
  select id, text, choices, correct_index, difficulty, propensity
    into v_qid, v_text, v_choices, v_ci, v_qd, v_prop
  from (
    with cand as (
      select id, text, choices, correct_index, difficulty, embedding, like_count, dislike_count,
             -(embedding <#> v_ptvec) as semantic
      from questions q
      where id <> all(coalesce(p_exclude, '{}'::uuid[]))
        and (p_answered is null or id <> p_answered)
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
                       c.like_count, c.dislike_count, gm.global_mean) as score
      from cand c, gm
    ),
    normd as (
      select *, exp((score - max(score) over ()) / c_tau_select) as w from scored
    )
    select id, text, choices, correct_index, difficulty,
           w / nullif(sum(w) over (), 0) as propensity,
           score / c_tau_select - ln(-ln(random())) as gkey
    from normd
    order by gkey desc limit 1
  ) pick;

  -- fallback: everything unseen exhausted → fresh cycle over the whole bank
  if v_qid is null then
    select id, text, choices, correct_index, difficulty, null::float8
      into v_qid, v_text, v_choices, v_ci, v_qd, v_prop
    from questions
    where (p_answered is null or id <> p_answered)
      and id <> all(coalesce(p_exclude, '{}'::uuid[]))
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
