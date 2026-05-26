import "server-only";

import { cache } from "react";

import { getSession } from "@/lib/auth/session";
import { getCartId } from "@/lib/cart/cookie";
import { fetchCart, type Cart } from "@/lib/shopify/cart";

/**
 * Per-request memoised access to the logged-in shopper's Shopify
 * cart.
 *
 * Single round-trip per request, fanned out to every Server
 * Component that needs the cart:
 *
 *   - `<SiteHeader>` reads it for the SSR-correct badge count on
 *     first paint (no empty-flash for logged-in users).
 *   - Future PDP / cart / checkout surfaces can call the same
 *     helper without paying a duplicate fetch.
 *
 * Guests short-circuit before the network — no session, no
 * fetch, `null`. The drawer / trigger fall back to the client
 * store's localStorage state on hydration.
 *
 * Returns `null` for any of:
 *
 *   - Guest (no session)
 *   - Logged in but no cart cookie yet (first visit before any
 *     add)
 *   - Cart cookie points to an expired / checked-out / deleted
 *     Shopify cart (`fetchCart` resolves null)
 *   - Hard network failure (logged inside `fetchCart`)
 *
 * The action layer never calls this helper — it uses
 * `getOrCreateCart` to create on the fly. This is read-only.
 */
export const getCurrentCart = cache(async (): Promise<Cart | null> => {
  const session = await getSession();
  if (!session) return null;

  const cartId = await getCartId();
  if (!cartId) return null;

  return fetchCart(cartId);
});
