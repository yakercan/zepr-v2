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

  /** Primary square hero image — already CDN-served, no transforms
   *  needed. Resolved at the API boundary: prefers
   *  `custom.product_image_1`, falls back to
   *  `custom.product_image_2`, finally to the upstream `image_url`,
   *  so the card never has to think about which source it came
   *  from. */
  image_url: string;

  /** Secondary still image shown when the card is hovered. Only
   *  populated when *both* `custom.product_image_1` AND
   *  `custom.product_image_2` are set — i.e. there's a meaningful
   *  "second look" distinct from the primary. Card overlays this
   *  with a CSS opacity transition; no JS needed. */
  hover_image_url?: string;

  /** Looping video shown when the card is hovered. Takes priority
   *  over `hover_image_url` when both exist. Cards load video
   *  metadata lazily (`preload="none"`) and only play on actual
   *  hover, so off-screen / never-hovered cards consume zero
   *  bandwidth. */
  hover_video_url?: string;

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

  /** Option groups keyed by option name — e.g.
   *  `{ Color: ["Pink","Blue"], Size: ["S","M","L"] }`. The
   *  Salespace sync pipeline strips single-variant "Default Title"
   *  products, so any product with at least one entry here has
   *  real variants to pick from. We surface the full map (not just
   *  a count) so the variant picker modal can render the actual
   *  swatches without a second fetch. Card-level "needs picker?"
   *  checks should go through `hasVariants()` in `lib/products`
   *  rather than touching this shape directly. */
  options?: Record<string, string[]>;
}

/**
 * Facet maps from the Salespace `/search` response.
 *
 * Each map is `value → product-count` so the filter UI can both
 * (a) list ONLY values that actually exist in the current result
 * set and (b) display the count next to each option.
 *
 * Everything is optional because not every search returns every
 * facet, and we don't want a missing facet to crash the bar.
 * The few we actually surface in the UI today:
 *
 *   - `subcategory`     → Category pill
 *   - `options.Size`    → Size pill
 *   - `price.buckets`   → Price pill (preset range chips)
 *
 * The rest are kept in the type for forward-compat — we read
 * them straight off the wire, so adding a Vendor or Available
 * filter later is a UI-only change.
 */
export interface SearchFacets {
  vendor?: Record<string, number>;
  product_type?: Record<string, number>;
  tags?: Record<string, number>;
  collections?: Record<string, number>;
  available?: Record<string, number>;
  subcategory?: Record<string, number>;
  "options.Size"?: Record<string, number>;
  /**
   * Price facet. The Salespace upstream returns:
   *
   *   - `min` / `max` in **cents** (the absolute bounds across
   *     the current result set).
   *   - `buckets` keyed by dollar ranges like `"0-50"` (each
   *     entry's value is the product count in that bucket).
   *
   * Mixed-unit on purpose — the bounds are precise (`12399` ¢)
   * and the buckets are user-facing ranges (`$0–$50`). Callers
   * convert the bounds when they need them in dollars.
   */
  price?: {
    min: number;
    max: number;
    buckets: Record<string, number>;
  };
  campaigns?: Record<string, number>;
}

export interface SearchResult {
  hits: SearchProduct[];
  total: number;
  page: number;
  limit: number;
  /** Populated when the upstream returns a facets block. Undefined
   *  in the empty/error fallback so callers can branch on
   *  presence (`if (result.facets) …`). */
  facets?: SearchFacets;
}
