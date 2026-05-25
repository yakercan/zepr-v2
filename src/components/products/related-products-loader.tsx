"use client";

import { type ReactNode, useMemo, useState, useTransition } from "react";
import { LoadMoreButton } from "@/components/products/load-more-button";
import { ProductCard } from "@/components/products/product-card";
import { ProductGrid } from "@/components/products/product-grid";
import { loadRelatedProducts } from "@/components/products/related-products-actions";
import type { RelatedProductsCursor } from "@/components/products/related-products-types";
import type { SearchProduct } from "@/types/product";

/**
 * Client island that owns the PDP related-products "See more"
 * state machine.
 *
 * Pairs with the `<RelatedProductsSection>` server component:
 * the section pre-renders the first batch of `<ProductCard>`s
 * (so initial paint and SEO get static HTML) and hands them in
 * as `children`; the loader then drives every subsequent batch
 * via the `loadRelatedProducts` server action and renders the
 * appended cards client-side in the same `<ProductGrid>`.
 *
 * Why a server action (not a URL change):
 *
 *   - Nobody deep-links a PDP rail's page 4 — URL pagination
 *     would only cost an RSC roundtrip and a Suspense skeleton
 *     flash on every click for zero shareable-URL benefit.
 *   - Cursor + dedup set live in client state, so each click
 *     pays exactly one Salespace round-trip (per still-needed
 *     pool) and only the new band of cards arrives over the
 *     wire. Same fast 10-by-10 cadence the main feed uses,
 *     without the URL churn.
 *
 * Why initial cards come in as `children` (not as a serialized
 * array): keeps the first 10 cards rendered by `ProductCard` on
 * the server. Only the loader's state machine and the appended
 * card markup ship JS — the static initial paint stays as
 * pre-rendered HTML.
 */

export interface RelatedProductsLoaderProps {
  collection: string;
  subcategory: string | null;
  /** Initial server-rendered `<ProductCard>`s for the first
   *  batch. Always rendered as-is. */
  children: ReactNode;
  /** Every handle visible after the initial render — the current
   *  PDP product's handle plus every handle in `children`. The
   *  server action uses this as the dedup source of truth. */
  initialShownHandles: ReadonlyArray<string>;
  /** Cursor handed back by the same action that fetched the
   *  initial batch — see `loadRelatedProducts`. */
  initialCursor: RelatedProductsCursor;
  /** Whether there's at least one more batch to fetch. Drives
   *  the visibility of the See more button. */
  initialHasMore: boolean;
  /** Snapshot of the shopper's favorited product GIDs, captured
   *  on the server at render time. Threaded through so any
   *  appended cards from "See more" clicks can paint hearts in
   *  the right state without a fresh server call. Empty array
   *  for guests; the heart button still works as a sign-in
   *  prompt either way. */
  favoritedIds: ReadonlyArray<string>;
  isLoggedIn: boolean;
}

export function RelatedProductsLoader({
  collection,
  subcategory,
  children,
  initialShownHandles,
  initialCursor,
  initialHasMore,
  favoritedIds,
  isLoggedIn,
}: RelatedProductsLoaderProps) {
  /* Cheap hash lookup for "is this appended product favorited?".
   * Memoised because the array reference is otherwise stable
   * across re-renders but constructing the Set each render is
   * still wasted work. */
  const favoritedSet = useMemo(
    () => new Set(favoritedIds),
    [favoritedIds],
  );

  /* Loader state — kept flat so each transition only touches
   * what changed:
   *   - `appended` is the running list of *new* cards added by
   *     clicks; the server-rendered initial cards live in
   *     `children` and never re-render.
   *   - `shownHandles` carries every handle the upstream should
   *     filter out on the next call (the current PDP handle +
   *     initial cards + everything in `appended`).
   *   - `cursor` is the opaque resume marker the action hands
   *     back; the loader treats it as a black box.
   *   - `hasMore` mirrors the most recent server reply so the
   *     button disappears the moment both pools exhaust. */
  const [appended, setAppended] = useState<SearchProduct[]>([]);
  const [shownHandles, setShownHandles] = useState<ReadonlyArray<string>>(
    initialShownHandles,
  );
  const [cursor, setCursor] = useState<RelatedProductsCursor>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    /* `startTransition` keeps the existing grid interactive
     * during the round-trip — same UX the URL-driven
     * `<ViewMoreButton>` gives, just powered by a server
     * action instead of `router.replace`. The button itself
     * reads `isPending` to show the spinner overlay. */
    startTransition(async () => {
      const result = await loadRelatedProducts({
        collection,
        subcategory,
        shownHandles,
        cursor,
      });

      if (result.products.length > 0) {
        setAppended((prev) => [...prev, ...result.products]);
        setShownHandles((prev) => [
          ...prev,
          ...result.products.map((p) => p.handle),
        ]);
      }
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <ProductGrid>
        {children}
        {appended.map((p) => (
          /* No `eager` on appended cards — they're guaranteed
           * below the fold by the time they mount (the shopper
           * had to scroll + click to reveal them). Let the
           * browser lazy-load. */
          <ProductCard
            key={p.id}
            product={p}
            favorited={favoritedSet.has(p.id)}
            isLoggedIn={isLoggedIn}
          />
        ))}
      </ProductGrid>
      {hasMore && (
        <LoadMoreButton onClick={handleClick} isPending={isPending} />
      )}
    </div>
  );
}
