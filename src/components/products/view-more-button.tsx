"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { parsePageParam } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/**
 * "View more" pagination control.
 *
 * URL-driven by design: clicking increments the current
 * `?page=N` param via `router.replace` inside a `useTransition`.
 * Three properties follow from that:
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
 * Visual: shared `.btn-primary` so the affordance reads as the
 * page's primary CTA. Spinner overlays the label position so the
 * button doesn't change width while loading (avoids the
 * shift-on-click jitter that's easy to ship by accident).
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
      // `replace` (not `push`) + `scroll: false` so the address
      // bar updates without an extra history entry and the page
      // doesn't jump. The transition lets React hold the
      // existing render while the larger payload streams in.
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className={cn("flex justify-center", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        className={cn(
          "btn-primary relative min-w-[160px]",
          // The button is busy, not unavailable — keep the brand
          // orange while pending so the state reads as "loading"
          // instead of "broken". `aria-busy` carries the semantic
          // meaning for assistive tech. The default-cursor part
          // is handled globally by `.btn-primary:disabled` now.
          "disabled:bg-[color:var(--color-brand)]",
        )}
      >
        {/* Label hides on pending so the spinner can claim the
            center without changing the button's intrinsic width. */}
        <span className={cn(isPending && "invisible")}>{label}</span>
        {isPending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner label="Loading more products" />
          </span>
        )}
      </button>
    </div>
  );
}
