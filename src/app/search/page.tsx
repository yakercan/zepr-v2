import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  SearchResults,
  SearchResultsSkeleton,
} from "@/components/search/search-results";
import { DEFAULT_CATEGORIES } from "@/config/categories";
import { getTaxonomy } from "@/lib/salespace/taxonomy";

/**
 * `/search?q=…&sort=…&subcategory=…&price_min=…&price_max=…&size=…&page=N`
 *
 * Thin shell. Validates `?q`, generates a per-query `<title>`
 * + `noindex`, fetches the taxonomy (cached, same call the
 * header uses) and forwards the rest into `<SearchResults>`.
 *
 * `<Suspense key={query}>` is the only boundary on the page:
 *
 *   - **Different query** → key changes → fallback fires once,
 *     the skeleton flashes briefly while the new payload streams
 *     in.
 *   - **Same query, different filter / page** → key stable, the
 *     in-page `useTransition` (in `<SearchFilters>` and
 *     `<ViewMoreButton>`) keeps React holding the existing tree
 *     mounted while the next render is built — no flash, no
 *     loss of pill / panel state.
 */

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    subcategory?: string | string[];
    price_min?: string;
    price_max?: string;
    size?: string | string[];
  }>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  return {
    title: query ? `Search: ${query}` : "Search",
    // Result pages are per-user, low-quality SEO surfaces. Don't
    // index but do follow links so product cards still pass juice.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, page, sort, subcategory, price_min, price_max, size } =
    await searchParams;
  const query = (q ?? "").trim();

  if (!query) {
    // Whitespace-only or missing query → home. Avoids rendering a
    // stranded filter bar with no results context.
    redirect("/");
  }

  // Taxonomy may be empty/null when the API is unreachable; fall
  // back to the static `DEFAULT_CATEGORIES` so the filter bar
  // still has something to show. Same fallback `<SiteHeader>` uses.
  const taxonomy = await getTaxonomy();
  const categories = taxonomy?.categories?.length
    ? taxonomy.categories
    : DEFAULT_CATEGORIES;

  return (
    <div className="page-container py-6">
      <Suspense key={query} fallback={<SearchResultsSkeleton />}>
        <SearchResults
          query={query}
          pageParam={page}
          sort={sort}
          subcategory={toArray(subcategory)}
          priceMin={parsePositiveInt(price_min)}
          priceMax={parsePositiveInt(price_max)}
          size={toArray(size)}
          categories={categories}
        />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Param normalisation                                                 */
/* ------------------------------------------------------------------ */

/** Next gives us either a string or an array depending on how
 *  many times the param appears in the URL — normalise to an
 *  array (or undefined when absent / empty). */
function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const trimmed = arr.filter((v) => v !== "");
  return trimmed.length ? trimmed : undefined;
}

/** Parse a non-negative integer from a query string, returning
 *  `undefined` for anything malformed so a bad URL never sends a
 *  NaN to the API. */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
