"use client";

import {
  CountBadgePill,
  type CountBadgeSize,
} from "@/components/ui/count-badge-pill";
import { useCartCount } from "@/lib/cart/store";
import { useHydrated } from "@/lib/hooks/use-hydrated";

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
 * `useHydrated()` handles the render-vs-mount flip in a way
 * that's also safe inside streamed Suspense sub-trees (see the
 * hook's doc block) — important here because the `/cart` page
 * renders inside Next.js's per-segment `<LoadingBoundary>`.
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
  const hydrated = useHydrated();
  const liveCount = useCartCount();
  const count =
    hydrated || initialCount === undefined ? liveCount : initialCount;

  return <CountBadgePill count={count} size={size} />;
}
