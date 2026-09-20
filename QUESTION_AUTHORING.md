# Question Authoring Guidelines

How trivia questions are written for TrivTok. This is the contract every
authoring agent (Codex, Claude subagents, whatever) must follow, and the spec
the insert-time validator ([lib/questions/validate.ts](lib/questions/validate.ts))
enforces. Read this before authoring a batch.

The single most important idea: **a good trivia question is won or lost on its
distractors, not its stem.** A correct answer sitting next to three lazy
distractors is a giveaway no matter how the stem is phrased. Spend your effort
here.

---

## 1. Output contract

Author a JSON array of objects, one per question:

```json
{ "text": "...", "choices": ["<correct>", "<distractor>", "<distractor>", "<distractor>"], "correctIndex": 0, "difficulty": 0.35 }
```

- **`correctIndex` is ALWAYS `0`.** Do not vary it, do not "balance" positions,
  do not think about where the answer should sit. The correct answer goes in
  slot 0, the three distractors fill 1–3. The app shuffles the four choices
  randomly at serve time (server-side, per impression), so the position you
  write is never the position the user sees. **Removing this decision from the
  author is the whole point** — it eliminates positional bias and any
  "the answer is always B" tell.
- **`choices` is exactly 4 strings**, all distinct, all non-empty.
- **`difficulty` is `0.0`–`1.0`** (two decimals). It maps to an item logit at
  scoring time and is auto-calibrated by real answers afterward, so an
  approximate honest guess is fine — see §5.
- Import with `npx tsx scripts/insert-authored.ts <file.json>`. The only API
  call in that path is the embedding.

## 2. Answer style — short

- **1–2 words is the target. 3 is a soft ceiling. 4+ is a smell.** "Momentum",
  "Jackie Robinson", "1912", "Mitochondria" — not "To begin the delivery while
  generating timing and momentum."
- If your correct answer is a sentence, the explanation has leaked into the
  answer. Move the substance into the **stem** and leave a crisp term behind.
- The three distractors must match the answer's length and register (see §4).

## 3. Stems — carry the context, never the answer

**Two failure modes to kill on sight** (both are real questions that shipped and
should not have):

1. **The answer hidden in the stem.** *"Which team of mutants stars in the 1990s
   animated **X-Men** series?" → answer "The X-Men."* The stem names the answer.
   Strip leading articles and re-read: if the stem contains the answer's words,
   or a near-synonym, rewrite it. Ask about a distinctive *fact* instead — a
   power, a rivalry, a specific episode — where the answer is not already sitting
   in the question.
2. **The generic trait with no anchor.** *"Which troll is known for being
   cheerful and colorful?" → answer "Poppy."* This tests nothing: it names no
   film, no scene, no relationship, and "cheerful and colorful" describes half
   the cast. Every stem must be **specific enough that only one answer fits and a
   fan would have to actually know it.** Name the exact work and pin the fact to a
   concrete action, line, event, or relationship — not a vibe. Better: *"In
   Trolls (2016), which character is initially a paranoid survivalist who refuses
   to sing? → Branch"* — a specific, testable fact, and the answer isn't in the
   stem.

- Stems may be **clever, indirect, or require a step of reasoning.** You do not
  have to ask "What is X?" A stem that describes a scenario, quotes a line, or
  asks for the odd-one-out is more engaging and harder to game.
- An explanation in the stem is **optional** — use it when context makes the
  question fair or interesting, skip it when the question stands alone. What is
  **not** optional: the explanation must never live in the **distractors**, and
  the stem must never contain the answer's wording (that trips the giveaway
  check and makes the answer obvious). If any choice reads like a mini-lesson
  ("...because it generates timing and momentum"), rewrite it.
- Exactly **one** answer must be defensible. Clever is good; ambiguous is a bug.
  If a knowledgeable person could argue for two options, tighten the stem.
- **Identify the exact context when it is not the answer.** Name the film,
  series, season, book, event, or version that the fact belongs to. A generic
  character trait ("Which troll is cheerful and colorful?") is not enough;
  ask about a distinctive action, relationship, scene, credit, or consequence
  in a named work instead. If the title itself is the answer, describe its
  distinctive content without repeating any part of the title.
- **Check answer words after removing leading articles.** "The X-Men" is still
  given away by a stem saying "X-Men." Read every stem next to its correct
  choice, not just the raw validator result.
- **Go deep and wide within a topic — depth is the goal, not coverage.** Prefer a
  *few* topics taken far over many topics skimmed. Before a batch, write down 8–12
  distinct facets of the subject and distribute questions across all of them, so a
  fan can scroll a long lane and keep hitting fresh, non-repeating facts. For a
  film franchise that means: each individual installment, specific plot events,
  character relationships and arcs, named settings/locations, songs or scores,
  quotable lines, cast and voice actors, and production/release trivia — plus the
  deep cuts only a superfan knows. A long batch that is mostly generic "Who is
  X?" / "Which film has Y?" prompts has failed the depth test even if every
  question is individually valid. Give each question a **specific, testable fact**
  and never repeat the same fact under reworded stems. Ladder difficulty from
  casual-viewer to superfan-obscure across the facets.
