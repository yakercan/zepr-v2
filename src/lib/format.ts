/**
 * Money formatting helpers.
 *
 * Salespace stores money as integer cents in a product currency
 * code. `formatPrice(cents, currency)` converts to a localized
 * display string using `Intl.NumberFormat`, which is fast (cached
 * internally by the engine) and gives us correct symbols, decimals,
 * and grouping per locale at no extra runtime cost.
 *
 * Locale is fixed to `en-US` for now — the rest of the storefront
 * follows the same convention. Swap to a request-derived locale
 * once i18n lands.
 */
const DEFAULT_LOCALE = "en-US";

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Display a price range when the min and max differ, otherwise a
 * single price. Returns a normalized string so the card layout
 * doesn't have to branch on range vs single.
 */
export function formatPriceRange(
  minCents: number,
  maxCents: number,
  currency: string,
): string {
  if (maxCents > minCents) {
    return `${formatPrice(minCents, currency)} – ${formatPrice(maxCents, currency)}`;
  }
  return formatPrice(minCents, currency);
}

/**
 * Integer discount percentage rounded down (so "$10 → $7" shows as
 * "30% OFF", not "30.00…%"). Returns 0 when there's no discount,
 * letting callers gate the badge on the falsy value.
 */
export function calcDiscountPercent(
  priceCents: number,
  compareAtCents: number | undefined,
): number {
  if (!compareAtCents || compareAtCents <= priceCents) return 0;
  return Math.floor(((compareAtCents - priceCents) / compareAtCents) * 100);
}
