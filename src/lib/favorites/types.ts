/**
 * Favorites domain types — shared between the server-only
 * Salespace provider, the server actions, and the `/favorites`
 * page.
 *
 * Lives in its own sibling module (not next to the provider) so
 * client components that just need a `type` import don't drag
 * the `server-only` provider along by accident.
 */

/**
 * One favorite row projected from Salespace's `/wishlist` GET
 * response.
 *
 * Salespace stores a denormalised product snapshot alongside
 * the save (image, title, price, available, compare-at), so the
 * `/favorites` page can render full cards from a single backend
 * call — no Shopify hydration step needed. The snapshot drifts
 * if the merchant changes the product after a save (rare, and
 * Salespace refreshes the snapshot on its own cadence), but the
 * trade is single-round-trip simplicity for the favorites view.
 *
 * `productId` is the numeric Shopify id (the gid tail).
 * That's the form Salespace's `/search` endpoint carries on
 * `SearchProduct.id`, which is what cards render, so keeping
 * favorites in numeric form lets the `Set` from
 * `getCurrentFavoritedIds()` be looked up as-is against card
 * ids — no per-card coercion.
 */
export interface FavoriteItem {
  productId: string;
  handle: string;
  title: string;
  imageUrl: string;
  priceMinCents: number;
  priceMaxCents: number;
  /** Set only when there's a genuine discount (`> price_min`);
   *  zero / equal values are dropped to `undefined` so cards
   *  never render a phantom strike-through. */
  compareAtMinCents?: number;
  currency: string;
  available: boolean;
  /** ISO timestamp from Salespace at insert time. */
  addedAt: string;
}
