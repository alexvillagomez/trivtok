"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-side Supabase client, used ONLY for auth (sign up / in / out and
// reading the current session). All app data still flows through the server
// actions + postgres.js — supabase-js never touches the question bank.
//
// Returns null when the public env vars aren't set, so the app degrades to
// anonymous-only instead of crashing.

let cached: SupabaseClient | null | undefined;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cached = url && anon ? createClient(url, anon) : null;
  return cached;
}
