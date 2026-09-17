"use client";

import { useEffect, useState } from "react";
import { getTopics, saveInterests } from "@/app/actions";
import type { PublicTopic } from "@/lib/types";

// First-visit onboarding: pick a few broad interests. The choices seed
// user_interests (server-side), so the feed opens straight into 'interest' mode
// instead of cold-starting. Skippable — skipping just falls back to explore.
// Re-openable later from the profile (same component, `mode="edit"`).

function anonId(): string {
  let id = window.localStorage.getItem("trivtok-user-id");
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem("trivtok-user-id", id);
  }
  return id;
}

type Props = {
  /** Called after the user saves or skips — the gate then reveals the feed. */
  onDone: () => void;
  /** "onboard" (first visit, has a Skip) or "edit" (from profile, has Cancel). */
  mode?: "onboard" | "edit";
};

export default function InterestPicker({ onDone, mode = "onboard" }: Props) {
  const [topics, setTopics] = useState<PublicTopic[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTopics().then((t) => {
      if (!cancelled) setTopics(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onContinue() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    const result = await saveInterests(anonId(), Array.from(selected));
    if (result.ok) {
      onDone();
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="frame">
        <div className="picker">
          <header className="picker__head">
            <h1 className="picker__title">
              {mode === "edit" ? "Edit your interests" : "What are you into?"}
            </h1>
            <p className="picker__sub">
              Pick a few to shape your feed. You can change these anytime.
            </p>
          </header>

          <div className="picker__grid">
            {topics === null
              ? Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="chip chip--skeleton" />
                ))
              : topics.map((t) => {
                  const on = selected.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`chip${on ? " chip--on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggle(t.id)}
                    >
                      <span className="chip__emoji">{t.emoji}</span>
                      <span className="chip__label">{t.label}</span>
                    </button>
                  );
                })}
          </div>

          <footer className="picker__foot">
            {error && <div className="picker__error">{error}</div>}
            <button
              type="button"
              className="picker__cta"
              disabled={busy || selected.size === 0}
              onClick={onContinue}
            >
              {busy
                ? "Saving…"
                : selected.size === 0
                  ? "Pick at least one"
                  : `Continue with ${selected.size}`}
            </button>
            <button
              type="button"
              className="picker__skip"
              disabled={busy}
              onClick={onDone}
            >
              {mode === "edit" ? "Cancel" : "Skip for now"}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
