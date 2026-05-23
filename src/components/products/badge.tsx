import type { BadgeView } from "@/lib/badges";
import { cn } from "@/lib/utils";

/**
 * Outline-style badge pill — the same chrome whether it's wearing a
 * product theme or the free-shipping theme. The accent colour drives
 * both the border and the label text; the fill stays transparent so
 * the badge reads as a tag rather than competing with the price /
 * title for visual weight.
 *
 * Style cribbed from the original zepr `ProductBadgePill` /
 * `FreeDeliveryBadge`: tight `px-2 py-0.5`, `text-xs` uppercase,
 * `font-medium`, `rounded-md`, `border` (1px) — matches the visual
 * rhythm we want above the product title without introducing new
 * primitives.
 */
export function ProductBadge({
  badge,
  className,
}: {
  badge: BadgeView;
  className?: string;
}) {
  return (
    <span
      style={{ borderColor: badge.theme.accent, color: badge.theme.accent }}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border bg-transparent",
        "px-2 py-0.5",
        "text-xs font-medium uppercase leading-none whitespace-nowrap",
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
