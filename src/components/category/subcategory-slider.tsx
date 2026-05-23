"use client";

import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { cn } from "@/lib/utils";
import type { TaxonomySubcategory } from "@/types/taxonomy";

/**
 * Subcategory slider for category pages.
 *
 * Horizontally scrollable row of icon bubbles — `All` + every
 * subcategory in the current category. Selection lives in the
 * URL as `?subcategory=<name>` (single value here: subcategories
 * are mutually exclusive in the slider, even though the same
 * key is multi-select in the search page filter bar — the
 * upstream API accepts either shape).
 *
 * URL behaviour on click:
 *
 *   - `All` → drop `?subcategory` (and `?page` so we land at top).
 *   - Any other bubble → set `?subcategory=<name>` (and drop
 *     `?page`). Also clears `?price_min`, `?price_max`, and
 *     `?size` because those are usually only meaningful within
 *     a subcategory — switching one out shouldn't carry the
 *     previous one's price ceilings.
 *
 * `useOptimistic` + `useTransition` keep the selection snappy:
 * the clicked bubble flips to "selected" instantly while
 * Next streams the new payload. Same pattern as the search
 * filter bar — see `<SearchFilters>` for the long-form
 * explanation.
 *
 * Desktop only gets the prev / next scroll buttons; on touch
 * surfaces native pan is already the right gesture and an
 * overlay button would only get in the way.
 */
export interface SubcategorySliderProps {
  subcategories: readonly TaxonomySubcategory[];
  /** Icon for the "All" bubble (the parent category's icon). */
  categoryIconUrl: string | null;
}

const ALL_LABEL = "All";

