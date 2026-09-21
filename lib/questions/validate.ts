// Question-quality checks — pure, synchronous, no I/O.
//
// The most common authoring defect is a stem that GIVES AWAY its own answer:
// the correct choice's wording appears verbatim in the question text, so the
// user can pick it without knowing anything. e.g.
//   "What is the name of the set of complex numbers …?"  → answer "Complex Numbers"
// These functions catch that at insert time so the bad question never lands in
// the bank, and expose the same reason string the report flow uses.

/** Lowercase, strip punctuation to spaces, collapse whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if `phrase` appears as a whole-word run inside `text` (both normalized). */
function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

/** Ignore a leading article when checking titled answers like "The X-Men". */
function giveawayPhrases(choice: string): string[] {
  const normalized = normalize(choice);
  const withoutArticle = normalized.replace(/^(?:the|an|a) /, "");
  return [...new Set([normalized, withoutArticle])].filter(
    (phrase) => phrase.includes(" ") || phrase.length >= 4,
  );
}

/**
 * A giveaway is when the correct answer's wording sits in the stem but the
 * alternatives' wording does not — the stem points straight at the answer.
 * Returns a human-readable reason, or null if the question looks fair.
 *
 * We only flag "meaningful" answer phrases (a multi-word phrase, or a single
 * word of 4+ characters) so a bare "is"/"the" match can't trip it, and we
 * require asymmetry (at least one distractor NOT in the stem) so a legitimate
 * "which of the following: a, b, c, d" listing isn't caught.
 */
export function findAnswerGiveaway(
  text: string,
  choices: string[],
  correctIndex: number,
): string | null {
  const stem = normalize(text);
  const answerPhrases = giveawayPhrases(choices[correctIndex] ?? "");
  if (!answerPhrases.some((phrase) => containsPhrase(stem, phrase))) return null;

  // If EVERY choice is echoed in the stem it's a listing ("which of these: a,
  // b, c, d?"), not a giveaway. We only flag the asymmetric case: the answer is
  // in the stem but at least one distractor is not.
  const allChoicesInStem = choices.every(
    (choice) => giveawayPhrases(choice).some((phrase) => containsPhrase(stem, phrase)),
  );
  if (allChoicesInStem) return null;

  return `The question text contains the correct answer ("${choices[correctIndex]}").`;
}

export type QuestionShape = {
  text: string;
  choices: string[];
  correctIndex: number;
  difficulty: number;
};

/**
 * Structural + quality validation for an authored question. Returns null when
 * the question is acceptable, or a reason string describing the first problem.
 */
export function validateAuthoredQuestion(q: QuestionShape): string | null {
  if (typeof q?.text !== "string" || q.text.length === 0) {
    return "Missing question text.";
  }
  if (!Array.isArray(q.choices) || q.choices.length !== 4) {
    return "A question needs exactly 4 choices.";
  }
  if (!q.choices.every((c) => typeof c === "string" && c.length > 0)) {
    return "Every choice must be a non-empty string.";
  }
  if (
    !Number.isInteger(q.correctIndex) ||
    q.correctIndex < 0 ||
    q.correctIndex > 3
  ) {
    return "correctIndex must be an integer 0..3.";
  }
  if (typeof q.difficulty !== "number" || q.difficulty < 0 || q.difficulty > 1) {
    return "difficulty must be a number in 0..1.";
  }
  return findAnswerGiveaway(q.text, q.choices, q.correctIndex);
}
