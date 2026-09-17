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

// Tiny persistent game state: everything the top HUD shows. Kept in
// localStorage so streak/XP/accuracy survive reloads and feel continuous.
type Stats = {
  xp: number;
  streak: number; // current run of consecutive correct answers
  best: number; // best streak ever
  answered: number;
  correct: number;
};

const ZERO_STATS: Stats = { xp: 0, streak: 0, best: 0, answered: 0, correct: 0 };
const STATS_KEY = "trivtok-stats";
const XP_PER_CORRECT = 12;

function loadStats(): Stats {
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (raw) return { ...ZERO_STATS, ...JSON.parse(raw) };
  } catch {
    // ignore corrupt/unavailable storage
  }
  return ZERO_STATS;
}

type Props = {
  questions: PublicQuestion[];
};

// Small line-art glyphs for the HUD — drawn, not emoji.
function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 23a7 7 0 0 0 7-7c0-2-1-3.9-2.5-5.5.2 1.4-.6 2.6-1.7 3 .8-2.3-.3-4.9-2.3-6.5-.5 3-2.8 4.2-4 6.5-.9 1.7-.6 4 .9 5.4A6.98 6.98 0 0 0 12 23z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

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
  const [stats, setStats] = useState<Stats>(ZERO_STATS);
  const [banner, setBanner] = useState<string | null>(null);

  const pointerDown = useRef(false);
  const startY = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const advancing = useRef(false); // locks the background refill to one at a time
  const fallbackIndex = useRef(0);
  const userId = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);

  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest values readable from event handlers without re-binding them.
  const slotsRef = useRef(slots);
  const indexRef = useRef(index);
  const statsRef = useRef(stats);
  slotsRef.current = slots;
  indexRef.current = index;
  statsRef.current = stats;

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

  // Load persisted game state once, then mirror every change back to storage.
  useEffect(() => {
    setStats(loadStats());
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      // ignore unavailable storage
    }
  }, [stats]);

  useEffect(() => {
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  function showBanner(text: string) {
    setBanner(text);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 1800);
  }

  function patchSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  // The core reward beat: record the answer, fire a haptic, and roll the
  // streak / XP / accuracy forward. Only the first answer on a card counts.
  function answer(i: number, slotIndex: number) {
    const slot = slotsRef.current[slotIndex];
    if (!slot || slot.selectedIndex !== null) return;
    patchSlot(slotIndex, { selectedIndex: i });

    const correct = i === slot.question.correctIndex;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(correct ? 18 : [6, 28, 6]);
    }

    const prev = statsRef.current;
    const streak = correct ? prev.streak + 1 : 0;
    const best = Math.max(prev.best, streak);
    setStats({
      xp: prev.xp + (correct ? XP_PER_CORRECT : 0),
      streak,
      best,
      answered: prev.answered + 1,
      correct: prev.correct + (correct ? 1 : 0),
    });

    if (correct && streak >= 2 && streak > prev.best) {
      showBanner(`NEW BEST · ${streak}`);
    } else if (correct && streak > 0 && streak % 5 === 0) {
      showBanner("TOP 8% TODAY");
    }
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
                onSelect={(choice) => isCurrent && answer(choice, i)}
                liked={slot.liked}
                reported={slot.reported}
                onToggleLike={() =>
                  isCurrent && patchSlot(i, { liked: !slot.liked })
                }
                onReport={() => isCurrent && report(i)}
                onDoubleLike={() => isCurrent && patchSlot(i, { liked: true })}
              />
            </div>
          );
        })}

        <div className="hud">
          <div className={`stat stat--streak${stats.streak >= 3 ? " is-hot" : ""}`}>
            <FlameIcon />
            {stats.streak}
          </div>
          <div className="stat stat--acc">
            <TargetIcon />
            {stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0}%
          </div>
          <div className="stat stat--xp">
            <BoltIcon />
            {stats.xp.toLocaleString()}
          </div>
        </div>

        {banner && <div className="banner">{banner}</div>}
      </div>

      {saveError && <div className="toast">{saveError}</div>}
    </div>
  );
}
