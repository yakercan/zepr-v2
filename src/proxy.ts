import { type NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_PURPOSE,
} from "@/lib/auth/cookies";
import { open, seal } from "@/lib/auth/crypto";
import type { Session } from "@/lib/auth/session";
import {
  ShopifyOAuthError,
  refreshAccessToken,
} from "@/lib/auth/shopify-oauth";

/**
 * Edge-of-origin proxy — silently keeps the Customer Account API
 * access token fresh.
 *
 * The session module (Server Components) can only READ the
 * session cookie; Next.js forbids cookie writes during render.
 * This proxy is the one place a `Set-Cookie` can attach to the
 * response BEFORE the page renders, so it's where the
 * "is the access_token near expiry? refresh it" decision lives.
 *
 * Fast paths first — most requests do near-zero work:
 *
 *   - No session cookie:      one cookie lookup, pass through.
 *   - Cookie failed decrypt:  clear + pass through (a tampered
 *                             or stale-secret cookie shouldn't
 *                             keep failing on every navigation).
 *   - Token not near expiry:  decrypt + compare + pass through.
 *
 * Only when the token is inside the refresh-skew window do we
 * call Shopify. On success, the response carries the rotated
 * cookie. On `invalid_grant` (token revoked elsewhere), the
 * cookie is cleared so the next render sees a clean logged-out
 * state. On any other error (5xx, network) we keep the stale
 * cookie — the access token is still valid for the remaining
 * skew window, so the next request can retry.
 *
 * Known race: two concurrent requests both crossing the
 * near-expiry threshold will both refresh; Shopify rotates the
 * refresh_token, so the loser sees `invalid_grant` and gets
 * logged out. Mitigations (distributed lock, retry-on-fresh-
 * cookie) are over-engineering for our traffic — if it surfaces
 * in production we add Redis-backed dedup here. Until then the
 * 60-second skew window makes this rare enough to ignore.
 *
 * Runs on the Node.js runtime by default — Next.js 16 mandates
 * Node for `proxy.ts` and forbids the `runtime` config option.
 */

/** How early to refresh before the token actually expires.
 *  Wide enough that no in-flight request will race the boundary
 *  with a freshly-expired token; narrow enough that we don't
 *  burn refreshes when there's still plenty of life left. */
const REFRESH_SKEW_MS = 60_000;

export async function proxy(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE);
  if (!cookie) return NextResponse.next();

  const session = open<Session>(cookie.value, SESSION_PURPOSE);
  if (!session) {
    /* Decrypt failure means the cookie was tampered, or sealed
     * with an old SESSION_SECRET after a key rotation. Either
     * way the value is useless — clear it so the next request
     * starts from a clean state instead of repeating the failure. */
    return clearAndContinue();
  }

  if (Date.now() < session.tokens.expiresAt - REFRESH_SKEW_MS) {
    return NextResponse.next();
  }

  try {
    const refreshed = await refreshAccessToken({
      refreshToken: session.tokens.refreshToken,
    });
    /* Shopify rotates the refresh_token on every successful
     * refresh — the new value MUST replace the old one in the
     * cookie or the next refresh attempt will get invalid_grant. */
    const next: Session = { ...session, tokens: refreshed };
    const response = NextResponse.next();
    response.cookies.set(
      SESSION_COOKIE,
      seal(next, SESSION_PURPOSE),
      SESSION_COOKIE_OPTIONS,
    );
    return response;
  } catch (err) {
    if (err instanceof ShopifyOAuthError && err.code === "invalid_grant") {
      /* Refresh token is truly dead — revoked by Shopify (logout
       * from another device, password reset, app uninstall, …).
       * Clear our side so the UI immediately reflects logged-out
       * state instead of pretending the session is still valid. */
      return clearAndContinue();
    }
    /* Anything else (network blip, Shopify 5xx) is transient.
     * Keep the existing cookie — the access_token is still valid
     * for the remaining skew window, the next request retries. */
    console.error("[auth] proxy refresh failed:", err);
    return NextResponse.next();
  }
}

/** Clear the session cookie and pass the request through. Used
 *  by both the "tampered cookie" and "refresh token revoked"
 *  exit paths; same shape, same options, one place to maintain. */
function clearAndContinue(): NextResponse {
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

export const config = {
  /* Skip the obviously-static surface. Auth routes
   * (`/account/login` etc.) are intentionally INCLUDED so a
   * shopper arriving with a near-expired session at any path
   * gets refreshed transparently — the routes themselves don't
   * mind a proxy pass-through because their own logic writes
   * cookies last, which wins over anything the proxy set.
   *
   * The trailing `.*\\.[a-zA-Z0-9]+$` segment excludes any path
   * ending in a file extension (images, fonts, JS chunks served
   * from non-standard locations) — broader than just `_next/*`
   * and cheaper than enumerating every static prefix. */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
