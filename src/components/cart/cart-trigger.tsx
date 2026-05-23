"use client";

import { CartIcon } from "@/components/ui/icons";
import { openCart } from "@/lib/cart/drawer-store";
import { useCartCount } from "@/lib/cart/store";

/**
 * Header cart icon. Client component (the only one in the header
 * right-side cluster) because it needs to read the cart count and
 * open the drawer.
 *
 * The `<CartIcon>` itself already swaps between empty / 1-4 fruits;
 * we layer a numeric badge on top once the count exceeds the
 * four-fruit visual cap so users always see the real number.
 *
 * Why a `<button>` (not a `<Link href="/cart">`):
 *
 *   - Opening a drawer is an interaction, not navigation. The native
 *     element should match the semantics so screen readers announce
 *     "Cart, button" and the user knows it won't change the URL.
 *   - The legacy `/cart` route stays available for the keyboard-only
 *     "view full cart" flow — checkout link in the drawer footer
 *     covers that path too.
 */
export function CartTrigger() {
  const count = useCartCount();
  const showNumericBadge = count > 4;

  return (
    <button
      type="button"
      onClick={openCart}
      className="header-icon-button relative"
      aria-label={
        count === 0
          ? "Open cart, empty"
          : `Open cart, ${count} item${count === 1 ? "" : "s"}`
      }
    >
      <CartIcon itemCount={count} />
      {showNumericBadge && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-brand)] px-1 text-[10px] font-bold leading-none text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
