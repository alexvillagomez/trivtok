"use client";

import { useEffect, useRef, useState } from "react";
import { beginFeed, reportQuestion, submitInteraction } from "@/app/actions";
import type { PublicQuestion } from "@/lib/types";
import QuestionCard from "./QuestionCard";

// TikTok-style vertical feed, one card ahead is always preloaded so a swipe
// never has to wait on the network. Direction is the TikTok convention: swipe
// UP → next/newer question, swipe DOWN → previous/older question (free, since
// it's just client-side history).
const SWIPE_THRESHOLD = 70; // px of travel that commits a swipe
const FLICK_VELOCITY = 0.45; // px/ms — a fast flick commits below the threshold
const DRAG_START = 6; // px before a gesture counts as a drag (taps stay taps)
const RUBBER = 0.35; // resistance when dragging back past the first card
const SNAP = "transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1)";

type Slot = {
  question: PublicQuestion;
  impressionId: string | null;
  selectedIndex: number | null;
  liked: boolean;
  reported: boolean;
  recorded: boolean; // whether this card's interaction has been sent to the DB
  shownAt: number;
};

type Props = {
  questions: PublicQuestion[];
};

function makeSlot(card: {
  nextQuestion: PublicQuestion;
  impressionId: string | null;
}): Slot {
  return {
    question: card.nextQuestion,
    impressionId: card.impressionId,
    selectedIndex: null,
    liked: false,
    reported: false,
    recorded: false,
    shownAt: Date.now(),
  };
}

