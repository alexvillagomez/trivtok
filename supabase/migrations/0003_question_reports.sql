-- TrivTok migration 0003 — user-submitted question reports.
--
-- A backstop for bad questions the automated quality gate misses (a giveaway
-- stem, a wrong answer key, an offensive item). Any viewer can flag the card
-- they're looking at; a human triages the queue and deletes/fixes the question.
-- ON DELETE CASCADE so removing a question also clears its reports.

create table question_reports (
  id          bigint generated always as identity primary key,
  question_id uuid not null references questions(id) on delete cascade,
  user_id     uuid references users(id),        -- nullable: anonymous reporters
  session_id  uuid,
  reason      text not null default 'other',    -- gives_away_answer | wrong_answer | offensive | other
  detail      text,                             -- optional free text
  created_at  timestamptz not null default now()
);
create index question_reports_question_idx on question_reports(question_id);
create index question_reports_created_idx   on question_reports(created_at);
