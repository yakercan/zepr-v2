"use client";

import { createStore } from "@/lib/external-store";
import type { CartLine } from "@/types/cart";

/**
 * Cart state, persisted to `localStorage` and shared across every
 * client component via `useSyncExternalStore`.
 *
 * Design rationale (why not Context / zustand / Redux):
 *
 *   - **No Context** — every consumer of cart state would force a
 *     `<Provider>` somewhere up the tree, and every state change
 *     would re-render everything underneath unless we hand-tuned
 *     `React.memo` on every leaf. `useSyncExternalStore` skips that
 *     entire problem: only components that actually read the changed
 *     slice re-render. The selector form lets the header badge
 *     subscribe to *just* the count, so editing a quantity inside
 *     the drawer doesn't even mark the header dirty unless the total
 *     changes.
 *   - **No third-party library** — zustand / valtio / jotai all do
 *     the same thing on top of `useSyncExternalStore`. With React 19
 *     shipping the primitive in core, a ~30-line `createStore` is
 *     all we need; adding a dep gains us nothing here and costs us
 *     bundle weight + a transitive surface area.
 *
 * Persistence model:
 *
 *   - One key, one JSON blob (`zepr-v2:cart:v1`).
 *   - Versioned key so a future schema change can be migrated by
 *     reading the old key, transforming, and writing the new one
 *     without confusing existing users' carts.
 *   - The `storage` event syncs across tabs for free — change the
 *     cart in tab A and tab B's drawer / header badge update in the
 *     same frame.
 *   - Quota / private-mode writes are swallowed: the in-memory state
 *     is still authoritative for the current tab, so the cart works
 *     even if persistence is unavailable.
 *
 * Hydration:
 *
 *   - Server snapshot is always `[]` (we don't read storage from the
 *     server, obviously). React's first client render also uses the
 *     server snapshot to avoid hydration mismatches, then immediately
 *     re-renders with the hydrated state. Net effect: a single empty-
 *     to-real flicker on first load, only visible on the cart badge
 *     and only if the cart isn't empty.
 *   - Hydration runs once at module load on the client (this file is
 *     `"use client"`, so it doesn't execute server-side at all).
 */

const STORAGE_KEY = "zepr-v2:cart:v1";

const EMPTY: readonly CartLine[] = [];

function loadFromStorage(): readonly CartLine[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    // Light shape filter — drops anything that lost a required field
    // in storage (e.g. older versions). Better to lose a stale line
    // than to crash the drawer mapping over it.
    return parsed.filter(isCartLine);
  } catch {
    return EMPTY;
  }
}

function isCartLine(v: unknown): v is CartLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.productId === "string" &&
    typeof l.handle === "string" &&
    typeof l.title === "string" &&
    typeof l.imageUrl === "string" &&
    typeof l.priceCents === "number" &&
    typeof l.currency === "string" &&
    typeof l.quantity === "number"
  );
}

function saveToStorage(lines: readonly CartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* Quota exceeded / private mode — ignore. In-memory state still
     * works for the current tab. */
  }
}

const cartStore = createStore<readonly CartLine[]>(EMPTY, EMPTY);

/* Module-load hydration. Runs exactly once when this file is first
 * imported into the client bundle. By the time any component renders,
 * the store carries the persisted snapshot. */
if (typeof window !== "undefined") {
  const persisted = loadFromStorage();
  if (persisted.length > 0) cartStore.set(persisted);
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) cartStore.set(loadFromStorage());
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/**
 * Write helper — updates the store *and* persists in one shot so the
 * two never disagree. `set` short-circuits on `Object.is`, so a no-op
 * update (same array reference returned) skips the storage write too.
 */
function update(updater: (prev: readonly CartLine[]) => readonly CartLine[]): void {
  cartStore.set((prev) => {
    const next = updater(prev);
    if (next !== prev) saveToStorage(next);
    return next;
  });
}

/**
 * Add a product to the cart. If a line with the same `id` already
 * exists, its quantity is incremented; otherwise a new line is
 * appended. `id` is the dedupe key, so callers that want one line
 * per variant should compose `id` as `productId + ":" + variantId`.
 */
export function addCartLine(
  line: Omit<CartLine, "quantity">,
  quantity = 1,
): void {
  if (quantity <= 0) return;
  update((prev) => {
    const idx = prev.findIndex((l) => l.id === line.id);
    if (idx >= 0) {
      const next = prev.slice();
      next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
      return next;
    }
    return [...prev, { ...line, quantity }];
  });
}

export function removeCartLine(id: string): void {
  update((prev) => prev.filter((l) => l.id !== id));
}

/**
 * Set the exact quantity for a line. Setting to `0` (or below)
 * removes the line — matches the visual behavior where pressing `-`
 * past 1 deletes the row.
 */
export function setCartLineQuantity(id: string, quantity: number): void {
  if (quantity <= 0) {
    removeCartLine(id);
    return;
  }
  update((prev) =>
    prev.map((l) => (l.id === id ? { ...l, quantity } : l)),
  );
}

export function clearCart(): void {
  update(() => EMPTY);
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Full lines snapshot — re-renders on every mutation. */
export function useCartLines(): readonly CartLine[] {
  return cartStore.use();
}

/** Total item count across all lines. Primitive selector, so the
 *  caller only re-renders when the number actually changes. */
export function useCartCount(): number {
  return cartStore.useSelector(
    (lines) => lines.reduce((sum, l) => sum + l.quantity, 0),
    0,
  );
}

/** Subtotal in cents (sum of price × quantity). Doesn't account for
 *  shipping, taxes, or coupons — those layer on at checkout. */
export function useCartSubtotalCents(): number {
  return cartStore.useSelector(
    (lines) => lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0),
    0,
  );
}
