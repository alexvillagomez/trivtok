import { sql } from "./client";
import { dot } from "../vector";
import { DEDUP_THRESHOLD, DEDUP_THRESHOLD_SAME_ANSWER } from "../embeddings/embed";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The legacy bank predates the replacement production corpus. Keep its rows
// out of bank-level duplicate checks while retaining checks against all rows
// imported at or after this durable boundary. The manifest is committed so a
// future importer can use exactly the same corpus definition.
type CorpusManifest = {
  boundary: { column: string; operator: string; value: string };
};

const manifestPath = resolve(process.cwd(), "data/production/new-corpus-manifest.json");
const corpusManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CorpusManifest;
const NEW_CORPUS_BOUNDARY = corpusManifest.boundary.value;

// Semantic near-duplicate detection over the 256-D `embedding_256` space
// (migration 0014), using a DOUBLE LEVER: a hard cosine cutoff, plus a softer
// cutoff that only fires when the correct answers also match. See the threshold
// constants in embeddings/embed.ts for the rationale. Two checks make up the
// import gate:
//   1. inBatchDuplicates — does a candidate duplicate an EARLIER one in the same
//      file? (pure, in-memory; the batch usually repeats itself first)
//   2. findExistingDuplicate — does a candidate duplicate something already in
//      the bank? (one HNSW probe for the nearest few, O(log n))

export type DupCandidate = { id: string; text: string; sim: number; answer: string };

/** Normalize an answer string for equality comparison (case/whitespace-insensitive). */
export function normAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The double-lever decision: is this (similarity, same-answer?) pair a duplicate? */
export function isDuplicateHit(sim: number, sameAnswer: boolean): boolean {
  if (sim >= DEDUP_THRESHOLD) return true;
  return sameAnswer && sim >= DEDUP_THRESHOLD_SAME_ANSWER;
}

/**
 * The nearest existing questions to a 256-D dedup vector, with each one's correct
 * answer, as cosine similarity. We pull a few (not just the top-1) so the
 * answer-gated lever can still fire when the very nearest neighbor is a
 * different-answer cousin but a same-answer twin sits just behind it.
 */
export async function nearestCandidates(vec256: number[], k = 8): Promise<DupCandidate[]> {
  const v = JSON.stringify(vec256);
  return sql<DupCandidate[]>`
    select id, text,
           (-(embedding_256 <#> ${v}::vector))::float8 as sim,
           choices[correct_index + 1] as answer
    from questions
    where created_at >= ${NEW_CORPUS_BOUNDARY}::timestamptz
      and embedding_256 is not null
    order by embedding_256 <#> ${v}::vector
    limit ${k}
  `;
}

/**
 * First existing question that duplicates this candidate under the double lever,
 * or null. `answer` is the candidate's correct choice text.
 */
export async function findExistingDuplicate(
  vec256: number[],
  answer: string,
): Promise<DupCandidate | null> {
  const a = normAnswer(answer);
  const candidates = await nearestCandidates(vec256);
  for (const c of candidates) {
    if (isDuplicateHit(c.sim, normAnswer(c.answer) === a)) return c;
  }
  return null;
}

/**
 * Indices that duplicate an earlier kept candidate within the same batch, under
 * the double lever. Returns droppedIndex -> the earlier index it collided with.
 * Pure/synchronous: vectors are unit-length, so dot() is cosine similarity.
 */
export function inBatchDuplicates(vecs: number[][], answers: string[]): Map<number, number> {
  const norm = answers.map(normAnswer);
  const kept: number[] = [];
  const dropped = new Map<number, number>();
  for (let i = 0; i < vecs.length; i++) {
    let hit = -1;
    for (const k of kept) {
      if (isDuplicateHit(dot(vecs[i], vecs[k]), norm[i] === norm[k])) {
        hit = k;
        break;
      }
    }
    if (hit >= 0) dropped.set(i, hit);
    else kept.push(i);
  }
  return dropped;
}
