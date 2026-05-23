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
 *   2. **Free shipping** is computed client-side from price ≥
 *      `FREE_SHIPPING_THRESHOLD_CENTS`. It's allowed to render
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
  | "BUNDLE_AND_SAVE"
  | "NEW_ARRIVAL";

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
  NEW_ARRIVAL:       { label: "New",           theme: { accent: "var(--color-brand)" } },
};

/**
 * Priority order — first match wins. Promos rank above achievements
 * because they're time-sensitive, and achievements rank above
 * generic trending / new flags.
 */
const PRODUCT_BADGE_PRIORITY: ProductBadgeType[] = [
  "BUNDLE_AND_SAVE",
  "LIMITED_TIME_DEAL",
  "BEST_SELLER",
  "TOP_RATED",
  "MOST_LIKED",
  "TRENDING_NOW",
  "NEW_ARRIVAL",
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
/** Single threshold for the whole storefront. Lives here so the
 *  card badge, the cart-progress bar, and any landing-page CTA all
 *  trace back to one number. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 3500;

export const FREE_SHIPPING_BADGE: BadgeView = {
  label: "Free Shipping",
  // Shares the storefront's success/trust green (see
  // `--color-success` in `globals.css`) so this pill and every
  // future trust marker — verified seller, money-back guarantee,
  // in-stock, etc. — read as one unified positive signal.
  theme: { accent: "var(--color-success)" },
};

export function qualifiesForFreeShipping(priceCents: number): boolean {
  return priceCents >= FREE_SHIPPING_THRESHOLD_CENTS;
}
