# TrivTok — Question Authoring

## Goal
Each question surfaces **one solid, interesting thing worth knowing** about a topic — a
"huh, good one" pull. You are testing whether someone **knows** the answer, never making
them reason, calculate, or work anything out. The stem supplies all the context; the
answer is a short, specific term.

## Production setup

- Use **`gpt-5.6-luna` with `high` reasoning** for question creation. This is the
  selected production model.
- Author **50 questions per batch** for one broad topic, such as `Economics`,
  `Television`, `Geography`, or `Food Science`. A single concept, movie, person,
  event, or year is too narrow to be a topic for a 50-question batch.
- Keep each batch as a raw JSON array in its own file. Do not add commentary or
  model metadata to question objects.
- Treat previously authored, trial, and generated batches as **throwaway**,
  except for the approved gold-star examples in this guide. Start the new corpus
  from the topic and this guide. Do not copy old files or count old questions
  toward a topic's coverage.
- The author should check answer accuracy, unique correctness, and wording while
  composing. **New production batches do not need a separate verification or
  editorial review.** Send them directly to the database through the existing
  structural and duplicate controls. Accept the residual wording, tagging, and
  distractor risk observed in the trials.

### Trial findings

Luna high produced mostly sound answers in the test batches. The observed misses
were occasional imprecise wording, a wrong `consequence` tag on a correctly
answered cause question, and a few weak distractors. They were not a pattern of
wrong keyed answers. The user chose Luna high for production with these residual
risks understood. The flexible, usually fact-heavy type choice worked well.
Continue to prefer a clean `fact` question whenever a causal framing would be
strained. Earlier batches were experiments and are not part of the new corpus.

### Handoff to a production agent

Configure the agent as `gpt-5.6-luna` with reasoning effort `high`. Give it a
**broad topic** and an output path for each 50-question batch. The agent should
plan coverage of that whole topic, then write the questions. Do not treat this
guide alone as an instruction to start a production run.

Use this task text, filling in the braces:

> Read `docs/question-authoring.md`. Author exactly 50 distinct questions about
> the broad topic **{topic}** in its required JSON format. Cover the topic's
> major facets, from central ideas through deeper, specific facts. Do not let
> one concept, work, person, event, or year dominate the batch. Include some
> obscure but fair facts and score their difficulty honestly. Prefer `fact`;
> use `mechanism` or `consequence` only when the answer genuinely fits. Check
> answers and choices while composing, and omit uncertain claims. Treat all
> earlier question files as throwaway; use only the gold-star examples in the
> guide as style references, without copying them into the batch. Write only
> the raw JSON array to **{output path}**. Do not run a separate fact-check or
> editorial review. Send the batch to the database through the existing
> structural and duplicate controls. Report generated, rejected, duplicate,
> and inserted counts.

The normal production workflow imports each completed batch directly. The
existing importer checks against the current bank; before the first replacement
import, configure deduplication so the throwaway bank does not veto questions
in the **new** corpus. After that setup, apply the existing structural and
duplicate controls with `npx tsx scripts/insert-authored.ts <output-path>` and
insert without a separate human or model verification pass. Only stop at the
JSON file when the assignment explicitly requests a dry run.

## Choose the type that fits

Tag every question with exactly one of these labels:

- **`fact`** — a notable, verifiable piece of knowledge. This is the natural choice
  for most topics and may be the large majority of a batch.
- **`mechanism`** — the stem names an outcome and asks why or how it occurs. The
  answer is the **name of the process that causes it**, such as `Osmosis`,
  `Evaporation`, or `Protein denaturation`. The process must explain the outcome;
  repeating the outcome under another name does not count.
- **`consequence`** — the stem names a specific setup or action, and the answer is
  its clear, knowable result.

Use these exact lowercase labels: `fact`, `mechanism`, `consequence`. Do not target
a type ratio or force every type into every batch. TV history, for example, may
be mostly `fact`. Choose a mechanism or consequence only when it makes a good
knowledge question.

## The stem
- **Context-complete.** Name the domain and any setup the reader needs, so there is zero
  ambiguity — e.g. *"In the Harry Potter novels…"*, *"In the human body…"*. A reader
  should never wonder "which one do you mean?"
- **Proper and interesting.** A real, readable question, not a hurried fragment.
  1–3 sentences.
- **No answer in the stem.** Do not include the answer's wording or an obvious
  variant. A question that says "kefir grains" cannot ask for `Kefir`; a
  question that says "sumac" cannot ask for `Sumac berries`.
- **No reasoning inside.** Never explain, hint, or walk toward the answer. Give the
  situation, not the connection.
- **No math or puzzles.** If answering requires calculation or logic steps, it's the
  wrong question — rewrite it as a knowledge question.

## The choices
- **Four choices. The correct one is always first (`correctIndex: 0`).** Positions get
  shuffled later. Do not use true/false questions in this format.
- **Short — ideally 1–2 words**, a brief phrase at most. Frame the stem so the answer
  *can* be that short. For a `mechanism`, choices name processes; they are not
  sentences explaining the process.
- **Every distractor is solid.** Each is a real, plausible alternative of the same kind —
  something a reasonable person could believe. No throwaways, impossible outcomes,
  jokes, "always/never" giveaways, or "all/none of the above."
