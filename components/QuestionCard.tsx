"use client";

import { useEffect, useState } from "react";
import type { PublicQuestion } from "@/lib/types";

const LABELS = ["A", "B", "C", "D"];

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-8-5.2-10-9.5C.8 8 2.6 5 6 5c2 0 3.2 1.1 4 2.4C10.8 6.1 12 5 14 5c3.4 0 5.2 3 4 6.5C20 15.8 12 21 12 21z" />
    </svg>
  );
}

type Props = {
  question: PublicQuestion;
  /** The choice the user tapped, or null if unanswered. */
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  liked: boolean;
  reported: boolean;
  onToggleLike: () => void;
  onReport: () => void;
  /** Double-tapping the question always likes (TikTok convention). */
  onDoubleLike: () => void;
  /** When true, hide the choices behind a blur until the user taps to reveal. */
  blurAnswers?: boolean;
};

/**
 * The question is the content: it sits centered in the top ~38% of the card,
 * with the four tactile answer bars grouped below. Answering triggers the
 * reward beat (correct burst / wrong shake), compresses the bars, and reveals
 * a one-line payoff. A three-dot menu (top-right) holds like/report; a
 * double-tap likes and floats a heart. No right-hand rail.
 */
export default function QuestionCard({
  question,
  selectedIndex,
  onSelect,
  liked,
  reported,
  onToggleLike,
  onReport,
  onDoubleLike,
  blurAnswers = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  // With blur on, the choices start hidden and the first tap reveals them (it
  // does NOT answer). Reset per question so each new card re-blurs.
  const [revealed, setRevealed] = useState(!blurAnswers);
  useEffect(() => {
    setRevealed(!blurAnswers);
  }, [question.id, blurAnswers]);

  const answered = selectedIndex !== null;
  const correct = answered && selectedIndex === question.correctIndex;
  const hidden = blurAnswers && !revealed;

  function fireHeart() {
    setBurstKey((k) => k + 1);
  }

  // Double-tap anywhere above the answer choices likes the question (TikTok
  // convention). We gate on the tap landing above the first choice so it never
  // collides with actually answering.
  function handleDoubleLike(e: React.MouseEvent) {
    const card = e.currentTarget as HTMLElement;
    const firstChoice = card.querySelector(".choice");
    const cutoff = firstChoice
      ? firstChoice.getBoundingClientRect().top
      : Infinity;
    if (e.clientY >= cutoff) return; // on/below the answers — leave answering alone
    fireHeart();
    onDoubleLike();
  }

  function handleMenuLike() {
    if (!liked) fireHeart();
    onToggleLike();
    setMenuOpen(false);
  }

  function handleMenuReport() {
    onReport();
    setMenuOpen(false);
  }

  return (
    <div className="card" onDoubleClick={handleDoubleLike}>
      <div className="qhead">
        <div className="qtext">{question.text}</div>

        <button
          className="qmenu-btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Question options"
        >
          <span />
          <span />
          <span />
        </button>

        {menuOpen && (
          <>
            <div className="qmenu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="qmenu-pop" role="menu">
              <button onClick={handleMenuLike}>
                {liked ? "Unlike" : "Like"}
              </button>
              <button onClick={handleMenuReport} disabled={reported}>
                {reported ? "Reported" : "Report"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={`answers${hidden ? " answers--blurred" : ""}`}>
        {hidden && (
          <button
            className="answer-reveal"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
          >
            Tap to reveal answers
          </button>
        )}
        {question.choices.map((choice, i) => {
          let cls = "choice";
          if (answered) cls += " choice--answered";
          if (answered && i === question.correctIndex) cls += " choice--correct";
          if (answered && i === selectedIndex && i !== question.correctIndex)
            cls += " choice--wrong";
          if (!answered && i === selectedIndex) cls += " choice--selected";

          const showXp = answered && correct && i === question.correctIndex;

          return (
            <button
              key={i}
              className={cls}
              onClick={() => !answered && onSelect(i)}
              disabled={answered}
            >
              <span className="choice__label">{LABELS[i]}</span>
              <span className="choice__text">{choice}</span>
              {showXp && <span className="xp-float">+12 XP</span>}
            </button>
          );
        })}
      </div>

      {burstKey > 0 && (
        <div className="heart-burst" key={burstKey}>
          <HeartIcon />
        </div>
      )}
    </div>
  );
}
