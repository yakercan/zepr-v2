import type { Metadata } from "next";
import Link from "next/link";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { DEFAULT_CATEGORIES } from "@/config/categories";
import { getTaxonomy } from "@/lib/salespace/taxonomy";
import { cn } from "@/lib/utils";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * `/categories` — index of every top-level category as a card
 * grid. Card image is the category's CDN image, label is the
 * category name; tapping the card lands the user on
 * `/categories/[handle]` where the subcategory slider + filter
 * bar take over.
 *
 * No products are fetched here — the upstream taxonomy is the
 * only call, and it's already cached for an hour. Falls back
 * to `DEFAULT_CATEGORIES` when the API is unreachable so the
 * route never serves an empty page.
 */

export const metadata: Metadata = {
  title: "Categories",
  description: "Browse every category on zepr.",
};

export default async function CategoryIndexPage() {
  const taxonomy = await getTaxonomy();
  const categories = taxonomy?.categories?.length
    ? taxonomy.categories
    : DEFAULT_CATEGORIES;

  return (
    <div className="page-container flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          Pick a category to start browsing.
        </p>
      </header>
      <ul
        className={cn(
          "grid gap-4",
          // 2 → 3 → 4 columns as the viewport widens. Same
          // breakpoints `<ProductGrid>` uses, so the index
          // and the inner pages feel like they were designed
          // together (which they were).
          "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
        )}
      >
        {categories.map((c, i) => (
          <li key={c.id}>
            <CategoryCard category={c} eager={i < 4} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function CategoryCard({
  category,
  eager,
}: {
  category: TaxonomyCategory;
  eager?: boolean;
}) {
  // Prefer the colourful CDN imageUrl, fall back to the line
  // icon when no banner is available. Both surfaces look
  // intentional — never a broken image.
  const imageUrl = category.imageUrl ?? category.iconUrl;

  return (
    <Link
      href={`/categories/${category.handle}`}
      // Same hover + border treatment as `<ProductCard>` so the
      // index cards and the product grid speak the same visual
      // language.
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl",
        "border border-[color:var(--color-border)]",
        "bg-white transition-colors duration-150",
        "hover:border-[color:var(--color-ink)]",
      )}
    >
      <div className="relative aspect-square w-full bg-[color:var(--color-surface)]">
        {imageUrl ? (
          <ShimmerImage
            src={imageUrl}
            alt=""
            // Slight inner padding so the contained image
            // breathes against the rounded media well — same
            // trick the homepage banner uses.
            wrapperClassName="absolute inset-0 block"
            className="h-full w-full object-contain p-6 transition-transform duration-200 group-hover:scale-[1.02]"
            skeletonRounded="none"
            loading={eager ? "eager" : "lazy"}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-[color:var(--color-ink-muted)]"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor">
              <path d="M12 2 2 7l10 5 10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-[color:var(--color-ink)]">
          {category.name}
        </span>
        {category.productCount > 0 && (
          <span className="text-xs text-[color:var(--color-ink-muted)]">
            {category.productCount.toLocaleString()}
          </span>
        )}
      </div>
    </Link>
  );
}
