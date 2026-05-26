/**
 * Client-side cart line item.
 *
 * The line carries everything the drawer needs to render itself
 * without re-fetching the product: title, image, prices in cents,
 * currency, handle for navigation. Persistence differs by mode:
 *
 *   - **Guest** → `localStorage` (`zepr-v2:cart:v1`). The line IS
 *     the source of truth for the current cart.
 *   - **Logged-in** → Shopify Storefront Cart API. The line is a
 *     denormalised projection of what Shopify holds, kept locally
 *     so the drawer paints from the store instead of refetching
 *     on every render. `id` mirrors Shopify's cart-line id when
 *     the line came from the server (so mutations can target the
 *     exact line); it's a locally-composed `productId:variantId`
 *     when the line was added optimistically and Shopify hasn't
 *     replied yet.
 *
 * `id` is the *line* id (one per cart row). Two distinct variants of
 * the same product become two lines with different ids.
 */
export interface CartLine {
  id: string;
  productId: string;
  /** Shopify Storefront `ProductVariant` GID
   *  (`gid://shopify/ProductVariant/<id>`). Required to talk to
   *  the Shopify Cart API — the `cartLinesAdd` mutation's
   *  `merchandiseId` field expects this exact format. PDP-built
   *  lines populate it from `variant.id`; card-built lines for
   *  single-variant products may leave it unset (server actions
   *  resolve from `handle` in that case). Always present once the
   *  line round-trips through Shopify. */
  merchandiseId?: string;
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
   *  the row's secondary line. Populated by PDP-built lines from
   *  the resolved variant's `selectedOptions`; absent for card-
   *  level single-variant adds. */
  variantTitle?: string;
}
