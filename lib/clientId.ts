// The browser's anonymous identity, shared by every client component. The app
// is anonymous-first: a stable user id lives in localStorage and follows the
// device across reloads; a session id lives in sessionStorage and resets each
// tab session. Signing in links this anon id to an account (lib/db/accounts.ts).
//
// This is a client-only helper — it touches window storage — so it must never be
// imported by a server component. It deliberately depends on nothing in lib/rec
// or lib/db.

const USER_ID_KEY = "trivtok-user-id";
const SESSION_ID_KEY = "trivtok-session-id";

/** The stable anonymous user id, created on first use and persisted. */
export function getAnonUserId(): string {
  let id = window.localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

// A tiny in-tab broadcast so the profile's settings sheet can tell the live feed
// that the answer-blur toggle changed, without a shared store or a page reload.
export const SETTINGS_EVENT = "trivtok-settings";
export type SettingsEventDetail = { blurAnswers: boolean };

/** The current session id, created on first use and reset each tab session. */
export function getSessionId(): string {
  let id = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}
