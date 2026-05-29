import type { ReactNode } from "react";
import type { BadgeView } from "@/lib/badges";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for every pill-style badge on a product card.
 *
 * `ProductBadge` (text label) and `RatingBadge` (star + number)
 * both render through this primitive so the chrome — padding,
 * border weight, corner radius, baseline alignment — stays in one
 * place. Two visual modes:
 *
 *   • `outline` (default) — transparent fill, accent border + text.
 *     Used in the meta row above/inline-with the title where the
 *     pill needs to read like a tag, not a CTA.
 *   • `solid` — accent fill, white text. Used as a louder callout
 *     overlaid on the media (e.g. the Free Shipping pill anchored
 *     to the bottom of the image).
 *
 * Kept module-private because every badge type the storefront
 * grows into (verified seller, in-stock, etc.) should compose this
 * helper, not re-implement the chrome.
 */
type BadgeVariant = "outline" | "solid";

function BadgeChrome({
  accent,
  variant = "outline",
  inline = false,
  className,
  children,
}: {
  accent: string;
  variant?: BadgeVariant;
  /** Render as `display:inline` instead of `inline-flex`.
   *
   *  Pass this when the pill flows *inside* a `line-clamp` title.
   *  `line-clamp` makes its container a `display:-webkit-box`, which
   *  stacks any *atomic* inline child (`inline-flex`/`inline-block`,
   *  or a replaced element like an `<svg>`) onto its own line — the
   *  cause of the pill "cutoff" / star-splitting bugs. A plain
   *  `inline` box of pure text flows as ordinary inline content the
   *  clamp handles correctly (and its trailing ellipsis still works).
   *  Callers using `inline` must keep the pill text-only — see
   *  `RatingBadge`, which renders a "★" glyph rather than an svg. */
  inline?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const style =
    variant === "solid"
      ? { backgroundColor: accent, borderColor: accent, color: "#ffffff" }
      : { borderColor: accent, color: accent };
  return (
    <span
      style={style}
      className={cn(
        "rounded-sm border px-2 py-0.5 leading-none whitespace-nowrap",
        inline ? "inline align-middle" : "inline-flex shrink-0 items-center",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Pill carrying a `BadgeView`'s label (product badge or
 * free-shipping). Uppercase so it reads as a tag rather than a
 * sentence. Defaults to the outlined variant; pass
 * `variant="solid"` for the louder filled callout (e.g. the
 * media-overlay Free Shipping pill).
 */
export function ProductBadge({
  badge,
  variant,
  inline,
  className,
}: {
  badge: BadgeView;
  variant?: BadgeVariant;
  /** See `BadgeChrome.inline` — pass when the pill sits inside a
   *  `line-clamp` title. The label is already text-only. */
  inline?: boolean;
  className?: string;
}) {
  return (
    <BadgeChrome
      accent={badge.theme.accent}
      variant={variant}
      inline={inline}
      className={className}
    >
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
  // Always renders `inline` because its only home is the `line-clamp`
  // product-card title. The star is a text "★" glyph rather than an
  // svg: a `line-clamp` title's `-webkit-box` stacks a replaced <svg>
  // onto its own line, splitting it from the number. A glyph is plain
  // inline text, and the chrome's `whitespace-nowrap` keeps "★ 4.7"
  // together.
  return (
    <BadgeChrome accent="var(--color-ink)" inline className={className}>
      <span className="text-xs font-medium tabular-nums">
        <span aria-hidden className="mr-0.5">
          ★
        </span>
        {value.toFixed(1)}
      </span>
    </BadgeChrome>
  );
}
