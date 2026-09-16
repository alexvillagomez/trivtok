import postgres from "postgres";

// One shared Postgres connection (server-side only — never imported by client
// components). Uses the DATABASE_URL from the environment.

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Add your Supabase connection string to .env.local",
  );
}

export const sql = postgres(url, {
  // Supabase's transaction pooler (port 6543) doesn't support prepared
  // statements; disabling them keeps this safe on both pooled and direct URLs.
  prepare: false,
  ssl: url.includes("localhost") ? false : "require",
});
