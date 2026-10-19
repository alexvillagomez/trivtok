import type { Question } from "../types";

// Per-question popularity from likes, as a Beta posterior mean shrunk toward
// the GLOBAL like-rate (not a flat 0.5). A brand-new question sits at the
// site-wide average and moves toward its own rate as votes accrue, so a
// 2-vote question never swings to 0.07 or 0.93.

export const RATING_PRIOR_STRENGTH = 10; // pseudo-votes; higher = more shrinkage

/** Site-wide like proportion, used as the prior mean. Falls back to 0.5. */
export function globalLikeRate(questions: Question[]): number {
  let likes = 0;
  let total = 0;
  for (const q of questions) {
    likes += q.likeCount;
    total += q.likeCount + q.dislikeCount;
  }
  return total === 0 ? 0.5 : likes / total;
}

/** Beta-posterior like-rating, shrunk toward `globalMean`. Always in (0,1). */
export function likeRating(
  likeCount: number,
  dislikeCount: number,
  globalMean: number,
  priorStrength: number = RATING_PRIOR_STRENGTH,
): number {
  return (
    (likeCount + priorStrength * globalMean) /
    (likeCount + dislikeCount + priorStrength)
  );
}