export function SubcategorySlider({
  subcategories,
  categoryIconUrl,
}: SubcategorySliderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Optimistic mirror of the active subcategory — same rationale
  // as `<SearchFilters>`: `useSearchParams` only updates after
  // the transition's data lands, which would otherwise flash the
  // previously selected bubble while the new payload streams in.
  const realActive = readSubcategory(searchParams);
  const [optimisticActive, setOptimisticActive] = useOptimistic<
    string | null,
    string | null
  >(realActive, (_prev, next) => next);

  // Memoised sorted list so the order is deterministic regardless
  // of how the upstream returned the array.
  const sorted = useMemo(
    () => [...subcategories].sort((a, b) => a.name.localeCompare(b.name)),
    [subcategories],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const { showLeft, showRight, scrollBy } = useEdgeAwareScroll(scrollerRef);

  const handleSelect = useCallback(
    (next: string | null) => {
      // Single-select: clicking the already-active bubble is a
      // no-op (clicking "All" while All is active too) — saves a
      // pointless navigation + RSC roundtrip.
      if (next === optimisticActive) return;

      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("subcategory", next);
      else params.delete("subcategory");
      // Reset filters that were tied to the previous subcategory's
      // result set (price range, size). Sort is intentionally
      // preserved — it's the user's global preference.
      params.delete("price_min");
      params.delete("price_max");
      params.delete("size");
      params.delete("page");

      const qs = params.toString();
      startTransition(() => {
        setOptimisticActive(next);
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [optimisticActive, pathname, router, searchParams, setOptimisticActive],
  );

  if (sorted.length === 0) return null;

  return (
    <div className="relative">
      {/* Left fade — keeps the leftmost bubble from being cut
       *  abruptly while the user scrolls into the row. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-0 z-10 hidden h-full w-16 md:block",
          "bg-gradient-to-r from-[color:var(--color-bg)] to-transparent",
          "transition-opacity duration-150",
          showLeft ? "opacity-100" : "opacity-0",
        )}
      />
      <ScrollButton
        direction="left"
        show={showLeft}
        onClick={() => scrollBy(-1)}
      />

      <div
        ref={scrollerRef}
        // `scroll-smooth` so the JS-driven scrollBy animates;
        // `snap-x snap-proximity` keeps native pan feeling solid
        // without being aggressive about it.
        className={cn(
          "flex gap-8 overflow-x-auto scroll-smooth px-2 pb-2 pt-1",
          "snap-x snap-proximity",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        <SubcategoryBubble
          label={ALL_LABEL}
          imageUrl={categoryIconUrl}
          selected={optimisticActive === null}
          onClick={() => handleSelect(null)}
        />
        {sorted.map((s) => (
          <SubcategoryBubble
            key={s.id}
            label={s.name}
            imageUrl={s.iconUrl}
            selected={optimisticActive === s.name}
            onClick={() => handleSelect(s.name)}
          />
        ))}
      </div>

      <ScrollButton
        direction="right"
        show={showRight}
        onClick={() => scrollBy(1)}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-0 top-0 z-10 hidden h-full w-16 md:block",
          "bg-gradient-to-l from-[color:var(--color-bg)] to-transparent",
          "transition-opacity duration-150",
          showRight ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bubble                                                              */
/* ------------------------------------------------------------------ */

function SubcategoryBubble({
  label,
  imageUrl,
  selected,
  onClick,
}: {
  label: string;
  imageUrl: string | null | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      // Width caps the label so multi-word names wrap cleanly
      // beneath the bubble instead of stretching the row.
      className={cn(
        "group flex w-24 shrink-0 snap-start flex-col items-center gap-2",
        "focus:outline-none",
      )}
    >
      <span
        className={cn(
          "relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full",
          "border-2 transition-colors duration-150",
          // Selected → ink border. Idle → faint outline that
          // firms up to ink on hover. Matches the outline-variant
          // styling on the filter pills, so the visual language
          // stays consistent across the page.
          selected
            ? "border-[color:var(--color-ink)]"
            : "border-[color:var(--color-border)] group-hover:border-[color:var(--color-ink)]",
        )}
      >
        {imageUrl ? (
          // No inner padding — the icon fills the bubble flush
          // against the border, which the user explicitly asked
          // for ("remove gap between border and icon itself").
          <ShimmerImage
            src={imageUrl}
            alt=""
            wrapperClassName="block h-full w-full"
            skeletonRounded="full"
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <BubbleFallback />
        )}
      </span>
      <span
        className={cn(
          "text-center text-sm font-medium leading-tight",
          "transition-colors duration-150",
          selected
            ? "text-[color:var(--color-ink)]"
            : "text-[color:var(--color-ink-muted)] group-hover:text-[color:var(--color-ink)]",
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Tiny diamond/box glyph used when a subcategory has no
 *  icon — same shape zepr falls back to so users don't get
 *  a confusing "missing" gap. */
function BubbleFallback() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-8 w-8 text-[color:var(--color-ink-muted)] opacity-60"
      fill="currentColor"
    >
      <path d="M12 2 2 7l10 5 10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scroll button                                                       */
/* ------------------------------------------------------------------ */

function ScrollButton({
  direction,
  show,
  onClick,
}: {
  direction: "left" | "right";
  show: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-hidden={!show}
      aria-label={direction === "left" ? "Scroll left" : "Scroll right"}
      tabIndex={show ? 0 : -1}
      className={cn(
        // Hidden on mobile — touch users already have native
        // panning. Visible on `md:` upward as an overlay puck.
        "absolute top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center",
        "rounded-full bg-white shadow-md md:flex",
        "border border-[color:var(--color-border)]",
        "transition-opacity duration-150",
        "hover:border-[color:var(--color-ink)]",
        show ? "opacity-100" : "pointer-events-none opacity-0",
        direction === "left" ? "left-0" : "right-0",
      )}
    >
      {direction === "left" ? (
        <ChevronLeftIcon className="h-4 w-4" />
      ) : (
        <ChevronRightIcon className="h-4 w-4" />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/**
 * Tracks the scroll position of a horizontal scroller and
 * exposes:
 *
 *   - `showLeft`  — `true` once the user has scrolled past the
 *                   left edge (so the back button can fade in).
 *   - `showRight` — `true` while there's still content past the
 *                   right edge.
 *   - `scrollBy(direction)` — animates the scroller one
 *                   "viewport-of-content" worth in `direction`
 *                   (`-1` ← / `+1` →).
 *
 * Two listeners (`scroll` + a `ResizeObserver`) so the buttons
 * also react when the container width changes — e.g. the user
 * resizes the window or rotates a tablet.
 */
function useEdgeAwareScroll(ref: React.RefObject<HTMLElement | null>) {
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      // 1px tolerance so sub-pixel rounding doesn't keep the
      // buttons stuck "on" at the extremes.
      setShowLeft(el.scrollLeft > 1);
      setShowRight(el.scrollLeft < maxScroll - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref]);

  const scrollBy = useCallback(
    (direction: -1 | 1) => {
      const el = ref.current;
      if (!el) return;
      // 80 % of the visible width = "one screen, with a little
      // overlap so the user doesn't lose their place".
      el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
    },
    [ref],
  );

  return { showLeft, showRight, scrollBy };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Reads the (single) active subcategory from URL params. The
 *  filter bar treats subcategory as multi-select; the slider
 *  treats it as single-select. We pick the first value (or
 *  `null` if absent) so a stray multi-value URL still resolves
 *  to a coherent slider selection instead of throwing. */
function readSubcategory(
  params: ReadonlyURLSearchParams,
): string | null {
  const v = params.get("subcategory");
  return v && v.length > 0 ? v : null;
}
