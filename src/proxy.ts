import { type NextRequest, NextResponse } from "next/server";

import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_COOKIE_OPTIONS,
} from "@/lib/attribution/cookie";
import { parseAttributionFromUrl } from "@/lib/attribution/format";
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
 * Edge-of-origin proxy. Two responsibilities, one pass:
 *
 *   1. **Session refresh** — silently keeps the Customer Account
 *      API access token fresh when it crosses the near-expiry
 *      window. The session module (Server Components) can only
 *      READ the session cookie; Next.js forbids cookie writes
 *      during render, so this proxy is the only place a
 *      `Set-Cookie` can attach to the response BEFORE the page
 *      renders.
 *   2. **UTM attribution capture** — when the incoming URL
 *      carries `utm_source`, parse the campaign payload and
 *      drop a 30-day `__Host-zepr_attribution` cookie. Server
 *      reads (cart action stamps) pick it up via `cookies()`;
 *      client reads (Buy Now permalink) via the SSR-rendered
 *      `<AttributionHydrator>`. Last-touch wins by design —
 *      a fresh ad click overwrites whatever was there.
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
 * Attribution capture is a single URL-search-params read for
 * the 99% of navigation that has no UTMs — cheap. The matcher
 * already excludes static assets, so we never run it for
 * images / fonts / JS chunks.
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
  /* Resolve the price A/B bucket first — a sticky cookie read that,
   * only for the one product under test, decides which handle to
   * render. Its rewrite target threads into the session pass so the
   * page renders in place (no redirect hop) and any session /
   * attribution cookies still land on the same response. */
  const ab = resolvePricingTest(req);

  const response = await handleSession(req, ab.rewriteUrl);
  if (ab.bucket) {
    response.cookies.set(
      PRICING_TEST_COOKIE,
      ab.bucket,
      PRICING_TEST_COOKIE_OPTIONS,
    );
  }
  return stampAttributionIfPresent(req, response);
}

/** Existing session-refresh logic, refactored to return a
 *  `NextResponse` so the attribution-capture step (below) can
 *  layer onto every exit path uniformly. `rewriteUrl`, when set by
 *  the price test, makes every exit a same-URL rewrite to the
 *  bucketed handle instead of a plain pass-through — cookie writes
 *  still attach to it. */
async function handleSession(
  req: NextRequest,
  rewriteUrl?: URL,
): Promise<NextResponse> {
  const base = () =>
    rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();

  /* Clear the session cookie and pass through. Shared by the
   * "tampered cookie" and "refresh token revoked" exit paths. */
  const clearAndContinue = () => {
    const response = base();
    response.cookies.set(SESSION_COOKIE, "", {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  };

  const cookie = req.cookies.get(SESSION_COOKIE);
  if (!cookie) return base();

  const session = open<Session>(cookie.value, SESSION_PURPOSE);
  if (!session) {
    /* Decrypt failure means the cookie was tampered, or sealed
     * with an old SESSION_SECRET after a key rotation. Either
     * way the value is useless — clear it so the next request
     * starts from a clean state instead of repeating the failure. */
    return clearAndContinue();
  }

  if (Date.now() < session.tokens.expiresAt - REFRESH_SKEW_MS) {
    return base();
  }

  try {
    const refreshed = await refreshAccessToken({
      refreshToken: session.tokens.refreshToken,
    });
    /* Shopify rotates the refresh_token on every successful
     * refresh — the new value MUST replace the old one in the
     * cookie or the next refresh attempt will get invalid_grant. */
    const next: Session = { ...session, tokens: refreshed };
    const response = base();
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
    return base();
  }
}

/** If the incoming URL has UTMs, stamp the attribution cookie
 *  on whatever response the session path produced. No-op on
 *  every navigation that isn't an ad / campaign landing, so
 *  internal navigation pays nothing here. */
function stampAttributionIfPresent(
  req: NextRequest,
  response: NextResponse,
): NextResponse {
  const attribution = parseAttributionFromUrl(req.nextUrl);
  if (!attribution) return response;
  response.cookies.set(
    ATTRIBUTION_COOKIE,
    JSON.stringify(attribution),
    ATTRIBUTION_COOKIE_OPTIONS,
  );
  return response;
}

/* ─── Temporary pricing A/B test ───────────────────────────────────
 *
 * One product sold at two price points, each a separate Shopify
 * product. A visitor landing on the canonical handle is bucketed once
 * — a 50/50 split — and that choice is pinned in a cookie, so the same
 * person always sees the same price. The winning handle is rendered
 * *in place* via a rewrite: the URL stays `/products/mosquito-trap-lamp`
 * for everyone, there's no redirect round-trip (so it adds no
 * meaningful latency), and add-to-cart / checkout naturally use the
 * bucketed product's variant + price.
 *
 * Self-contained on purpose: to end the test, delete this block and
 * the `resolvePricingTest(req)` call in `proxy()`. (To make the URL
 * actually change instead of rewriting in place, swap the
 * `NextResponse.rewrite` thread for a `NextResponse.redirect`.)
 */
const PRICING_TEST = {
  /** Canonical handle visitors land on; also the control bucket. */
  base: "mosquito-trap-lamp",
  /** Equal-weighted buckets. Index 0 is the control (renders as-is);
   *  the rest are the alternate-price products, rendered via rewrite. */
  buckets: [
    "mosquito-trap-lamp",
    "mosquito-trap-lamp-2",
  ] as readonly string[],
} as const;

const PRICING_TEST_COOKIE = "ab_mtl";
const PRICING_TEST_COOKIE_OPTIONS = {
  /* Server-only: only this proxy ever reads the bucket. */
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  /* 90 days — comfortably outlasts the test so a visitor keeps their
   * price across the whole run. */
  maxAge: 60 * 60 * 24 * 90,
} as const;

/** Decide (or recall) the price bucket for a request. A single
 *  pathname compare for the 99.99% of traffic that isn't the product
 *  under test, so it costs effectively nothing globally. Returns the
 *  rewrite target (absent for the control / non-test paths) and the
 *  bucket to persist (absent when the existing cookie is already
 *  correct, so we don't re-set it on every navigation). */
function resolvePricingTest(req: NextRequest): {
  rewriteUrl?: URL;
  bucket?: string;
} {
  if (req.nextUrl.pathname !== `/products/${PRICING_TEST.base}`) {
    return {};
  }

  const existing = req.cookies.get(PRICING_TEST_COOKIE)?.value;
  const bucket =
    existing && PRICING_TEST.buckets.includes(existing)
      ? existing
      : PRICING_TEST.buckets[
          Math.floor(Math.random() * PRICING_TEST.buckets.length)
        ];

  /* Control renders the matched page untouched; alternates rewrite to
   * their own handle while the browser URL stays put. */
  let rewriteUrl: URL | undefined;
  if (bucket !== PRICING_TEST.base) {
    rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = `/products/${bucket}`;
  }

  /* Persist only when missing or stale (first visit, or a tampered /
   * retired bucket value), so a steady visitor pays no Set-Cookie. */
  return { rewriteUrl, bucket: existing === bucket ? undefined : bucket };
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
