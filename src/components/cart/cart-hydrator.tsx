"use client";

import { useRef } from "react";

import { hydrateCart } from "@/lib/cart/store";
import type { Cart } from "@/lib/shopify/cart";

/**
 * Authoritative cart hydration island. Renders nothing; its only
 * job is to call `hydrateCart()` exactly once on mount with the
 * server-resolved mode + initial cart + checkout domain.
 *
 * Mounted in `<SiteHeader>` (which is a server component that
 * already pays for the auth + cart fetch on every page), so the
 * hydrator runs on every route as a side-effect of the layout
 * rendering.
 *
 * Runs during render — not in `useEffect` — for a reason: any
 * sibling client island that subscribes to the cart store (the
 * `<CartTrigger>` badge being the loudest) reads its first
 * snapshot on the very next commit, and we want the store
 * pre-seeded by then. Deferring to an effect would paint a stale
 * value for one frame after hydration before the effect catches
 * up. `hydrateCart` writes to a module-level external store
 * (not React state), so the `set-state-in-render` rule doesn't
 * apply here.
 *
 * Strict-Mode safe via the canonical lazy-init ref pattern — the
 * `=== null` check is what React's lint rule for refs recognises
 * as legal access during render. Production renders the
 * component exactly once and the body runs exactly once; dev's
 * mount → unmount → remount cycle re-creates the ref each time,
 * which is fine because `hydrateCart` is itself idempotent
 * against same-prop re-calls.
 */
export function CartHydrator({
  mode,
  initialCart,
  checkoutDomain,
}: {
  mode: "guest" | "server";
  initialCart: Cart | null;
  checkoutDomain: string;
}) {
  const initRef = useRef<true | null>(null);
  if (initRef.current === null) {
    initRef.current = true;
    hydrateCart({ mode, initialCart, checkoutDomain });
  }
  return null;
}
