"use client";

import { createStore } from "@/lib/external-store";

/**
 * Cart drawer open/closed state.
 *
 * Lives in its own store (rather than alongside the persisted cart
 * lines) for two reasons:
 *
 *   1. **Ephemeral, not persisted.** A reload should not re-open the
 *      drawer — that would be jarring. Keeping it separate avoids a
 *      "persist everything except this one field" carveout in the
 *      cart store's storage layer.
 *   2. **Different update cadence.** Adding a line writes to
 *      localStorage; opening the drawer doesn't need to. Independent
 *      stores keep the two flows uncoupled.
 *
 * Anyone in the client tree (product card "+", PDP add-to-cart,
 * promo banner, success toast) can call `openCart()` directly — no
 * prop drilling, no context provider. The drawer subscribes via
 * `useCartDrawerOpen` and toggles its visibility class.
 */
const drawerStore = createStore<boolean>(false, false);

export function openCart(): void {
  drawerStore.set(true);
}

export function closeCart(): void {
  drawerStore.set(false);
}

export function toggleCart(): void {
  drawerStore.set((prev) => !prev);
}

export function useCartDrawerOpen(): boolean {
  return drawerStore.use();
}
