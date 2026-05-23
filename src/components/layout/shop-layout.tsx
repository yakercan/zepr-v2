import type { ReactNode } from "react";

/**
 * Top-level layout shell. Wraps every page below the device gate.
 * Right now it's a thin frame with just `<main>`; the header, footer,
 * and cart drawer will be slotted in here as they're built.
 */
export function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {/* <SiteHeader /> — added in the next step */}
      <main className="flex-1">{children}</main>
      {/* <SiteFooter /> — TBD */}
      {/* <CartDrawer /> — TBD */}
    </div>
  );
}
