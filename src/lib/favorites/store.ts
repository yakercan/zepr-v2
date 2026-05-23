"use client";

import { createStore } from "@/lib/external-store";

/**
 * Favorites (wishlist) state, persisted to `localStorage` and
 * synced across tabs.
 *
 * Just a list of product ids — the product details are looked up
 * elsewhere (search results today, a dedicated favorites endpoint
 * later). Keeping it minimal means the storage payload stays tiny
 * regardless of how many items the user favorites, and the cross-
 * tab `storage` event is cheap to fire.
 *
 * Follows the same shape as `lib/cart/store.ts` so the two stores
 * read consistently:
 *
 *   - Versioned storage key for future migrations.
 *   - Hydration once at module load (client only).
 *   - `storage` event listener for tab-to-tab sync.
 *   - Selector hook (`useIsFavorited`) returns a primitive so
 *     each card only re-renders when *its* favorited state
 *     changes — not when any other product is added / removed.
 */

const STORAGE_KEY = "zepr-v2:favorites:v1";

const EMPTY: readonly string[] = [];

function loadFromStorage(): readonly string[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return EMPTY;
  }
}

function saveToStorage(ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* Quota exceeded / private mode — ignore. In-memory state
     * still works for the current tab. */
  }
}

const favoritesStore = createStore<readonly string[]>(EMPTY, EMPTY);

if (typeof window !== "undefined") {
  const persisted = loadFromStorage();
  if (persisted.length > 0) favoritesStore.set(persisted);
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) favoritesStore.set(loadFromStorage());
  });
}

function update(updater: (prev: readonly string[]) => readonly string[]): void {
  favoritesStore.set((prev) => {
    const next = updater(prev);
    if (next !== prev) saveToStorage(next);
    return next;
  });
}

/**
 * Toggle a product's favorite state. Idempotent per-call — calling
 * twice returns the list to its starting state.
 */
export function toggleFavorite(productId: string): void {
  update((prev) => {
    const idx = prev.indexOf(productId);
    if (idx >= 0) {
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    }
    return [...prev, productId];
  });
}

/**
 * Per-product subscription. Returns a primitive boolean so each
 * card's render only fires when *its* favorited state changes —
 * adding any other product to favorites doesn't ripple through
 * the whole grid.
 */
export function useIsFavorited(productId: string): boolean {
  return favoritesStore.useSelector(
    (ids) => ids.includes(productId),
    false,
  );
}

/** Read all favorited ids — for a dedicated /favorites page. */
export function useFavoriteIds(): readonly string[] {
  return favoritesStore.use();
}
