"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { FavoritesBadge } from "@/components/layout/favorites-badge";
import { ProductCard } from "@/components/products/product-card";
import { ProductGrid } from "@/components/products/product-grid";
import { useFavoritedIds } from "@/lib/favorites/store";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import type { FavoriteItem } from "@/lib/favorites/types";
import type { SearchProduct } from "@/types/product";

/**
 * Client-rendered body for `/favorites`.
 *
 * Why a client wrapper at all? Server components can't react to
 * optimistic store mutations — unfavoriting a card on this page
 * would leave the card mounted (with an empty heart) until the
 * next navigation flushed the route cache. That's the "takes a
 * while to disappear" feeling the shopper sees.
 *
 * The wrapper subscribes to the favorites store and filters the
 * server-seeded snapshot through it: the moment a heart flips
 * off, the corresponding `productId` drops out of the live set,
 * the filter re-runs, the card is gone on the very next paint.
 * No revalidation, no waiting.
 *
 * Empty-state handling lives here for the same reason — when the
 * last item is removed, the grid switches to the empty state
 * client-side instead of waiting for the page to re-render. The
 * heading's count stays accurate too (it reads the same store).
 *
 * SSR / hydration: the first paint renders the items list as-is
 * (matches the server HTML byte-for-byte). The store is seeded
 * by the layout's header badge, so by the first post-hydration
 * commit it already carries the truth and the switch to
 * store-filtered items is silent. The title badge is the same
 * `<FavoritesBadge>` the header uses (just `size="title"`) so
 * its count tracks the store live.
 */
export function FavoritesPageBody({
  initialItems,
}: {
  initialItems: ReadonlyArray<FavoriteItem>;
}) {
  /* Captured once. We never re-seed from the server during the
   * page's lifetime — the user might unheart and re-heart, and
   * we want the card to come *back* if they re-heart, not stay
   * gone because the server hasn't echoed the change yet. */
  const [snapshot] = useState(initialItems);

  /* Stable initialIds reference for the title badge — derived
   * from the captured snapshot, so the badge's seeding effect
   * only fires once. Without `useMemo` a fresh `new Set(...)`
   * each render would refire the effect, which would re-seed
   * the store with the original list and undo every optimistic
   * removal. */
  const initialIds = useMemo(
    () => new Set(snapshot.map((item) => item.productId)),
    [snapshot],
  );

  /* `useHydrated()` returns `false` during SSR and the first
   * client render (matches the server-rendered HTML), then
   * `true` from the first post-hydration commit. So the initial
   * paint shows the full server snapshot, and from then on we
   * filter through the live store — unfavorites disappear the
   * moment the store flips. */
  const hydrated = useHydrated();
  const favoritedIds = useFavoritedIds();

  const items = hydrated
    ? snapshot.filter((item) => favoritedIds.has(item.productId))
    : snapshot;

  return (
    <>
      <header className="mb-8 md:mb-10">
        <h1 className="flex items-center text-2xl font-semibold leading-tight md:text-3xl">
          Favorites
          <FavoritesBadge initialIds={initialIds} size="title" />
        </h1>
      </header>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ProductGrid>
          {items.map((item, i) => (
            <ProductCard
              key={item.productId}
              product={toSearchProduct(item)}
              eager={i < 10}
              /* Every card here is favorited by definition.
               * After hydration the heart state comes from the
               * store, but `initiallyFavorited` still owns the
               * first paint (matches SSR HTML). */
              favorited
              isLoggedIn
            />
          ))}
        </ProductGrid>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Wire-shape adapter                                                   */
/* ------------------------------------------------------------------ */

/**
 * Project a `FavoriteItem` (Salespace wishlist snapshot) into the
 * `SearchProduct` shape `<ProductCard>` consumes.
 *
 * Salespace's wishlist endpoint returns a slimmer snapshot than
 * the search endpoint — no badges, no rating chip, no hover
 * media, no variant options. That's by design: the favorites
 * page is a personal collection (the shopper already decided to
 * save these), not a discovery surface. Cards render with image
 * + title + price + add-to-cart; the visual stripping is silent.
 */
function toSearchProduct(item: FavoriteItem): SearchProduct {
  return {
    id: item.productId,
    handle: item.handle,
    title: item.title,
    image_url: item.imageUrl,
    price_min_cents: item.priceMinCents,
    price_max_cents: item.priceMaxCents,
    compare_at_min_cents: item.compareAtMinCents,
    currency: item.currency,
    available: item.available,
  };
}

/* ------------------------------------------------------------------ */
/* Empty state                                                          */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 py-16 px-6 text-center"
    >
      <p className="text-sm text-[color:var(--color-ink-muted)]">
        You haven&apos;t saved any favorites yet. Tap the heart on a product
        you love and it&apos;ll show up here.
      </p>
      <Link href="/" className="btn-primary">
        Browse products
      </Link>
    </div>
  );
}
