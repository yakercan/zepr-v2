import Image from "next/image";
import Link from "next/link";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { AccountDropdown } from "@/components/layout/account-dropdown";
import { CategoriesDropdown } from "@/components/layout/categories-dropdown";
import { SearchBar } from "@/components/layout/search-bar";
import { BestSellersIcon, FireIcon, HeartIcon } from "@/components/ui/icons";
import { DEFAULT_CATEGORIES } from "@/config/categories";
import { site } from "@/config/site";
import { getTaxonomy } from "@/lib/salespace/taxonomy";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Site-wide header. Async server component — fetches the category
 * taxonomy at request time (cached for an hour at the edge via
 * Next's fetch cache) and renders the whole bar in one round.
 *
 * Background fades from translucent-blur to opaque-white on either
 * `:hover` of the header itself OR `:has(details[open])` when any
 * dropdown inside is open. The CSS lives in `.site-header` /
 * `globals.css` so the React tree stays state-free.
 *
 * Categories and Account both render via the same `<Dropdown>` —
 * single source of caret + click-outside + Escape behavior. Categories
 * uses `sideMode` to mount a subcategory grid in the right column when
 * a category row is hovered; Account uses the simple stacked layout.
 */
export async function SiteHeader() {
  const taxonomy = await getTaxonomy();
  const categories: readonly TaxonomyCategory[] =
    taxonomy?.categories?.length
      ? taxonomy.categories
      : DEFAULT_CATEGORIES;

  return (
    <header className="site-header sticky top-0 z-50 border-b border-[color:var(--color-border)]">
      <div className="page-container flex h-16 items-center gap-4">
        <Logo />

        <nav
          className="flex shrink-0 items-center gap-1"
          aria-label="Primary navigation"
        >
          <Link href="/search" className="header-nav-link">
            <BestSellersIcon className="text-[color:var(--color-ink)]" />
            <span className="text-[15px] font-semibold">Best Sellers</span>
          </Link>

          <Link
            href="/search?sort=hot_deals%3Adesc"
            className="header-nav-link"
          >
            <FireIcon className="text-[color:var(--color-ink)]" />
            <span className="text-[15px] font-semibold">Hot Deals</span>
          </Link>

          <CategoriesDropdown categories={categories} />
        </nav>

        <SearchBar />

        <div className="flex shrink-0 items-center gap-1">
          <Link href="/favorites" className="header-nav-link">
            <HeartIcon className="text-[color:var(--color-ink)]" />
            <span className="text-[15px] font-semibold">Favorites</span>
          </Link>

          <AccountDropdown />

          <CartTrigger />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Logo() {
  /* Square mark (orange tile + white "Zepr"). Same intrinsic asset
   * size on disk as the wordmark — the 1:1 aspect just renders tighter
   * in the header. Marked `priority` because it's above-the-fold on
   * every route. */
  return (
    <Link href="/" className="shrink-0" aria-label={site.name}>
      <Image
        src="/zepr-logo.svg"
        alt={site.name}
        width={40}
        height={40}
        priority
        className="h-10 w-10"
      />
    </Link>
  );
}

/**
 * Left-column category icon — always the local monochrome line SVG,
 * not the taxonomy's colorful CDN icon. See `getLineCategoryIcon`
 * for the rationale. Renders a neutral placeholder square when no
 * line icon is registered for the handle yet.
 */
