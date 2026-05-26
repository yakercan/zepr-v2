"use client";

import { useEffect, useState } from "react";

import { CartBadge } from "@/components/cart/cart-badge";
import { CartEmpty } from "@/components/cart/cart-empty";
import { CartFooter } from "@/components/cart/cart-footer";
import { CartLineRow } from "@/components/cart/cart-line-row";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import {
  useCartLines,
  useCartPending,
  useCartSubtotalCents,
} from "@/lib/cart/store";
import type { Cart } from "@/lib/shopify/cart";
import { PANEL_SURFACE_THIN_CLASSES } from "@/lib/styles";
import type { CartLine } from "@/types/cart";
import { cn } from "@/lib/utils";

/**
 * `/cart` page body — full reuse of the drawer's parts, just
 * laid out as a page:
 *
 *   - `<CartLineRow>` for each line (same component the drawer
 *     uses, including the optimistic quantity stepper, trash
 *     button, and discounted-strike compare-at).
 *   - `<CartFooter>` for the free-shipping progress + subtotal +
 *     Checkout CTA. The footer is surface-agnostic (no chrome of
 *     its own) so we wrap it in a `PANEL_SURFACE_THIN` card here
 *     and the drawer wraps it as a sticky footer with `border-t`
 *     — same content, surface-appropriate frame.
 *   - `<CartEmpty mode="page">` for the empty-cart state, routing
 *     "Continue shopping" to `/` (the drawer variant dismisses
 *     itself instead — different action verb, same copy).
 *   - `<LoadingOverlay>` over the lines panel during in-flight
 *     mutations, matching the drawer's "no flicker on edit" feel.
 *
 * Layout:
 *
 *   md+:
 *     ┌─ title ─────────────────────────────────────────────┐
 *     │ Your cart  [3]                                      │
 *     ├────────────────────────────┬────────────────────────┤
 *     │ ┌─── lines (panel) ─────┐  │  ┌── summary ──┐       │
 *     │ │ row 1  · · · ·  $X    │  │  │ free-ship   │       │
 *     │ │ row 2  · · · ·  $Y    │  │  │ subtotal $Z │       │
 *     │ │ row 3  · · · ·  $W    │  │  │ Checkout    │       │
 *     │ └───────────────────────┘  │  └─────────────┘       │
 *     └────────────────────────────┴────────────────────────┘
 *
 *   < md: single column — lines panel above, summary card below.
 *
 *   Summary is `md:sticky md:top-20` so as the shopper scrolls
 *   through a long line list the checkout CTA stays in view. The
 *   sticky context releases when the grid row ends (column
 *   matches the row's height), so the summary never overlaps
 *   anything below the page.
 *
 * Visual frame for each block uses `PANEL_SURFACE_THIN_CLASSES`
 * (rounded-2xl, soft border, white surface) — same dialect the
 * account dashboard / order detail panels speak, so the cart
 * page slots into the rest of the customer-facing chrome
 * without introducing a new card style.
 *
 * # SSR / hydration handoff
 *
 * The cart store can't legally surface its real lines through
 * SSR — its server snapshot is `EMPTY`, and a naive client-only
 * read would therefore paint "Your cart is empty" for one frame
 * on every reload (even for a logged-in shopper with a full
 * cart) before the store-fed re-render swaps the real lines in.
 * That's a visible "empty → filled" flash.
 *
 * Handoff resolves that:
 *
 *   1. The server page (`/cart/page.tsx`) fetches the cart via
 *      `getCurrentCart()` and passes it down as `initialCart`.
 *   2. Through SSR + the first client render we ignore the store
 *      and render `initialCart` directly — HTML matches, no
 *      flash, real lines on first paint for signed-in shoppers.
 *   3. A mount-only `useEffect` flips an internal `mounted`
 *      flag; from the next render on the store wins and the page
 *      tracks every mutation live.
 *
 * Why an effect-driven flag instead of `useHydrated()`: this
 * component sits inside Next.js's streamed per-segment Suspense
 * boundary (`<LoadingBoundary name="cart/" />`). React 19's
 * `useSyncExternalStore` doesn't reliably return its server
 * snapshot during a streamed sub-tree's hydration commit — by
 * the time the chunk lands the outer app is already past its
 * hydration phase, so the hook switches straight to its client
 * snapshot and the "pre-hydration vs post-hydration" handoff
 * collapses into one render with stale data, producing
 * mismatch warnings against the SSR HTML. `useState(false)` +
 * `useEffect(setMounted(true))` doesn't have that failure mode:
 * the initial render is honest about render-vs-mount no matter
 * where in the tree we are, and effects fire strictly after
 * every initial render + commit (including `<CartHydrator>`'s
 * render-time store seed in the header) has settled.
 *
 * Guests have no server cart (no session = `initialCart === null`).
 * Through the same window we render `<CartPageSkeleton>` — a
 * shimmer that mirrors the eventual layout, so the page chrome
 * doesn't reshape when `localStorage` reveals real lines on the
 * post-mount render. Better one frame of skeleton than one frame
 * of "empty cart" copy for a shopper who actually has items
 * saved.
 */
export interface CartPageBodyProps {
  /** Server-fetched cart for SSR / first-commit rendering.
   *  `null` for guests and signed-in shoppers without a cart
   *  cookie — the body falls back to a skeleton through the
   *  hydration window in that case rather than risking a
   *  speculative empty-state paint. */
  initialCart: Cart | null;
}

