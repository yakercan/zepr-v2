import Image from "next/image";
import Link from "next/link";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import {
  BestSellersIcon,
  CartIcon,
  CategoriesIcon,
  HeartIcon,
  SearchIcon,
  UserIcon,
  ZeprIcon,
  ZEPR_ICONS,
} from "@/components/ui/icons";
import { DEFAULT_CATEGORIES, type NavCategory } from "@/config/categories";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Site-wide header. Pure server component — no React state lives here.
 *
 * Background fades from translucent-blur to opaque-white on either
 * `:hover` of the header itself OR `:has(details[open])` when any
 * dropdown inside is open. The CSS lives in `.site-header` /
 * `globals.css` so the React tree stays state-free.
 *
 * Categories and Account both render via the same `<Dropdown>` —
 * single source of caret + click-outside + Escape behavior. Easy to
 * add a third (Language, Currency, …) by dropping in another
 * `<Dropdown>` with new content.
 */
export function SiteHeader({
  categories = DEFAULT_CATEGORIES,
}: {
  categories?: readonly NavCategory[];
}) {
  return (
    <header className="site-header sticky top-0 z-50 border-b border-[color:var(--color-border)]">
      <div className="mx-auto flex h-16 max-w-[var(--page-max-px)] items-center gap-4 px-6">
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
            <ZeprIcon src={ZEPR_ICONS.fireBlack} size={20} alt="" />
            <span className="text-[15px] font-semibold">Hot Deals</span>
          </Link>

          <CategoriesDropdown categories={categories} />
        </nav>

        <SearchBarStub />

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/account/wishlist"
            className="header-icon-button"
            aria-label="Wishlist"
          >
            <HeartIcon />
          </Link>

          <AccountDropdown />

          <Link
            href="/cart"
            className="header-icon-button"
            aria-label="Cart"
          >
            <CartIcon />
            {/* badge slot — wired up when the cart store lands */}
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Logo() {
  return (
    <Link href="/" className="shrink-0" aria-label={site.name}>
      <Image
        src="/zepr-wordmark.svg"
        alt={site.name}
        width={88}
        height={40}
        priority
        className="h-10 w-auto"
      />
    </Link>
  );
}

function CategoriesDropdown({
  categories,
}: {
  categories: readonly NavCategory[];
}) {
  return (
    <Dropdown
      trigger={
        <>
          <CategoriesIcon className="text-[color:var(--color-ink)]" />
          <span className="text-[15px] font-semibold">Categories</span>
        </>
      }
      panelClassName="grid w-[34rem] grid-cols-2 gap-1 p-2"
    >
      {categories.map((cat) => (
        <DropdownItem
          key={cat.handle}
          href={`/collections/${cat.handle}`}
          icon={
            <Image
              src={cat.icon}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5"
            />
          }
        >
          {cat.title}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

function AccountDropdown() {
  return (
    <Dropdown
      align="right"
      panelClassName="w-[14rem] p-1.5"
      triggerClassName="header-icon-trigger"
      ariaLabel="Account"
      trigger={<UserIcon />}
    >
      <DropdownItem href="/account/sign-in">Sign in</DropdownItem>
      <DropdownItem href="/account">My account</DropdownItem>
      <DropdownItem href="/account/orders">Orders</DropdownItem>
      <DropdownItem href="/account/wishlist">Wishlist</DropdownItem>
      <div className="my-1.5 h-px bg-[color:var(--color-border)]" />
      <DropdownItem href="/help">Help</DropdownItem>
    </Dropdown>
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
