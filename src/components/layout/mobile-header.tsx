"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { CartTrigger } from "@/components/cart/cart-trigger";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { MobileSearchSheet } from "@/components/layout/mobile-search-sheet";
import { MenuIcon, SearchIcon } from "@/components/ui/icons";
import { SEARCH_BAR_SURFACE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { TaxonomyCategory } from "@/types/taxonomy";

const SEARCH_PLACEHOLDER = "Search products, brands, and more";

/**
 * Mobile-condensed site header.
 *
 * Replaces the desktop header on touch devices via the
 * `<SiteHeader>` switch. Footprint:
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │ [☰] [logo]  [🔍 Search products…  ] [Cart]       │
 *   └──────────────────────────────────────────────────┘
 *
 * Layout choices:
 *
 *   - **Hamburger on the far left** matches the conventional
 *     mobile nav pattern (Instagram, YouTube, Amazon).
 *   - **Logo next to the hamburger** keeps the brand anchored
 *     near the screen edge where the eye lands first.
 *   - **Search bar fills the middle** with a small extra gutter
 *     between it and the logo — that visual breathing room is
 *     what separates the brand cluster from the discovery
 *     surface.
 *   - **Cart on the far right.** Both the hamburger and the cart
 *     render as 44×44 round buttons on touch — the hamburger via
 *     a literal `h-11 w-11`, the cart via `<CartTrigger>`'s
 *     `touch:h-11 touch:w-11`. Two matched hit areas bookend
 *     the row.
 *
 * Trade-offs vs. the desktop bar:
 *
 *   - **Search is a visible bar trigger, not a hidden icon.**
 *     The bar fills the row between the logo and the cart so the
 *     affordance reads as a real search input. Tapping it opens
 *     the full-height `<MobileSearchSheet>` for the actual typing
 *     experience — the OS keyboard gets a dedicated sheet built
 *     around it rather than overlaying the rest of the chrome.
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
  /* `?q` from the current URL — mirrors what the desktop bar
   * shows in its input on a `/search?q=foo` page. The trigger
   * is a button (no editable input), so we just render the
   * value as the label: shoppers see *what they searched for*
   * in the bar at all times, and tapping it opens the sheet
   * with the same value pre-filled (`<MobileSearchSheet>` reads
   * the same hook). */
  const urlQuery = useSearchParams().get("q") ?? "";

  return (
    <>
      <header
        /* `xl-desktop:hidden` is the inverse of the desktop header's
         * `hidden xl-desktop:block`. Together they make the two headers
         * mutually exclusive at the CSS layer (correct on first paint,
         * no JS branch at the SiteHeader level) — no double-mount of
         * CartTrigger / nav state. This header shows unless the viewport
         * is ≥1280px AND driven by a desktop pointer, so a touch tablet
         * in landscape keeps the mobile header at any width. */
        className="sticky top-0 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] xl-desktop:hidden"
        style={{ zIndex: "var(--z-header)" }}
      >
        <div className="flex h-14 items-center gap-2 px-3">
          {/* Hamburger — left-anchored per conventional mobile
           *  nav pattern. 44×44 hit area (Apple/Material's
           *  recommended floor) matches `<CartTrigger>`'s
           *  touch-bumped size on the far right so the row's two
           *  bookend buttons read as the same size. */}
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-bubble)]"
          >
            <MenuIcon className="h-7 w-7" />
          </button>

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
           * keyboard.
           *
           * `ml-1` adds a hair of breathing room past the standard
           * `gap-2`, separating the brand cluster (hamburger +
           * logo) from the discovery surface. The right-side
           * boundary still uses the row gap, so the bar sits a
           * bit closer to the cart than the logo — that asymmetry
           * is intentional and matches what the eye reads as "two
           * groups with a primary action between them". */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={urlQuery ? `Search: ${urlQuery}` : SEARCH_PLACEHOLDER}
            aria-expanded={searchOpen}
            className={cn(
              SEARCH_BAR_SURFACE_CLASSES,
              "ml-2 flex min-w-0 flex-1 items-center gap-2 px-4 text-left",
              /* Label colour follows desktop's placeholder-vs-value
               * convention: muted grey when we're rendering the
               * placeholder, full ink when a real query is on
               * screen. The eye reads it the same way it reads the
               * desktop input. */
              urlQuery
                ? "text-[color:var(--color-ink)]"
                : "text-[color:var(--color-ink-muted)]",
            )}
          >
            <SearchIcon className="h-5 w-5 shrink-0 text-[color:var(--color-ink-secondary)]" />
            <span className="truncate">{urlQuery || SEARCH_PLACEHOLDER}</span>
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
