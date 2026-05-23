import type { ReactNode } from "react";
import type { BadgeView } from "@/lib/badges";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for every pill-style badge on a product card.
 *
 * `ProductBadge` (text label) and `RatingBadge` (star + number)
 * both render through this primitive so the chrome — padding,
 * border weight, corner radius, baseline alignment — stays in one
 * place. The only knobs are accent colour and contents.
 *
 * Kept module-private because every badge type the storefront
 * grows into (verified seller, in-stock, etc.) should compose this
 * helper, not re-implement the chrome.
 */
function BadgeChrome({
  accent,
  className,
  children,
}: {
  accent: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      style={{ borderColor: accent, color: accent }}
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border bg-transparent",
        "px-2 py-0.5 leading-none whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Outline pill carrying a `BadgeView`'s label (product badge or
 * free-shipping). Uppercase + tight tracking so it reads as a tag.
 */
export function ProductBadge({
  badge,
  className,
}: {
  badge: BadgeView;
  className?: string;
}) {
  return (
    <BadgeChrome accent={badge.theme.accent} className={className}>
      <span className="text-xs font-medium uppercase">{badge.label}</span>
    </BadgeChrome>
  );
}

/**
 * Outline pill for the product's average star rating. Same chrome
 * as `ProductBadge` so a card's badge row reads as a single line
 * of equally-weighted markers; ink-coloured so it sits quietly
 * next to the brand / secondary promo pills instead of competing
 * with them.
 *
 * Returns `null` for unrated products so callers can drop the
 * component into the JSX without guarding on `value > 0` first.
 */
export function RatingBadge({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  if (value <= 0) return null;
  return (
    <BadgeChrome accent="var(--color-ink)" className={className}>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="mr-1 h-3 w-3 fill-current"
      >
        <path d="M8 1.5l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 11.99l-4.12 2.17.79-4.58L1.34 6.33l4.6-.67L8 1.5z" />
      </svg>
      <span className="text-xs font-medium tabular-nums">
        {value.toFixed(1)}
      </span>
    </BadgeChrome>
  );
}
