import Image from "next/image";
import Link from "next/link";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Subcategory grid rendered inside the Categories dropdown's right
 * column.
 *
 * Pure UI — receives the active category and produces a 4-column grid
 * of circular icons + names, plus an "All" tile that links to the
 * category's collection page. Mirrors the original zepr mega menu
 * layout so the visual language stays consistent.
 *
 * When a category has no subcategories (e.g. the static fallback used
 * before the Salespace taxonomy API responds), we still render the
 * "All" tile so the user has a useful destination.
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
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[color:var(--color-search)] transition-transform duration-200 group-hover:scale-[1.04]">
        {iconUrl ? (
          <Image
            src={iconUrl}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
            unoptimized
          />
        ) : (
          <span className="text-sm font-medium text-[color:var(--color-ink-muted)]">
            {fallback}
          </span>
        )}
      </span>
      <span className="text-xs font-medium leading-tight text-[color:var(--color-ink)] transition-colors duration-200 group-hover:text-[color:var(--color-brand)]">
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
        <Image
          src={category.iconUrl}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 opacity-80"
          unoptimized
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
