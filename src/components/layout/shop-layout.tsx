import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Top-level layout shell. Wraps every page below the device gate.
 * Header is sticky; the page content sits below it directly — no
 * spacer needed because the header is part of the document flow,
 * not absolutely positioned.
 */
export function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {/* <SiteFooter /> — TBD */}
      {/* <CartDrawer /> — TBD */}
    </div>
  );
}
