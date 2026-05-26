"use client";

import { useEffect } from "react";

import {
  CountBadgePill,
  type CountBadgeSize,
} from "@/components/ui/count-badge-pill";
import {
  seedFavorites,
  useFavoritesCount,
} from "@/lib/favorites/store";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/**
 * Animated counter pill next to the "Favorites" header label
 * (and the `/favorites` page title).
 *
 * Visual primitive lives in `<CountBadgePill>` — this wrapper
 * owns the data side: seeding the favourites store from the
 * server-rendered ID set, subscribing for live updates, and
 * keeping first-paint SSR-correct via `useHydrated()`.
 *
 * Doubles as the canonical seeder for the favorites store: on
 * mount it calls `seedFavorites(initialIds)` so every other
 * consumer (card hearts, `/favorites` grid filter) reads the
 * same set reactively. The header lives in the layout, so this
 * seed runs on every navigation / hard reload, keeping the
 * client in sync with Salespace.
 *
 * SSR-safe first paint: `useHydrated()` is false during SSR and
 * the first client render, so `count` resolves to
 * `initialIds.size` end-to-end. That puts the underlying
 * `useBadgeAnimation`'s `useState` initializers in their final
 * pose on mount — no entry transition on reload, only on
 * subsequent 0 ↔ N flips.
 */
export type FavoritesBadgeSize = Extract<CountBadgeSize, "header" | "title">;

export interface FavoritesBadgeProps {
  /** Server-rendered snapshot of the shopper's favorited ids.
   *  Both seeds the store (so cards across the page read the
   *  same Set reactively) and provides the SSR-matching first-
   *  paint count. */
  initialIds: ReadonlySet<string>;
  size?: FavoritesBadgeSize;
}

export function FavoritesBadge({
  initialIds,
  size = "header",
}: FavoritesBadgeProps) {
  const hydrated = useHydrated();
  const storeCount = useFavoritesCount();

  useEffect(() => {
    seedFavorites(initialIds);
  }, [initialIds]);

  /* Server snapshot until hydrated, store after. The store's
   * own effect (`seedFavorites` above) populates it before the
   * first post-hydration render, so the handoff is silent. */
  const count = hydrated ? storeCount : initialIds.size;

  return <CountBadgePill count={count} size={size} />;
}
