/**
 * Cookie-consent choice — the persisted record of what the shopper
 * picked in the cookie banner.
 *
 * Pure module (no `server-only`, no `next/headers`) so both the
 * server (reads it during layout render to decide whether to show
 * the banner) and the client banner (writes it on the shopper's
 * choice) can share the cookie name + parsing without a boundary
 * violation.
 *
 * Deliberately NOT HTTP-only: the client banner writes it via
 * `document.cookie` the instant the shopper chooses, so the choice
 * sticks without a server round-trip. It carries no sensitive data
 * — just `granted` / `denied` — which is the standard shape for a
 * consent flag.
 */

export type ConsentChoice = "granted" | "denied";

/** Cookie that records the shopper's banner choice. Read server-side
 *  in the layout, written client-side by `<CookieConsent>`. */
export const CONSENT_COOKIE = "zepr_cookie_consent";

/** One year — the conventional consent-record lifetime. After it
 *  lapses the banner re-asks (required regions) so consent never
 *  goes stale indefinitely. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Narrow a raw cookie value to a known choice, or `null` when the
 *  cookie is absent / malformed (→ "no decision yet"). */
export function parseConsentChoice(
  value: string | undefined | null,
): ConsentChoice | null {
  return value === "granted" || value === "denied" ? value : null;
}
