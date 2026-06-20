/**
 * Product badges — small text-only outlined pills displayed above
 * the product title.
 *
 * Two kinds:
 *
 *   1. **Product badges** (`ProductBadgeType`) come from the
 *      Salespace API's `badges` array. At most ONE renders per card,
 *      picked by `PRODUCT_BADGE_PRIORITY`.
 *
 *   2. **Free shipping** is computed from price ≥ the market's
 *      `freeShippingThresholdCents(currency)`. It's allowed to render
 *      alongside the product badge — they answer different
 *      questions ("what's special?" vs "will it ship free?").
 *
 * Each theme is a single accent colour. The badge pill borrows it
 * for its border + text, and the card's current-price `<span>`
 * borrows it from the *product* badge specifically so the price
 * visually tracks the headline tag.
 *
 * Why one accent value instead of bg/text class pairs:
 *
 *   • The same colour drives three places (border, text, price),
 *     so one variable is the natural shape.
 *   • Applied inline via `style` → no Tailwind JIT class-explosion
 *     when we add new badge types, no purge surprises.
 *   • Trivial to map to a CSS custom property later if we want to
 *     drive the whole card off it.
 */

/* ------------------------------------------------------------------ */
/* Shared shape                                                        */
/* ------------------------------------------------------------------ */
export interface BadgeTheme {
  /** Hex value, `var(...)`, or any CSS color. Used inline for the
   *  pill border + text, and (for product badges only) the current
   *  price tint on the card. */
  accent: string;
}

export interface BadgeView {
  label: string;
  theme: BadgeTheme;
}

/* ------------------------------------------------------------------ */
/* Product badges (API-driven)                                         */
/* ------------------------------------------------------------------ */
export type ProductBadgeType =
  | "BEST_SELLER"
  | "TOP_RATED"
  | "MOST_LIKED"
  | "TRENDING_NOW"
  | "LIMITED_TIME_DEAL"
  | "BUNDLE_AND_SAVE";

/**
 * Two accents only:
 *
 *   • `--color-secondary` (hot-pink)   → reserved for `Hot Deal`.
 *     It's the loudest, time-pressure tag, so it gets its own
 *     accent and the card's price flips pink to match.
 *
 *   • `--color-brand`     (orange)     → every other product badge.
 *     Best Seller / Top Rated / etc. all share the brand accent so
 *     the storefront speaks one promo voice and the card's price
 *     turns brand-orange whenever a non-Hot-Deal badge headlines.
 *
 * (Free Shipping is intentionally the calm ink colour — see
 * `FREE_SHIPPING_BADGE` below — because it's a delivery promise,
 * not a product promo, and doesn't drive the price tint.)
 */
const PRODUCT_BADGE_DEFS: Record<ProductBadgeType, BadgeView> = {
  BEST_SELLER:       { label: "Best Seller",   theme: { accent: "var(--color-brand)" } },
  TOP_RATED:         { label: "Top Rated",     theme: { accent: "var(--color-brand)" } },
  MOST_LIKED:        { label: "Most Liked",    theme: { accent: "var(--color-brand)" } },
  TRENDING_NOW:      { label: "Trending",      theme: { accent: "var(--color-brand)" } },
  LIMITED_TIME_DEAL: { label: "Hot Deal",      theme: { accent: "var(--color-secondary)" } },
  BUNDLE_AND_SAVE:   { label: "Bundle & Save", theme: { accent: "var(--color-brand)" } },
};

