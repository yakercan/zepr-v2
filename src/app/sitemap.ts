import type { MetadataRoute } from "next";
import { DEFAULT_CATEGORIES } from "@/config/categories";
import { searchProducts } from "@/lib/salespace/search";
import { getTaxonomy } from "@/lib/salespace/taxonomy";
import { SITE_URL } from "@/lib/seo/structured-data";

/**
 * `/sitemap.xml` — the indexable URL inventory we hand to Search
 * Console: the home page, the indexable static routes, every
 * category landing page (from the live taxonomy), and every product
 * PDP (enumerated from the Salespace search index).
 *
 * Regenerated daily via ISR (`revalidate`) so new products show up
 * without a redeploy, while the build/edge only pays the
 * enumeration cost once per day rather than per request. Only
 * indexable surfaces appear here — `noindex` pages (cart, account,
 * legal, favorites) are intentionally omitted.
 */

export const revalidate = 86400; // 24h

/** Upstream page size for product enumeration. Conservative so we
 *  never trip an API page-size cap. */
const PRODUCT_PAGE = 100;
/** Soft ceiling on PDP entries — comfortably under the 50k-URL
 *  per-file sitemap limit, and a guard against runaway pagination.
 *  Raise (or split into a sitemap index) if the catalogue grows
 *  past this. */
const MAX_PRODUCTS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const [categoryEntries, productEntries] = await Promise.all([
    collectCategoryEntries(now),
    collectProductEntries(now),
  ]);

  return [...staticEntries, ...categoryEntries, ...productEntries];
}

/** Category landing pages from the live taxonomy, falling back to
 *  the static list when the API is unavailable (same fallback the
 *  header and category route use). */
async function collectCategoryEntries(
  now: Date,
): Promise<MetadataRoute.Sitemap> {
  const taxonomy = await getTaxonomy();
  const categories = taxonomy?.categories?.length
    ? taxonomy.categories
    : DEFAULT_CATEGORIES;
  return categories.map((category) => ({
    url: `${SITE_URL}/categories/${category.handle}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));
}

/** Walk the search index page by page, collecting unique product
 *  handles into PDP URLs. Stops at the first short page, when the
 *  reported total is reached, or at `MAX_PRODUCTS` — whichever comes
 *  first. */
async function collectProductEntries(
  now: Date,
): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();

  for (let page = 1; entries.length < MAX_PRODUCTS; page++) {
    const result = await searchProducts(
      { limit: PRODUCT_PAGE, page },
      { revalidate, tags: ["sitemap", "products"] },
    );
    if (!result.hits.length) break;

    for (const hit of result.hits) {
      if (seen.has(hit.handle)) continue;
      seen.add(hit.handle);
      entries.push({
        url: `${SITE_URL}/products/${hit.handle}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    // Last page reached: fewer hits than requested, or we've now
    // seen everything the index claims to hold.
    if (result.hits.length < PRODUCT_PAGE) break;
    if (result.total && seen.size >= result.total) break;
  }

  return entries;
}
