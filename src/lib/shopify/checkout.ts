/**
 * Shopify "Buy Now" cart-permalink builder — the URL that powers
 * the PDP's "Buy Now - Fast Checkout" CTA.
 *
 * Pattern: `https://<checkout-domain>/cart/<v1>:<q1>,<v2>:<q2>,…`
 *
 * Tapping this URL drops the shopper straight into Shopify's
 * hosted checkout with the lines pre-populated, bypassing the
 * local cart entirely. Matches the legacy storefront's
 * `buildCheckoutPermalinkUrl` behaviour and is why the Buy Now
 * path doesn't go through `addCartLine()`.
 *
 * Each line takes the Storefront API variant gid
 * (`gid://shopify/ProductVariant/12345`); the gid is split down
 * to its numeric tail at build time. Lines whose gid can't be
 * parsed are skipped — if every line is invalid the function
 * returns `null` so the caller can disable the CTA rather than
 * navigate to a broken url.
 *
 * `checkoutDomain` is the bare hostname (no scheme, no path).
 * `https://` is prepended unconditionally.
 */
export interface CheckoutLine {
  variantGid: string;
  quantity: number;
}

export function buildCartPermalink(
  checkoutDomain: string,
  lines: ReadonlyArray<CheckoutLine>,
): string | null {
  const segments: string[] = [];
  for (const line of lines) {
    const numericId = line.variantGid.split("/").pop();
    if (!numericId || !/^\d+$/.test(numericId)) continue;
    const qty = Math.max(1, Math.floor(line.quantity));
    segments.push(`${numericId}:${qty}`);
  }
  if (segments.length === 0) return null;
  return `https://${checkoutDomain}/cart/${segments.join(",")}`;
}
