"use client";

import { useEffect } from "react";

import {
  seedFavorites,
  useFavoritesCount,
} from "@/lib/favorites/store";
import { useBadgeAnimation } from "@/lib/hooks/use-badge-animation";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

/**
 * Animated counter pill next to the "Favorites" header label.
 *
 * Two CSS layers, driven by `useBadgeAnimation`:
 *
 *   - **Outer slot** — `overflow-hidden` wrapper whose `max-width`
 *     and `margin-left` collapse to zero when the count is 0 and
 *     slide open when positive.
 *   - **Inner pill** — brand-colored circle that fades in once
 *     the slot is open and fades out before it collapses.
 *     `leading-none` is load-bearing for vertical centering.
 *
 * Capped at `9+` past 9 so the geometry stays stable.
 *
 * Doubles as the canonical seeder for the favorites store: on
 * mount it calls `seedFavorites(initialIds)` so every other
 * consumer (card hearts, `/favorites` grid filter) reads the
 * same set reactively. The header lives in the layout, so this
 * seed runs on every navigation / hard reload, keeping the
 * client in sync with Salespace.
 *
 * SSR-safe first paint: `useHydrated()` is false during SSR and
 * the first client render, so `count` resolves to
 * `initialIds.size` end-to-end. That puts `useBadgeAnimation`'s
 * `useState` initializers in their final pose on mount — no
 * entry transition on reload, only on subsequent 0 ↔ N flips.
 */
export type FavoritesBadgeSize = "header" | "title";

interface SizeStyles {
  /** Outer slot — `ml` and `max-w` collapse to 0 when no count. */
  slotOpen: string;
  /** Inner pill geometry. Brand color applied via inline style so
   *  theme tokens stay the only source of truth for it. */
  pill: string;
  /** Optical-center nudge for the digit. At small sizes the
   *  sans-serif numeral's baseline sits a fraction off the pill's
   *  geometric centre; a sub-pixel translate brings it back
   *  on-axis. Empty string when no nudge is needed. */
  digit: string;
}

const SIZE_STYLES: Record<FavoritesBadgeSize, SizeStyles> = {
  header: {
    /* `ml-1.5` (6px) sits a hair off the 15px label — close enough
     * to read as one unit, but with enough air that the pill
     * doesn't crowd the descender of the "F". `max-w-9` clears the
     * "9+" pill at its widest with margin so the slide can
     * complete before the easing curve compresses. */
    slotOpen: "ml-1.5 max-w-9",
    pill: "h-5 min-w-5 px-1.5 text-[11px]",
    /* At 11px the numeral sits a fraction below the pill's
     * geometric centre; a 0.5px upward translate brings it
     * onto the optical axis. Horizontal centring lands cleanly
     * at the geometric centre, so no x-axis nudge here. */
    digit: "-translate-y-[0.5px]",
  },
  title: {
    /* `/favorites` page heading — pill sits at ~28px to read
     * confidently next to a `text-2xl`/`text-3xl` title without
     * overpowering it. `ml-3` (12px) is the breathing room from
     * the "Favorites" wordmark; `max-w-14` (56px) clears the
     * "9+" pill at the larger size. */
    slotOpen: "ml-3 max-w-14",
    pill: "h-7 min-w-7 px-2.5 text-sm",
    /* Title-size digit lands on-axis naturally at `text-sm`. */
    digit: "",
  },
};

export interface FavoritesBadgeProps {
  /** Server-rendered snapshot of the shopper's favorited ids.
   *  Both seeds the store (so cards across the page read the
   *  same Set reactively) and provides the SSR-matching first-
   *  paint count. */
  initialIds: ReadonlySet<string>;
  size?: FavoritesBadgeSize;
}

export function FavoritesBadge({
  initialIds,
  size = "header",
}: FavoritesBadgeProps) {
  const hydrated = useHydrated();
  const storeCount = useFavoritesCount();

  useEffect(() => {
    seedFavorites(initialIds);
  }, [initialIds]);

  /* Server snapshot until hydrated, store after. The store's
   * own effect (`seedFavorites` above) populates it before the
   * first post-hydration render, so the handoff is silent. */
  const count = hydrated ? storeCount : initialIds.size;
  const { mounted, visible, display } = useBadgeAnimation(count);
  const styles = SIZE_STYLES[size];

  return (
    <span
      aria-hidden={!mounted}
      className={cn(
        "inline-flex items-center overflow-hidden transition-all duration-300 ease-out",
        mounted ? styles.slotOpen : "ml-0 max-w-0",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full font-semibold leading-none tabular-nums text-white transition-opacity duration-300 ease-out",
          styles.pill,
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ backgroundColor: "var(--color-brand)" }}
      >
        <span className={cn("inline-block", styles.digit)}>
          {display > 9 ? "9+" : display}
        </span>
      </span>
    </span>
  );
}
