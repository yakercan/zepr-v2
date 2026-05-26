/**
 * Attribution payload — last-touch UTM bundle captured from the
 * landing URL when a shopper arrives from an ad / social / email
 * campaign, persisted for the duration of the attribution window
 * so it survives navigation, redirects, and re-visits within the
 * same browser.
 *
 * Stamped onto every Shopify cart attribute set we own (via
 * `cart.updateAttributes` on logged-in carts, via
 * `attributes[_utm_*]` query params on guest / Buy Now permalinks)
 * so the resulting order's `note_attributes` carry the same UTMs
 * — that's what makes the order traceable back to the campaign
 * in the merchant admin without any third-party analytics
 * tooling.
 *
 * `landing_url` is the path + search the shopper actually landed
 * on (not the post-redirect destination), so a short-link click
 * like `/101?utm_source=ig` records the short-link itself rather
 * than the product page Shopify-side. Useful for funnel
 * debugging: "which short link did this order come through?".
 *
 * `captured_at` is ISO so analytics can derive lag-to-conversion
 * without us having to remember to set a custom format.
 *
 * Empty UTM slots (e.g. a campaign that only set `utm_source` +
 * `utm_campaign`) carry `null` rather than being omitted, so the
 * shape stays stable across every captured event.
 */
export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_url: string;
  captured_at: string;
}

/** The five canonical UTM keys. Single source of truth shared
 *  between capture (URL parse), persistence (cookie payload),
 *  and rendering (cart attribute generation). */
export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
