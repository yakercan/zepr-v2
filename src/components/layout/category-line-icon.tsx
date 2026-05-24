import Image from "next/image";
import { getLineCategoryIcon } from "@/config/categories";
import { cn } from "@/lib/utils";

/**
 * Line-art category icon paired with a category `handle`.
 *
 * The header's categories dropdown uses these in two places:
 *
 *   - Left column — leading icon for each row.
 *   - Right column — leading icon next to the active category's
 *     title.
 *
 * `getLineCategoryIcon` returns a CDN path or `null`; we render
 * a neutral placeholder square in the null case so a new
 * category that doesn't have an icon yet still occupies the
 * right amount of space (no layout shift when the asset lands).
 */
export function CategoryLineIcon({
  handle,
  className,
  size = 20,
}: {
  handle: string;
  className?: string;
  /** Both width and height in px — these icons are square. */
  size?: number;
}) {
  const src = getLineCategoryIcon(handle);
  if (!src) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-block shrink-0 rounded bg-[color:var(--color-surface-muted)]",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
