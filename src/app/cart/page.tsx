import type { Metadata } from "next";

import { CartPageBody } from "@/components/cart/cart-page-body";
import { getCurrentCart } from "@/lib/cart/queries";

export const metadata: Metadata = {
  title: "Your cart",
  // Per-shopper utility surface — nothing to index, but follow so
  // the in-page links still pass through.
  robots: { index: false, follow: true },
};

/**
 * `/cart` — full-page cart surface, complementary to the
 * right-anchored drawer. The drawer remains the primary,
 * high-conversion path (one click from any page, sticky-footer
 * checkout); the page exists for direct URL navigation,
 * bookmarks, share links, and any flow where a slim sheet is
 * the wrong frame for the task.
 *
 * Async server shell — fetches the authoritative cart at request
 * time and threads it into the client body as `initialCart`.
 * Logged-in shoppers therefore SSR with their real cart contents
 * and never see the empty-state flash that a pure client read
 * would produce (the cart store's `getServerSnapshot` resolves
 * to `EMPTY` during SSR + the first hydration commit, regardless
 * of what the client-side store carries — `<CartPageBody>`'s
 * hydration handoff bridges that gap).
 *
 * Guests get `null` here (no session = no cart fetch) and the
 * body renders a skeleton until the store hydrates from
 * `localStorage` on the post-hydration commit. Either way the
 * page never paints "Your cart is empty" speculatively.
 *
 * `getCurrentCart()` is `cache()`-memoised at the React request
 * boundary and already called once by `<SiteHeader>`, so this is
 * free — no extra Shopify round-trip, no extra cookie reads.
 *
 * Layout / styling decisions live with the body component so
 * this shell stays a thin data-loader + render pair.
 */
export default async function CartPage() {
  const initialCart = await getCurrentCart();
  return <CartPageBody initialCart={initialCart} />;
}
