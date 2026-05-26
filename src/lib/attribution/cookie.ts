import "server-only";

import { cookies } from "next/headers";

import type { Attribution } from "@/types/attribution";

/**
 * `__Host-zepr_attribution` — last-touch UTM attribution
 * captured from an ad / campaign landing URL.
 *
 * Read from every server action that wants to stamp the cart
 * (`addToCartAction`, `mergeGuestCartAction`); also surfaced to
 * the client via `<AttributionHydrator>` so Buy Now permalinks
 * built in the browser carry the same `attributes[_utm_*]`
 * params.
 *
 * Lifecycle:
 *
 *   - **Write**: middleware (`src/middleware.ts`) intercepts
 *     incoming requests that carry `utm_source` in the query
 *     string and writes this cookie. Last-touch wins — a fresh
 *     campaign click overwrites whatever was there.
 *   - **Read**: server reads via `getAttribution()` here;
 *     client reads via `<AttributionHydrator>` → `useAttribution()`.
 *   - **Expiry**: 30-day rolling cookie. Honest middle ground
 *     between "long enough for considered-purchase categories
 *     (furniture, electronics)" and "short enough that a stale
 *     attribution from months ago doesn't get re-credited on a
 *     fresh organic visit".
 *
 * `__Host-` prefix locks the cookie to its issuing origin with
 * `Secure` + `Path=/` + no `Domain`, so browsers reject any
 * mis-scoped sibling. Not HTTP-only — the client store needs to
 * read the same payload to keep Buy Now permalinks accurate
 * without a redundant in-memory copy on hydration. UTMs are
 * already URL-public, so JS readability is the right
 * trade-off here.
 *
 * Payload is compact JSON (~200 bytes). Storing it as JSON
 * rather than seven sub-cookies keeps the read site-down (one
 * `cookies().get()` instead of seven) and means a partial
 * write (one slot fails to set) can't happen.
 */

export const ATTRIBUTION_COOKIE = "__Host-zepr_attribution";

/**
 * 30 days. Matches the typical attribution window the rest of
 * the industry uses for paid-social funnels. Renewed every
 * fresh capture (last-touch overwrites with a new `captured_at`
 * timestamp + reset TTL).
 */
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const ATTRIBUTION_COOKIE_OPTIONS = {
  /* Readable from JS so the client store can pick up the same
   * payload without us having to ship the attribution twice
   * (once in a SSR'd prop, once in this cookie). UTMs are URL-
   * public values — exposing them to JS doesn't widen the
   * attack surface meaningfully. */
  httpOnly: false,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
} as const;

export async function getAttribution(): Promise<Attribution | null> {
  const store = await cookies();
  const raw = store.get(ATTRIBUTION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isAttribution(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function isAttribution(v: unknown): v is Attribution {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.utm_source === "string" &&
    typeof a.landing_url === "string" &&
    typeof a.captured_at === "string"
  );
}
