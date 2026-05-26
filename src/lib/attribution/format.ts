import {
  UTM_KEYS,
  type Attribution,
  type UtmKey,
} from "@/types/attribution";

/**
 * Pure attribution formatters — usable from both client and
 * server code (no `"server-only"` / `"use client"` markers, no
 * cookie or DOM access). The mechanics of *where* attribution
 * lives are owned by `./cookie.ts` (server) and `./store.ts`
 * (client); this file just transforms it between the shapes the
 * other layers want.
 *
 * Three transforms here:
 *
 *   - `parseAttributionFromUrl(url)` — pull UTMs off an
 *     incoming request URL into an `Attribution` object. Used
 *     by the middleware that writes the cookie. Returns `null`
 *     when there's no `utm_source` (treat that as "not an ad
 *     landing", don't disturb prior attribution).
 *   - `attributionToCartAttributes(a)` — `_utm_*` cart-attribute
 *     pairs for Shopify's `cartAttributesUpdate` mutation. The
 *     `_` prefix marks them as merchant-only (shows in admin /
 *     order notes, hidden from customer-facing emails / receipts
 *     — same convention old zepr used so admin reports stay
 *     consistent across the migration).
 *   - `attributionToCheckoutParams(a)` — `URLSearchParams` ready
 *     to splice into a Shopify cart-permalink URL
 *     (`attributes[_utm_source]=…`). Same data as the cart-
 *     attribute path; just the URL-shaped variant for guest /
 *     Buy Now flows that don't go through the Cart API.
 */

export function parseAttributionFromUrl(url: URL): Attribution | null {
  const utmSource = url.searchParams.get("utm_source");
  /* No `utm_source` = "not an ad-landing nav, leave previous
   * attribution alone". Capture only fires on real campaign
   * arrivals, so internal navigation between pages can't
   * accidentally wipe a real attribution by visiting a page that
   * happens to have an unrelated query param. */
  if (!utmSource) return null;

  return {
    utm_source: utmSource,
    utm_medium: url.searchParams.get("utm_medium"),
    utm_campaign: url.searchParams.get("utm_campaign"),
    utm_content: url.searchParams.get("utm_content"),
    utm_term: url.searchParams.get("utm_term"),
    landing_url: url.pathname + url.search,
    captured_at: new Date().toISOString(),
  };
}

export interface AttributeKV {
  key: string;
  value: string;
}

export function attributionToCartAttributes(
  attribution: Attribution | null | undefined,
): AttributeKV[] {
  if (!attribution) return [];
  const out: AttributeKV[] = [];
  for (const k of UTM_KEYS) {
    const v = attribution[k as UtmKey];
    if (v) out.push({ key: `_${k}`, value: v });
  }
  if (attribution.landing_url) {
    out.push({ key: "_landing_url", value: attribution.landing_url });
  }
  if (attribution.captured_at) {
    out.push({
      key: "_attribution_captured_at",
      value: attribution.captured_at,
    });
  }
  return out;
}

/**
 * Turn attribution into the URL params Shopify's hosted-checkout
 * permalink reads — `?attributes[_utm_source]=instagram&…`.
 * Optionally accepts additional `extras` so a Buy Now caller
 * can attach campaign-specific breadcrumbs (offer-tier hints,
 * etc.) without minting a synthetic Attribution object.
 *
 * Returns an empty `URLSearchParams` instance when there's
 * nothing to encode — caller can `.toString()` it safely and
 * append regardless.
 */
export function attributionToCheckoutParams(
  attribution: Attribution | null | undefined,
  extras: ReadonlyArray<AttributeKV> = [],
): URLSearchParams {
  const params = new URLSearchParams();
  const attrs = [...attributionToCartAttributes(attribution), ...extras];
  for (const { key, value } of attrs) {
    params.append(`attributes[${key}]`, value);
  }
  return params;
}
