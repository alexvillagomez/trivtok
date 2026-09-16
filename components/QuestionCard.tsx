import type { PublicQuestion } from "@/lib/types";

const LABELS = ["A", "B", "C", "D"];

type Props = {
  question: PublicQuestion;
  /** The choice the user tapped, or null if unanswered. */
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Double-tapping the question box always likes (TikTok convention). */
  onDoubleLike: () => void;
};

/**
 * Pure presentational card: the question in a box at the top and its four
 * choices below. No difficulty or other chrome — just the trivia. Answering
 * is optional; you can swipe to the next question without picking one.
 */
export default function QuestionCard({
  question,
  selectedIndex,
  onSelect,
  onDoubleLike,
}: Props) {
  const answered = selectedIndex !== null;

  return (
    <div className="card">
      <div className="qbox" onDoubleClick={onDoubleLike}>
        {question.text}
      </div>

      <div className="choices">
        {question.choices.map((choice, i) => {
          let cls = "choice";
          if (answered && i === question.correctIndex) cls += " choice--correct";
          if (answered && i === selectedIndex && i !== question.correctIndex)
            cls += " choice--wrong";

          return (
            <button
              key={i}
              className={cls}
              onClick={() => !answered && onSelect(i)}
              disabled={answered}
            >
              <span className="choice__label">{LABELS[i]}</span>
              <span className="choice__text">{choice}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
