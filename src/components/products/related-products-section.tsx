import "server-only";

import { ProductCard } from "@/components/products/product-card";
import { ProductSection } from "@/components/products/product-section";
import { loadRelatedProducts } from "@/components/products/related-products-actions";
import { RelatedProductsLoader } from "@/components/products/related-products-loader";
import { INITIAL_RELATED_CURSOR } from "@/components/products/related-products-types";
import { getAuthState } from "@/lib/auth/session";
import { getCurrentFavoritedIds } from "@/lib/favorites/queries";
import { RELATED_PRODUCTS_PAGE_SIZE } from "@/lib/pagination";
import type { ProductDetail } from "@/types/product";

/**
 * "You may also like" PDP section.
 *
 * Async server component that resolves the first batch of
 * related products inline, renders the section header + the
 * server-rendered initial cards, and hands the cursor +
 * dedup set off to `<RelatedProductsLoader>` for the
 * subsequent "See more" clicks. Wrap in
 * `<Suspense fallback={<ProductSectionSkeleton />}>` at the call
 * site so the section streams in below the fold without
 * blocking the hero paint.
 *
 * Initial-batch fetching shares the exact code path the loader
 * uses on subsequent clicks (`loadRelatedProducts`) — same
 * subcategory-first sourcing, same dedup contract, same cursor
 * shape. The only thing this server file owns end-to-end is the
 * "View all →" destination decision (which depends on
 * subcategory depth, free in the same response) and the static
 * markup for the initial `<ProductCard>` row.
 *
 * "View all" destination — points into the *subcategory* page
 * when the subcategory genuinely has more than one band's worth
 * of products, category page otherwise. Dropping the shopper
 * into a near-empty subcategory page would feel like a dead end;
 * the category fallback keeps browse momentum.
 *
 * Fetch budget: exactly the work the rail itself needs — one
 * Salespace round-trip for the subcategory pool (which already
 * carries `total` on the response, so no separate probe call),
 * plus the category top-up only when the subcategory pool
 * didn't yield a full band.
 */

export interface RelatedProductsSectionProps {
  product: ProductDetail;
}

export async function RelatedProductsSection({
  product,
}: RelatedProductsSectionProps) {
  /* No collection on the product → nothing to relate to. The PDP
   * route should already gate the section on `primaryCollection`
   * so the Suspense fallback isn't shown for products that won't
   * render a rail; this guard is defensive belt-and-braces. */
  if (!product.primaryCollection) return null;

  const collection = product.primaryCollection.handle;
  const subcategory = product.subcategory ?? null;

  /* Related catalog + auth + favorites set in parallel. The
   * `<RelatedProductsLoader>` is a client component and can't
   * call `getCurrentFavoritedIds` itself; we hand it the
   * serialised set so any "See more" batch it loads later can
   * paint hearts in the right state with no follow-up server
   * call. The trade-off is that favorites toggled in *another
   * tab* between initial render and a "See more" click won't
   * reflect on the newly-loaded cards — acceptable for v1. */
  const [initial, authState, favoritedIds] = await Promise.all([
    loadRelatedProducts({
      collection,
      subcategory,
      shownHandles: [product.handle],
      cursor: INITIAL_RELATED_CURSOR,
    }),
    getAuthState(),
    getCurrentFavoritedIds(),
  ]);

  if (initial.products.length === 0) return null;

  /* Subcategory deep enough to be worth deep-linking into?
   * "Deep enough" = strictly more than a single band's worth of
   * unique products; below that, sending the shopper to a
   * near-empty subcategory page feels like a dead end. The
   * `total` is threaded out of `loadRelatedProducts` from the
   * subcategory fetch's own response — no probe round-trip. */
  const subcategoryHasDepth =
    !!subcategory &&
    (initial.subcategoryTotal ?? 0) > RELATED_PRODUCTS_PAGE_SIZE;
  const viewAllHref =
    subcategoryHasDepth && subcategory
      ? `/categories/${collection}?subcategory=${encodeURIComponent(subcategory)}`
      : `/categories/${collection}`;

  /* Seed the loader's dedup set with the current PDP product's
   * handle plus every handle in the initial batch. The action
   * already filtered the initial batch against `[product.handle]`,
   * so any duplicate between the two pools is already resolved
   * by the time we get here. */
  const initialShownHandles = [
    product.handle,
    ...initial.products.map((p) => p.handle),
  ];

  return (
    <ProductSection title="You may also like" viewAllHref={viewAllHref}>
      <RelatedProductsLoader
        collection={collection}
        subcategory={subcategory}
        initialShownHandles={initialShownHandles}
        initialCursor={initial.cursor}
        initialHasMore={initial.hasMore}
        favoritedIds={Array.from(favoritedIds)}
        isLoggedIn={authState.isLoggedIn}
      >
        {initial.products.map((p, i) => (
          /* First row eager-loads — matches the convention every
           * grid surface uses (above-the-fold tiles get
           * `priority` so the LCP image isn't deferred). 5 is
           * the `xl:` column count; narrower layouts treat the
           * same threshold as "well into the visible band",
           * which is good enough. */
          <ProductCard
            key={p.id}
            product={p}
            eager={i < 5}
            favorited={favoritedIds.has(p.id)}
            isLoggedIn={authState.isLoggedIn}
          />
        ))}
      </RelatedProductsLoader>
    </ProductSection>
  );
}
