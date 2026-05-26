import type { ReactNode } from "react";
import { Suspense } from "react";
import { ShopifyAnalytics } from "@/components/analytics/shopify-analytics";
import { AttributionHydrator } from "@/components/attribution/attribution-hydrator";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartLoginHandoff } from "@/components/cart/cart-login-handoff";
import { CartMetaHydrator } from "@/components/cart/cart-meta-hydrator";
import { BfcacheRefresh } from "@/components/layout/bfcache-refresh";
import { SiteHeader } from "@/components/layout/site-header";
import { env } from "@/env";
import { getAttribution } from "@/lib/attribution/cookie";
import { getAuthState } from "@/lib/auth/session";
import { getCartHandoffPending } from "@/lib/cart/cookie";

/**
 * Top-level layout shell. Wraps every page below the device gate.
 *
 * Mount order matters here:
 *
 *   - `<SiteHeader>` is sticky at `z-50`.
 *   - `<main>` is the document flow.
 *   - `<CartDrawer>` lives at the bottom so its portaled backdrop +
 *     panel sit at the end of the DOM. That keeps the stacking
 *     context predictable (portal escapes the layout tree entirely,
 *     so the order here is mostly for human reading) and means the
 *     drawer can be opened from anywhere via `openCart()` without
 *     prop drilling.
 *   - `<CartLoginHandoff pending={…}>` is the post-OAuth cart-merge
 *     listener. The signal is the `__Host-zepr_cart_handoff` cookie
 *     read server-side here — no `useSearchParams`, no Suspense
 *     boundary, no transient `?cart_handoff=1` flash in the URL.
 *     Renders nothing on the page; runs a side effect once after
 *     hydration when the flag is on.
 *   - `<AttributionHydrator>` seeds the client attribution store
 *     from the SSR-resolved cookie. The middleware writes the
 *     cookie on UTM landings; this hydrator mirrors it into the
 *     client store so Buy Now buttons and guest checkout URLs
 *     attach the same `_utm_*` payload the server stamps on the
 *     Shopify cart. Re-renders on every navigation pick up any
 *     fresh capture without us touching the route.
 *   - `<CartMetaHydrator>` primes `mode` + `checkoutDomain` in
 *     the cart store on the first frame, ahead of the full
 *     `<CartHydrator>` in the header (which has to await a
 *     Shopify cart fetch for logged-in shoppers). This makes the
 *     Buy Now permalink and guest checkout URL work even if the
 *     shopper clicks before the header finishes streaming —
 *     otherwise the domain would be `undefined` and the
 *     resulting URL would 404.
 *   - `<ShopifyAnalytics>` is the analytics root: hydrates the
 *     provider config with the shop id, sets the Shopify visitor
 *     + session cookies, and emits a `PAGE_VIEW` on every URL
 *     change. Resource-specific events (product / collection /
 *     search / add-to-cart) layer on top from their own surfaces
 *     — see `src/lib/analytics/events.ts`. Wrapped in `<Suspense>`
 *     because it touches `useSearchParams()` for query-aware
 *     page-views; the boundary keeps Next from forcing the
 *     entire layout into a dynamic render.
 *   - `<BfcacheRefresh>` handles the browser back/forward cache
 *     scenario — when a shopper returns from Shopify checkout
 *     via the back button, the page is restored from bfcache
 *     with frozen data. This island calls `router.refresh()` so
 *     every server component re-streams fresh. One central fix
 *     for the whole tree; nothing else needs to know about
 *     bfcache.
 */
export async function ShopLayout({ children }: { children: ReactNode }) {
  /* Fast-path layout reads — all three are cookie-only and
   * `cache()`-memoised, so this `Promise.all` resolves in
   * sub-millisecond. The slow Shopify cart fetch happens inside
   * `<SiteHeader>` and only blocks the header itself, not the
   * meta hydration mounted here. */
  const [cartHandoffPending, attribution, authState] = await Promise.all([
    getCartHandoffPending(),
    getAttribution(),
    getAuthState(),
  ]);

  /* Checkout subdomain — server-only env. Prefer the dedicated
   * `checkout.<domain>` when set, fall back to the storefront
   * host (Shopify accepts the same `/cart/<variant>:<qty>`
   * permalink shape on both). Passed to `<CartMetaHydrator>`
   * as a literal string prop. */
  const checkoutDomain =
    env.SHOPIFY_CHECKOUT_DOMAIN ?? env.SHOPIFY_STOREFRONT_DOMAIN;
  const mode: "guest" | "server" = authState.isLoggedIn ? "server" : "guest";

  return (
    <div className="flex min-h-full flex-col">
      <CartMetaHydrator mode={mode} checkoutDomain={checkoutDomain} />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {/* <SiteFooter /> — TBD */}
      <CartDrawer />
      <CartLoginHandoff pending={cartHandoffPending} />
      <AttributionHydrator attribution={attribution} />
      <Suspense fallback={null}>
        <ShopifyAnalytics shopId={env.SHOPIFY_SHOP_ID} />
      </Suspense>
      <BfcacheRefresh />
    </div>
  );
}
