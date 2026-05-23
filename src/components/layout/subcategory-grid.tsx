import Link from "next/link";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Subcategory grid rendered inside the Categories dropdown's right
 * column.
 *
 * Pure UI — receives the active category and produces a 4-column grid
 * of icons + names plus an "All" tile that links to the category's
 * collection page. Icons use `<ShimmerImage>` so the panel paints a
 * skeleton while CDN PNGs decode (especially on the first hover of a
 * given category — subsequent hovers hit the browser cache and the
 * shimmer never appears).
 *
 * The grid only mounts when the parent `<Dropdown>` swaps the active
 * panel (via a React `key` keyed on category handle), so previous
 * category's icons can't bleed through into the next one.
 */
export function SubcategoryGrid({ category }: { category: TaxonomyCategory }) {
  const subcategories = category.subcategories ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-[color:var(--color-ink)]">
          {category.name}
        </h3>
        <Link
          href={`/collections/${category.handle}`}
          className="text-xs font-medium text-[color:var(--color-brand)] hover:underline"
        >
          Shop all
        </Link>
      </div>

      {subcategories.length === 0 ? (
        <SubcategoryEmpty category={category} />
      ) : (
        <div className="grid grid-cols-4 gap-x-4 gap-y-6">
          <SubcategoryTile
            href={`/collections/${category.handle}`}
            label="All"
            iconUrl={category.iconUrl}
            fallback="All"
          />
          {subcategories.map((sub) => (
            <SubcategoryTile
              key={sub.id}
              href={`/collections/${category.handle}?subcategory=${encodeURIComponent(sub.name)}`}
              label={sub.name}
              iconUrl={sub.iconUrl}
              fallback={sub.name.charAt(0)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* Tile icon size — bumped from 44px → 56px for legibility now that
 * the gray circle backplate is gone. Width === height so the shimmer
 * skeleton inherits a perfect square footprint while loading. */
const TILE_ICON_PX = 56;

function SubcategoryTile({
  href,
  label,
  iconUrl,
  fallback,
}: {
  href: string;
  label: string;
  iconUrl: string | null;
  fallback: string;
}) {
  /* Named `group/tile` so hover state is scoped to this tile only —
   * the dropdown's outer `group/dropdown` won't also fire. */
  return (
    <Link
      href={href}
      className="group/tile flex flex-col items-center gap-1.5 text-center"
    >
      <span
        className="flex items-center justify-center transition-transform duration-200 group-hover/tile:scale-[1.06]"
        style={{ width: TILE_ICON_PX, height: TILE_ICON_PX }}
      >
        {iconUrl ? (
          <ShimmerImage
            src={iconUrl}
            width={TILE_ICON_PX}
            height={TILE_ICON_PX}
            className="object-contain"
            style={{ width: TILE_ICON_PX, height: TILE_ICON_PX }}
            skeletonRounded="full"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center rounded-full bg-[color:var(--color-search)] text-sm font-medium text-[color:var(--color-ink-muted)]"
            aria-hidden
          >
            {fallback}
          </span>
        )}
      </span>
      <span className="text-xs font-medium leading-tight text-[color:var(--color-ink)] transition-colors duration-200 group-hover/tile:text-[color:var(--color-brand)]">
        {label}
      </span>
    </Link>
  );
}

/** Shown when the category has no subcategories yet — encourages the
 *  user to shop the category itself rather than dead-ending. */
function SubcategoryEmpty({ category }: { category: TaxonomyCategory }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
      {category.iconUrl && (
        <ShimmerImage
          src={category.iconUrl}
          width={64}
          height={64}
          className="object-contain opacity-80"
          style={{ width: 64, height: 64 }}
          skeletonRounded="full"
        />
      )}
      <p className="max-w-[16rem] text-sm text-[color:var(--color-ink-secondary)]">
        Browse the full {category.name} collection.
      </p>
      <Link
        href={`/collections/${category.handle}`}
        className="inline-flex items-center rounded-full bg-[color:var(--color-brand)] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-hover)]"
      >
        Shop {category.name}
      </Link>
    </div>
  );
}
