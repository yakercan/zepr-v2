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
 *   - There's no `/cart` route in v2 — the drawer + Shopify-hosted
 *     checkout cover the full flow. The drawer's footer Checkout
 *     CTA owns the keyboard path to checkout.
 */
export function CartTrigger({ initialCount = 0 }: { initialCount?: number }) {
  const hydrated = useHydrated();
  const liveCount = useCartCount();
  const count = hydrated ? liveCount : initialCount;

  return (
    <button
      type="button"
      onClick={openCart}
      className="icon-bubble icon-bubble-no-tint h-10 w-10"
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
