import { readFile, writeFile } from "node:fs/promises";

type AuthoredQuestion = {
  text: string;
  choices: string[];
  correctIndex: number;
  difficulty: number;
};

function moveCorrectAnswer(question: AuthoredQuestion, targetIndex: number): AuthoredQuestion {
  const correctAnswer = question.choices[question.correctIndex];
  const distractors = question.choices.filter((_, index) => index !== question.correctIndex);
  const choices = [...distractors];
  choices.splice(targetIndex, 0, correctAnswer);
  return { ...question, choices, correctIndex: targetIndex };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error(
      "usage: node --import tsx scripts/rebalance-answer-positions.ts <file.json> [...]",
    );
  }

  for (const file of files) {
    const questions = JSON.parse(await readFile(file, "utf8")) as AuthoredQuestion[];
    const balanced = questions.map((question, index) => moveCorrectAnswer(question, index % 4));
    await writeFile(file, `${JSON.stringify(balanced, null, 2)}\n`);
    const distribution = [0, 0, 0, 0];
    balanced.forEach((question) => distribution[question.correctIndex] += 1);
    console.log(`${file}: ${balanced.length} questions, positions ${distribution.join("/")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
