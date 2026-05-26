import Image from "next/image";
import Link from "next/link";
import { CartHydrator } from "@/components/cart/cart-hydrator";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { AccountDropdown } from "@/components/layout/account-dropdown";
import { CategoriesDropdown } from "@/components/layout/categories-dropdown";
import { FavoritesBadge } from "@/components/layout/favorites-badge";
import { SearchBar } from "@/components/layout/search-bar";
import { BestSellersIcon, FireIcon } from "@/components/ui/icons";
import { DEFAULT_CATEGORIES } from "@/config/categories";
import { site } from "@/config/site";
import { env } from "@/env";
import { getAuthState } from "@/lib/auth/session";
import { getCurrentCart } from "@/lib/cart/queries";
import { getCurrentFavoritedIds } from "@/lib/favorites/queries";
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
  /* Fan-out every server read in parallel — taxonomy is the heavy
   * one (Salespace category tree, cached an hour at the fetch
   * boundary). Favorites + auth + cart are small per-request
   * lookups, already memoised via `cache()` so other server
   * surfaces that need the same data don't re-fetch. The cart
   * read short-circuits for guests inside `getCurrentCart` — no
   * Shopify round-trip when there's nothing to fetch. */
  const [taxonomy, favoritedIds, authState, initialCart] = await Promise.all([
    getTaxonomy(),
    getCurrentFavoritedIds(),
    getAuthState(),
    getCurrentCart(),
  ]);
  const categories: readonly TaxonomyCategory[] =
    taxonomy?.categories?.length
      ? taxonomy.categories
      : DEFAULT_CATEGORIES;

  /* Hosted checkout subdomain for guest carts. Prefer the
   * dedicated checkout domain when set; fall back to the
   * storefront's `.myshopify.com` host (Shopify accepts the same
   * `/cart/<variant>:<qty>` permalink shape on both). */
  const checkoutDomain =
    env.SHOPIFY_CHECKOUT_DOMAIN ?? env.SHOPIFY_STOREFRONT_DOMAIN;

  return (
    <header className="site-header sticky top-0 z-50 border-b border-[color:var(--color-border)]">
      <div className="page-container flex h-16 items-center gap-4">
        <Logo />

        <nav
          // `self-stretch` so the nav fills the header row's
          // full height. Its `<details>` dropdown child then
          // stretches against the nav (also `self-stretch`),
          // which lets the dropdown panel anchor cleanly to the
          // header's bottom edge via `top-full` — no hand-tuned
          // offset needed.
          className="flex shrink-0 items-center gap-1 self-stretch"
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

        {/* Same `self-stretch` trick as the nav above — lets the
         *  AccountDropdown's `<details>` reach the header's
         *  bottom edge so its panel sits flush. */}
        <div className="flex shrink-0 items-center gap-1 self-stretch">
          <Link href="/favorites" className="header-nav-link">
            {/* Wrap the label + badge in their own flex so the
             *  parent header-nav-link `gap-2` stays an icon-to-text
             *  rule and doesn't push the badge away from the
             *  word. With one direct child the parent gap has
             *  nothing to space against. */}
            <span className="inline-flex items-center">
              <span className="text-[15px] font-semibold">Favorites</span>
              <FavoritesBadge initialIds={favoritedIds} />
            </span>
          </Link>

          <AccountDropdown />

          <CartTrigger initialCount={initialCart?.totalQuantity ?? 0} />
          <CartHydrator
            mode={authState.isLoggedIn ? "server" : "guest"}
            initialCart={initialCart}
            checkoutDomain={checkoutDomain}
          />
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
