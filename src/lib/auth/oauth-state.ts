import "server-only";

import { cookies } from "next/headers";

import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_OPTIONS,
  OAUTH_STATE_PURPOSE,
} from "@/lib/auth/cookies";
import { open, seal } from "@/lib/auth/crypto";

/**
 * Encrypted envelope carried in the `__Host-zepr_oauth_state`
 * cookie across the `/account/login` → Shopify login UI →
 * `/account/authorize` round-trip.
 *
 * Every field is set ONCE at the start of the flow and read
 * ONCE at the callback — the cookie is one-shot and cleared
 * after consumption (success or failure), so a replayed login
 * link can never reuse a stale challenge.
 *
 * Why these four:
 *
 *   - `state`         CSRF token. The callback verifies Shopify
 *                     echoed the exact same value; mismatch ⇒
 *                     reject the request.
 *   - `nonce`         OIDC replay guard. Embedded in the
 *                     `id_token` Shopify returns; the callback
 *                     checks the claim matches this value.
 *   - `codeVerifier`  PKCE secret. The callback proves possession
 *                     by sending it to the token endpoint, so an
 *                     attacker who intercepted the auth code
 *                     can't redeem it.
 *   - `returnTo`      Same-origin path the shopper should land
 *                     on after a successful login. Sanitised by
 *                     the login route so a malicious link can't
 *                     redirect off-platform.
 */
export interface OAuthState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export async function setOAuthState(state: OAuthState): Promise<void> {
  const store = await cookies();
  const sealed = seal(state, OAUTH_STATE_PURPOSE);
  store.set(OAUTH_STATE_COOKIE, sealed, OAUTH_STATE_COOKIE_OPTIONS);
}

export async function getOAuthState(): Promise<OAuthState | null> {
  const store = await cookies();
  const cookie = store.get(OAUTH_STATE_COOKIE);
  if (!cookie) return null;
  return open<OAuthState>(cookie.value, OAUTH_STATE_PURPOSE);
}

/**
 * Clear the oauth-state cookie. Called from the callback on
 * EVERY exit path — success, error, CSRF rejection — so a
 * partial flow can never leak state into the next attempt.
 *
 * Uses `set` with `maxAge: 0` and the original options so the
 * browser overwrites in place rather than leaving a stray
 * `__Host-` cookie at a mismatched scope.
 */
export async function clearOAuthState(): Promise<void> {
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, "", {
    ...OAUTH_STATE_COOKIE_OPTIONS,
    maxAge: 0,
  });
}
