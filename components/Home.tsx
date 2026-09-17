"use client";

import { useEffect, useState } from "react";
import type { PublicQuestion } from "@/lib/types";
import Feed from "./Feed";
import InterestPicker from "./InterestPicker";

// Onboarding gate. A brand-new device (no `trivtok-onboarded` flag) sees the
// interest picker before the feed; everyone else goes straight to the feed. The
// flag is set on save OR skip, so the gate shows exactly once. The profile page
// re-opens the picker on demand, independently of this flag.

const ONBOARDED_KEY = "trivtok-onboarded";

type View = "loading" | "picker" | "feed";

type Props = {
  questions: PublicQuestion[];
};

export default function Home({ questions }: Props) {
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    let onboarded = false;
    try {
      onboarded = window.localStorage.getItem(ONBOARDED_KEY) === "1";
    } catch {
      // storage unavailable — treat as not onboarded, but don't block forever
    }
    setView(onboarded ? "feed" : "picker");
  }, []);

  function finishOnboarding() {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      // ignore unavailable storage
    }
    setView("feed");
  }

  if (view === "loading") {
    return (
      <div className="app">
        <div className="frame">
          <div className="loading-slide">Loading…</div>
        </div>
      </div>
    );
  }

  if (view === "picker") {
    return <InterestPicker onDone={finishOnboarding} />;
  }

  return <Feed questions={questions} />;
}
