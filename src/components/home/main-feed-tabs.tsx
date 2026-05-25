"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { ViewAllLink } from "@/components/ui/view-all-link";
import {
  DEFAULT_MAIN_FEED_TAB,
  MAIN_FEED_TABS,
  parseMainFeedTab,
  type MainFeedTabId,
} from "@/config/main-feed-tabs";
import { pillClasses } from "@/lib/styles";

/**
 * Tab strip that drives the homepage main product feed.
 *
 * URL-backed (`?tab=<id>`) so deep-links, back/forward, and refresh
 * all preserve the active sort. Clicking a tab does NOT trigger a
 * navigation — we use `router.replace` with `scroll: false`, which
 * just rewrites the address bar entry. The grid below reads the
 * same `?tab` param and swaps its data accordingly.
 *
 * The default tab (`feed`) is encoded as the *absence* of the
 * query param so the canonical home URL stays clean `/`. Every
 * other tab — including Best Sellers — round-trips through
 * `?tab=<id>`.
 *
 * Optimistic state via `useOptimistic`: the URL is the source of
 * truth, and `setOptimisticTab(id)` paints the selected pill in
 * the same frame as the click. When the transition completes and
 * the URL catches up, the optimistic override naturally collapses
 * back into `urlTab` — no manual resync, no chance of a stale
 * mirror painting an "unselected" frame between commit and the
 * URL update.
 *
 * The pill itself is shared with the search-page filter bar — both
 * pull from `pillClasses()` in `lib/styles.ts`. Change pill look
 * there once and every surface tracks.
 */
export function MainFeedTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = parseMainFeedTab(searchParams.get("tab"));

  const [active, setActive] = useOptimistic(urlTab);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (id: MainFeedTabId) => {
    if (id === active) return;

    const params = new URLSearchParams(searchParams);
    if (id === DEFAULT_MAIN_FEED_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", id);
    }
    // Each tab gets its own "view more" counter — leaking a
    // deep page from the previous tab would dump a wall of
    // unrelated products on the user. Always reset on switch.
    params.delete("page");
    const qs = params.toString();

    // `setActive` must be called inside a transition (React 19
    // contract for `useOptimistic`) — wrap the nav alongside it so
    // both commit together. `replace` + `scroll: false` keeps us
    // on the same page without touching history or scroll.
    startTransition(() => {
      setActive(id);
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    });
  };

  /* "View all →" bridges from the homepage feed into the full
   * search results for the active tab's sort. Same destination
   * shape the search page already handles, so deep-linking it
   * (bookmark / share) lands on a coherent grid.
   *
   * Tabs whose sort matches the search page's *implicit* default
   * (`best_sellers:desc`) — and the homepage `feed` ordering,
   * which search has no analogue for and so falls through to the
   * same default — pass no `?sort` query at all. Keeps the
   * canonical URL clean (`/search`) the same way the search
   * dropdown encodes Best Sellers as the absence of `?sort`. */
  const activeTab = MAIN_FEED_TABS.find((t) => t.id === active);
  const passesThroughToDefault =
    !activeTab ||
    activeTab.id === DEFAULT_MAIN_FEED_TAB ||
    activeTab.id === "best_sellers";
  const viewAllHref = passesThroughToDefault
    ? "/search"
    : `/search?sort=${encodeURIComponent(activeTab.sort)}`;

  /* Intentionally no visual dim while pending — `aria-busy` carries
   * the loading state for AT, and the grid's Suspense fallback
   * below is the only visual cue users need. Dimming the strip
   * also dimmed the just-selected pill, which read as a flash. */
  return (
    <div
      role="tablist"
      aria-label="Product feed sort"
      aria-busy={isPending}
      className="flex flex-wrap items-center gap-2"
    >
      {MAIN_FEED_TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => handleSelect(tab.id)}
            className={pillClasses(isActive, "outline")}
          >
            {tab.label}
          </button>
        );
      })}
      {/* `ml-auto` pins the link to the right edge of the row;
       *  `flex-wrap` above lets it drop to a new line on narrow
       *  viewports where the pills already wrap, and `ml-auto`
       *  keeps it right-justified there too. */}
      <ViewAllLink href={viewAllHref} className="ml-auto" />
    </div>
  );
}
