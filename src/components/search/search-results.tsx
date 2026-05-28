import { ProductCard } from "@/components/products/product-card";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "@/components/products/product-grid";
import { ViewMoreButton } from "@/components/products/view-more-button";
import { SearchFilters } from "@/components/search/search-filters";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthState } from "@/lib/auth/session";
import { getCurrentFavoritedIds } from "@/lib/favorites/queries";
import { PRODUCTS_PAGE_SIZE, parsePageParam } from "@/lib/pagination";
import { searchProducts } from "@/lib/salespace/search";
import type { TaxonomyCategory } from "@/types/taxonomy";

/** Sort applied when the URL has no `?sort`. Mirrors the implicit
 *  default surfaced by `<SearchFilters>` so the pill label and
 *  the actual ranking always agree. */
const DEFAULT_SORT = "best_sellers:desc";

/**
 * `/search` body — filter bar + grid + view-more for a single
 * (query, sort, filters, page) combination.
 *
 * Server-rendered. Issues the single Salespace `/search` call
 * that powers the entire page; the facets that come back drive
 * the filter bar's available pills (Category / Price / Size),
 * the grid renders the hits, and `<ViewMoreButton>` paginates.
 *
 * Lives inside a `<Suspense key={query}>` in `page.tsx`. Within
 * the same query, filter and page changes ride a client-side
 * `useTransition` (in `<SearchFilters>` and `<ViewMoreButton>`),
 * so React holds the previous render mounted — including the
 * filter bar with its in-flight panel state — while the new
 * payload streams in. Only a new query unmounts and shows the
 * skeleton.
 */
export async function SearchResults({
  query,
  pageParam,
  sort,
  subcategory,
  priceMin,
  priceMax,
  size,
  categories,
}: {
  query: string;
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

  // Auth + favorites set fetched in parallel with the search
  // call so the heart on each card paints in the right state on
  // first frame. `getCurrentFavoritedIds()` short-circuits to an
  // empty set for guests.
  const [result, authState, favoritedIds] = await Promise.all([
    searchProducts(
      {
        // Empty `q` is forwarded as `undefined` so the upstream
        // treats the request as a generic browse (top-ranked
        // products) instead of a query for the literal empty
        // string. The filter bar still works either way.
        q: query || undefined,
        limit,
        // Absent `?sort` → fall back to the implicit Best Sellers
        // ranking. The pill UI shows "Sort by: Best Sellers" in
        // that same state, so the two never disagree.
        sort: sort || DEFAULT_SORT,
        subcategory: subcategory?.length ? subcategory : undefined,
        price_min: priceMin,
        price_max: priceMax,
        size: size?.length ? size : undefined,
      },
      // Per-query cache tag so a future revalidation can target a
      // single query without nuking the whole products cache.
      // Empty query rolls up under `search:` so the browse view
      // shares a single bucket.
      { tags: [`search:${query}`] },
    ),
    getAuthState(),
    getCurrentFavoritedIds(),
  ]);

  const hasResults = result.hits.length > 0;
  const hasMore = hasResults && result.hits.length < result.total;

  return (
    <div className="flex flex-col gap-6">
      <SearchFilters categories={categories} facets={result.facets} />
      {hasResults ? (
        <div className="flex flex-col gap-8">
          <ProductGrid>
            {result.hits.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                // First ten cards stream as `priority` so the LCP
                // candidate (top-left tile) doesn't wait on lazy.
                eager={i < 10}
                favorited={favoritedIds.has(product.id)}
                isLoggedIn={authState.isLoggedIn}
              />
            ))}
          </ProductGrid>
          <ViewMoreButton hasMore={hasMore} />
        </div>
      ) : (
        <NoResults query={query} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function NoResults({ query }: { query: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-[color:var(--color-border)] py-16 text-center"
    >
      {query ? (
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          We couldn’t find anything matching{" "}
          <span className="font-semibold text-[color:var(--color-ink)]">
            “{query}”
          </span>
          .
        </p>
      ) : (
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          No products to show right now.
        </p>
      )}
      <p className="mt-1 text-sm text-[color:var(--color-ink-muted)]">
        Try a different keyword, check your spelling, or clear a filter.
      </p>
    </div>
  );
}

/**
 * Suspense fallback. Mirrors the post-fetch layout (filter pill
 * row → product grid) so the swap to the real content doesn't
 * reflow.
 */
export function SearchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      {/* Mirrors the live filter row's layout via the same
       *  `<ScrollRow>` primitive — on mobile the placeholders
       *  scroll edge-to-edge instead of wrapping onto a second
       *  line, so the swap to real pills doesn't reflow. */}
      <ScrollRow>
        <Skeleton className="h-11 w-48 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
        <Skeleton className="h-11 w-20 rounded-full" />
      </ScrollRow>
      <ProductGridSkeleton count={PRODUCTS_PAGE_SIZE} />
    </div>
  );
}
