import { EMBEDDING_DIM, type Embedding, type Question } from "./types";

// Placeholder embeddings so the Question shape stays correct before the DB
// exists. Deterministic per-seed unit vectors — the recommendation engine
// will use real ones later; the UI (step 1) does not read them at all.
function seededEmbedding(seed: number): Embedding {
  const v: number[] = [];
  let s = seed;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff; // simple LCG
    v.push((s / 0x7fffffff) * 2 - 1);
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export const MOCK_QUESTIONS: Question[] = [
  {
    id: "q1",
    text: "Which planet in our solar system is the hottest?",
    choices: ["Mercury", "Venus", "Mars", "Jupiter"],
    correctIndex: 1,
    difficulty: 0.35,
    likeCount: 40,
    dislikeCount: 5,
    embedding: seededEmbedding(1),
  },
  {
    id: "q2",
    text: "Who painted the ceiling of the Sistine Chapel?",
    choices: ["Leonardo da Vinci", "Raphael", "Michelangelo", "Donatello"],
    correctIndex: 2,
    difficulty: 0.5,
    likeCount: 0,
    dislikeCount: 0,
    embedding: seededEmbedding(2),
  },
  {
    id: "q3",
    text: "What is the smallest prime number?",
    choices: ["0", "1", "2", "3"],
    correctIndex: 2,
    difficulty: 0.1,
    likeCount: 0,
    dislikeCount: 0,
    embedding: seededEmbedding(3),
  },
  {
    id: "q4",
    text: "In which country would you find the ancient city of Petra?",
    choices: ["Egypt", "Jordan", "Greece", "Peru"],
    correctIndex: 1,
    difficulty: 0.65,
    likeCount: 3,
    dislikeCount: 30,
    embedding: seededEmbedding(4),
  },
  {
    id: "q5",
    text: "Which element has the chemical symbol 'Au'?",
    choices: ["Silver", "Aluminum", "Gold", "Argon"],
    correctIndex: 2,
    difficulty: 0.5,
    likeCount: 0,
    dislikeCount: 0,
    embedding: seededEmbedding(5),
  },
  {
    id: "q6",
    text: "How many strings does a standard violin have?",
    choices: ["4", "5", "6", "7"],
    correctIndex: 0,
    difficulty: 0.3,
    likeCount: 0,
    dislikeCount: 0,
    embedding: seededEmbedding(6),
  },
  {
    id: "q7",
    text: "What year did the first human land on the Moon?",
    choices: ["1965", "1969", "1972", "1958"],
    correctIndex: 1,
    difficulty: 0.55,
    likeCount: 0,
    dislikeCount: 0,
    embedding: seededEmbedding(7),
  },
  {
    id: "q8",
    text: "Which ocean is the largest by surface area?",
    choices: ["Atlantic", "Indian", "Arctic", "Pacific"],
    correctIndex: 3,
    difficulty: 0.25,
    likeCount: 0,
    dislikeCount: 0,
    embedding: seededEmbedding(8),
  },
];
