import type { ReactNode } from "react";
import { AttributionHydrator } from "@/components/attribution/attribution-hydrator";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartLoginHandoff } from "@/components/cart/cart-login-handoff";
import { SiteHeader } from "@/components/layout/site-header";
import { getAttribution } from "@/lib/attribution/cookie";
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
 */
export async function ShopLayout({ children }: { children: ReactNode }) {
  const [cartHandoffPending, attribution] = await Promise.all([
    getCartHandoffPending(),
    getAttribution(),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {/* <SiteFooter /> — TBD */}
      <CartDrawer />
      <CartLoginHandoff pending={cartHandoffPending} />
      <AttributionHydrator attribution={attribution} />
    </div>
  );
}
