-- TrivTok migration 0004 — the recommendation math, in the database.
--
-- Step 1 of moving the hot path in-DB (Option A): the erf-free ADF/IRT math as
-- pure IMMUTABLE functions over float8[] vectors. These mirror lib/rec exactly
-- and are golden-tested against it (scripts/try-sql-parity.ts). Because the
-- ability model now uses the logistic approximation Φ(x)≈σ(1.702x), every one
-- of these needs nothing but exp() — no erf, no lookup tables.
--
-- Vectors travel as float8[] here; the orchestrating next_question() function
-- (a later migration) reads the pgvector columns, casts to float8[], calls
-- these, and writes back — so nothing but the chosen stem ever leaves Postgres.

-- σ(x)
create or replace function rec_sigmoid(x float8)
returns float8 language sql immutable parallel safe as $$
  select 1.0 / (1.0 + exp(-x));
$$;

-- Σ a_i · b_i
create or replace function rec_dot(a float8[], b float8[])
returns float8 language sql immutable parallel safe as $$
  select coalesce(sum(a[i] * b[i]), 0.0)
  from generate_subscripts(a, 1) as i;
$$;

-- Engagement signal r_t: like +1 · answer +0.1 · quick skip −0.5 · dislike −1
create or replace function rec_engagement(liked boolean, answered boolean, response_ms int)
returns float8 language sql immutable parallel safe as $$
  select case
    when liked then 1.0
    when answered then 0.1
    when response_ms is not null and response_ms < 1500 then -0.5
    else -1.0
  end;
$$;

-- Confidence-moderated P(correct) = σ(1.702 · (mean·e − b) / √(β² + Σ e²·var)).
create or replace function rec_pcorrect(
  mean float8[], variance float8[], e float8[], difficulty float8, beta float8 default 1.0
) returns float8 language sql immutable parallel safe as $$
  select rec_sigmoid(
    1.702 * (
      (rec_dot(mean, e) - (difficulty - 0.5) * 4)
      / sqrt(
          beta * beta
          + (select coalesce(sum(e[i] * e[i] * variance[i]), 0.0)
             from generate_subscripts(e, 1) as i)
        )
    )
  );
$$;

-- Difficulty suitability factor in (0,1]: 1 − |P − 0.70|.
create or replace function rec_difficulty_factor(p float8)
returns float8 language sql immutable parallel safe as $$
  select 1.0 - abs(p - 0.7);
$$;

-- Bayesian ADF ability update under the logistic surrogate.
--   s=mean·e−b, totVar=Σe²·var, c=√(β²+totVar), y=±1, t=y·s/c
--   v=1.702·σ(−1.702·t), w=v·(v+t)
--   mean_i += y·(e_i·var_i/c)·v ;  var_i *= 1 − (e_i²·var_i/c²)·w
create or replace function rec_update_ability(
  mean float8[], variance float8[], e float8[], difficulty float8, correct boolean,
  beta float8 default 1.0,
  out new_mean float8[], out new_variance float8[]
) language plpgsql immutable parallel safe as $$
declare
  s float8 := 0; totvar float8 := 0; c float8; y float8; t float8; v float8; w float8;
  i int; n int := array_length(e, 1);
begin
  for i in 1..n loop
    s := s + mean[i] * e[i];
    totvar := totvar + e[i] * e[i] * variance[i];
  end loop;
  s := s - (difficulty - 0.5) * 4;
  c := sqrt(beta * beta + totvar);
  y := case when correct then 1.0 else -1.0 end;
  t := (y * s) / c;
  v := 1.702 * rec_sigmoid(-1.702 * t);
  w := v * (v + t);
  new_mean := mean;
  new_variance := variance;
  for i in 1..n loop
    new_mean[i] := mean[i] + y * ((e[i] * variance[i]) / c) * v;
    new_variance[i] := variance[i] * (1.0 - ((e[i] * e[i] * variance[i]) / (c * c)) * w);
  end loop;
end;
$$;

-- Question difficulty drift from the same correctness error: b ← b − lr·(y − P),
-- kept in 0..1. Uses the PRE-update ability (caller passes it) so ability and
-- difficulty share one prediction error.
create or replace function rec_update_difficulty(
  difficulty float8, mean float8[], variance float8[], e float8[], correct boolean, lr float8 default 0.02
) returns float8 language sql immutable parallel safe as $$
  select greatest(0.0, least(1.0,
    (
      ((difficulty - 0.5) * 4)
      - lr * ((case when correct then 1.0 else 0.0 end) - rec_pcorrect(mean, variance, e, difficulty, 1.0))
    ) / 4 + 0.5
  ));
$$;
