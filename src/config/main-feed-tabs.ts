/**
 * Tabs that drive the homepage main product feed.
 *
 * Mirrors the `MainProductsSection` pattern from the original zepr
 * storefront, but kept to the four sort variants the user wants
 * surfaced on the new landing page. The `id` is what shows up in the
 * URL (`?tab=…`), `sort` is the Salespace API sort key consumed by
 * the products grid.
 *
 * The first entry is the implicit default — when no `?tab` is in the
 * URL, this tab is rendered as active. Keep that contract: the home
 * URL stays clean (`/`) for the default and only gains a query when
 * the user actively picks a different sort.
 */
export type MainFeedTabId =
  | "best_sellers"
  | "hot_deals"
  | "top_rated"
  | "newest";

export interface MainFeedTab {
  id: MainFeedTabId;
  label: string;
  /** Salespace sort key — `sort=<this>` on the search API. */
  sort: string;
}

export const MAIN_FEED_TABS: readonly MainFeedTab[] = [
  { id: "best_sellers", label: "Best Sellers", sort: "best_sellers:desc" },
  { id: "hot_deals",    label: "Hot Deals",    sort: "hot_deals:desc" },
  { id: "top_rated",    label: "Top Rated",    sort: "best_rated:desc" },
  { id: "newest",       label: "Newest",       sort: "newest:desc" },
] as const;

export const DEFAULT_MAIN_FEED_TAB: MainFeedTabId = MAIN_FEED_TABS[0].id;

/** Defensive parse for `?tab=` — anything we don't recognize falls
 *  back to the default tab so a bad/stale URL still lands the user
 *  on something sensible. */
export function parseMainFeedTab(raw: string | null): MainFeedTabId {
  const match = MAIN_FEED_TABS.find((t) => t.id === raw);
  return match ? match.id : DEFAULT_MAIN_FEED_TAB;
}
