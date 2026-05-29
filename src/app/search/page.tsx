import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchViewTracker } from "@/components/analytics/view-trackers";
import { SeoText } from "@/components/seo/seo-text";
import {
  SearchResults,
  SearchResultsSkeleton,
} from "@/components/search/search-results";
import { DEFAULT_CATEGORIES } from "@/config/categories";
import { site } from "@/config/site";
import { getTaxonomy } from "@/lib/salespace/taxonomy";

/**
 * `/search[?q=…][&sort=…&subcategory=…&price_min=…&price_max=…&size=…&page=N]`
 *
 * Thin shell. Generates a per-query `<title>` + `noindex`,
 * fetches the taxonomy (cached, same call the header uses) and
 * forwards everything into `<SearchResults>`. Empty `?q` is a
 * valid browse state — the upstream just returns top-ranked
 * products and the filter bar still works as expected.
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

/* ------------------------------------------------------------------ */
/* SEO copy — derived once from the query so `generateMetadata` and   */
/* the page body can't drift on what they tell crawlers.              */
/* ------------------------------------------------------------------ */

function searchTitle(query: string): string {
  return query ? `Search: ${query}` : "Search";
}

function searchHeading(query: string): string {
  return query ? `Search results for “${query}”` : `Search ${site.name}`;
}

function searchDescription(query: string): string {
  return query
    ? `Browse search results for “${query}” at ${site.name} — trending products with exclusive bundle deals and free shipping on all orders.`
    : `Search thousands of trending products at ${site.name}. Find home essentials, beauty products, electronics, pet supplies & more. Free shipping on all orders.`;
}

/** Canonical drops filter/sort/page params so every faceted or
 *  paginated view of a query folds onto one indexable URL. */
function searchCanonical(query: string): string {
  return query ? `/search?q=${encodeURIComponent(query)}` : "/search";
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  return {
    title: searchTitle(query),
    description: searchDescription(query),
    /* Indexable on purpose. High-intent query landing pages
     *  ("electric kettle", "dog bed") are exactly what we want
     *  ranking — the same play that lands marketplace search pages
     *  high in results. The canonical above keeps the faceted
     *  variants from splintering that signal. */
    robots: { index: true, follow: true },
    alternates: { canonical: searchCanonical(query) },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, page, sort, subcategory, price_min, price_max, size } =
    await searchParams;
  const query = (q ?? "").trim();

  // Taxonomy may be empty/null when the API is unreachable; fall
  // back to the static `DEFAULT_CATEGORIES` so the filter bar
  // still has something to show. Same fallback `<SiteHeader>` uses.
  const taxonomy = await getTaxonomy();
  const categories = taxonomy?.categories?.length
    ? taxonomy.categories
    : DEFAULT_CATEGORIES;

  return (
    <div className="page-container py-6">
      {/* Only track non-empty queries — an empty `?q=` is the
       *  browse landing state, not a search the merchant would
       *  want surfaced in the "Top searches" report. */}
      {query && <SearchViewTracker query={query} />}
      {/* The results grid has no visible <h1>; this hidden,
          query-driven heading + intro gives the indexed page a
          crawlable summary that matches what's on screen. */}
      <SeoText
        heading={searchHeading(query)}
        description={searchDescription(query)}
      />
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
