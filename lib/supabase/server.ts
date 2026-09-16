import "server-only";

import { createClient } from "@supabase/supabase-js";

// Server-side verification of a Supabase access token. We don't keep a session
// here — we just validate the JWT the browser presents at link time and read
// the authenticated user's id + email from it.

export type AuthedUser = { id: string; email: string | null };

export async function verifyAccessToken(token: string): Promise<AuthedUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase auth is not configured (NEXT_PUBLIC_SUPABASE_* missing)");
  }
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
