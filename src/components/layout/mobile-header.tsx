"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { CartTrigger } from "@/components/cart/cart-trigger";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { MobileSearchSheet } from "@/components/layout/mobile-search-sheet";
import { MenuIcon, SearchIcon } from "@/components/ui/icons";
import { SEARCH_BAR_SURFACE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Mobile-condensed site header.
 *
 * Replaces the desktop header on touch devices via the
 * `<SiteHeader>` switch. Footprint:
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │ [logo] [🔍 Search products…  ]  [☰]  [Cart]      │
 *   └──────────────────────────────────────────────────┘
 *
 * Layout choices:
 *
 *   - **Logo on the far left** anchors the brand at the same
 *     position it occupies in the desktop header.
 *   - **Search bar fills the middle** so the storefront's primary
 *     discovery affordance is always tappable — no hidden icon,
 *     no extra trip through a sub-menu.
 *   - **Hamburger + cart cluster on the right.** Both render as
 *     40×40 round buttons (`<CartTrigger>`'s `icon-bubble h-10 w-10`
 *     dictates the family) so the two icons line up visually
 *     pixel-for-pixel — same height, same hit area, same hover
 *     halo.
 *
 * Trade-offs vs. the desktop bar:
 *
 *   - **Search is a visible bar trigger, not a hidden icon.**
 *     The bar fills the row between the logo and the right-side
 *     cluster so the affordance reads as a real search input.
 *     Tapping it opens the full-height `<MobileSearchSheet>` for
 *     the actual typing experience — the OS keyboard gets a
 *     dedicated sheet built around it rather than overlaying the
 *     rest of the chrome.
 *   - **Categories drop the mega-menu.** The hamburger opens
 *     `<MobileNavDrawer>` whose nested-drawer drill-down replaces
 *     the desktop subcategory grid.
 *   - **Account collapses into the nav drawer.** Frees a tap-
 *     target's worth of space for the cart icon, which is the
 *     primary mobile conversion path.
 *   - **Favorites lives inside the nav drawer** when signed in
 *     (same reason — header real estate). Guests don't see it
 *     because the route's auth guard would just bounce them.
 *
 * Owning two pieces of state (`navOpen`, `searchOpen`) keeps this
 * file self-contained — the desktop header doesn't need to know
 * the mobile sheets exist.
 */
export interface MobileHeaderProps {
  /** Pre-fetched category taxonomy (already resolved server-side
   *  in `<SiteHeader>`). Passing the resolved list down avoids a
   *  client-side fetch just to render the nav drawer. */
  categories: readonly TaxonomyCategory[];
  /** Server-resolved auth state — gates the account section in
   *  the nav drawer between the guest CTA and the signed-in
   *  link stack. */
  isLoggedIn: boolean;
  /** Cart count snapshot for the trigger's accessible label. The
   *  trigger itself subscribes to the live store after hydration,
   *  so this just makes the first paint SSR-accurate. */
  initialCartCount: number;
  /** Storefront name used for the logo's `alt` + `aria-label`.
   *  Passed in rather than imported from `@/config/site`
   *  because that module touches server-only env vars that
   *  would blow up if pulled into a Client Component bundle. */
  siteName: string;
}

export function MobileHeader({
  categories,
  isLoggedIn,
  initialCartCount,
  siteName,
}: MobileHeaderProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header
        /* `desktop:hidden` is the inverse of the desktop header's
         * `touch:hidden`. Together they make the two headers
         * mutually exclusive at the CSS layer — no JS branch at
         * the SiteHeader level, no flicker between SSR and
         * hydration, no double-mount of CartTrigger / nav state.
         * The desktop branch picks up the desktop header, mobile
         * picks up this one. */
        className="sticky top-0 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] desktop:hidden"
        style={{ zIndex: "var(--z-header)" }}
      >
        <div className="flex h-14 items-center gap-2 px-3">
          <Link
            href="/"
            aria-label={siteName}
            className="flex shrink-0 items-center"
          >
            <Image
              src="/zepr-logo.svg"
              alt={siteName}
              width={36}
              height={36}
              priority
              className="h-9 w-9"
            />
          </Link>

          {/* Search-bar trigger.
           *
           * Wears the same resting visual as the desktop bar and
           * the mobile sheet's input — all three render
           * `SEARCH_BAR_SURFACE_CLASSES`, so the trigger that
           * launches the sheet and the input inside the sheet
           * look like the same field. Tapping just opens
           * `<MobileSearchSheet>`; the actual typing experience
           * lives there, with the OS keyboard docked against a
           * sheet that's built around the input. No focus on this
           * element, no inline suggestion modal, no race with the
           * keyboard. */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search products, brands, and more"
            aria-expanded={searchOpen}
            className={cn(
              SEARCH_BAR_SURFACE_CLASSES,
              "flex min-w-0 flex-1 items-center gap-2 px-4 text-left",
              "active:bg-[color:var(--color-bubble)]",
              "text-[color:var(--color-ink-muted)]",
            )}
          >
            <SearchIcon className="h-5 w-5 shrink-0 text-[color:var(--color-ink-secondary)]" />
            <span className="truncate">Search products, brands, and more</span>
          </button>

          {/* Right-side icon cluster — hamburger sits *before* the
           *  cart so the two round buttons read as a visual pair
           *  in the top-right corner, with the cart anchored to
           *  the screen edge. Both render at `h-10 w-10`: the cart
           *  is fixed by `<CartTrigger>`'s `icon-bubble h-10 w-10`,
           *  the hamburger matches it on purpose for a clean line
           *  of identical hit areas. */}
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-bubble)]"
          >
            <MenuIcon className="h-6 w-6" />
          </button>

          <CartTrigger initialCount={initialCartCount} />
        </div>
      </header>

      <MobileNavDrawer
        open={navOpen}
        onOpenChange={setNavOpen}
        categories={categories}
        isLoggedIn={isLoggedIn}
      />
      <MobileSearchSheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
    </>
  );
}
