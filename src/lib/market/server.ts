import "server-only";

import { cookies, headers } from "next/headers";

import {
  DEFAULT_MARKET,
  resolveMarket,
  type Market,
  type MarketCountry,
} from "@/config/markets";

/**
 * Server-side market resolution — the one place the storefront
 * decides "which country is this request for?".
 *
 * Resolution precedence (highest first):
 *
 *   1. `zepr_country` cookie — an explicit override. There's no
 *      country switcher in the UI today, so this exists purely as
 *      the testing lever: set the cookie (e.g. in devtools) to
 *      `GB` / `AU` / … to preview any market on a single machine
 *      without a VPN. It's also the forward hook a future switcher
 *      would write to — wiring the precedence now means the switcher
 *      becomes a cookie write with zero data-layer changes.
 *   2. `x-vercel-ip-country` — Vercel's edge geo header, present on
 *      every production / preview request. This is the real signal
 *      for live visitors.
 *   3. USA default — local dev (no geo header), bots, and any
 *      country outside the six live markets.
 *
 * Defensive by design: `headers()` / `cookies()` throw outside a
 * request scope (e.g. when `sitemap.ts` calls the Salespace client
 * at build / revalidate time). We swallow that and fall back to the
 * USA baseline so price-agnostic callers never crash on geo lookup.
 *
 * Reading `headers()` / `cookies()` opts the calling route into
 * dynamic rendering — which is already the case for every
 * price-bearing surface (they render dynamically so Suspense
 * streams), so this adds no new constraint.
 */

const COUNTRY_COOKIE = "zepr_country";
const VERCEL_COUNTRY_HEADER = "x-vercel-ip-country";

export async function getServerMarket(): Promise<Market> {
  try {
    const [cookieStore, headerStore] = await Promise.all([
      cookies(),
      headers(),
    ]);
    const override = cookieStore.get(COUNTRY_COOKIE)?.value;
    const geo = headerStore.get(VERCEL_COUNTRY_HEADER);
    return resolveMarket(override ?? geo);
  } catch {
    return DEFAULT_MARKET;
  }
}

/** Convenience wrapper for callers that only need the Shopify /
 *  Salespace country code (e.g. `@inContext(country:)`). */
export async function getServerCountry(): Promise<MarketCountry> {
  return (await getServerMarket()).country;
}
