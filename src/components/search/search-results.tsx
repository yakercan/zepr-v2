import { ProductCard } from "@/components/products/product-card";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "@/components/products/product-grid";
import { ViewMoreButton } from "@/components/products/view-more-button";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCTS_PAGE_SIZE, parsePageParam } from "@/lib/pagination";
import { searchProducts } from "@/lib/salespace/search";

/**
 * `/search` page body.
 *
 * Server-rendered fetch + grid + "see more". Wraps the same
 * pagination contract the homepage main feed uses: `page × PAGE_SIZE`
 * in one upstream call, so refreshing on `?page=3` re-renders the
 * same 60 cards the user had loaded.
 *
 * Three states render from one component so we never end up with
 * a stranded "results header" sitting above an empty grid:
 *
 *   - **has results** → header with count + grid + view-more
 *   - **no results**  → friendly empty state with the query echoed
 *   - **empty query** → handled upstream by `redirect()` in the
 *                       route component (we never receive `""`)
 *
 * Kept separate from `page.tsx` for the same reason `MainFeed` is
 * separate: the route file stays a thin shell that wires
 * `<Suspense>` + metadata; this component owns the fetch + render.
 */
export async function SearchResults({
  query,
  pageParam,
}: {
  query: string;
  pageParam?: string;
}) {
  const page = parsePageParam(pageParam);
  const limit = page * PRODUCTS_PAGE_SIZE;

  const result = await searchProducts(
    { q: query, limit },
    // Per-query cache tag so future invalidations can target one
    // query without nuking the entire products cache.
    { tags: [`search:${query}`] },
  );

  if (result.hits.length === 0) {
    return <NoResults query={query} />;
  }

  const hasMore = result.hits.length < result.total;

  return (
    <div className="flex flex-col gap-6">
      <SearchHeader query={query} total={result.total} />
      <ProductGrid>
        {result.hits.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            // First ten cards stream as `priority` images so the
            // LCP candidate (top-left tile) doesn't wait on lazy.
            eager={i < 10}
          />
        ))}
      </ProductGrid>
      <ViewMoreButton hasMore={hasMore} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header + states                                                     */
/* ------------------------------------------------------------------ */

function SearchHeader({ query, total }: { query: string; total: number }) {
  // Format with locale grouping ("1,234") — looks polished at higher
  // counts and is virtually free.
  const formatted = total.toLocaleString();
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold text-[color:var(--color-ink)]">
        Results for{" "}
        <span className="text-[color:var(--color-brand)]">“{query}”</span>
      </h1>
      <p className="text-sm text-[color:var(--color-ink-muted)]">
        {formatted} {total === 1 ? "result" : "results"}
      </p>
    </header>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col gap-6">
      <SearchHeader query={query} total={0} />
      <div
        role="status"
        className="rounded-2xl border border-dashed border-[color:var(--color-border)] py-16 text-center"
      >
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          We couldn’t find anything matching{" "}
          <span className="font-semibold text-[color:var(--color-ink)]">
            “{query}”
          </span>
          .
        </p>
        <p className="mt-1 text-sm text-[color:var(--color-ink-muted)]">
          Try a different keyword or check your spelling.
        </p>
      </div>
    </div>
  );
}

/**
 * Fallback shown while the first batch streams in. Mirrors the
 * post-fetch shape (heading row → grid) so the swap doesn't
 * reflow the layout.
 */
export function SearchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72" rounded="md" />
        <Skeleton className="h-4 w-28" rounded="md" />
      </div>
      <ProductGridSkeleton count={PRODUCTS_PAGE_SIZE} />
    </div>
  );
}
