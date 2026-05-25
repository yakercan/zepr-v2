import { ProductCard } from "@/components/products/product-card";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "@/components/products/product-grid";
import { ViewMoreButton } from "@/components/products/view-more-button";
import { SearchFilters } from "@/components/search/search-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthState } from "@/lib/auth/session";
import { getCurrentFavoritedIds } from "@/lib/favorites/queries";
import { PRODUCTS_PAGE_SIZE, parsePageParam } from "@/lib/pagination";
import { searchProducts } from "@/lib/salespace/search";
import type { TaxonomyCategory } from "@/types/taxonomy";

/** Default sort when the URL has no `?sort`. Same key the
 *  search page uses so the pill label ("Sort by: Best
 *  Sellers") matches the actual ranking. */
const DEFAULT_SORT = "best_sellers:desc";

/**
 * `/categories/[handle]` body — filter bar + grid + view-more
 * for one collection. Mirrors `<SearchResults>` but anchors
 * to a category handle instead of a query, and hides the
 * Category filter pill (the subcategory slider already lives
 * above it).
 *
 * Server-rendered: a single upstream `/search` call with
 * `collections=<handle>` powers the grid and feeds the
 * Price / Size facets back into the filter bar. The
 * subcategory slider sits in `page.tsx`, outside this
 * component, so a subcategory change doesn't tear down the
 * filter bar's open panel state.
 */
export async function CategoryResults({
  handle,
  pageParam,
  sort,
  subcategory,
  priceMin,
  priceMax,
  size,
  categories,
}: {
  handle: string;
  pageParam?: string;
  sort?: string;
  subcategory?: string[];
  priceMin?: number;
  priceMax?: number;
  size?: string[];
  categories: readonly TaxonomyCategory[];
}) {
  const page = parsePageParam(pageParam);
  const limit = page * PRODUCTS_PAGE_SIZE;

  // Auth + favorites set fetched in parallel with the category
  // call so the heart on each card paints in the right state on
  // first frame.
  const [result, authState, favoritedIds] = await Promise.all([
    searchProducts(
      {
        collection: handle,
        limit,
        sort: sort || DEFAULT_SORT,
        subcategory: subcategory?.length ? subcategory : undefined,
        price_min: priceMin,
        price_max: priceMax,
        size: size?.length ? size : undefined,
      },
      // Per-handle cache tag so a future webhook can revalidate
      // one category without touching others.
      { tags: [`category:${handle}`] },
    ),
    getAuthState(),
    getCurrentFavoritedIds(),
  ]);

  const hasResults = result.hits.length > 0;
  const hasMore = hasResults && result.hits.length < result.total;

  return (
    <div className="flex flex-col gap-6">
      <SearchFilters
        categories={categories}
        facets={result.facets}
        hideCategory
      />
      {hasResults ? (
        <div className="flex flex-col gap-8">
          <ProductGrid>
            {result.hits.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                eager={i < 10}
                favorited={favoritedIds.has(product.id)}
                isLoggedIn={authState.isLoggedIn}
              />
            ))}
          </ProductGrid>
          <ViewMoreButton hasMore={hasMore} />
        </div>
      ) : (
        <NoResults />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function NoResults() {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-[color:var(--color-border)] py-16 text-center"
    >
      <p className="text-sm text-[color:var(--color-ink-muted)]">
        No products match the current filters.
      </p>
      <p className="mt-1 text-sm text-[color:var(--color-ink-muted)]">
        Try clearing a filter or pick a different subcategory.
      </p>
    </div>
  );
}

/**
 * Suspense fallback. Mirrors the post-fetch layout (filter pill
 * row → product grid) so swapping to real content doesn't
 * reflow. The subcategory slider above this boundary stays in
 * view across loads — no need to skeleton it.
 */
export function CategoryResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-11 w-48 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
        <Skeleton className="h-11 w-20 rounded-full" />
      </div>
      <ProductGridSkeleton count={PRODUCTS_PAGE_SIZE} />
    </div>
  );
}
