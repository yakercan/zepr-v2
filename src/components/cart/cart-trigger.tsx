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
 * The `<CartIcon>` itself already swaps between empty / 1-4 fruits;
 * we layer a numeric badge on top once the count exceeds the
 * four-fruit visual cap so users always see the real number.
 *
 * SSR-correct count on first paint for logged-in users —
 * `<SiteHeader>` resolves the Shopify cart server-side and forwards
 * the resulting `totalQuantity` as `initialCount`. Until React
 * hydration completes we render that prop; once hydrated we
 * subscribe to the client cart store for live updates. Mirrors the
 * `<FavoritesBadge>` pattern — same `useHydrated()` gate, same
 * "no empty-flash on first paint" guarantee.
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
  const showNumericBadge = count > 4;

  return (
    <button
      type="button"
      onClick={openCart}
      className="icon-bubble icon-bubble-no-tint relative h-10 w-10"
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
