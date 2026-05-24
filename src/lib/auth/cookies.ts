import "server-only";

/**
 * Canonical cookie names, encryption purposes, and option presets
 * for the auth flow.
 *
 * Centralising them here means every `set` / `delete` call across
 * the codebase (login route, callback route, logout route, the
 * refresh-on-read path in `getSession`) uses identical attributes
 * — set / clear can never disagree, and the encryption purpose
 * passed to `crypto.seal` / `crypto.open` is co-located with the
 * cookie name it protects so a typo can't silently break decrypt.
 *
 * Naming uses the `__Host-` prefix, which the browser enforces:
 *
 *   - cookie MUST set `Secure`
 *   - cookie MUST NOT set `Domain` (host-only — no subdomain leak)
 *   - cookie MUST set `Path=/`
 *
 * A `__Host-` cookie that violates any of those is rejected at
 * the browser, so a production misconfiguration can't silently
 * weaken the surface. Requires HTTPS at the edge — already a
 * given because Shopify mandates HTTPS callbacks.
 */

/** Long-lived encrypted session cookie. Carries the OAuth token
 *  set (access_token + refresh_token + id_token + expires_at)
 *  sealed via `seal(payload, SESSION_PURPOSE)`. */
export const SESSION_COOKIE = "__Host-zepr_session";
export const SESSION_PURPOSE = "session";

/** Short-lived encrypted oauth-state cookie. Carries
 *  `{ code_verifier, state, nonce, return_to }` across the
 *  `/account/login` → Shopify → `/account/authorize` round-trip.
 *  Sealed via `seal(payload, OAUTH_STATE_PURPOSE)`. */
export const OAUTH_STATE_COOKIE = "__Host-zepr_oauth_state";
export const OAUTH_STATE_PURPOSE = "oauth-state";

/* ----- Per-cookie option presets ------------------------------ */

/**
 * Long-lived session cookie. 30-day rolling — `getSession`
 * re-issues the cookie on each successful read so an active
 * shopper sees a moving expiry and never hits a login screen
 * mid-session. Inactive shoppers expire naturally after 30
 * days of silence.
 *
 * `sameSite: "lax"` is required: the post-Shopify callback is a
 * top-level GET back to our domain, which `lax` allows but
 * `strict` would block. `lax` still defends every CSRF surface
 * that matters here (no third-party form POST can carry the
 * session cookie).
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
} as const;

/**
 * OAuth-state cookie. Lives only across the ~5-second login
 * round-trip. A 10-minute cap is generous enough for a shopper
 * to log in / sign up / reset password and still come back, and
 * tight enough that abandoned attempts evaporate quickly rather
 * than piling up in the browser jar.
 */
export const OAUTH_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 10, // 10 minutes
} as const;

/* ----- Clear-cookie option presets ---------------------------- */

/* `cookies().delete(name, options)` needs the same path/secure
 * flags the cookie was set with — otherwise the browser keeps a
 * stray copy at a different path. Reusing one shape across both
 * cookies because both are pinned to `path: "/"` + `Secure`. */
export const CLEAR_COOKIE_OPTIONS = {
  path: "/",
  secure: true,
} as const;
