"use client";

import Link from "next/link";
import { closeCart } from "@/lib/cart/drawer-store";
import { cn } from "@/lib/utils";

/**
 * Empty-state body for the cart — shared by the drawer and the
 * `/cart` page. Same copy + visual rhythm on both surfaces;
 * "Continue shopping" branches by `mode`:
 *
 *   - **`drawer`** (default) → dismisses the overlay so the
 *     shopper lands back on whatever page they were already on,
 *     no URL change. The drawer body is a tall flex column, so
 *     the container claims `h-full flex-1` to vertically centre
 *     the message inside it.
 *   - **`page`** → routes to the homepage. The empty state sits
 *     inside a `PANEL_SURFACE_THIN` card on the cart page, which
 *     has its own natural height, so the container drops the
 *     `h-full flex-1` and just pads + centres.
 *
 * Copy-only — no decorative bag icon. The drawer's header already
 * shows the cart context ("Your cart"), and the page's `<h1>`
 * does the same; a second glyph here would add visual weight the
 * empty state doesn't need.
 */
export interface CartEmptyProps {
  mode?: "drawer" | "page";
}

export function CartEmpty({ mode = "drawer" }: CartEmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        /* Drawer-only sizing: the parent body is a tall flex
         * column with `min-h-0 flex-1`, so the empty state claims
         * the full height and centres vertically. On the page,
         * the card surface frames the message at its natural
         * height — no fill behaviour wanted. */
        mode === "drawer" && "h-full flex-1",
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-[color:var(--color-ink)]">
          Your cart is empty
        </h3>
        <p className="mt-1 text-sm text-[color:var(--color-ink-secondary)]">
          Add a few items to get started.
        </p>
      </div>
      {mode === "drawer" ? (
        <button
          type="button"
          onClick={closeCart}
          className="btn-primary mt-2"
        >
          Continue shopping
        </button>
      ) : (
        <Link href="/" className="btn-primary mt-2">
          Continue shopping
        </Link>
      )}
    </div>
  );
}
