import type { ReactNode } from "react";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartLoginHandoff } from "@/components/cart/cart-login-handoff";
import { SiteHeader } from "@/components/layout/site-header";
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
 */
export async function ShopLayout({ children }: { children: ReactNode }) {
  const cartHandoffPending = await getCartHandoffPending();

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {/* <SiteFooter /> — TBD */}
      <CartDrawer />
      <CartLoginHandoff pending={cartHandoffPending} />
    </div>
  );
}
