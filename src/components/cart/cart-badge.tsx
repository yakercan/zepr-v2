"use client";

import {
  CountBadgePill,
  type CountBadgeSize,
} from "@/components/ui/count-badge-pill";
import { useCartCount } from "@/lib/cart/store";

/**
 * Animated counter pill for the cart drawer header — visual
 * primitive shared with `<FavoritesBadge>`.
 *
 * No initial-count seeding here: the drawer is closed on first
 * paint, so subscribing directly to `useCartCount()` is fine.
 * By the time the drawer animates open, the cart store has
 * already hydrated (via `<CartMetaHydrator>` for the meta and
 * `<CartHydrator>` for the lines themselves) and the count
 * reads its authoritative value.
 */
export type CartBadgeSize = Extract<CountBadgeSize, "drawer" | "title">;

export function CartBadge({
  size = "drawer",
}: {
  size?: CartBadgeSize;
}) {
  const count = useCartCount();
  return <CountBadgePill count={count} size={size} />;
}
