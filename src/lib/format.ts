/**
 * Money formatting helpers.
 *
 * Salespace stores money as integer cents in a product currency
 * code. `formatPrice(cents, currency)` converts to a localized
 * display string.
 *
 * Single source of truth: this delegates to `formatMarketAmount`
 * (in `config/markets.ts`), which derives the `Intl.NumberFormat`
 * locale from the currency via `localeForCurrency` — so every money
 * string in the app (cart, orders, badges, the `<Price>` component)
 * renders the same native symbol for a given currency: `S$35.00`,
 * `£35.00`, `CA$50.00`, not the ISO-code fallback (`SGD 35.00`) a
 * fixed `en-US` locale would produce for non-US currencies.
 */
import { formatMarketAmount } from "@/config/markets";

export function formatPrice(cents: number, currency: string): string {
  return formatMarketAmount(cents, currency);
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
