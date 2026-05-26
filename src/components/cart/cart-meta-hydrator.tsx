"use client";

import { useRef } from "react";

import { hydrateCartMeta } from "@/lib/cart/store";

/**
 * Cart meta hydrator. Renders nothing.
 *
 * Mounted in `<ShopLayout>` (NOT `<SiteHeader>`) so it ships
 * with the layout's fast cookie-only awaits, ahead of the
 * header's slow Shopify cart fetch. Sets the two pieces of
 * cart metadata that the rest of the tree might need before
 * the cart itself lands:
 *
 *   - **`mode`** — guest vs. server. Mutation routing in the
 *     cart store keys on this; Buy Now's permalink builder
 *     doesn't care about mode but the rest of the cart UI does.
 *   - **`checkoutDomain`** — the Shopify checkout hostname
 *     spliced into every cart permalink (Buy Now, guest
 *     checkout). Without this set, `buildCartPermalink` would
 *     interpolate `undefined` and the navigation URL would
 *     read `https://undefined/cart/…` for a shopper who
 *     clicks Buy Now before the header finishes streaming.
 *
 * The full `<CartHydrator>` in `<SiteHeader>` still fires
 * later with the actual cart lines + ids; this hydrator only
 * primes the metadata that's safe to set without waiting for
 * the cart fetch.
 *
 * Lazy-init pattern matches `<CartHydrator>` — runs during
 * render (not in `useEffect`) so any sibling that reads
 * `metaStore` on its very first commit sees the right value.
 * Strict-Mode safe via the `useRef<true | null>(null)`
 * one-shot guard.
 */
export function CartMetaHydrator({
  mode,
  checkoutDomain,
}: {
  mode: "guest" | "server";
  checkoutDomain: string;
}) {
  const initRef = useRef<true | null>(null);
  if (initRef.current === null) {
    initRef.current = true;
    hydrateCartMeta({ mode, checkoutDomain });
  }
  return null;
}
