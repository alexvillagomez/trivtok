// Offline smoke test: Bayesian ability + weighted-geometric-mean selection.
// Run: npx tsx scripts/try-score.ts
import { selectNextQuestion } from "../lib/rec/select";
import { pCorrect, updateAbility, newAbility } from "../lib/rec/difficulty";
import { likeRating, globalLikeRate } from "../lib/rec/rating";
import { normalize } from "../lib/vector";
import type { Embedding, Question } from "../lib/types";

function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function axis0(): Embedding {
  const v = new Array(64).fill(0);
  v[0] = 1;
  return normalize(v);
}

const bank: Question[] = [
  { id: "easy", text: "e", choices: ["a", "b", "c", "d"], correctIndex: 0, difficulty: 0.1, embedding: axis0(), likeCount: 5, dislikeCount: 5 },
  { id: "target", text: "t", choices: ["a", "b", "c", "d"], correctIndex: 0, difficulty: 0.3, embedding: axis0(), likeCount: 5, dislikeCount: 5 },
  { id: "medium", text: "m", choices: ["a", "b", "c", "d"], correctIndex: 0, difficulty: 0.5, embedding: axis0(), likeCount: 5, dislikeCount: 5 },
  { id: "hard", text: "h", choices: ["a", "b", "c", "d"], correctIndex: 0, difficulty: 0.8, embedding: axis0(), likeCount: 5, dislikeCount: 5 },
  { id: "loved", text: "l", choices: ["a", "b", "c", "d"], correctIndex: 0, difficulty: 0.3, embedding: axis0(), likeCount: 40, dislikeCount: 2 },
  { id: "hated", text: "x", choices: ["a", "b", "c", "d"], correctIndex: 0, difficulty: 0.3, embedding: axis0(), likeCount: 2, dislikeCount: 40 },
];

const globalMean = globalLikeRate(bank);
console.log(`global like-rate = ${globalMean.toFixed(3)}\n`);

// --- Cold start: fresh user, ability fully uncertain ---
const fresh = newAbility();
const { scored } = selectNextQuestion(axis0(), fresh, bank, { rand: seededRand(1) });
console.log("cold-start user (max uncertainty):");
console.log("  id       P(correct)  diffFactor  rating  prob");
for (const s of scored) {
  console.log(
    `  ${s.question.id.padEnd(8)} ${s.pCorrect.toFixed(3)}      ` +
      `${s.difficultyFactor.toFixed(3)}      ${s.ratingFactor.toFixed(3)}   ${(s.prob * 100).toFixed(1)}%`,
  );
}

// De-peak check: loved vs an equally-difficulty-matched neutral question.
const loved = scored.find((s) => s.question.id === "loved")!;
const target = scored.find((s) => s.question.id === "target")!;
console.log(`\nloved ${(loved.prob * 100).toFixed(1)}% vs target ${(target.prob * 100).toFixed(1)}%  (was 88% vs 5% under raw multiplicative)`);

// Rating shrink: new 0-vote question should sit at the global mean.
console.log("rating shrink: 0-vote question →", likeRating(0, 0, globalMean).toFixed(3), "(= global mean)");
console.log("               2/40 hated      →", likeRating(2, 40, globalMean).toFixed(3), "(pulled off extreme)");

// --- Bayesian learning: variance shrinks, P sharpens as we answer ---
console.log("\nBayesian ability — answer 'hard' (d=0.8) correctly, repeatedly:");
let ability = newAbility();
const hard = bank.find((q) => q.id === "hard")!;
for (let i = 0; i < 20; i++) {
  ability = updateAbility(ability, hard.embedding, hard.difficulty, true);
  if (i === 0 || i === 4 || i === 19) {
    console.log(
      `  after ${String(i + 1).padStart(2)} answers: P(hard)=${pCorrect(ability, hard.embedding, hard.difficulty).toFixed(3)}  ` +
        `mean[0]=${ability.mean[0].toFixed(3)}  var[0]=${ability.variance[0].toFixed(3)}`,
    );
  }
}
console.log(`  other dims untouched: mean/var[1..63] == prior? ${ability.mean.slice(1).every((x) => x === 0) && ability.variance.slice(1).every((x) => x === 1)}`);

// Self-pacing: first update should move mean more than the 20th (variance shrank).
let a2 = newAbility();
const before1 = a2.mean[0];
a2 = updateAbility(a2, hard.embedding, hard.difficulty, true);
const step1 = a2.mean[0] - before1;
for (let i = 0; i < 18; i++) a2 = updateAbility(a2, hard.embedding, hard.difficulty, true);
const beforeN = a2.mean[0];
a2 = updateAbility(a2, hard.embedding, hard.difficulty, true);
const stepN = a2.mean[0] - beforeN;
console.log(`  self-pacing: 1st step moved mean ${step1.toFixed(4)}, 20th moved ${stepN.toFixed(4)} (should shrink)`);
