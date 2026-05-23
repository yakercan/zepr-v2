/**
 * Salespace search-API product types — kept intentionally minimal.
 *
 * We surface only the fields the storefront actually reads. The
 * upstream API returns many more (variants, inventory, tags, every
 * metafield, etc.) but pulling those into the type would make every
 * component touchable by changes we don't care about. New fields can
 * be added here when a component genuinely needs them.
 *
 * Money is in cents — the API is consistent and we keep the same
 * convention through to the formatter at the leaves.
 */
export interface SearchProductReview {
  /** Average rating (1.0 – 5.0). */
  value: number;
  scale_min: number;
  scale_max: number;
}

export interface SearchProduct {
  id: string;
  handle: string;
  title: string;

  /** Square hero image — already CDN-served, no transforms needed. */
  image_url: string;

  /** All money values are integer cents in the product currency. */
  price_min_cents: number;
  price_max_cents: number;
  compare_at_min_cents?: number;
  compare_at_max_cents?: number;
  currency: string;

  available: boolean;

  /** Server-decorated rating snapshot. The raw API returns
   *  `metafields['custom.review']` as a JSON string; the search
   *  client parses it once so consumers don't have to. */
  rating?: SearchProductReview;
  rating_count?: number;

  /** Server-tagged badges (e.g. "BEST_SELLER", "TOP_RATED"). The
   *  product card surfaces at most one to keep the corner clean. */
  badges?: string[];
}

export interface SearchResult {
  hits: SearchProduct[];
  total: number;
  page: number;
  limit: number;
}
