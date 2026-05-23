/**
 * Shared pagination primitives for product listings.
 *
 * Every product surface (homepage feed, search results, category
 * pages, future "you might like" rails) follows the same
 * URL-driven "view more" pattern:
 *
 *   - `?page=N` in the URL — defaults to 1 when absent.
 *   - Server fetches `N × PRODUCTS_PAGE_SIZE` items in one call,
 *     so a refresh on `?page=3` re-renders the same 60 cards the
 *     user had loaded.
 *   - `<ViewMoreButton>` increments `?page` via `router.replace`
 *     inside a transition, keeping the existing grid mounted
 *     while the new RSC payload streams in.
 *
 * Keeping the size + parser in one place means every surface
 * stays consistent without any of them having to redefine
 * "what's a page". Change `PRODUCTS_PAGE_SIZE` here and the whole
 * site re-tunes.
 */

/** How many products land per "page". 20 fits a 5-column grid
 *  cleanly (4 rows) and a 4-column grid (5 rows) — both common
 *  layout choices. */
export const PRODUCTS_PAGE_SIZE = 20;

/**
 * Parse the `?page=` query string value into a sane positive
 * integer. Anything missing, negative, zero, NaN, or non-integer
 * (e.g. `"abc"`, `"2.5"`) collapses to page 1 — so a malformed
 * URL never crashes the listing.
 */
export function parsePageParam(raw: string | null | undefined): number {
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