- **Aim for 80–100 distinct questions per topic when the material supports it.**
  A smaller verified batch is better than padding, but do not stop at a 30–60
  question survey if films, sequels, spin-offs, characters, scenes, and production
  provide enough independent facts for a longer lane. Track multiple files as
  one topic and revisit earlier short batches to deepen them.

## 4. Distractor craft — the core skill

A strong distractor is one a half-informed person would actually pick. Build
each of the three to be *tempting*, not filler.

**Do:**
- **Same category and grain as the answer.** If the answer is a year, all three
  distractors are plausible nearby years. If it's a person, three real people of
  the same era/field. If it's a chemical, three real chemicals.
- **Match length, specificity, and register.** The classic LLM tell is that the
  correct answer is the longest, most technical, most hedged, or most
  "textbook-complete" option. Kill that tell: if the answer is two plain words,
  the distractors are two plain words. No option should stand out as "the
  careful one."
- **Mine real misconceptions and adjacent facts.** The best distractor is the
  answer to a *neighboring* question — the thing people confuse this with, the
  common wrong belief, the almost-right date. Reach for what a student gets
  wrong on a test, not a random noun.
- **Keep them mutually exclusive and parallel** in grammar and format.

**Don't:**
- No joke / absurd throwaway options (they turn a 4-way into an easy 2-way).
- No "All of the above", "None of the above", "Both A and B".
- No meta-tells: hedging words ("generally", "typically", "primarily") only on
  the correct option; vague filler like "is associated with…"; one option far
  more detailed than the rest.
- No distractor that is a subset/superset of the answer, or a paraphrase of it.

**Before → after**

| Weak (giveaway) | Strong |
|---|---|
| Answer: "To begin the delivery while generating timing and momentum" · distractors: "To signal the batter", "To measure the mound", "To make a foul count" | Stem: "A pitcher's windup mainly exists to generate what?" · choices: **"Momentum"**, "Spin", "Concealment", "Balance" |
| Answer: "The powerhouse of the cell that produces ATP energy" · distractors: "A part of the cell", "Something in biology", "The cell wall" | Stem: "Which organelle produces most of a cell's ATP?" · choices: **"Mitochondria"**, "Ribosome", "Golgi body", "Lysosome" |

Notice: in the strong versions every option is the same shape, and the wrong
ones are real things you'd have to actually know to rule out.

## 5. Difficulty

- Rough honest estimate of P(a typical player gets it right), inverted onto
  0–1: easy well-known fact ≈ `0.1–0.3`, solid general knowledge ≈ `0.4–0.6`,
  specialist/indirect ≈ `0.7–0.9`.
- The system runs a Bayesian (ADF) update on `difficulty` from real answers, so
  it self-corrects. Don't agonize — but **do author clever/indirect questions at
  a genuinely higher difficulty**, so calibration isn't fighting a mislabel.

## 6. Managing subagents & models — minimize usage

Orchestrators (the agent that fans work out) should optimize for **fewest
tokens spent per acceptable question**, not maximal per-question polish.

- **Assign the model to the task tier:**
  - *Bulk, factual, well-trodden topics* (capitals, basic science, sports
    facts) → the **cheapest capable model** (e.g. Haiku-class). These are
    pattern work; a small model nails them.
  - *Clever / indirect / hard "deep" tiers* where distractor quality and
    non-obvious phrasing matter → a **stronger model** (e.g. Sonnet-class).
    Pay for cleverness only where it shows.
- **One batch, one subagent, one pass.** Give each subagent a topic and a count,
  let it emit the whole JSON array in a single generation. Do not fan a topic
  across many subagents or many turns.
- **Do NOT verify per question.** Authors should not re-research facts, run a
  second self-critique pass, or spend extra calls double-checking their own
  output. That is deliberate: verification is **centralized and free** —
  `scripts/audit-question-bank.ts` and the insert-time validator catch
  structural defects, giveaways, duplicates, and (soon) over-long answers across
  the whole bank in one cheap sweep. Trust the first pass; let the backstop
  reject the few bad ones. Spending model tokens to hand-verify each question
  defeats the cost model.
- **Parallelize independent topics** rather than serializing them.

## 7. What the backstop already checks (so you don't have to)

[lib/questions/validate.ts](lib/questions/validate.ts), run at insert and by
[scripts/audit-question-bank.ts](scripts/audit-question-bank.ts):

- Exactly 4 distinct non-empty choices; valid `correctIndex`; `difficulty` in
  range.
- **Answer-giveaway detection** — the correct answer's wording appearing in the
  stem.
- Duplicate-question detection across the bank.
- Answer-length cap (rejects sentence-answers) — enforced here so authors get
  the short-answer rule for free.

If a question survives the validator it's structurally fine. Your job is the
part a validator can't check: **distractors that are genuinely hard to tell
apart from the answer.**