export default function Feed({ questions }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [index, setIndex] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pointerDown = useRef(false);
  const startY = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const advancing = useRef(false); // locks the background refill to one at a time
  const fallbackIndex = useRef(0);
  const userId = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);

  // Keep the latest values readable from event handlers without re-binding them.
  const slotsRef = useRef(slots);
  const indexRef = useRef(index);
  slotsRef.current = slots;
  indexRef.current = index;

  function getIdentity(): { userId: string; sessionId: string } {
    if (!userId.current) {
      userId.current = window.localStorage.getItem("trivtok-user-id");
      if (!userId.current) {
        userId.current = crypto.randomUUID();
        window.localStorage.setItem("trivtok-user-id", userId.current);
      }
    }
    if (!sessionId.current) {
      sessionId.current = window.sessionStorage.getItem("trivtok-session-id");
      if (!sessionId.current) {
        sessionId.current = crypto.randomUUID();
        window.sessionStorage.setItem("trivtok-session-id", sessionId.current);
      }
    }
    return { userId: userId.current, sessionId: sessionId.current };
  }

  function nextFallbackSlot(): Slot {
    fallbackIndex.current = (fallbackIndex.current + 1) % questions.length;
    return makeSlot({
      nextQuestion: questions[fallbackIndex.current],
      impressionId: null,
    });
  }

  // Open the session on mount: the server picks (and logs) the first card, then
  // we immediately preload a second so the buffer is always one card ahead.
  useEffect(() => {
    let cancelled = false;
    const identity = getIdentity();
    (async () => {
      const first = await beginFeed(identity.userId, identity.sessionId);
      if (cancelled) return;
      if (!first.ok) {
        setSlots([makeSlot({ nextQuestion: questions[0], impressionId: null })]);
        setSaveError("Offline — showing sample questions.");
        return;
      }
      const slot0 = makeSlot(first);
      const second = await beginFeed(identity.userId, identity.sessionId, [
        slot0.question.id,
      ]);
      if (cancelled) return;
      const slot1 = second.ok ? makeSlot(second) : nextFallbackSlot();
      setSlots([slot0, slot1]);
      setIndex(0);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  // Move to the next card. Always free (the buffer is preloaded); the first
  // time we pass a card we fire off its interaction and refill the buffer in
  // the background. Revisiting a card never re-records and never refetches.
  async function goForward() {
    if (advancing.current) return; // a refill is in flight — don't outrun it
    const cur = indexRef.current;
    const deck = slotsRef.current;
    if (cur + 1 >= deck.length) return; // nothing preloaded yet

    setIndex(cur + 1);
    patchSlot(cur + 1, { shownAt: Date.now() });
    setDragY(0);

    const leaving = deck[cur];
    if (leaving.recorded) return;

    patchSlot(cur, { recorded: true }); // optimistic, so we never record twice
    advancing.current = true;
    setSaveError(null);
    const identity = getIdentity();
    try {
      const result = await submitInteraction({
        ...identity,
        questionId: leaving.question.id,
        impressionId: leaving.impressionId,
        shownAt: new Date(leaving.shownAt).toISOString(),
        selectedIndex: leaving.selectedIndex,
        liked: leaving.liked,
        responseTimeMs: Date.now() - leaving.shownAt,
        excludeIds: deck.map((s) => s.question.id),
      });
      if (result.ok) {
        setSlots((prev) => [...prev, makeSlot(result)]);
      } else {
        setSlots((prev) => [...prev, nextFallbackSlot()]);
        setSaveError("Recommendation update failed; showing the next question.");
      }
    } catch {
      setSlots((prev) => [...prev, nextFallbackSlot()]);
      setSaveError("Recommendation update failed; showing the next question.");
    } finally {
      advancing.current = false;
    }
  }

  function goBack() {
    const cur = indexRef.current;
    if (cur > 0) setIndex(cur - 1);
    setDragY(0);
  }

  // --- Pointer / swipe handling ---
  function onPointerDown(e: React.PointerEvent) {
    if (advancing.current) return;
    pointerDown.current = true;
    startY.current = e.clientY;
    lastY.current = e.clientY;
    lastT.current = performance.now();
    velocity.current = 0;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointerDown.current) return;
    let dy = e.clientY - startY.current;
    if (!dragging && Math.abs(dy) < DRAG_START) return;
    if (!dragging) setDragging(true);

    // Rubber-band a downward drag on the very first card — there's nothing
    // behind it to reveal.
    if (dy > 0 && indexRef.current === 0) dy *= RUBBER;

    const now = performance.now();
    const dt = Math.max(1, now - lastT.current);
    velocity.current = (e.clientY - lastY.current) / dt;
    lastY.current = e.clientY;
    lastT.current = now;
    setDragY(dy);
  }

  function onPointerUp() {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    if (!dragging) return; // it was a tap — let the button's onClick handle it
    setDragging(false);

    const dy = dragY;
    const v = velocity.current;
    const committedUp = dy < -SWIPE_THRESHOLD || v < -FLICK_VELOCITY;
    const committedDown = dy > SWIPE_THRESHOLD || v > FLICK_VELOCITY;

    if (dy < 0 && committedUp) {
      goForward();
    } else if (dy > 0 && committedDown) {
      goBack();
    } else {
      setDragY(0); // spring back
    }
  }

  async function report(i: number) {
    const slot = slotsRef.current[i];
    if (!slot || slot.reported) return;
    patchSlot(i, { reported: true }); // optimistic
    const identity = getIdentity();
    const result = await reportQuestion({
      questionId: slot.question.id,
      userId: identity.userId,
      sessionId: identity.sessionId,
      reason: "other",
    });
    if (!result.ok) {
      patchSlot(i, { reported: false });
      setSaveError("Could not submit report. Please try again.");
    }
  }

  if (slots.length === 0) {
    return (
      <div className="app">
        <div className="frame">
          <div className="loading-slide">{saveError ?? "Loading your feed…"}</div>
        </div>
      </div>
    );
  }

  // Render only the current card plus its immediate neighbours; each is a
  // full-frame slide translated by its distance from the current index (in
  // frame-heights, i.e. 100%) plus the live drag offset.
  const visible: number[] = [];
  for (let i = index - 1; i <= index + 1; i++) {
    if (i >= 0 && i < slots.length) visible.push(i);
  }

  return (
    <div className="app">
      <div
        className="frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {visible.map((i) => {
          const slot = slots[i];
          const offset = i - index;
          const isCurrent = i === index;
          const style: React.CSSProperties = {
            transform: `translateY(calc(${offset * 100}% + ${dragY}px))`,
            transition: dragging ? "none" : SNAP,
          };

          return (
            <div className="slide" key={i} style={style}>
              <QuestionCard
                question={slot.question}
                selectedIndex={slot.selectedIndex}
                onSelect={(choice) =>
                  isCurrent && patchSlot(i, { selectedIndex: choice })
                }
                onDoubleLike={() => isCurrent && patchSlot(i, { liked: true })}
              />
              <div className="rail">
                <button
                  className={`rail-btn${slot.liked ? " rail-btn--liked" : ""}`}
                  onClick={() => patchSlot(i, { liked: !slot.liked })}
                  aria-label={slot.liked ? "Unlike" : "Like"}
                >
                  <span className="rail-icon">{slot.liked ? "♥" : "♡"}</span>
                  <span className="rail-label">Like</span>
                </button>
                <button
                  className={`rail-btn${slot.reported ? " rail-btn--reported" : ""}`}
                  onClick={() => report(i)}
                  disabled={slot.reported}
                  aria-label={slot.reported ? "Reported" : "Report"}
                >
                  <span className="rail-icon">{slot.reported ? "✓" : "⚑"}</span>
                  <span className="rail-label">
                    {slot.reported ? "Sent" : "Report"}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {saveError && <div className="toast">{saveError}</div>}
    </div>
  );
}
