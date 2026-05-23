"use client";

import Link from "next/link";
import { DropdownItem, useDropdownClose } from "@/components/ui/dropdown";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Right-column panel inside the Categories dropdown.
 *
 * Layout:
 *
 *   - **Clickable title** (shrink-0) — the category name itself
 *     is the "All" affordance: clicking it navigates to
 *     `/categories/<handle>` (the unfiltered category) and closes
 *     the dropdown. Hovers brand-orange to telegraph the link.
 *     A soft drop-shadow under the bottom border lifts it above
 *     the scrolling list.
 *   - **Scrolling list** (flex-1 overflow-y-auto) — vertical
 *     "PNG icon + name" rows, one per subcategory, separated by
 *     hairline dividers. Empty (no subcategories) collapses to
 *     just the title — still a useful entry point.
 *
 * Subcategory rows reuse `<DropdownItem>` so the shared hover /
 * active treatment carries over for free. The component
 * re-mounts (via the parent's `key`) on every category swap, so
 * the previous category's icons can never bleed through into the
 * next render.
 */
export function SubcategoryGrid({ category }: { category: TaxonomyCategory }) {
  const subcategories = category.subcategories ?? [];
  const close = useDropdownClose();

  return (
    <div className="flex h-full flex-col">
      <Link
        href={`/categories/${category.handle}`}
        onClick={close}
        className={
          // Sticky header treatment: bottom border + soft drop
          // shadow. The shadow is intentionally subtle — it
          // reads as a quiet lift rather than a hard rule. Hover
          // tints to brand-orange so the title clearly registers
          // as the "browse all" target.
          "block shrink-0 truncate border-b border-[color:var(--color-border)] px-4 py-3 text-base font-semibold text-[color:var(--color-ink)] transition-colors hover:text-[color:var(--color-brand)] shadow-[0_4px_8px_-6px_rgba(0,0,0,0.08)]"
        }
      >
        {category.name}
      </Link>

      {/* Inset dividers — a hairline placed between items rather
       *  than `divide-y` on the wrapper so the line can be
       *  margin-inset to match the row's inner padding (and the
       *  hover bg's rounded corners). Aligns the divider with
       *  where the item *visually* starts instead of butting it
       *  against the panel edges. */}
      <div className="flex-1 overflow-y-auto py-1">
        {subcategories.map((sub, i) => (
          <div key={sub.id}>
            {i > 0 && (
              <div
                aria-hidden
                className="mx-3 h-px bg-[color:var(--color-border)]"
              />
            )}
            <DropdownItem
              href={`/categories/${category.handle}?subcategory=${encodeURIComponent(sub.name)}`}
              icon={<SubcategoryIcon src={sub.iconUrl} fallback={sub.name} />}
            >
              {sub.name}
            </DropdownItem>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Icon size — compact enough that rows don't tower but still
 * large enough for the PNG to read at a glance. Width === height
 * so the shimmer skeleton stays circular while the image decodes. */
const SUBCATEGORY_ICON_PX = 28;

function SubcategoryIcon({
  src,
  fallback,
}: {
  src: string | null;
  /** Single-glyph stand-in when the taxonomy didn't ship an
   *  icon for this entry. */
  fallback: string;
}) {
  if (!src) {
    return (
      <span
        className="flex items-center justify-center rounded-full bg-[color:var(--color-search)] text-[10px] font-semibold text-[color:var(--color-ink-muted)]"
        style={{ width: SUBCATEGORY_ICON_PX, height: SUBCATEGORY_ICON_PX }}
        aria-hidden
      >
        {fallback.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <ShimmerImage
      src={src}
      width={SUBCATEGORY_ICON_PX}
      height={SUBCATEGORY_ICON_PX}
      className="object-contain"
      style={{ width: SUBCATEGORY_ICON_PX, height: SUBCATEGORY_ICON_PX }}
      skeletonRounded="full"
    />
  );
}
