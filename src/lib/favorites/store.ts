"use client";

import { createStore } from "@/lib/external-store";

/**
 * Client-side mirror of the shopper's favorited product set.
 *
 * One source of truth for every surface that cares whether a
 * particular product is favorited *right now*:
 *
 *   - The header badge counts `size` and animates on 0 ↔ N.
 *   - Each product card's heart subscribes to `has(productId)`
 *     so the visual stays consistent across grids (e.g. heart
 *     a product in the home feed → its twin on the related
 *     rail flips too).
 *   - The `/favorites` page filters its grid against the set
 *     so unfavoriting a card removes it on the next paint —
 *     no waiting for a navigation to bake.
 *
 * Why a Set (instead of a number)?
 *
 *   Encoding membership lets us derive `count`, `has`, and full
 *   `ids` from one piece of state. The previous count-only store
 *   could only animate the header badge — every other consumer
 *   had to pass favorited state down as a prop, which the
 *   server action couldn't reach mid-page. With the Set, the
 *   server seeds it once per render and every consumer reads
 *   the same value reactively.
 *
 * Source-of-truth model:
 *
 *   - **Server** seeds the store on every render via the
 *     header's `<FavoritesBadge initialIds={...}/>` — the badge
 *     mount effect calls `seedFavorites(...)`. The header lives
 *     in the layout so the seed runs on every navigation /
 *     hard reload.
 *   - **Client toggles** call `markFavorited` / `markUnfavorited`
 *     from inside the heart button's click handler. The store
 *     is authoritative for the lifetime of the page session;
 *     when the user navigates, the next server render re-seeds
 *     the truth.
 *
 * Guests pin the set to empty — they can't favorite anything,
 * so the count stays 0 and the badge stays unmounted.
 *
 * Set identity: mutations replace the Set wholesale (no in-place
 * mutation) so `useSyncExternalStore`'s `Object.is` change
 * detection fires for every consumer. Selectors that read
 * primitives (`size`, `has`) bail out with `Object.is` when the
 * derived value didn't change, so a "no-op" add on an already-
 * favorited product doesn't re-render every card on the page.
 */

const EMPTY: ReadonlySet<string> = new Set();

const favoritesStore = createStore<ReadonlySet<string>>(EMPTY, EMPTY);

/* ------------------------------------------------------------------ */
/* Reads                                                                */
/* ------------------------------------------------------------------ */

/** Count selector — primitive, so only re-renders when the
 *  integer size actually changes. */
export function useFavoritesCount(): number {
  return favoritesStore.useSelector((set) => set.size, 0);
}

/** Membership selector for a single product. Primitive boolean
 *  → only re-renders when *this* product's status flips. */
export function useIsFavorited(productId: string): boolean {
  return favoritesStore.useSelector((set) => set.has(productId), false);
}

/** Full Set snapshot — for consumers that need to filter / iterate
 *  (e.g. the `/favorites` grid). Re-renders on any membership
 *  change; if you only need one product, prefer `useIsFavorited`. */
export function useFavoritedIds(): ReadonlySet<string> {
  return favoritesStore.use();
}

/** Imperative read for event handlers. */
export function getFavoritedIds(): ReadonlySet<string> {
  return favoritesStore.get();
}

/* ------------------------------------------------------------------ */
/* Mutations                                                             */
/* ------------------------------------------------------------------ */

/**
 * Seeder — replaces the entire set with the server-rendered
 * snapshot. Called from the header badge after each server
 * render to keep the client in sync with Salespace.
 *
 * Accepts any iterable (the header passes a `Set`, the page
 * body could pass an array of `productId`s). We always wrap in
 * a fresh `Set` so subscribers see a new reference and refire.
 */
export function seedFavorites(ids: Iterable<string>): void {
  favoritesStore.set(new Set(ids));
}

/**
 * Optimistic add — called from `FavoriteButton` the moment the
 * heart is clicked, before the server action returns. No-ops if
 * the id is already in the set so a double-click doesn't churn
 * subscribers.
 */
export function markFavorited(productId: string): void {
  favoritesStore.set((prev) => {
    if (prev.has(productId)) return prev;
    const next = new Set(prev);
    next.add(productId);
    return next;
  });
}

/**
 * Optimistic remove — called from `FavoriteButton` on un-heart.
 * No-ops if the id wasn't in the set so a stale click after a
 * server-side removal can't drive the set into a wrong shape.
 */
export function markUnfavorited(productId: string): void {
  favoritesStore.set((prev) => {
    if (!prev.has(productId)) return prev;
    const next = new Set(prev);
    next.delete(productId);
    return next;
  });
}
