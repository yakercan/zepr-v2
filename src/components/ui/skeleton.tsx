import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-element shimmer skeleton.
 *
 * Two divs: a gray placeholder + an absolutely positioned highlight
 * band that slides across via the `shimmer` keyframes defined in
 * `globals.css`. No JS, no observers — pure CSS transform + linear
 * gradient, GPU-only, costs effectively nothing while running.
 *
 * Used both standalone (loading list rows, card placeholders) and as
 * an overlay inside `<ShimmerImage>` while its `<img>` decodes.
 *
 * The caller controls the shape via `className` (width/height) — the
 * component sets only rounding + the shimmer; nothing else.
 */
export interface SkeletonProps {
  className?: string;
  /** Shape preset. `full` for circles, `lg` for cards, `md` everywhere
   *  else. Pass `none` if the parent already clips with its own radius
   *  so the inner overlay doesn't double-round. */
  rounded?: "none" | "md" | "lg" | "full";
  /** Inline style passthrough — useful when the size is dynamic (e.g.
   *  an aspect ratio derived from wire dims) and can't be a class. */
  style?: CSSProperties;
}

const ROUNDED_CLASS: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  none: "",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

export function Skeleton({
  className,
  rounded = "md",
  style,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[color:var(--color-search)]",
        ROUNDED_CLASS[rounded],
        className,
      )}
      style={style}
      aria-hidden
    >
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}
