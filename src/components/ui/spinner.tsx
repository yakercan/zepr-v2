import { cn } from "@/lib/utils";

/**
 * Inline loading spinner.
 *
 * One ring, three-quarters opaque, one quarter transparent, spun
 * with `animate-spin` (Tailwind's built-in `linear infinite`
 * keyframe). No SVG — a CSS border ring is cheaper and renders
 * crisply at any DPR without anti-aliasing artefacts.
 *
 * Picks up `currentColor` for the visible arc, so the spinner
 * always matches whatever text colour wraps it — white on the
 * brand button, ink on a light surface, brand orange inside an
 * icon-bubble. No `colour` prop needed.
 *
 * Sizes mirror the rest of the UI: `sm` ≈ 14px (inline with
 * text), `md` ≈ 16px (default — fits next to `btn-primary` label
 * heights), `lg` ≈ 20px (block-level loaders). Override with a
 * className utility (`h-N w-N`) if a one-off needs something
 * specific; the className wins via tailwind-merge.
 *
 * Always renders an `aria-label` and `role="status"` so screen
 * readers announce loading state without the caller having to
 * remember it.
 */
export interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Override the default "Loading" announcement when the
   *  context demands a more specific label (e.g. "Loading more
   *  products"). */
  label?: string;
}

const SIZE_CLASS: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-3.5 w-3.5 border-2",
  md: "h-4 w-4 border-2",
  lg: "h-5 w-5 border-[2.5px]",
};

export function Spinner({
  className,
  size = "md",
  label = "Loading",
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full",
        // The trick: opaque current-colour ring with one side
        // turned transparent → spinning arc. No keyframe of our
        // own; `animate-spin` is Tailwind's stock infinite rotate.
        "border-current border-t-transparent",
        SIZE_CLASS[size],
        className,
      )}
    />
  );
}
