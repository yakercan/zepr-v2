/**
 * Shopify cart-permalink builder — the URL that powers the
 * guest-mode checkout button in the cart drawer.
 *
 * Pattern: `https://<checkout-domain>/cart/<v1>:<q1>,<v2>:<q2>,…`
 *
 * Tapping this URL drops the shopper straight into Shopify's
 * hosted checkout with the lines pre-populated. Matches the legacy
 * storefront's `buildCheckoutPermalinkUrl` behaviour.
 *
 * Each line takes the Storefront API variant gid
 * (`gid://shopify/ProductVariant/12345`); the gid is split down
 * to its numeric tail at build time. Lines whose gid can't be
 * parsed are skipped — if every line is invalid the function
 * returns `null` so the caller can disable the CTA rather than
 * navigate to a broken url.
 *
 * Optional `attributes` are appended as `attributes[<key>]=<v>`
 * query params — Shopify natively reads them off the permalink
 * URL and stamps them on the resulting cart (same path
 * `cartAttributesUpdate` writes to). The guest checkout flow uses
 * this hook to carry UTM attribution into checkout even though it
 * never touches the Cart API.
 *
 * `checkoutDomain` is the bare hostname (no scheme, no path).
 * `https://` is prepended unconditionally.
 */
export interface CheckoutLine {
  variantGid: string;
  quantity: number;
}

export interface CheckoutAttribute {
  key: string;
  value: string;
}

export function buildCartPermalink(
  checkoutDomain: string,
  lines: ReadonlyArray<CheckoutLine>,
  options: { attributes?: ReadonlyArray<CheckoutAttribute> } = {},
): string | null {
  const segments: string[] = [];
  for (const line of lines) {
    const numericId = line.variantGid.split("/").pop();
    if (!numericId || !/^\d+$/.test(numericId)) continue;
    const qty = Math.max(1, Math.floor(line.quantity));
    segments.push(`${numericId}:${qty}`);
  }
  if (segments.length === 0) return null;

  const base = `https://${checkoutDomain}/cart/${segments.join(",")}`;
  const attrs = options.attributes ?? [];
  if (attrs.length === 0) return base;

  /* `URLSearchParams` is the safest way to encode user-supplied
   * values into the query string — handles spaces, ampersands,
   * non-ASCII (Turkish campaign names, emoji UTMs, etc.) the
   * same way Shopify's URL parser expects. */
  const params = new URLSearchParams();
  for (const { key, value } of attrs) {
    params.append(`attributes[${key}]`, value);
  }
  return `${base}?${params.toString()}`;
}
