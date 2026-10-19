"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getProfile,
  getSettings,
  linkAccount,
  saveSettings,
  type ProfileData,
} from "@/app/actions";
import { getAnonUserId, SETTINGS_EVENT } from "@/lib/clientId";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/types";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import InterestPicker from "@/components/InterestPicker";

// Top-right profile button → slide-up sheet with the user's self-portrait:
// lifetime accuracy + counts (DB truth via getProfile), favorite topics,
// strongest areas, auth (lifted from AuthPanel), and a "Change interests"
// shortcut back into the InterestPicker. Replaces the old <AuthPanel/> bar.

// Optional secondary flair only — the DB is the source of truth for accuracy.
type LocalStats = { xp: number; best: number };

function readLocalStats(): LocalStats {
  try {
    const raw = window.localStorage.getItem("trivtok-stats");
    if (!raw) return { xp: 0, best: 0 };
    const s = JSON.parse(raw);
    return { xp: Number(s.xp) || 0, best: Number(s.best) || 0 };
  } catch {
    return { xp: 0, best: 0 };
  }
}

export default function Profile() {
  const supabase = getSupabaseBrowser();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [local, setLocal] = useState<LocalStats>({ xp: 0, best: 0 });

  // Auth form state (mirrors AuthPanel).
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [formEmail, setFormEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadError(null);
    const result = await getProfile(getAnonUserId());
    if (result.ok) {
      setProfile(result);
    } else {
      setProfile(null);
      setLoadError(result.error);
    }
  }, []);

  // Resolve the session email once (or mark anonymous when auth isn't set up).
  // A persisted Supabase session (same browser / installed web app) should keep
  // you signed in AND on your account: reconcile the feed identity to the linked
  // account here, so a restored session heals any drift in the local user id.
  useEffect(() => {
    if (!supabase) {
      setEmail(null);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (cancelled) return;
      setEmail(session?.user.email ?? null);
      if (!session) return;
      const current = getAnonUserId();
      const result = await linkAccount(current, session.access_token);
      if (!cancelled && result.ok && result.userId !== current) {
        window.localStorage.setItem("trivtok-user-id", result.userId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Fetch profile + local flair whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    setLocal(readLocalStats());
    loadProfile();
  }, [open, loadProfile]);

  async function linkAndReload(accessToken: string) {
    const result = await linkAccount(getAnonUserId(), accessToken);
    if (result.ok) {
      window.localStorage.setItem("trivtok-user-id", result.userId);
      window.sessionStorage.removeItem("trivtok-session-id");
      window.location.reload();
    } else {
      setMessage(result.error);
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: formEmail,
        password,
      });
      if (error) {
        setMessage(error.message);
        setBusy(false);
      } else if (data.session) {
        await linkAndReload(data.session.access_token);
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
        setBusy(false);
      }
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: formEmail,
      password,
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    } else if (data.session) {
      await linkAndReload(data.session.access_token);
    }
  }

  async function onSignOut() {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    window.localStorage.setItem("trivtok-user-id", crypto.randomUUID());
    window.sessionStorage.removeItem("trivtok-session-id");
    window.location.reload();
  }

  // The interest editor takes over the whole frame (it renders its own .app).
  if (editing) {
    return (
      <InterestPicker
        mode="edit"
        onDone={() => {
          setEditing(false);
          loadProfile();
        }}
      />
    );
  }

  const initial = email ? email[0]!.toUpperCase() : "?";

  return (
    <>
      <button
        className="profile-trigger"
        aria-label="Open profile"
        onClick={() => setOpen(true)}
      >
        {initial}
      </button>

      {open && (
        <div
          className="profile-overlay"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="profile-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Profile"
          >
            <div className="profile-sheet__head">
              <div className="profile-avatar">{initial}</div>
              <div className="profile-ident">
                <div className="profile-ident__name">
                  {email ?? "Anonymous"}
                </div>
                <div className="profile-ident__sub">
                  {email ? "Signed in" : "Browsing anonymously"}
                </div>
              </div>
              <button
                className="profile-close"
                aria-label="Close profile"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="profile-body">
              {loadError ? (
                <div className="profile-error">
                  {loadError}
                  <button className="profile-retry" onClick={loadProfile}>
                    Retry
                  </button>
                </div>
              ) : profile === null ? (
                <div className="profile-loading">Loading your profile…</div>
              ) : (
                <ProfileContent profile={profile} local={local} />
              )}

              {/* Auth section */}
              {supabase && email !== undefined && (
                <section className="profile-section">
                  <h3 className="profile-section__title">Account</h3>
                  {email ? (
                    <div className="profile-account">
                      <span className="profile-account__email">{email}</span>
                      <button
                        className="profile-btn"
                        onClick={onSignOut}
                        disabled={busy}
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <form className="profile-auth" onSubmit={onSubmit}>
                      <input
                        type="email"
                        placeholder="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                      <input
                        type="password"
                        placeholder="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete={
                          mode === "signup" ? "new-password" : "current-password"
                        }
                      />
                      <button
                        className="profile-btn profile-btn--primary"
                        type="submit"
                        disabled={busy}
                      >
                        {mode === "signup" ? "Sign up" : "Sign in"}
                      </button>
                      <button
                        className="profile-authlink"
                        type="button"
                        onClick={() => {
                          setMode((m) => (m === "signup" ? "signin" : "signup"));
                          setMessage(null);
                        }}
                      >
                        {mode === "signup"
                          ? "have an account?"
                          : "create account"}
                      </button>
                      {message && (
                        <span className="profile-authmsg">{message}</span>
                      )}
                    </form>
                  )}
                </section>
              )}

              <SettingsSection />

              <button
                className="profile-btn profile-btn--wide"
                onClick={() => setEditing(true)}
              >
                Change interests
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProfileContent({
  profile,
  local,
}: {
  profile: ProfileData;
  local: LocalStats;
}) {
  const { lifetime, favoriteTopics, strongestAreas } = profile;
  const accuracyPct = Math.round(lifetime.accuracy * 100);

  return (
    <>
      {/* Lifetime accuracy hero + supporting counts */}
      <section className="profile-hero">
        <div className="profile-hero__pct">{accuracyPct}%</div>
        <div className="profile-hero__label">lifetime accuracy</div>
      </section>

      <div className="profile-stats">
        <Stat value={lifetime.seen} label="seen" />
        <Stat value={lifetime.answered} label="answered" />
        <Stat value={lifetime.correct} label="correct" />
        <Stat value={lifetime.liked} label="liked" />
      </div>

      {(local.best > 0 || local.xp > 0) && (
        <div className="profile-flair">
          <span className="profile-flair__item profile-flair__item--xp">
            {local.xp.toLocaleString()} XP
          </span>
          <span className="profile-flair__item profile-flair__item--best">
            best streak {local.best}
          </span>
        </div>
      )}

      {/* Favorite topics */}
      <section className="profile-section">
        <h3 className="profile-section__title">Favorite topics</h3>
        {favoriteTopics.length === 0 ? (
          <p className="profile-empty">
            Like a few questions to build your favorites.
          </p>
        ) : (
          <div className="profile-chips">
            {favoriteTopics.map((t) => (
              <span key={t.label} className="profile-chip">
                {t.label}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Strongest areas */}
      <section className="profile-section">
        <h3 className="profile-section__title">Strongest areas</h3>
        {strongestAreas.length === 0 ? (
          <p className="profile-empty">
            Answer more questions to reveal your strongest areas.
          </p>
        ) : (
          <ul className="profile-bars">
            {strongestAreas.map((a) => (
              <li key={a.label} className="profile-bar">
                <span className="profile-bar__label">{a.label}</span>
                <span className="profile-bar__track">
                  <span
                    className="profile-bar__fill"
                    style={{
                      width: `${Math.round(Math.max(0, Math.min(1, a.score)) * 100)}%`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="profile-stat">
      <div className="profile-stat__value">{value.toLocaleString()}</div>
      <div className="profile-stat__label">{label}</div>
    </div>
  );
}

// Exploration + difficulty feed the in-DB recommender; blur is a client render
// flag. All three persist on the user's row (getSettings/saveSettings). Slider
// moves update local state instantly and persist on a short debounce, so a drag
// is one write, not dozens; the blur toggle also broadcasts to the live feed.
const SAVE_DEBOUNCE_MS = 350;

function SettingsSection() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror the latest settings so update() can build the next value without
  // reading a stale closure — and without side-effecting inside a setState updater.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;
    getSettings(getAnonUserId()).then((res) => {
      if (!cancelled && res.ok) {
        setSettings({
          exploreLevel: res.exploreLevel,
          targetP: res.targetP,
          blurAnswers: res.blurAnswers,
        });
      }
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function persist(next: UserSettings, immediate = false) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const run = () => saveSettings(getAnonUserId(), next);
    if (immediate) run();
    else saveTimer.current = setTimeout(run, SAVE_DEBOUNCE_MS);
  }

  function update(patch: Partial<UserSettings>, immediate = false) {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    persist(next, immediate);
  }

  return (
    <section className="profile-section settings">
      <h3 className="profile-section__title">Settings</h3>

      <label className="settings-row">
        <span className="settings-row__label">Exploration</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.exploreLevel}
          disabled={!loaded}
          onChange={(e) => update({ exploreLevel: Number(e.target.value) })}
        />
        <span className="settings-row__ends">
          <span>Only what I like</span>
          <span>Explore constantly</span>
        </span>
      </label>

      <label className="settings-row">
        <span className="settings-row__label">Difficulty</span>
        <input
          type="range"
          min={0.5}
          max={0.9}
          step={0.05}
          // The slider reads left→right as easy→hard, but a LOW target P(correct)
          // means HARDER questions, so we flip: position = max+min − targetP.
          value={0.5 + 0.9 - settings.targetP}
          disabled={!loaded}
          onChange={(e) => update({ targetP: 0.5 + 0.9 - Number(e.target.value) })}
        />
        <span className="settings-row__ends">
          <span>Easier</span>
          <span>Harder</span>
        </span>
      </label>

      <label className="settings-toggle">
        <span className="settings-row__label">Blur answers until tapped</span>
        <input
          type="checkbox"
          checked={settings.blurAnswers}
          disabled={!loaded}
          onChange={(e) => {
            const blurAnswers = e.target.checked;
            update({ blurAnswers }, true);
            window.dispatchEvent(
              new CustomEvent(SETTINGS_EVENT, { detail: { blurAnswers } }),
            );
          }}
        />
      </label>
    </section>
  );
}
