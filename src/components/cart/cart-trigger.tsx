"use client";

import { CartIcon } from "@/components/ui/icons";
import { openCart } from "@/lib/cart/drawer-store";
import { useCartCount } from "@/lib/cart/store";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/**
 * Header cart icon. Client component (the only one in the header
 * right-side cluster) because it needs to read the cart count and
 * open the drawer.
 *
 * Visual cue is the `<CartIcon>` itself — it swaps art between
 * empty / 1-4 fruits as items accumulate. No separate numeric
 * badge layered on the icon: the canonical count lives in the
 * drawer header (`<CartBadge>`), which is the only surface that
 * needs to read the literal number. Keeping the trigger
 * iconographic + the drawer numeric draws a cleaner line between
 * "where you click" and "where you see the count".
 *
 * The `initialCount` prop is still threaded for accessibility —
 * the `aria-label` reads "Open cart, N items" on first paint
 * (SSR-correct for logged-in shoppers via `getCurrentCart()` in
 * `<SiteHeader>`), then live-updates from the cart store after
 * hydration. Same pattern as `<FavoritesBadge>`.
 *
 * Why a `<button>` (not a `<Link href="/cart">`):
 *
 *   - Opening a drawer is an interaction, not navigation. The native
 *     element should match the semantics so screen readers announce
 *     "Cart, button" and the user knows it won't change the URL.
 *   - The drawer is the high-conversion primary path (one click,
 *     sticky-footer Checkout). The `/cart` route exists as a
 *     secondary surface for direct navigation (URL bar, bookmarks,
 *     share links) — not the default click target.
 */
export function CartTrigger({ initialCount = 0 }: { initialCount?: number }) {
  const hydrated = useHydrated();
  const liveCount = useCartCount();
  const count = hydrated ? liveCount : initialCount;

  return (
    <button
      type="button"
      onClick={openCart}
      /* h-10 on desktop, h-11 on mobile. The mobile header pairs
       * this trigger with a hamburger button — bumping the touch
       * size to 44px gives the cluster a more confident footprint
       * on phones (and matches the Apple/Material 44px tap-target
       * floor) while keeping the desktop header's denser chrome
       * untouched. */
      className="icon-bubble icon-bubble-no-tint h-10 w-10 touch:h-11 touch:w-11"
      aria-label={
        count === 0
          ? "Open cart, empty"
          : `Open cart, ${count} item${count === 1 ? "" : "s"}`
      }
    >
      <CartIcon itemCount={count} />
    </button>
  );
}
