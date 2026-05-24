import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_PURPOSE,
} from "@/lib/auth/cookies";
import { open, seal } from "@/lib/auth/crypto";
import type { TokenSet } from "@/lib/auth/shopify-oauth";

/**
 * Server-side session lifecycle for the Shopify Customer Account
 * API OAuth flow.
 *
 * Three concentric layers, all surfaced from this one file:
 *
 *   1. `Session` / `Customer` — the canonical shape persisted in
 *      the encrypted `__Host-zepr_session` cookie. Tokens for
 *      talking to Shopify on the shopper's behalf, plus the
 *      handful of id_token claims the UI actually reads.
 *
 *   2. `getSession` / `setSession` / `clearSession` — pure cookie
 *      I/O, no Shopify calls. The callback route writes a fresh
 *      Session here; the logout route clears it. Everything else
 *      just reads.
 *
 *   3. `getAuthState` — narrow projection the rest of the
 *      codebase (header, PDP review badge, …) imports. Decouples
 *      consumer surfaces from the full token shape so refactors
 *      to the session payload don't ripple across components.
 *
 * Token refresh on near-expiry is deliberately NOT in this file.
 * It lives in Next.js middleware (step 5) so that the response
 * carrying the refreshed cookie can be returned BEFORE the page
 * renders — Server Components can't write cookies, so doing it
 * here would either silently no-op or throw mid-render.
 */

/**
 * Subset of OIDC id_token claims we persist after the callback
 * validates the token. Decoupled from `TokenSet` so a future
 * "swap to a different identity provider" refactor only touches
 * one file.
 */
export interface Customer {
  /** Shopify customer GID — `gid://shopify/Customer/{id}`. The
   *  identifier we hand to the Customer Account GraphQL API and
   *  use to attribute reviews / wishlist rows on Supabase. */
  id: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
}

/**
 * Full sealed-cookie payload. Owning both the token set AND the
 * customer claims in one blob means a single `open` call gives
 * the renderer everything it needs — no second decrypt for the
 * UI projection.
 */
export interface Session {
  tokens: TokenSet;
  customer: Customer;
}

/**
 * UI-facing projection of `Session`.
 *
 * Only the fields component code legitimately needs to render
 * (greeting name, "is this MY review?" identity check). Tokens
 * stay locked inside the session module so a leaky component
 * can't accidentally pass an access_token to the client.
 */
export interface AuthState {
  isLoggedIn: boolean;
  /** Display name for greeting / own-review attribution. */
  customerName?: string;
  /** Used as a stable key for "is this review by the current
   *  shopper?" checks without exposing the customer GID. */
  customerEmail?: string;
}

/* ---------- Cookie I/O ---------------------------------------- */

/**
 * Read + decrypt the session cookie.
 *
 * Returns `null` for any failure (missing cookie, tampered
 * payload, wrong secret, malformed JSON) — the callsite branches
 * on a single nullable result instead of three error types.
 *
 * Wrapped in React's `cache()` so multiple Server Components in
 * the same render tree (header avatar, PDP review badge, footer
 * cart pill) share one decrypt instead of repeating the AES-GCM
 * work. The cache is per-request — invalidates automatically
 * on the next navigation.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE);
  if (!cookie) return null;
  return open<Session>(cookie.value, SESSION_PURPOSE);
});

/**
 * Seal + write the session cookie. Only callable from Server
 * Actions, Route Handlers, and middleware — Server Components
 * can't write cookies. Callers (the `/account/authorize` route,
 * the refresh path in middleware) handle that constraint.
 */
export async function setSession(session: Session): Promise<void> {
  const store = await cookies();
  const sealed = seal(session, SESSION_PURPOSE);
  store.set(SESSION_COOKIE, sealed, SESSION_COOKIE_OPTIONS);
}

/**
 * Clear the session cookie. Same write-context constraint as
 * `setSession`.
 *
 * Uses `set` with `maxAge: 0` rather than `delete` so the new
 * cookie carries the same attributes (`Secure`, `Path=/`,
 * `__Host-` prefix) that the original was set with — required
 * for the browser to match-and-overwrite rather than leaving a
 * stale sibling cookie at a different scope.
 */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

/* ---------- UI projection ------------------------------------- */

/**
 * The function every UI surface calls to ask "is the shopper
 * signed in, and if so what should we greet them with?"
 *
 * Stays a thin wrapper over `getSession` so adding new UI fields
 * (avatar URL, loyalty tier, …) is a single-file change here and
 * a one-line addition wherever the field is rendered — no need
 * to expose the token set just to project one more claim.
 */
export async function getAuthState(): Promise<AuthState> {
  const session = await getSession();
  if (!session) return { isLoggedIn: false };

  const { firstName, lastName, email } = session.customer;
  const customerName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || undefined;

  return {
    isLoggedIn: true,
    customerName,
    customerEmail: email,
  };
}
