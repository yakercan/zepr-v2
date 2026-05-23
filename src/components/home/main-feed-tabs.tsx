"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DEFAULT_MAIN_FEED_TAB,
  MAIN_FEED_TABS,
  parseMainFeedTab,
  type MainFeedTabId,
} from "@/config/main-feed-tabs";
import { SURFACE_OUTLINE_CLASSES } from "@/lib/styles";
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

// Idle: white fill, shared `SURFACE_OUTLINE_CLASSES` preset for
// the soft grey → ink hover transition. The preset includes its
// own `border-2`, so no separate border-width is needed here.
// `SURFACE_OUTLINE_CLASSES` is the single source of truth for
// "selectable surface outline" across tabs, cards, and any future
// chip / picker — change it once in `lib/styles.ts`, every surface
// tracks.
const TAB_IDLE_CLASS = cn(
  "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
  SURFACE_OUTLINE_CLASSES,
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
