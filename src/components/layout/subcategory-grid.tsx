"use client";

import { DropdownItem } from "@/components/ui/dropdown";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Right-column panel inside the Categories dropdown.
 *
 * Vertical list (not a grid of bubbles): each row is a CDN PNG
 * icon + name, sharing the standard `<DropdownItem>` chrome so
 * hover / active states match the left column without bespoke
 * styling.
 *
 * The first row is "All" — same destination as clicking the
 * left-column row itself (`/category/<handle>`) but placed
 * here so users browsing the right column don't have to dart
 * back to the left column to get to the unfiltered category.
 *
 * The list scrolls inside its absolutely-positioned parent
 * column (see `<Dropdown>` sideMode notes) so a category with
 * 30 subcategories doesn't blow out the panel height — the
 * panel always ends where the left column's category list ends.
 *
 * The component re-mounts (via the parent's `key`) every time
 * the active row changes, so the previous category's icons can
 * never bleed through into the next render.
 */
export function SubcategoryGrid({ category }: { category: TaxonomyCategory }) {
  const subcategories = category.subcategories ?? [];

  return (
    <div className="flex flex-col">
      <h3 className="mb-1 truncate px-3 pt-1 text-base font-semibold text-[color:var(--color-ink)]">
        {category.name}
      </h3>

      <DropdownItem
        href={`/category/${category.handle}`}
        icon={<SubcategoryIcon src={category.iconUrl} fallback="All" />}
      >
        All
      </DropdownItem>
      {subcategories.map((sub) => (
        <DropdownItem
          key={sub.id}
          href={`/category/${category.handle}?subcategory=${encodeURIComponent(sub.name)}`}
          icon={<SubcategoryIcon src={sub.iconUrl} fallback={sub.name} />}
        >
          {sub.name}
        </DropdownItem>
      ))}
    </div>
  );
}

/* Icon size mirrors the chunkier banner-like feel the user
 * wanted — bigger than the 16px account-dropdown SVGs but still
 * compact enough that rows don't tower. Width === height keeps
 * the shimmer skeleton circular while the PNG decodes. */
const SUBCATEGORY_ICON_PX = 28;

function SubcategoryIcon({
  src,
  fallback,
}: {
  src: string | null;
  /** Single-glyph stand-in (first letter, "All", …) when the
   *  taxonomy didn't ship an icon for this entry. */
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
