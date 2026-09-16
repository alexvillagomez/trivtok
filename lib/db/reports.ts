import { sql } from "./client";

// Data access for user-submitted question reports (see migration 0003).
// Server-side only — never imported by a client component.

/** The allowed report reasons. Kept in sync with the DB comment on `reason`. */
export const REPORT_REASONS = [
  "gives_away_answer",
  "wrong_answer",
  "offensive",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}

export type QuestionReport = {
  questionId: string;
  userId: string | null;
  sessionId: string | null;
  reason: ReportReason;
  detail: string | null;
};

/** Record one report. Fails if the question id doesn't exist (FK). */
export async function insertQuestionReport(report: QuestionReport): Promise<void> {
  await sql`
    insert into question_reports (question_id, user_id, session_id, reason, detail)
    values (
      ${report.questionId},
      ${report.userId},
      ${report.sessionId},
      ${report.reason},
      ${report.detail}
    )
  `;
}
