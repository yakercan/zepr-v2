import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  SearchResults,
  SearchResultsSkeleton,
} from "@/components/search/search-results";

/**
 * `/search?q=…&page=N` — keyword search results.
 *
 * Thin shell:
 *
 *   - validates / normalises `?q`
 *   - bounces an empty / whitespace-only query straight back to
 *     home (the search bar already filters those client-side; this
 *     guards direct-nav and stray bookmarks)
 *   - generates a per-query `<title>` + `noindex` so result pages
 *     don't pollute search engines
 *   - wraps `<SearchResults>` in `<Suspense>` keyed on the query
 *     only — page changes ride a `useTransition` from
 *     `<ViewMoreButton>`, so the skeleton fallback only flashes
 *     when the query itself changes
 */

interface SearchPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
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
  const { q, page } = await searchParams;
  const query = (q ?? "").trim();

  if (!query) {
    // Whitespace-only or missing query → home. Avoids rendering a
    // stranded "Results for ''" header that means nothing.
    redirect("/");
  }

  return (
    <div className="page-container flex flex-col py-6">
      <Suspense key={query} fallback={<SearchResultsSkeleton />}>
        <SearchResults query={query} pageParam={page} />
      </Suspense>
    </div>
  );
}
