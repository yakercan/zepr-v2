import "server-only";

import { ProductCard } from "@/components/products/product-card";
import { ProductSection } from "@/components/products/product-section";
import { loadRelatedProducts } from "@/components/products/related-products-actions";
import { RelatedProductsLoader } from "@/components/products/related-products-loader";
import { INITIAL_RELATED_CURSOR } from "@/components/products/related-products-types";
import { RELATED_PRODUCTS_PAGE_SIZE } from "@/lib/pagination";
import { searchProducts } from "@/lib/salespace/search";
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
 * subcategory depth) and the static markup for the initial
 * `<ProductCard>` row.
 *
 * "View all" destination — points into the *subcategory* page
 * when the subcategory genuinely has more than one band's worth
 * of products, category page otherwise. Dropping the shopper
 * into a near-empty subcategory page would feel like a dead end;
 * the category fallback keeps browse momentum.
 *
 * Fetch budget: one round-trip when the product has no
 * subcategory tag (category pool only), or two parallel
 * round-trips when it does — the subcategory call also gives us
 * the `total` we need to pick the View-all destination, so it
 * always runs.
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

  /* Run the initial batch fetch *and* the subcategory-depth
   * probe in parallel. The depth probe is what determines the
   * "View all →" destination — it only matters when the product
   * actually has a subcategory tag, and even then it's a cheap
   * `limit=1` call just to read `total`. The two requests fire
   * concurrently so the slowest is the only latency we pay. */
  const [initial, subcategoryProbe] = await Promise.all([
    loadRelatedProducts({
      collection,
      subcategory,
      shownHandles: [product.handle],
      cursor: INITIAL_RELATED_CURSOR,
    }),
    subcategory
      ? searchProducts(
          {
            collection,
            subcategory,
            sort: "best_sellers:desc",
            limit: 1,
          },
          { tags: [`related-probe:${collection}:${subcategory}`] },
        )
      : Promise.resolve(null),
  ]);

  if (initial.products.length === 0) return null;

  /* Subcategory deep enough to be worth deep-linking into?
   * "Deep enough" = strictly more than a single band's worth of
   * unique products; below that, sending the shopper to a
   * near-empty subcategory page feels like a dead end. */
  const subcategoryHasDepth =
    !!subcategory &&
    (subcategoryProbe?.total ?? 0) > RELATED_PRODUCTS_PAGE_SIZE;
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
      >
        {initial.products.map((p, i) => (
          /* First row eager-loads — matches the convention every
           * grid surface uses (above-the-fold tiles get
           * `priority` so the LCP image isn't deferred). 5 is
           * the `xl:` column count; narrower layouts treat the
           * same threshold as "well into the visible band",
           * which is good enough. */
          <ProductCard key={p.id} product={p} eager={i < 5} />
        ))}
      </RelatedProductsLoader>
    </ProductSection>
  );
}
