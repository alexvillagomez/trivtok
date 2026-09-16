// Offline smoke test for the Step 6 feedback loop. No keys, no DB.
// Run: npx tsx scripts/try-update.ts
import { applyInteraction } from "../lib/rec/update";
import { newAbility } from "../lib/rec/difficulty";
import { normalize } from "../lib/vector";
import type { Embedding, UserInterest } from "../lib/types";

function axis(i: number): Embedding {
  const v = new Array(64).fill(0);
  v[i] = 1;
  return normalize(v);
}

const now = "2026-08-27T12:00:00Z";
const userId = "u1";
const question = { embedding: axis(0), difficulty: 0.5 };

// --- 1. Like on a cold user spawns the first interest, no ability change ---
let r = applyInteraction({
  ability: newAbility(),
  interests: [],
  userId,
  question,
  interaction: { liked: true, answered: false, correct: null, responseTimeMs: 3000 },
  now,
});
console.log("cold user likes a question:");
console.log(`  engagement=${r.engagement}  interests spawned=${r.interests.length}  strength=${r.interests[0]?.strength}`);
console.log(`  ability unchanged (mean[0]=${r.ability.mean[0]})  difficulty unchanged (${r.difficulty})`);

const interests: UserInterest[] = r.interests;

// --- 2. Answer correctly: ability + difficulty move, interest barely (+0.1) ---
r = applyInteraction({
  ability: newAbility(),
  interests,
  userId,
  question,
  interaction: { liked: false, answered: true, correct: true, responseTimeMs: 5000 },
  now,
});
console.log("\nanswers correctly (expected P=0.5):");
console.log(`  engagement=${r.engagement} → nearest interest strength ${interests[0].strength} → ${r.interests[0].strength.toFixed(3)}`);
console.log(`  ability mean[0] 0 → ${r.ability.mean[0].toFixed(3)} (moved up)`);
console.log(`  difficulty 0.500 → ${r.difficulty.toFixed(4)} (got it right → easier)`);

// --- 3. Answer incorrectly: ability down, difficulty up ---
r = applyInteraction({
  ability: newAbility(),
  interests,
  userId,
  question,
  interaction: { liked: false, answered: false ? true : true, correct: false, responseTimeMs: 5000 },
  now,
});
console.log("\nanswers incorrectly:");
console.log(`  ability mean[0] 0 → ${r.ability.mean[0].toFixed(3)} (moved down)`);
console.log(`  difficulty 0.500 → ${r.difficulty.toFixed(4)} (got it wrong → harder)`);

// --- 4. Dislike (lingered swipe, no answer) drops strength, no ability change ---
r = applyInteraction({
  ability: newAbility(),
  interests,
  userId,
  question,
  interaction: { liked: false, answered: false, correct: null, responseTimeMs: 6000 },
  now,
});
console.log("\ndislike (slow swipe, no answer):");
console.log(`  engagement=${r.engagement} → strength ${interests[0].strength} → ${r.interests[0].strength.toFixed(3)} (down)`);
console.log(`  ability + difficulty untouched: ${r.ability.mean[0] === 0 && r.difficulty === 0.5}`);

// --- 5. Quick skip (fast swipe) is a weaker negative than dislike ---
const quick = applyInteraction({
  ability: newAbility(), interests, userId, question,
  interaction: { liked: false, answered: false, correct: null, responseTimeMs: 500 }, now,
});
console.log(`\nquick skip (500ms): engagement=${quick.engagement} (vs dislike −1)`);
