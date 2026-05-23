"use client";

import { closeCart } from "@/lib/cart/drawer-store";

/**
 * Empty-state body for the cart drawer.
 *
 * Centered vertically inside the drawer's scroll area so the message
 * sits at the visual middle on any drawer height (long screen,
 * short laptop window, mobile sheet). The "Continue shopping" button
 * just closes the drawer — there's no separate "back to home" CTA
 * because the user is already on a page; they just need the overlay
 * dismissed so they can keep browsing.
 *
 * Copy-only — no decorative bag icon. The drawer's header already
 * shows the cart context ("Your cart"), so a second glyph here would
 * be redundant and add visual weight the empty state doesn't need.
 */
export function CartEmpty() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div>
        <h3 className="text-base font-semibold text-[color:var(--color-ink)]">
          Your cart is empty
        </h3>
        <p className="mt-1 text-sm text-[color:var(--color-ink-secondary)]">
          Add a few items to get started.
        </p>
      </div>
      <button
        type="button"
        onClick={closeCart}
        className="btn-primary mt-2"
      >
        Continue shopping
      </button>
    </div>
  );
}
