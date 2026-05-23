import type { ReactNode } from "react";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { SiteHeader } from "@/components/layout/site-header";

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
 */
export function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {/* <SiteFooter /> — TBD */}
      <CartDrawer />
    </div>
  );
}
