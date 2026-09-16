"use client";

import { useEffect, useState } from "react";
import { linkAccount } from "@/app/actions";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

// Minimal email+password auth. Signing in links the current anonymous id to the
// account (server-side) so saved progress + history carry over, then swaps the
// stored user id to the canonical one and reloads the feed. Signing out resets
// the device to a fresh anonymous user.

function anonId(): string {
  let id = window.localStorage.getItem("trivtok-user-id");
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem("trivtok-user-id", id);
  }
  return id;
}

export default function AuthPanel() {
  const supabase = getSupabaseBrowser();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [formEmail, setFormEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setEmail(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
  }, [supabase]);

  if (!supabase) return null; // auth not configured — anonymous-only

  async function linkAndReload(accessToken: string) {
    const result = await linkAccount(anonId(), accessToken);
    if (result.ok) {
      window.localStorage.setItem("trivtok-user-id", result.userId);
      // New session so beginFeed re-opens cleanly under the canonical id.
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
    // Reset the device to a brand-new anonymous user.
    window.localStorage.setItem("trivtok-user-id", crypto.randomUUID());
    window.sessionStorage.removeItem("trivtok-session-id");
    window.location.reload();
  }

  if (email === undefined) return null; // still resolving session

  if (email) {
    return (
      <div className="auth-panel">
        <span className="auth-email">{email}</span>
        <button className="auth-btn" onClick={onSignOut} disabled={busy}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form className="auth-panel" onSubmit={onSubmit}>
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
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
      />
      <button className="auth-btn" type="submit" disabled={busy}>
        {mode === "signup" ? "Sign up" : "Sign in"}
      </button>
      <button
        className="auth-link"
        type="button"
        onClick={() => {
          setMode((m) => (m === "signup" ? "signin" : "signup"));
          setMessage(null);
        }}
      >
        {mode === "signup" ? "have an account?" : "create account"}
      </button>
      {message && <span className="auth-message">{message}</span>}
    </form>
  );
}
