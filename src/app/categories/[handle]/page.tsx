import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CollectionViewTracker } from "@/components/analytics/view-trackers";
import {
  CategoryResults,
  CategoryResultsSkeleton,
} from "@/components/category/category-results";
import { SubcategorySlider } from "@/components/category/subcategory-slider";
import { DEFAULT_CATEGORIES } from "@/config/categories";
import { site } from "@/config/site";
import { JsonLd } from "@/lib/seo/json-ld";
import {
  breadcrumbSchema,
  collectionPageSchema,
  SITE_URL,
} from "@/lib/seo/structured-data";
import { getTaxonomy } from "@/lib/salespace/taxonomy";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * `/categories/[handle]?page=N&sort=…&subcategory=…&price_min=…
 *                      &price_max=…&size=…`
 *
 * Thin shell:
 *
 *   1. Validate `handle` against the taxonomy (404 if unknown
 *      so we never render a stranded subcategory slider with
 *      no products underneath).
 *   2. Render the subcategory slider *outside* the `<Suspense>`
 *      so it stays mounted across filter / page changes — same
 *      reasoning that keeps `<SearchFilters>` mounted inside
 *      its `<Suspense>` on `/search`.
 *   3. Stream the products + filter bar inside a `<Suspense>`
 *      keyed on the handle. Different category → skeleton flash;
 *      same category + new filter / page → in-place transition.
 */

interface CategoryPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{
    page?: string;
    sort?: string;
    subcategory?: string | string[];
    price_min?: string;
    price_max?: string;
    size?: string | string[];
  }>;
}

/** Compelling, indexable description for a category landing page.
 *  Mirrors the legacy storefront's tailored collection copy without
 *  the per-handle switch — the name-driven template reads well for
 *  every category and stays in one place. */
function categoryDescription(name: string): string {
  return `Shop ${name} at ${site.name} — discover trending ${name.toLowerCase()} with exclusive bundle deals and free shipping on all orders.`;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { handle } = await params;
  const category = await resolveCategory(handle);
  if (!category) {
    return { title: "Category", robots: { index: false } };
  }
  const description = categoryDescription(category.name);
  const path = `/categories/${category.handle}`;
  return {
    title: category.name,
    description,
    /* Canonical strips filter/sort/page query params so every
     *  faceted view of a category consolidates onto the clean
     *  landing URL — the one we actually want ranking. */
    alternates: { canonical: path },
    openGraph: {
      title: category.name,
      description,
      url: `${SITE_URL}${path}`,
      ...(category.imageUrl ? { images: [{ url: category.imageUrl }] } : {}),
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  const category = await resolveCategory(handle);
  if (!category) notFound();

  // Lift the full category list once for the filter bar
  // fallback path (used only when facets are unavailable —
  // keeps the bar useful when the API is briefly degraded).
  const categories = await loadCategories();

  return (
    <div className="page-container flex flex-col gap-6 py-6">
      {/* Breadcrumb trail + CollectionPage node. The grid's product
          links each carry their own Product schema on their PDPs, so
          we don't duplicate an ItemList of the results here. */}
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", url: "/" },
            { name: category.name },
          ]),
          collectionPageSchema({
            name: category.name,
            description: categoryDescription(category.name),
            path: `/categories/${category.handle}`,
            image: category.imageUrl,
          }),
        ]}
      />
      {category.shopifyCollectionId && (
        <CollectionViewTracker
          collectionId={category.shopifyCollectionId}
          handle={category.handle}
        />
      )}
      <SubcategorySlider
        subcategories={category.subcategories}
        categoryIconUrl={category.iconUrl}
      />
      <Suspense key={handle} fallback={<CategoryResultsSkeleton />}>
        <CategoryResults
          handle={handle}
          pageParam={sp.page}
          sort={sp.sort}
          subcategory={toArray(sp.subcategory)}
          priceMin={parsePositiveInt(sp.price_min)}
          priceMax={parsePositiveInt(sp.price_max)}
          size={toArray(sp.size)}
          categories={categories}
        />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolve a category by handle from the live taxonomy, falling
 * back to the static `DEFAULT_CATEGORIES` if the upstream is
 * unavailable. Returns `null` when the handle isn't in either
 * source so the caller can 404 cleanly.
 */
async function resolveCategory(handle: string): Promise<TaxonomyCategory | null> {
  const taxonomy = await getTaxonomy();
  const list = taxonomy?.categories?.length
    ? taxonomy.categories
    : DEFAULT_CATEGORIES;
  return list.find((c) => c.handle === handle) ?? null;
}

async function loadCategories(): Promise<readonly TaxonomyCategory[]> {
  const taxonomy = await getTaxonomy();
  return taxonomy?.categories?.length
    ? taxonomy.categories
    : DEFAULT_CATEGORIES;
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const trimmed = arr.filter((v) => v !== "");
  return trimmed.length ? trimmed : undefined;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
