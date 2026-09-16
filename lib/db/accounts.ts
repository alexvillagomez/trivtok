import { newAbility } from "../rec/difficulty";
import { sql } from "./client";

// Anonymous-first account linking. The app's canonical, stable user id is
// public.users.id. Anonymous users get a client-generated id; when they sign
// in we attach the Supabase Auth account to their data so the same id — and
// their whole interaction history — follows them across sessions and devices.
//
// The function returns the CANONICAL user id the client should use from now on.

/**
 * Link an anonymous id to a Supabase Auth account and return the canonical id.
 *
 * - First sign-in for this account: stamp auth_id/email onto the anonymous row,
 *   so that row *becomes* the account (nothing is lost).
 * - Account already exists (e.g. signing in on a second device): keep the
 *   account's durable profile, but re-point the anonymous device's raw logs
 *   (impressions + interactions) onto the account so no training data is
 *   orphaned, then drop the throwaway anonymous row.
 */
export async function linkAnonymousToAccount(
  anonId: string,
  authId: string,
  email: string | null,
): Promise<string> {
  return sql.begin(async (tx) => {
    const existing = await tx<{ id: string }[]>`
      select id from users where auth_id = ${authId}
    `;

    if (existing.length > 0) {
      const accountId = existing[0].id;
      if (accountId !== anonId) {
        // Preserve training-data continuity: move the anon device's raw event
        // logs to the account. The account's ability/interests (its durable
        // learned profile) win, so the anon profile rows are discarded.
        await tx`update impressions  set user_id = ${accountId} where user_id = ${anonId}`;
        await tx`update interactions set user_id = ${accountId} where user_id = ${anonId}`;
        await tx`delete from user_interests where user_id = ${anonId}`;
        await tx`delete from users where id = ${anonId}`;
      }
      await tx`update users set email = ${email}, last_seen_at = now() where id = ${accountId}`;
      return accountId;
    }

    // First sign-in: make sure the anon row exists, then claim it for the account.
    const initial = newAbility();
    await tx`
      insert into users (id, ability_mean, ability_variance)
      values (
        ${anonId},
        ${JSON.stringify(initial.mean)}::vector,
        ${JSON.stringify(initial.variance)}::vector
      )
      on conflict (id) do nothing
    `;
    await tx`
      update users
      set auth_id = ${authId}, email = ${email}, last_seen_at = now()
      where id = ${anonId}
    `;
    return anonId;
  });
}
