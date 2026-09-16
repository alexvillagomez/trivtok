import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateAuthoredQuestion,
  type QuestionShape,
} from "../lib/questions/validate";

const GENERATED_DIR = path.resolve("data/generated");
const CATALOG_PATH = path.resolve("data/question-catalog.json");
const TOPIC_FAMILIES_PATH = path.resolve("data/topic-families.json");

type FileSummary = {
  file: string;
  questions: number;
  difficulty: {
    min: number;
    max: number;
    hardAtOrAbove070: number;
  };
  correctIndexDistribution: [number, number, number, number];
  sha256: string;
};

type AuditIssue = {
  file: string;
  question?: number;
  severity: "error" | "warning";
  message: string;
};

type TopicFamilyDefinition = {
  id: string;
  topic: string;
  targetQuestions: number;
  minimumHardQuestions?: number;
  difficultyTarget?: {
    easierBelow070: number;
    hardAtOrAbove070: number;
  };
  enforceAntiTemplate?: boolean;
  files: string[];
};

function normalizeQuestionText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeTemplateStem(text: string): string {
  return normalizeQuestionText(text)
    .replace(/\([^)]*\d+[^)]*\)/g, " ")
    .replace(/\b\d+\b/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function isQuestionShape(value: unknown): value is QuestionShape {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<QuestionShape>;
  return (
    typeof candidate.text === "string" &&
    Array.isArray(candidate.choices) &&
    Number.isInteger(candidate.correctIndex) &&
    typeof candidate.difficulty === "number"
  );
}

async function main() {
  const shouldWrite = process.argv.includes("--write");
  const verbose = process.argv.includes("--verbose");
  const topicFamilyConfig = JSON.parse(
    await readFile(TOPIC_FAMILIES_PATH, "utf8"),
  ) as { families: TopicFamilyDefinition[] };
  const antiTemplateFiles = new Set(
    topicFamilyConfig.families
      .filter((family) => family.enforceAntiTemplate)
      .flatMap((family) => family.files),
  );
  const fileNames = (await readdir(GENERATED_DIR))
    .filter((file) => file.endsWith(".json"))
    .sort();

  const issues: AuditIssue[] = [];
  const summaries: FileSummary[] = [];
  const occurrences = new Map<string, { file: string; question: number; text: string }[]>();

  for (const file of fileNames) {
    const absolutePath = path.join(GENERATED_DIR, file);
    const raw = await readFile(absolutePath, "utf8");
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      issues.push({
        file,
        severity: "error",
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    if (!Array.isArray(parsed)) {
      issues.push({ file, severity: "error", message: "Top-level value must be an array." });
      continue;
    }

    const distribution: [number, number, number, number] = [0, 0, 0, 0];
    const difficulties: number[] = [];
    const templateStems = new Map<string, number[]>();
    const choiceSets = new Map<string, number[]>();
    const catalogFile = `data/generated/${file}`;
    const enforceLongScrollQuality = antiTemplateFiles.has(catalogFile);

    parsed.forEach((value, index) => {
      const questionNumber = index + 1;
      if (!isQuestionShape(value)) {
        issues.push({
          file,
          question: questionNumber,
          severity: "error",
          message: "Question is missing one or more required fields with the correct types.",
        });
        return;
      }

      const validationMessage = validateAuthoredQuestion(value);
      if (validationMessage) {
        issues.push({
          file,
          question: questionNumber,
          severity: validationMessage.startsWith("The question text contains")
            ? "warning"
            : "error",
          message: validationMessage,
        });
      }

      if (new Set(value.choices.map((choice) => choice.trim())).size !== 4) {
        issues.push({
          file,
          question: questionNumber,
          severity: "error",
          message: "Choices must be distinct after normalization.",
        });
      }

      if (value.correctIndex >= 0 && value.correctIndex <= 3) {
        distribution[value.correctIndex] += 1;
      }
      if (Number.isFinite(value.difficulty)) difficulties.push(value.difficulty);

      if (enforceLongScrollQuality) {
        if (/\b(case study|example|record|question|item)\s*(?:number\s*)?\d+\b|\bnumber\s+\d+\b/i.test(value.text)) {
          issues.push({
            file,
            question: questionNumber,
            severity: "error",
            message: "Numbered template labels are not allowed in long-scroll topics.",
          });
        }
        if (
          value.choices.some((choice) =>
            /\ba documented (?:witness|patronal|technical).* clue for\b/i.test(choice),
          )
        ) {
          issues.push({
            file,
            question: questionNumber,
            severity: "error",
            message: "Meta-answer placeholders are not allowed in long-scroll topics.",
          });
        }
        if (
          /\bundefined\b|specifically describe or measure\?/i.test(
            `${value.text} ${value.choices.join(" ")}`,
          ) ||
          value.choices.some((choice) => /\bis associated with\b/i.test(choice))
        ) {
          issues.push({
            file,
            question: questionNumber,
            severity: "error",
            message: "Generic association/undefined placeholders are not allowed.",
          });
        }
        if (Math.abs(value.difficulty - Math.round(value.difficulty * 100) / 100) > 1e-9) {
          issues.push({
            file,
            question: questionNumber,
            severity: "error",
            message: "Difficulty must use at most two decimal places.",
          });
        }
        const templateStem = normalizeTemplateStem(value.text);
        const sameTemplate = templateStems.get(templateStem) ?? [];
        sameTemplate.push(questionNumber);
        templateStems.set(templateStem, sameTemplate);

        const choiceSet = value.choices
          .map((choice) => normalizeQuestionText(choice))
          .sort()
          .join(" | ");
        const sameChoices = choiceSets.get(choiceSet) ?? [];
        sameChoices.push(questionNumber);
        choiceSets.set(choiceSet, sameChoices);
      }

      const normalized = normalizeQuestionText(value.text);
      const matches = occurrences.get(normalized) ?? [];
      matches.push({ file, question: questionNumber, text: value.text });
      occurrences.set(normalized, matches);
    });

    if (enforceLongScrollQuality) {
      for (const [stem, questionNumbers] of templateStems) {
        if (questionNumbers.length >= 3) {
          issues.push({
            file,
            severity: "error",
            message: `Repeated stem template at questions ${questionNumbers.join(", ")}: ${JSON.stringify(stem)}`,
          });
        }
      }
      for (const questionNumbers of choiceSets.values()) {
        if (questionNumbers.length >= 5) {
          issues.push({
            file,
            severity: "error",
            message: `Repeated answer set at questions ${questionNumbers.join(", ")}.`,
          });
        }
      }
    }

    summaries.push({
      file: catalogFile,
      questions: parsed.length,
      difficulty: {
        min: difficulties.length ? Math.min(...difficulties) : 0,
        max: difficulties.length ? Math.max(...difficulties) : 0,
        hardAtOrAbove070: difficulties.filter((value) => value >= 0.7).length,
      },
      correctIndexDistribution: distribution,
      sha256: createHash("sha256").update(raw).digest("hex"),
    });
  }

  const duplicateGroups = [...occurrences.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => a[0].text.localeCompare(b[0].text));
  for (const group of duplicateGroups) {
    issues.push({
      file: group.map((item) => `${item.file}:${item.question}`).join(", "),
      severity: "warning",
      message: `Duplicate normalized question text: ${JSON.stringify(group[0].text)}`,
    });
  }

  const summaryByFile = new Map(summaries.map((summary) => [summary.file, summary]));
  const topicFamilies = topicFamilyConfig.families.map((family) => {
    const missingFiles = family.files.filter((file) => !summaryByFile.has(file));
    if (missingFiles.length > 0) {
      issues.push({
        file: "data/topic-families.json",
        severity: "error",
        message: `${family.id} references missing files: ${missingFiles.join(", ")}`,
      });
    }
    const questions = family.files.reduce(
      (total, file) => total + (summaryByFile.get(file)?.questions ?? 0),
      0,
    );
    const hardQuestions = family.files.reduce(
      (total, file) =>
        total + (summaryByFile.get(file)?.difficulty.hardAtOrAbove070 ?? 0),
      0,
    );
    const easierQuestions = questions - hardQuestions;
    if (questions < family.targetQuestions) {
      issues.push({
        file: "data/topic-families.json",
        severity: "error",
        message: `${family.id} has ${questions}/${family.targetQuestions} long-scroll questions.`,
      });
    }
    if (
      family.minimumHardQuestions !== undefined &&
      hardQuestions < family.minimumHardQuestions
    ) {
      issues.push({
        file: "data/topic-families.json",
        severity: "error",
        message: `${family.id} has ${hardQuestions}/${family.minimumHardQuestions} hard questions.`,
      });
    }
    if (
      family.difficultyTarget &&
      (easierQuestions !== family.difficultyTarget.easierBelow070 ||
        hardQuestions !== family.difficultyTarget.hardAtOrAbove070)
    ) {
      issues.push({
        file: "data/topic-families.json",
        severity: "error",
        message:
          `${family.id} has ${easierQuestions} easier and ${hardQuestions} harder questions; ` +
          `target is ${family.difficultyTarget.easierBelow070}/${family.difficultyTarget.hardAtOrAbove070}.`,
      });
    }
    if (family.files.length === 1 && questions === 100) {
      const distribution = summaryByFile.get(family.files[0])?.correctIndexDistribution;
      if (distribution && distribution.some((count) => count !== 25)) {
        issues.push({
          file: family.files[0],
          severity: "error",
          message: `A 100-question deep batch must have answer positions 25/25/25/25, found ${distribution.join("/")}.`,
        });
      }
    }
    return {
      ...family,
      questions,
      easierQuestions,
      hardQuestions,
      targetMet:
        questions >= family.targetQuestions &&
        (family.minimumHardQuestions === undefined ||
          hardQuestions >= family.minimumHardQuestions) &&
        (family.difficultyTarget === undefined ||
          (easierQuestions === family.difficultyTarget.easierBelow070 &&
            hardQuestions === family.difficultyTarget.hardAtOrAbove070)),
    };
  });

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const catalog = {
    version: 1,
    generatedOn: new Date().toISOString().slice(0, 10),
    sourceDirectory: "data/generated",
    totals: {
      files: summaries.length,
      questions: summaries.reduce((total, item) => total + item.questions, 0),
      duplicateQuestionGroups: duplicateGroups.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    topicFamilies,
    files: summaries,
  };

  if (shouldWrite && errors.length === 0) {
    await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), CATALOG_PATH)}.`);
  } else if (shouldWrite) {
    console.error("Catalog not written because the bank has errors.");
  }

  const reportedIssues = verbose ? issues : errors;
  console.log(
    JSON.stringify(
      {
        totals: catalog.totals,
        warningBreakdown: {
          possibleAnswerGiveaways: warnings.filter((issue) => issue.question !== undefined).length,
          duplicateQuestionGroups: duplicateGroups.length,
        },
        ...(reportedIssues.length > 0 ? { issues: reportedIssues } : {}),
      },
      null,
      2,
    ),
  );
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
