"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  DEFAULT_MAIN_FEED_TAB,
  MAIN_FEED_TABS,
  parseMainFeedTab,
  type MainFeedTabId,
} from "@/config/main-feed-tabs";
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
 * The default tab (`best_sellers`) is encoded as the *absence* of
 * the query param so the canonical home URL stays clean `/`.
 *
 * Visual: reversed-colour pills — active is ink-on-white, idle is
 * white-on-ink. Sticks to the left edge of the page-container so the
 * row reads like a section header, not a centered hero element.
 */
// Every pill carries `border-2 border-transparent` at the base so
// the 2px outline on the idle variant doesn't shift the active pill
// by a pixel when its border collapses into the ink background.
const TAB_BASE_CLASS = cn(
  "shrink-0 rounded-full border-2 border-transparent px-5 py-2.5",
  "text-sm font-semibold leading-none",
  "transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-[color:var(--color-ink)] focus-visible:ring-offset-2",
  "focus-visible:ring-offset-[color:var(--color-page)]",
);

const TAB_ACTIVE_CLASS = cn(
  "bg-[color:var(--color-ink)] text-white",
  "border-[color:var(--color-ink)]",
);

// Idle: white fill, soft gray outline so the pill reads clearly
// against the page even when nothing is hovered. Hover deepens the
// outline + text to ink — colour-only transition keeps it cheap and
// stops the row from "popping" with bg/scale changes on hover.
const TAB_IDLE_CLASS = cn(
  "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
  "border-[color:var(--color-border-strong)]",
  "hover:border-[color:var(--color-ink)]",
);

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

  const handleSelect = (id: MainFeedTabId) => {
    if (id === active) return;
    setActive(id);

    const params = new URLSearchParams(searchParams);
    if (id === DEFAULT_MAIN_FEED_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", id);
    }
    const qs = params.toString();
    // `replace` (not push) + `scroll: false`: stays on the same page,
    // doesn't add to history, doesn't jump to top.
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  };

  return (
    <div
      role="tablist"
      aria-label="Product feed sort"
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
            className={cn(
              TAB_BASE_CLASS,
              isActive ? TAB_ACTIVE_CLASS : TAB_IDLE_CLASS,
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
