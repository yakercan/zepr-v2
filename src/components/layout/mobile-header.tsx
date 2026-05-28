"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { CartTrigger } from "@/components/cart/cart-trigger";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { MobileSearchSheet } from "@/components/layout/mobile-search-sheet";
import { MenuIcon, SearchIcon } from "@/components/ui/icons";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Mobile-condensed site header.
 *
 * Replaces the desktop header on touch devices via the
 * `<SiteHeader>` switch. Footprint:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ [☰]   [Zepr logo]              [🔍] [Cart]  │
 *   └─────────────────────────────────────────────┘
 *
 * Trade-offs vs. the desktop bar:
 *
 *   - **Search is hidden behind a tap.** The full-screen
 *     `<MobileSearchSheet>` is a better surface than a always-
 *     visible 60px-wide input — and lets us hand the OS keyboard
 *     a sheet built around it rather than forcing it to overlay
 *     the rest of the chrome.
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
        <div className="flex h-14 items-center gap-1 px-3">
          {/* Hamburger — left-anchored per conventional mobile
           *  nav pattern. Square tap target so the icon centers
           *  exactly between the screen edge and the next item. */}
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-bubble)]"
          >
            <MenuIcon className="h-6 w-6" />
          </button>

          <Link
            href="/"
            aria-label={siteName}
            className="ml-1 flex shrink-0 items-center"
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

          {/* Flexible spacer so the right-side cluster always
           *  hugs the screen edge regardless of the logo's exact
           *  width. */}
          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            aria-expanded={searchOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-bubble)]"
          >
            <SearchIcon className="h-5 w-5" />
          </button>

          {/* Cart — same `<CartTrigger>` the desktop header uses.
           *  The trigger renders its own bubble + icon swap based
           *  on the cart-count store, so mobile gets the exact
           *  same conversion affordance without a separate
           *  primitive. */}
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