- **Same style.** All four share category, form, length, and register, so the right one
  never stands out.
- **One clean answer.** The correct choice is uniquely, verifiably right; no distractor is
  "also kind of true"; the answer is never a restatement of the stem.
- **No explanations in choices.** A choice is the bare answer — no *because / since /
  from*, parentheses, or full causal clause. If the answer needs a long explanation,
  choose another fact or tighten the stem.

## Coverage & difficulty
- **A topic is broad; individual questions can be specific.** `Economics` is a
  suitable topic. `Real versus nominal values`, one movie, or a particular
  historical shopping event is a subject for one or a few questions within a
  topic, not the topic of an entire 50-question batch.
- **Build breadth and depth in the same 50.** Plan the major facets before
  writing. An Economics batch, for example, could range across markets and
  prices, money and banking, inflation, jobs and wages, trade, growth,
  government policy, and economic history. Include central concepts and then
  less familiar people, terms, events, relationships, and examples within those
  facets. A concept such as real versus nominal values may deserve one or two
  questions, perhaps a few more if each teaches something distinct, but nowhere
  near 25.
- **Vary specificity.** Named works, events, people, and obscure facts make a
  broad topic interesting. Include them across the topic rather than letting
  one narrow subject dominate. Avoid both an easy-only survey and a batch
  overwhelmed by hyper-specific one-offs. Do not repeat a fact under new
  wording or ask several near-identical questions with the same answer.
- **Hard means obscure knowledge, not extra reasoning.** A deep-cut fact can still
  have a short stem and a one-phrase answer. Do not make questions hard by adding
  calculations, vague wording, or barely distinguishable choices.
- **Score difficulty honestly.** Do not cluster everything around `0.3`–`0.5`
  or hesitate to use `0.7` and above for obscure but verifiable facts:
  - **`0.2`–`0.35` easy** — widely known foundation
  - **`0.4`–`0.55` medium** — solid general or topic knowledge
  - **`0.6`–`0.7` hard** — less familiar detail within the topic
  - **`0.7`–`0.85` very hard** — obscure, specific knowledge with one clean answer
  - **Above `0.85`** only for exceptionally obscure but still fair facts

The goal is a useful difficulty spread, not a fixed quota. Score an obscure fact
high even if the question itself is short and clear. A batch made only of easy
recall has not reached enough depth, even if every answer is correct.

## Correctness
Every answer must be true and uncontested. If you're not certain it's correct, don't
write it. Check that the stem names the right kind of answer (a grain versus a flour,
for example) and that no distractor is also defensible.

While composing, check each stem beside its intended answer. Look for giveaways
that differ by a singular, plural, or related word; choices that are also true;
and repeated facts under different stems. Deep and specialist facts are welcome
when you know them confidently. Be especially careful with historical firsts,
awards, and dates that may be disputed or easy to misremember. Leave an uncertain
fact out rather than padding the batch. The acceptance process runs the existing
structural validator and duplicate controls automatically.

## Gold-star examples

These selected sample questions show concise stems, specific knowledge,
plausible choices of the same kind, and honest difficulty scores. They do not
count toward a new 50-question batch; use the style without repeating the facts.
The correct answer is first in each line.

1. **Food Science · `fact` · `0.6`** Which measurement expresses how much unbound
   water in a food is available for microbial growth? — Water activity / Moisture
   content / Acidity / Osmotic pressure
2. **Food Science · `fact` · `0.65`** Which traditional process treats maize with
   an alkaline solution before grinding it? — Nixtamalization / Malting /
   Tempering / Decortication
3. **Food Science · `fact` · `0.7`** Which sensory receptor is activated by
   capsaicin, producing a burning sensation? — TRPV1 / TAS1R2 / TAS2R38 / ASIC3
4. **Television · `fact` · `0.55`** Which television production method records a
   studio scene with several cameras rolling at the same time? — Multicamera
   production / Single-camera production / Motion capture / Rotoscoping
5. **Television · `fact` · `0.55`** In television production, what is an episode
   that uses a limited setting and mostly regular cast members called? — Bottle
   episode / Clip show / Crossover / Backdoor pilot
6. **Earth Science · `fact` · `0.45`** Which kind of fossil is especially useful
   for matching rock layers because it was widespread but existed for a
   relatively short time? — Index fossil / Trace fossil / Living fossil /
   Carbon film
7. **Earth Science · `mechanism` · `0.45`** Which process can create underground
   cavities when groundwater moves through soluble limestone? — Dissolution /
   Deposition / Compaction / Glaciation
8. **Geography · `fact` · `0.45`** What is the largest island in the Mediterranean
   Sea? — Sicily / Sardinia / Cyprus / Crete

## Output — JSON array, correct answer first

Each object has exactly `type`, `text`, `choices`, `correctIndex`, and
`difficulty`. Use no true/false choices or `correct_answer` object.

```json
[
  {"type":"fact","text":"<complete, context-rich question>","choices":["<correct answer>","<plausible alternative>","<plausible alternative>","<plausible alternative>"],"correctIndex":0,"difficulty":0.7}
]
```
