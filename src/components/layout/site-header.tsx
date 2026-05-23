import Image from "next/image";
import Link from "next/link";
import { AccountDropdown } from "@/components/layout/account-dropdown";
import { SubcategoryGrid } from "@/components/layout/subcategory-grid";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import {
  BestSellersIcon,
  CartIcon,
  CategoriesIcon,
  FireIcon,
  HeartIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { DEFAULT_CATEGORIES, getLineCategoryIcon } from "@/config/categories";
import { site } from "@/config/site";
import { getTaxonomy } from "@/lib/salespace/taxonomy";
import { cn } from "@/lib/utils";
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

        <SearchBarStub />

        <div className="flex shrink-0 items-center gap-1">
          <Link href="/favorites" className="header-nav-link">
            <HeartIcon className="text-[color:var(--color-ink)]" />
            <span className="text-[15px] font-semibold">Favorites</span>
          </Link>

          <AccountDropdown />

          <CartLink itemCount={0} />
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

function CategoriesDropdown({
  categories,
}: {
  categories: readonly TaxonomyCategory[];
}) {
  return (
    <Dropdown
      sideMode
      panelClassName="w-[48rem]"
      mainColumnClassName="w-[16rem] shrink-0 py-2 pl-1.5 pr-1.5"
      sidePanelClassName="min-h-[22rem] p-5"
      trigger={
        <>
          <CategoriesIcon className="text-[color:var(--color-ink)]" />
          <span className="text-[15px] font-semibold">Categories</span>
        </>
      }
    >
      {categories.map((cat) => (
        <DropdownItem
          key={cat.handle}
          itemKey={cat.handle}
          href={`/collections/${cat.handle}`}
          icon={<CategoryLineIcon handle={cat.handle} />}
          sidePanel={<SubcategoryGrid category={cat} />}
        >
          {cat.name}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

/**
 * Left-column category icon — always the local monochrome line SVG,
 * not the taxonomy's colorful CDN icon. See `getLineCategoryIcon`
 * for the rationale. Renders a neutral placeholder square when no
 * line icon is registered for the handle yet.
 */
function CategoryLineIcon({ handle }: { handle: string }) {
  const src = getLineCategoryIcon(handle);
  if (!src) {
    return (
      <span className="inline-block h-5 w-5 rounded bg-[color:var(--color-search)]" />
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 object-contain"
    />
  );
}

/**
 * Cart trigger. Pure server component for now — it accepts a count
 * prop so when the real cart source (cookie + Storefront API or a
 * lightweight client store) lands, only the call site changes. The
 * `<CartIcon>` itself handles all visual variants (empty / 1-4
 * fruits) and a small numeric badge appears once the count exceeds
 * the four-fruit max so the user still sees the real number.
 */
function CartLink({ itemCount }: { itemCount: number }) {
  const showBadge = itemCount > 0;
  return (
    <Link
      href="/cart"
      className="header-icon-button relative"
      aria-label={
        itemCount === 0
          ? "Cart, empty"
          : `Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`
      }
    >
      <CartIcon itemCount={itemCount} />
      {showBadge && itemCount > 4 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-brand)] px-1 text-[10px] font-bold leading-none text-white"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </Link>
  );
}

/**
 * Placeholder search bar — visual only. Wires up to the real search
 * route + suggestions when we build the search step.
 */
function SearchBarStub() {
  return (
    <form
      action="/search"
      method="get"
      className={cn(
        "relative mx-auto flex h-10 min-w-0 max-w-2xl flex-1 items-center rounded-full",
        "bg-[color:var(--color-search)] transition-colors hover:bg-[color:var(--color-search-hover)] focus-within:bg-white focus-within:ring-2 focus-within:ring-[color:var(--color-brand-border)]",
      )}
    >
      <SearchIcon className="ml-3.5 text-[color:var(--color-ink-secondary)]" />
      <input
        name="q"
        type="search"
        placeholder="Search products, brands, and more"
        className="h-full flex-1 bg-transparent px-3 text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-muted)] outline-none"
        autoComplete="off"
      />
    </form>
  );
}