/**
 * Priority order — first match wins. Mirrors zepr's storefront so
 * the same product surfaces the same headline tag across both
 * sites. The order encodes a deliberate hierarchy:
 *
 *   1. **Structural offers** (`BUNDLE_AND_SAVE`) — a permanent
 *      multi-buy deal is a meaningful differentiator and trumps
 *      everything else.
 *   2. **Achievements** (`BEST_SELLER` → `TOP_RATED` → `MOST_LIKED`
 *      → `TRENDING_NOW`) — durable signals about the product
 *      itself. Best Seller leads because sales volume is the
 *      strongest social proof; the rest follow rough decreasing
 *      strength of that signal.
 *   3. **Time-bound promo** (`LIMITED_TIME_DEAL`) — a Hot Deal is
 *      the weakest differentiator: it says "this is on sale right
 *      now" but tells you nothing about whether the product is
 *      good or beloved. Surfaced only when no achievement applies.
 *
 * Side effect to remember: this same order drives the card's
 * current-price tint (via `productBadge.theme.accent`). A product
 * tagged with both `BEST_SELLER` and `LIMITED_TIME_DEAL` shows the
 * Best Seller pill *and* the brand-orange price, never the Hot
 * Deal pink — which matches zepr exactly.
 */
const PRODUCT_BADGE_PRIORITY: ProductBadgeType[] = [
  "BUNDLE_AND_SAVE",
  "BEST_SELLER",
  "TOP_RATED",
  "MOST_LIKED",
  "TRENDING_NOW",
  "LIMITED_TIME_DEAL",
];

/**
 * Pick at most one badge to render from the raw API array. Unknown
 * strings are ignored; missing / empty arrays return `null` so the
 * card knows to skip rendering entirely instead of showing a
 * placeholder.
 */
export function pickProductBadge(
  badges: string[] | undefined | null,
): BadgeView | null {
  if (!badges?.length) return null;
  const set = new Set(badges);
  for (const type of PRODUCT_BADGE_PRIORITY) {
    if (set.has(type)) return PRODUCT_BADGE_DEFS[type];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Free shipping (computed, additive)                                  */
/* ------------------------------------------------------------------ */
/**
 * Free-shipping thresholds, in minor units, keyed by presentment
 * currency. The single source of truth for the card badge, the PDP
 * delivery badge, the cart-progress bar, and the FAQ copy.
 *
 * Per-market rule (mirrors the Shopify shipping config): US and UK sit
 * at 35; Singapore, Canada, Australia, and New Zealand at 50.
 *
 * Currency model: each value is a flat amount in **the visitor's
 * market currency**, NOT a USD amount converted per market. It works
 * because every price compared against it is already the market's
 * presentment price in minor units (Salespace per-market columns /
 * Shopify `@inContext`), and all supported markets are 2-decimal — so
 * `3500` reads as $35 / £35 and `5000` as S$50 / CA$50 / A$50 / NZ$50
 * for the matching visitor, with no conversion step.
 */
const FREE_SHIPPING_THRESHOLD_BY_CURRENCY: Readonly<Record<string, number>> = {
  USD: 3500,
  GBP: 3500,
  SGD: 5000,
  CAD: 5000,
  AUD: 5000,
  NZD: 5000,
};

/** Fallback for an unknown currency — the 50 baseline. */
const DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS = 5000;

/** Free-shipping threshold (minor units) for a presentment currency.
 *  US/UK → 3500, SG/CA/AU/NZ → 5000. */
export function freeShippingThresholdCents(currency: string): number {
  return (
    FREE_SHIPPING_THRESHOLD_BY_CURRENCY[currency.toUpperCase()] ??
    DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS
  );
}

export const FREE_SHIPPING_BADGE: BadgeView = {
  label: "Free Shipping",
  // Shares the storefront's success/trust green (see
  // `--color-success` in `globals.css`) so this pill and every
  // future trust marker — verified seller, money-back guarantee,
  // in-stock, etc. — read as one unified positive signal.
  theme: { accent: "var(--color-success)" },
};

/** True when `priceCents` clears the free-shipping bar for its market.
 *  Both `priceCents` and the threshold are in `currency`'s minor units
 *  (the same presentment currency the rest of the UI shows), so the
 *  comparison means "≥ the local threshold" — see
 *  `freeShippingThresholdCents`. */
export function qualifiesForFreeShipping(
  priceCents: number,
  currency: string,
): boolean {
  return priceCents >= freeShippingThresholdCents(currency);
}