export function CartPageBody({ initialCart }: CartPageBodyProps) {
  const storeLines = useCartLines();
  const storeSubtotal = useCartSubtotalCents();
  const pending = useCartPending();

  /* `mounted` controls the SSR-vs-live handoff. See `<CartBadge>`'s
   * doc block for the full reasoning — short version: the `/cart`
   * page renders inside a streamed Next.js Suspense boundary, and
   * `useSyncExternalStore` (which `useHydrated()` wraps) doesn't
   * reliably return its server snapshot during the sub-tree's
   * hydration commit. `useState(false)` + a mount-only `useEffect`
   * is honest about render-vs-mount regardless of streaming, so
   * the first render always emits the SSR-matching `initialCart`
   * branch and the flip to the live store happens strictly after
   * every initial render in the tree (including
   * `<CartHydrator>`'s render-time seed in the header) has
   * committed.
   *
   * `react-hooks/set-state-in-effect` flagged because the lint
   * prefers `useSyncExternalStore`; that's the hook we're
   * deliberately routing around here. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  /* Pre-mount we render the server snapshot (or skeleton when
   * there isn't one); post-mount the store takes over. Using
   * `null` as the "no data" sentinel keeps the empty-cart branch
   * (`lines.length === 0`) cleanly distinct from the
   * skeleton branch (`lines === null`). */
  const lines: readonly CartLine[] | null = mounted
    ? storeLines
    : (initialCart?.lines ?? null);

  const subtotalCents = mounted
    ? storeSubtotal
    : (initialCart?.subtotalCents ?? 0);

  /* Currency token comes from the first line. Empty / skeleton
   * states skip the footer entirely, so the fallback only ever
   * surfaces during a hypothetical mid-mutation render where the
   * lines array is being repopulated. */
  const currency =
    (lines && lines[0]?.currency) ?? initialCart?.currency ?? "USD";

  /* Initial count drives the title pill through SSR + the
   * hydration commit so logged-in shoppers see "Your cart [3]"
   * on first paint instead of the count animating up from 0.
   * Guests pass undefined and the badge resolves to the store
   * (0 → real count on the post-hydration tick). */
  const initialCount = initialCart?.totalQuantity;

  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <h1 className="inline-flex items-center text-2xl font-semibold leading-tight text-[color:var(--color-ink)] md:text-3xl">
        Your cart
        <CartBadge size="title" initialCount={initialCount} />
      </h1>

      {lines === null ? (
        <CartPageSkeleton />
      ) : lines.length === 0 ? (
        <div className={cn(PANEL_SURFACE_THIN_CLASSES, "mt-6 md:mt-8")}>
          <CartEmpty mode="page" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-[1fr_360px]">
          {/* Lines panel — `relative` is the positioning context
           *  for the `<LoadingOverlay>` so the spinner fills only
           *  the line list, not the whole page. `min-w-0` lets
           *  the column shrink past the row's intrinsic content
           *  width (long product titles) without blowing the
           *  grid track. */}
          <div
            className={cn(
              PANEL_SURFACE_THIN_CLASSES,
              "relative min-w-0 px-5",
            )}
          >
            <ul className="flex flex-col divide-y divide-[color:var(--color-border)]">
              {lines.map((line) => (
                <CartLineRow key={line.id} line={line} />
              ))}
            </ul>
            <LoadingOverlay state={pending ? "loading" : null} />
          </div>

          {/* Summary column — sticky on md+ so the checkout CTA
           *  stays anchored while the shopper scrolls a long
           *  line list. `self-start` overrides the grid's default
           *  `stretch` so the card claims only its natural
           *  height (sticky needs a finite height to anchor
           *  against). `top-20` (5rem) clears the sticky header
           *  (4rem + 1px border) with a small breathing gap. */}
          <div className="md:sticky md:top-20 md:self-start">
            <div className={PANEL_SURFACE_THIN_CLASSES}>
              <CartFooter
                subtotalCents={subtotalCents}
                currency={currency}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                             */
/* ------------------------------------------------------------------ */

/**
 * Pre-hydration shimmer for the cart page. Mirrors the two-column
 * `md+` layout (lines panel + summary card) so the page chrome
 * doesn't reflow when the real data lands on the post-hydration
 * tick — only the inner content swaps shimmer bars for live rows.
 *
 * Three line-row placeholders is the typical median cart depth;
 * the exact count doesn't matter past "looks like something is
 * loading", and we'd rather underdraw than fake a fuller cart
 * than the shopper actually has.
 */
function CartPageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading cart"
      className="mt-6 grid gap-6 md:mt-8 md:grid-cols-[1fr_360px]"
    >
      <div className={cn(PANEL_SURFACE_THIN_CLASSES, "min-w-0 px-5")}>
        <ul className="flex flex-col divide-y divide-[color:var(--color-border)]">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-4 py-4">
              {/* Thumbnail placeholder — same 80×80 footprint as
               *  `<CartLineRow>`'s image cell. `shrink-0` keeps
               *  it stable while the title bars below claim the
               *  rest of the row width. */}
              <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-[color:var(--color-surface-muted)]" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
                <div className="h-4 w-3/4 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
                <div className="mt-auto flex items-center gap-3">
                  <div className="h-8 w-24 animate-pulse rounded-full bg-[color:var(--color-surface-muted)]" />
                  <div className="h-4 w-16 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="md:sticky md:top-20 md:self-start">
        <div className={cn(PANEL_SURFACE_THIN_CLASSES, "flex flex-col gap-4 p-5")}>
          {/* Free-shipping bar shimmer */}
          <div className="h-2 w-full animate-pulse rounded-full bg-[color:var(--color-surface-muted)]" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
          {/* Subtotal row shimmer */}
          <div className="flex items-center justify-between pt-2">
            <div className="h-4 w-20 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
            <div className="h-5 w-24 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
          </div>
          {/* Checkout CTA shimmer */}
          <div className="h-12 w-full animate-pulse rounded-lg bg-[color:var(--color-surface-muted)]" />
        </div>
      </div>
    </div>
  );
}
