/**
 * Client-side cart line item.
 *
 * Today the cart lives entirely in `localStorage` (no Shopify cart
 * API on the wire yet), so the line carries everything the drawer
 * needs to render itself without re-fetching the product: title,
 * image, prices in cents, currency, handle for navigation. When the
 * real cart backend lands, this type stays — only the persistence
 * layer flips from `localStorage` to the storefront mutation API.
 *
 * `id` is the *line* id (one per cart row). Two distinct variants of
 * the same product become two lines with different ids. We compose
 * it from `productId` + `variantId` (or just `productId` for single-
 * variant products) when adding, so the cart store can dedupe and
 * accumulate quantities without an extra equality check.
 */
export interface CartLine {
  id: string;
  productId: string;
  handle: string;
  title: string;
  imageUrl: string;
  priceCents: number;
  /** Original price for showing a strikethrough next to the active
   *  price. Optional — undefined means no discount on this line. */
  compareAtCents?: number;
  currency: string;
  quantity: number;
  /** Optional human-readable variant ("Size: L", "Color: Blue") for
   *  the row's secondary line. Skipped today because the product
   *  search type doesn't surface variants yet; the drawer renders
   *  this when present so PDP-side adds work as soon as variants
   *  land. */
  variantTitle?: string;
}
