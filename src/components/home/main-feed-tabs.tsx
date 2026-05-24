"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ViewAllLink } from "@/components/ui/view-all-link";
import {
  DEFAULT_MAIN_FEED_TAB,
  MAIN_FEED_TABS,
  parseMainFeedTab,
  type MainFeedTabId,
} from "@/config/main-feed-tabs";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Tab strip that drives the homepage main product feed.
 *
 * URL-backed (`?tab=<id>`) so deep-links, back/forward, and refresh
 * all preserve the active sort. Clicking a tab does NOT trigger a
 * navigation — we use `router.replace` with `scroll: false`, which
 * just rewrites the address bar entry. The grid below reads the
 * same `?tab` param and swaps its data accordingly (added next).
 *
 * The default tab (`feed`) is encoded as the *absence* of the
 * query param so the canonical home URL stays clean `/`. Every
 * other tab — including Best Sellers — round-trips through
 * `?tab=<id>`.
 *
 * Visual: reversed-colour pills, anchored to the left edge of the
 * page container, with a shared `<ViewAllLink>` pinned to the
 * right — same right-aligned bridge `<ProductSection>` uses, so
 * the affordance reads identically wherever it lives.
 *
 * The pill itself is shared with the search-page filter bar — both
 * pull from `pillClasses()` in `lib/styles.ts`. Change pill look
 * there once and every surface tracks.
 */
export function MainFeedTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = parseMainFeedTab(searchParams.get("tab"));

  // Local mirror of the URL param. We keep an explicit `lastUrlTab`
  // ref-via-state so we can detect external URL changes (back/forward,
  // programmatic nav) and resync — same React-19-clean pattern the
  // search bar uses to follow `?q=…`.
  const [active, setActive] = useState<MainFeedTabId>(urlTab);
  const [lastUrlTab, setLastUrlTab] = useState<MainFeedTabId>(urlTab);
  if (urlTab !== lastUrlTab) {
    setLastUrlTab(urlTab);
    setActive(urlTab);
  }

  // `useTransition` keeps the click → pill-highlight flip synchronous
  // (so the active state paints in the same frame as the tap) while
  // the RSC refetch for the grid runs as a low-priority transition.
  // `isPending` is exposed so the strip can show a subtle "loading"
  // tint while the new tab's payload streams in.
  const [isPending, startTransition] = useTransition();

  const handleSelect = (id: MainFeedTabId) => {
    if (id === active) return;
    setActive(id);

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
    // `replace` (not push) + `scroll: false`: stays on the same page,
    // doesn't add to history, doesn't jump to top. Wrapped in a
    // transition so React keeps the previous grid interactive until
    // the new RSC payload is ready.
    startTransition(() => {
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

  return (
    <div
      role="tablist"
      aria-label="Product feed sort"
      aria-busy={isPending}
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity duration-150",
        isPending && "opacity-70",
      )}
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
