"use client";

import { useBadgeAnimation } from "@/lib/hooks/use-badge-animation";
import { cn } from "@/lib/utils";

/**
 * Animated counter pill — the visual primitive behind every
 * "small number in a badge" surface.
 *
 * Two CSS layers, driven by `useBadgeAnimation`:
 *
 *   - **Outer slot** — `overflow-hidden` wrapper whose
 *     `max-width` + `margin-left` collapse to zero when the
 *     count is 0, slide open when positive. Gives sibling text
 *     room to shift, but only when there's actually a number to
 *     show.
 *   - **Inner pill** — brand-coloured circle that fades in once
 *     the slot is open and fades out before it collapses.
 *
 * Capped at `9+` past 9 so geometry stays stable regardless of
 * the underlying count.
 *
 * Three sizes, each tuned for the typography it sits next to:
 *
 *   - `header` — alongside a `text-[15px]` nav label
 *     ("Favorites").
 *   - `title` — alongside a `text-2xl/3xl` page heading.
 *   - `drawer` — alongside the drawer's `text-base` "Your cart"
 *     heading. Slightly smaller than `header` to read as a
 *     companion to the title rather than a competing element.
 *
 * No data source — pass `count` in. Cart and favourites each
 * wrap this with their respective subscribers + initial-paint
 * hydration logic.
 */

export type CountBadgeSize = "header" | "title" | "drawer";

interface SizeStyles {
  /** Always-applied slot styling — explicit height pins the
   *  inline-flex box to exactly the pill's height so the
   *  `overflow-hidden` (needed for the horizontal slide
   *  animation) can't clip the pill vertically when the parent
   *  text line-box rounds a fraction shorter than the pill. */
  slotBase: string;
  /** Slot styling when the pill is mounted — controls the
   *  horizontal slide-in (margin + max-width). */
  slotOpen: string;
  pill: string;
  /** Sub-pixel optical-centre nudge — at small font-sizes the
   *  numeral's baseline sits a fraction below the pill's
   *  geometric centre, so a CSS translate pulls it back onto
   *  the optical axis. Empty when the natural lay-up is fine. */
  digit: string;
}

const SIZE_STYLES: Record<CountBadgeSize, SizeStyles> = {
  header: {
    slotBase: "h-5",
    slotOpen: "ml-1.5 max-w-9",
    pill: "h-5 min-w-5 px-1.5 text-[11px]",
    digit: "-translate-y-[0.5px]",
  },
  title: {
    slotBase: "h-7",
    slotOpen: "ml-3 max-w-14",
    pill: "h-7 min-w-7 px-2.5 text-sm",
    digit: "",
  },
  drawer: {
    /* `ml-2` (8px) reads as "this number belongs to the title"
     * without crowding the `Y` in "Your cart". `max-w-9` clears
     * the "9+" pill at its widest with breathing room. */
    slotBase: "h-[22px]",
    slotOpen: "ml-2 max-w-9",
    pill: "h-[22px] min-w-[22px] px-1.5 text-xs",
    digit: "",
  },
};

export interface CountBadgePillProps {
  count: number;
  size?: CountBadgeSize;
}

export function CountBadgePill({
  count,
  size = "header",
}: CountBadgePillProps) {
  const { mounted, visible, display } = useBadgeAnimation(count);
  const styles = SIZE_STYLES[size];

  return (
    <span
      aria-hidden={!mounted}
      className={cn(
        "inline-flex items-center overflow-hidden align-middle transition-all duration-300 ease-out",
        styles.slotBase,
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
