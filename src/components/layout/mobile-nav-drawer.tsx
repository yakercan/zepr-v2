"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Drawer } from "vaul";

import { useIsDesktop } from "@/components/device/device-provider";
import { CategoryLineIcon } from "@/components/layout/category-line-icon";
import {
  BestSellersIcon,
  ChevronRightIcon,
  CloseIcon,
  FireIcon,
} from "@/components/ui/icons";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { snapshotServerCartToStorage } from "@/lib/cart/store";
import type {
  TaxonomyCategory,
  TaxonomySubcategory,
} from "@/types/taxonomy";
import { cn } from "@/lib/utils";

/**
 * Mobile primary navigation drawer.
 *
 * Triggered by the hamburger button in `<MobileHeader>`. Slides
 * in from the **left** edge — the conventional hamburger pattern
 * — and stacks the storefront's top-level surfaces in a single
 * touch-friendly list:
 *
 *   • Best Sellers · Hot Deals          (quick links)
 *   • Categories…                       (entry to nested drawer)
 *   • Account: Sign in / Dashboard, etc.
 *   • Help: Contact · FAQs
 *
 * # Vaul nested drawers for category drill-down
 *
 * Tapping a category row in the top-level drawer doesn't navigate
 * straight to `/categories/<handle>` — it opens a **nested** Vaul
 * drawer (also left-anchored, stacked above the parent with the
 * parent scaled back a touch via Vaul's own background-scale
 * affordance). That second drawer shows:
 *
 *   • A "Back" affordance via Vaul's gesture (drag right) + an
 *     explicit close on the parent close
 *   • A "View all in <Category>" CTA
 *   • The subcategory list
 *
 * Two layers of physical depth makes the drill-down feel native
 * — same pattern Apple Music uses for artist → album, and the
 * shopper never loses the parent context (it's literally still
 * visible behind the nested drawer's panel).
 *
 * # Auth-aware account section
 *
 * The `isLoggedIn` prop comes from the server (resolved once in
 * `<SiteHeader>` and threaded down). Branching is purely
 * cosmetic — every account link in the guest list also bounces
 * unauthenticated traffic through `/account/login` server-side,
 * so the routes still land correctly when a guest taps "Orders".
 *
 * # Why a bare `Drawer.Root` (not the shared `<Sheet>` primitive)
 *
 * The shared primitive is bottom-only and doesn't expose Vaul's
 * `direction` / `NestedRoot` knobs — both of which we need here.
 * The styling is otherwise the same idiom (rounded outside edge,
 * `--color-surface` bg, hairline border) so visual consistency
 * is preserved by mirroring the design tokens rather than
 * factoring out a shared primitive that'd carry one consumer.
 */
export interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: readonly TaxonomyCategory[];
  isLoggedIn: boolean;
}

export function MobileNavDrawer({
  open,
  onOpenChange,
  categories,
  isLoggedIn,
}: MobileNavDrawerProps) {
  /* Same desktop short-circuit as `<Sheet>` — keeps the drawer
   * from holding stale `open` state if the shopper resizes from
   * mobile into desktop mid-session (or flips via the dev tools
   * `?device=` override). On desktop the whole subtree is
   * unmounted; no listeners, no portals, no risk of a hidden
   * drawer being stuck open behind the desktop chrome. */
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction="left"
    >
      <Drawer.Portal>
        <Drawer.Overlay
          className="fixed inset-0 bg-black/40"
          style={{ zIndex: "calc(var(--z-sheet) - 10)" }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{ zIndex: "var(--z-sheet)" }}
          className={cn(
            /* Left-anchored, full-height. Width clamps generously
             * so the list never gets squashed on phones and stays
             * usable on tablets without ballooning past a tap-and-
             * a-half. */
            "fixed inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col",
            "border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)]",
            "outline-none",
            "shadow-[12px_0_40px_-12px_rgba(0,0,0,0.18)]",
          )}
        >
          <NavHeader title="Menu" onClose={() => onOpenChange(false)} />
          {/* Description is purely for assistive tech — Radix
           *  Dialog (Vaul's underlying primitive) emits a warning
           *  when neither a `<Description>` nor an explicit
           *  `aria-describedby={undefined}` is wired, so we
           *  satisfy the contract with a single sr-only line. */}
          <Drawer.Description className="sr-only">
            Primary navigation menu
          </Drawer.Description>

          <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
            <NavSectionLabel>Browse</NavSectionLabel>
            <NavRow
              href="/search"
              onNavigate={() => onOpenChange(false)}
              icon={<BestSellersIcon className="text-[color:var(--color-ink)]" />}
              label="Best Sellers"
            />
            <NavRow
              href="/search?sort=hot_deals%3Adesc"
              onNavigate={() => onOpenChange(false)}
              icon={<FireIcon className="text-[color:var(--color-ink)]" />}
              label="Hot Deals"
            />

            <NavSectionLabel>Categories</NavSectionLabel>
            <CategoriesList
              categories={categories}
              onNavigate={() => onOpenChange(false)}
            />

            <NavSectionLabel>Account</NavSectionLabel>
            {isLoggedIn ? (
              <SignedInAccountList
                onNavigate={() => onOpenChange(false)}
              />
            ) : (
              <GuestAccountList onNavigate={() => onOpenChange(false)} />
            )}

            <NavSectionLabel>Help</NavSectionLabel>
            <NavRow
              href="/contact"
              onNavigate={() => onOpenChange(false)}
              label="Contact"
            />
            <NavRow
              href="/faq"
              onNavigate={() => onOpenChange(false)}
              label="FAQs"
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function NavHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
      <Drawer.Title className="text-base font-semibold text-[color:var(--color-ink)]">
        {title}
      </Drawer.Title>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-bubble)] hover:text-[color:var(--color-ink)]"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Section label                                                       */
