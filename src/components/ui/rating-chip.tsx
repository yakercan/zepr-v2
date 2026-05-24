import { cn } from "@/lib/utils";

/**
 * Compact rating display — a single brand-orange star + the
 * numeric rating to one decimal, optionally followed by a
 * total-count `(n)` for aggregates.
 *
 *     ★ 4.5            individual review (rating only)
 *     ★ 4.7 (24)       aggregate (PDP accordion title aside)
 *
 * One primitive, one format, used everywhere a rating shows up.
 * A five-star strip would have been redundant alongside the
 * precise decimal number and would also drag attention away
 * from the brand-orange CTAs sitting next to it — the compact
 * chip reads at a glance without competing.
 *
 * Returns `null` when `value <= 0` so callers can drop it in
 * without guarding on "is there a rating yet".
 *
 * Server-component-safe (no hooks, no client APIs).
 */
export interface RatingChipProps {
  /** Numeric rating, 0–5. Rendered to one decimal place. */
  value: number;
  /** Optional total review count, appended in parentheses.
   *  Only meaningful for aggregate ratings — per-review usages
   *  leave this undefined and the count is omitted. */
  count?: number;
  className?: string;
}

export function RatingChip({ value, count, className }: RatingChipProps) {
  if (!(value > 0)) return null;

  const accessibleLabel =
    count !== undefined && count > 0
      ? `${value.toFixed(1)} out of 5 from ${count} review${count === 1 ? "" : "s"}`
      : `${value.toFixed(1)} out of 5`;

  return (
    <span
      role="img"
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-sm tabular-nums",
        className,
      )}
    >
      <Star className="h-3.5 w-3.5 text-[color:var(--color-brand)]" />
      <span className="font-semibold text-[color:var(--color-ink)]">
        {value.toFixed(1)}
      </span>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-[color:var(--color-ink-muted)]">
          ({count})
        </span>
      )}
    </span>
  );
}

function Star({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn("fill-current", className)}
    >
      <path d="M8 1.5l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 11.99l-4.12 2.17.79-4.58L1.34 6.33l4.6-.67L8 1.5z" />
    </svg>
  );
}
