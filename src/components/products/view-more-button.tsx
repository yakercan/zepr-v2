"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LoadMoreButton } from "@/components/products/load-more-button";
import { parsePageParam } from "@/lib/pagination";

/**
 * "View more" pagination control — URL-driven variant.
 *
 * Clicking increments the current `?page=N` param via
 * `router.replace` inside a `useTransition`. Three properties
 * follow from that:
 *
 *   1. **Refresh-safe** — page state lives in the URL, not in
 *      component state. Hard-reload on `?page=3` re-renders the
 *      same 60 cards.
 *   2. **No flicker** — `useTransition` tells React to hold the
 *      existing grid in view while the new (larger) RSC payload
 *      streams in. No skeleton fallback fires.
 *   3. **Route-agnostic** — the button reads `pathname` and
 *      preserves every other query param (`?tab`, `?q`,
 *      `?subcategory`, etc.) when rewriting the URL. Drop it in
 *      under any product grid — homepage feed, search results,
 *      collection pages — no per-route wiring.
 *
 * Renders nothing when there's nothing more to load. The caller
 * computes `hasMore` from the fetched `total` vs current count
 * and passes it through.
 *
 * Visual is delegated to `<LoadMoreButton>` — every "load more"
 * surface (URL-driven, callback-driven) shares the same look.
 * This component is just the URL-state machine on top of it.
 */
export function ViewMoreButton({
  hasMore,
  className,
  label = "See more",
}: {
  hasMore: boolean;
  className?: string;
  /** Override the default label per surface — e.g. "See more
   *  results" on the search page. */
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (!hasMore) return null;

  function handleClick() {
    const params = new URLSearchParams(searchParams);
    const next = parsePageParam(params.get("page")) + 1;
    params.set("page", String(next));
    startTransition(() => {
      /* `replace` (not `push`) + `scroll: false`: the address bar
       * updates without an extra history entry and the page
       * doesn't jump. The transition lets React hold the existing
       * render while the larger payload streams in. */
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <LoadMoreButton
      onClick={handleClick}
      isPending={isPending}
      label={label}
      className={className}
    />
  );
}