/* ------------------------------------------------------------------ */

function NavSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-[color:var(--color-ink-muted)]">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Generic row                                                         */
/* ------------------------------------------------------------------ */

interface NavRowProps {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Tertiary affordance — usually a chevron-right for "drill in"
   *  rows or a small badge. */
  trailing?: ReactNode;
  /** Called after the link's `onClick` to close the drawer / let
   *  the caller capture analytics. The Link still navigates
   *  normally; we just signal the drawer to dismiss in parallel
   *  so the new page lands without a stale overlay. */
  onNavigate?: () => void;
}

function NavRow({
  href,
  label,
  icon,
  trailing,
  onNavigate,
}: NavRowProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        "text-[15px] text-[color:var(--color-ink)]",
        "transition-colors hover:bg-[color:var(--color-hover-strong)]",
      )}
    >
      {icon && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate font-medium">{label}</span>
      {trailing}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Categories — nested drawer drill-down                               */
/* ------------------------------------------------------------------ */

function CategoriesList({
  categories,
  onNavigate,
}: {
  categories: readonly TaxonomyCategory[];
  onNavigate: () => void;
}) {
  return (
    <ul>
      {categories.map((cat) => (
        <li key={cat.handle}>
          <CategoryDrillRow category={cat} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Single category row that opens a nested drawer with the
 * subcategory drill-down. Owns its own `open` state so each
 * category gets an independent nested-drawer lifecycle (Vaul
 * tracks them via React tree position, not a shared id).
 *
 * Empty subcategory lists collapse the chevron into a direct
 * link — there's nothing to drill into, so we just navigate to
 * the category page.
 */
function CategoryDrillRow({
  category,
  onNavigate,
}: {
  category: TaxonomyCategory;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const subcategories = category.subcategories ?? [];

  if (subcategories.length === 0) {
    /* No drill-down — render as a plain row that navigates to
     * the category page directly. Closing the parent drawer is
     * the same as any other nav row. */
    return (
      <NavRow
        href={`/categories/${category.handle}`}
        label={category.name}
        icon={<CategoryLineIcon handle={category.handle} size={20} />}
        onNavigate={onNavigate}
      />
    );
  }

  const viewAllHref = `/categories/${category.handle}`;

  return (
    <Drawer.NestedRoot
      open={open}
      onOpenChange={setOpen}
      direction="left"
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left",
          "text-[15px] text-[color:var(--color-ink)]",
          "transition-colors hover:bg-[color:var(--color-hover-strong)]",
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <CategoryLineIcon handle={category.handle} size={20} />
        </span>
        <span className="flex-1 truncate font-medium">
          {category.name}
        </span>
        <ChevronRightIcon className="h-4 w-4 text-[color:var(--color-ink-muted)]" />
      </button>

      <Drawer.Portal>
        <Drawer.Overlay
          className="fixed inset-0 bg-black/40"
          style={{ zIndex: "calc(var(--z-sheet) + 10)" }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{ zIndex: "calc(var(--z-sheet) + 20)" }}
          className={cn(
            "fixed inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col",
            "border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)]",
            "outline-none",
            "shadow-[12px_0_40px_-12px_rgba(0,0,0,0.18)]",
          )}
        >
          <Drawer.Title className="sr-only">
            {category.name}
          </Drawer.Title>
          <Drawer.Description className="sr-only">
            Browse subcategories within {category.name}.
          </Drawer.Description>

          <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--color-border)] px-2 py-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-bubble)] hover:text-[color:var(--color-ink)]"
            >
              {/* Mirror the chevron-right used in rows so the
               *  "back" affordance reads as the inverse motion. */}
              <ChevronRightIcon className="h-5 w-5 rotate-180" />
            </button>
            <CategoryLineIcon handle={category.handle} size={20} />
            <h3 className="flex-1 truncate text-base font-semibold text-[color:var(--color-ink)]">
              {category.name}
            </h3>
          </header>

          <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
            {/* "View all" entry — closes the nested drawer +
             *  parent drawer and lets the App Router push so
             *  layout doesn't full-reload. Distinct row styling
             *  (filled brand background) so it reads as the
             *  primary action vs. the subcategory list. */}
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigate();
                  router.push(viewAllHref);
                }}
                className="flex w-full items-center justify-between rounded-xl bg-[color:var(--color-brand)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-hover)]"
              >
                <span>View all in {category.name}</span>
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            <ul>
              {subcategories.map((sub) => (
                <li key={sub.id}>
                  <SubcategoryRow
                    sub={sub}
                    categoryHandle={category.handle}
                    onNavigate={() => {
                      setOpen(false);
                      onNavigate();
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}

const SUBCATEGORY_ICON_PX = 28;

function SubcategoryRow({
  sub,
  categoryHandle,
  onNavigate,
}: {
  sub: TaxonomySubcategory;
  categoryHandle: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={`/categories/${categoryHandle}?subcategory=${encodeURIComponent(sub.name)}`}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        "text-[15px] text-[color:var(--color-ink)]",
        "transition-colors hover:bg-[color:var(--color-hover-strong)]",
      )}
    >
      {sub.iconUrl ? (
        <ShimmerImage
          src={sub.iconUrl}
          width={SUBCATEGORY_ICON_PX}
          height={SUBCATEGORY_ICON_PX}
          className="object-contain"
          style={{
            width: SUBCATEGORY_ICON_PX,
            height: SUBCATEGORY_ICON_PX,
          }}
          skeletonRounded="full"
        />
      ) : (
        <span
          className="flex shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface-muted)] text-[10px] font-semibold text-[color:var(--color-ink-muted)]"
          style={{
            width: SUBCATEGORY_ICON_PX,
            height: SUBCATEGORY_ICON_PX,
          }}
          aria-hidden
        >
          {sub.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="flex-1 truncate font-medium">{sub.name}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

function GuestAccountList({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col">
      <div className="px-4 py-2">
        <Link
          href="/account/login"
          onClick={onNavigate}
          className="btn-primary w-full"
        >
          Sign in / Register
        </Link>
      </div>
      <NavRow
        href="/account/orders"
        label="Orders & Returns"
        onNavigate={onNavigate}
      />
    </div>
  );
}

function SignedInAccountList({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col">
      <NavRow
        href="/account"
        label="Dashboard"
        trailing={
          <span
            aria-hidden
            className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
          />
        }
        onNavigate={onNavigate}
      />
      <NavRow
        href="/account/orders"
        label="Orders & Returns"
        onNavigate={onNavigate}
      />
      <NavRow
        href="/account/addresses"
        label="My Addresses"
        onNavigate={onNavigate}
      />
      <NavRow
        href="/favorites"
        label="Favorites"
        onNavigate={onNavigate}
      />
      <div
        aria-hidden
        className="mx-4 my-1 border-t border-[color:var(--color-border)]"
      />
      <Link
        href="/account/logout"
        onClick={() => {
          /* Snapshot the server cart into local storage just
           * before the navigation tears down the JS context —
           * same handoff the desktop dropdown's logout row
           * runs. No-op in guest mode (the store has nothing
           * server-shaped to persist), so safe to call here
           * unconditionally. */
          snapshotServerCartToStorage();
          onNavigate();
        }}
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          "text-[15px] font-medium text-[color:var(--color-danger)]",
          "transition-colors hover:bg-[color:var(--color-hover-strong)]",
        )}
      >
        Logout
      </Link>
    </div>
  );
}
