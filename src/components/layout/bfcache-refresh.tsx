"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Bfcache refresh handler. Renders nothing.
 *
 * When a shopper navigates away from the storefront (typically
 * to Shopify checkout) and uses the browser back button to
 * return, Safari and modern Chrome restore the page from the
 * back/forward cache. Restored pages replay every byte of
 * frozen state — DOM, JS heap, in-memory React state — exactly
 * as it was at navigation time. From the shopper's POV the page
 * is "back" instantly, but every server-fetched value is now a
 * snapshot from before they left:
 *
 *   - Product cards still grayscale-pending if their fetch was
 *     mid-flight at unload.
 *   - Header taxonomy / cart-count / favourites counts frozen.
 *   - Anything that was loading is still loading; anything that
 *     was loaded reflects the pre-checkout world.
 *
 * `router.refresh()` is Next.js's canonical fix for this: it
 * invalidates the route's data cache and re-streams every
 * server component in place, no remount, no flash. The frozen
 * snapshot is replaced with fresh data on the very next paint.
 * Client-only state that the bfcache pinned (e.g. an open
 * dropdown) is unaffected — that's correct, the shopper opened
 * it themselves and expects it to still be open.
 *
 * Specific client stores that hold their own data parallel to
 * Shopify (the cart-line store) own their own pageshow
 * revalidation alongside this — `router.refresh()` covers
 * server-rendered content, those listeners cover the slices
 * Next doesn't own.
 *
 * Fresh navigations (no bfcache) fire `pageshow` with
 * `persisted: false` — those are already SSR-fresh, so the
 * `persisted` gate keeps this a no-op for the normal nav path.
 *
 * Mounted once at the `<ShopLayout>` root. One listener, one
 * concern — the rest of the tree stays decoupled from
 * browser-history mechanics.
 */
export function BfcacheRefresh() {
  const router = useRouter();

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        router.refresh();
      }
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  return null;
}
