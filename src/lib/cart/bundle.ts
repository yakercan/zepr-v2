/**
 * Cart-wide "Bundle & Save" promotion.
 *
 * The discount is a pure function of the TOTAL number of units in the
 * cart (every line's quantity summed — two of the same item counts as
 * two), and applies uniformly to every line:
 *
 *   - 1 unit    → no discount
 *   - 2 units   → 20% off everything
 *   - 3+ units  → 30% off everything
 *
 * This is the in-cart PREVIEW of the matching Shopify quantity-break
 * automatic discount, which charges it for real at checkout. Because
 * it keys off cart quantity (not a per-line tag), the same rule works
 * for guests (the checkout permalink carries the quantities) and
 * logged-in shoppers alike. Keep the thresholds here in lockstep with
 * the Shopify discount so the cart total matches what's charged.
 *
 * Tiers are listed high → low so the first match wins; add or retune
 * a tier in one place and the cart footer + line rows follow.
 */
export const CART_BUNDLE_TIERS: ReadonlyArray<{
  minQuantity: number;
  percent: number;
}> = [
  { minQuantity: 3, percent: 30 },
  { minQuantity: 2, percent: 20 },
];

/**
 * Master switch / kill switch for the in-cart bundle preview — the
 * per-line discounted totals + "Bundle · N% off" tags on each cart
 * line. Flip to `false` to disable the whole feature in one place
 * (line rows fall back to plain sale pricing).
 *
 * Keep the thresholds in `CART_BUNDLE_TIERS` in lockstep with the
 * matching Shopify quantity-break automatic discount so the cart
 * total equals what's charged at checkout.
 *
 * Note: the footer's "Bundle savings" and "You're saving" breakdown
 * rows are intentionally commented out in `cart-footer.tsx` for now —
 * the subtotal still reads the bundle-discounted total against the
 * struck compare-at "was" price, just without the itemised rows. The
 * per-line badge in the cart drawer stays on.
 */
export const BUNDLE_SAVINGS_ENABLED = true;

/** Percentage off the whole cart for a given total unit count. `0`
 *  below the first threshold (i.e. a single-item cart), and `0`
 *  everywhere while `BUNDLE_SAVINGS_ENABLED` is off. */
export function cartBundlePercent(totalQuantity: number): number {
  if (!BUNDLE_SAVINGS_ENABLED) return 0;
  for (const tier of CART_BUNDLE_TIERS) {
    if (totalQuantity >= tier.minQuantity) return tier.percent;
  }
  return 0;
}

/**
 * Cents a percentage shaves off a SINGLE unit at `unitPriceCents` —
 * the atom all the other bundle math is built from. The raw discount
 * is FLOORED to the cent (never rounded up), so the shopper is always
 * charged at least the discounted price and the store never
 * over-discounts by a fraction of a cent:
 *
 *   $25.99 @ 20% → 25.99 × 0.20 = 5.198 → floor to $5.19 off
 *
 * Flooring PER UNIT (rather than on a grouped subtotal) is the whole
 * point: 2 × $25.99 saves exactly 2 × $5.19 = $10.38, not
 * floor($51.98 × 20%) = $10.39. Keeping the floor at the unit level is
 * what lets the cart line, the cart footer, and the PDP tiered-offer
 * tile all agree to the cent. `0`% → no savings.
 */
export function bundleUnitSavingsCents(
  unitPriceCents: number,
  percent: number,
): number {
  if (percent <= 0) return 0;
  return Math.floor((unitPriceCents * percent) / 100);
}

/** Total bundle savings for `quantity` units at `unitPriceCents` —
 *  the per-unit floored saving times the quantity. Summed across the
 *  cart's lines this is the footer's "Bundle savings" figure, and it
 *  exactly equals the sum of the discounted line totals shown above
 *  it because both floor at the same (unit) level. */
export function bundleSavingsCents(
  unitPriceCents: number,
  quantity: number,
  percent: number,
): number {
  return bundleUnitSavingsCents(unitPriceCents, percent) * quantity;
}

/** Discounted total for `quantity` units at `unitPriceCents` — the
 *  gross (`unitPriceCents × quantity`) minus the per-unit-floored
 *  bundle savings. A `0`% promo is a pass-through. */
export function bundleDiscountedCents(
  unitPriceCents: number,
  quantity: number,
  percent: number,
): number {
  return (
    unitPriceCents * quantity -
    bundleSavingsCents(unitPriceCents, quantity, percent)
  );
}
