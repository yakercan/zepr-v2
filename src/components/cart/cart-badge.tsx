"use client";

import { useEffect, useState } from "react";

import {
  CountBadgePill,
  type CountBadgeSize,
} from "@/components/ui/count-badge-pill";
import { useCartCount } from "@/lib/cart/store";

/**
 * Animated counter pill for the cart drawer header and the
 * `/cart` page title — visual primitive shared with
 * `<FavoritesBadge>`.
 *
 * Two consumers, two SSR stories:
 *
 *   - `size="drawer"` lives inside the cart drawer, which is
 *     closed on first paint. By the time it animates open the
 *     store has already hydrated (via `<CartMetaHydrator>` for
 *     the meta and `<CartHydrator>` for the lines themselves)
 *     and the count reads its authoritative value. No
 *     `initialCount` plumbing needed.
 *
 *   - `size="title"` lives on `/cart` and renders inline with
 *     the page heading on first paint. Logged-in shoppers have
 *     a server-fetched cart available, so we accept an
 *     `initialCount` for the SSR-correct number and only switch
 *     to the store after mount. Guests pass no `initialCount`
 *     and the badge resolves to 0 → live count on the first
 *     post-mount render. Mirrors `<CartTrigger>`'s existing
 *     `initialCount` plumbing.
 *
 * # Why `useState + useEffect` instead of `useHydrated()`
 *
 * The `/cart` page renders inside a streamed Suspense boundary
 * (Next.js's per-segment `<LoadingBoundary>` — visible at the
 * top of any hydration diff for this route). When a client
 * component lives inside a streamed sub-tree, React 19's
 * `useSyncExternalStore` doesn't reliably return its server
 * snapshot during the sub-tree's hydration commit — by the
 * time the chunk lands and reconciles, the *outer* app is
 * already past its hydration phase, so the hook switches
 * straight to `getSnapshot()` and we get the live (post-
 * hydration) value during what *should* be the matching-the-
 * SSR-HTML render. The badge therefore computed `count=0`
 * (live store, not yet seeded by `<CartHydrator>` in the
 * header) while the server HTML carried `count=4`, producing
 * a hydration mismatch on every cart page load.
 *
 * `useState(false)` is honest about render-vs-mount: it
 * returns `false` on every first render of this component, no
 * matter where in the tree we are, no matter how the parent
 * arrived (initial paint, streamed Suspense chunk, lazy
 * import, transition…). `useEffect` then fires strictly after
 * every initial render in the tree has committed — including
 * `<CartHydrator>`'s render-time store seed in the header — so
 * the flip to `mounted=true` happens with `liveCount` already
 * at its authoritative value. No race, no flash, no
 * hydration warning.
 */
export type CartBadgeSize = Extract<CountBadgeSize, "drawer" | "title">;

export interface CartBadgeProps {
  size?: CartBadgeSize;
  /** SSR-correct count for the first paint. When provided, the
   *  badge renders this value through the initial render and
   *  hydration commit, then switches to the live store on the
   *  first post-mount render. Omit for surfaces where first-
   *  paint accuracy doesn't matter (drawer's closed-by-default
   *  case). */
  initialCount?: number;
}

export function CartBadge({
  size = "drawer",
  initialCount,
}: CartBadgeProps) {
  const liveCount = useCartCount();

  /* `mounted` stays `false` through SSR + the first client
   * render (matching the HTML byte-for-byte regardless of
   * Suspense streaming), then flips `true` from the post-mount
   * effect. After that the badge tracks the live store, so
   * mutations (remove / qty change / add) reflect immediately.
   *
   * The lint rule wants us to use `useSyncExternalStore` for
   * "boolean that flips after hydration" — and we did, via
   * `useHydrated()`. That hook is broken inside streamed
   * Suspense boundaries (see the doc block above), so we
   * deliberately fall back to the canonical `useState +
   * useEffect` shape here. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const count =
    mounted || initialCount === undefined ? liveCount : initialCount;

  return <CountBadgePill count={count} size={size} />;
}
