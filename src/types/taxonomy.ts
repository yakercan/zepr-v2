/**
 * Salespace category taxonomy shape.
 *
 * Mirrors the response from `GET /taxonomy` on the Salespace Search API
 * — the same shape the original zepr storefront consumes — so we can
 * use a single typed model across the header dropdown, collection
 * pages, and the subcategory slider when those land.
 */

export interface TaxonomySubcategory {
  id: number;
  /** URL slug, e.g. `"kitchen-and-dining"`. */
  handle: string;
  /** Display name, e.g. `"Kitchen & Dining"`. */
  name: string;
  /** CDN icon URL, or `null` if the API didn't return one. */
  iconUrl: string | null;
  productCount: number;
}

export interface TaxonomyCategory {
  id: number;
  /** URL slug, e.g. `"home-and-living"`. */
  handle: string;
  /** Display name, e.g. `"Home & Living"`. */
  name: string;
  /** Banner image for category landing pages. */
  imageUrl: string | null;
  /** Small CDN icon, used in the header dropdown and category bar. */
  iconUrl: string | null;
  shopifyCollectionId: string | null;
  productCount: number;
  subcategories: TaxonomySubcategory[];
}

export interface TaxonomyResponse {
  categories: TaxonomyCategory[];
  /** Server-side version key for cache busting. */
  version: string;
  /** Server-side issue timestamp (Unix ms). */
  timestamp: number;
}
