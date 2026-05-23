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

/* ------------------------------------------------------------------ */
/* Product Detail Page (PDP)                                           */
/* ------------------------------------------------------------------ */

/**
 * Single product image with intrinsic dimensions so Next's `<Image>`
 * can avoid CLS without a wrapper hack. `altText` mirrors Shopify's
 * own nullable convention — we render the title as alt when it's
 * missing.
 */
export interface ProductImage {
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

/**
 * One item in a product's media gallery — image or video, unified
 * into a single shape so the gallery component iterates once and
 * the renderer branches on `kind`.
 *
 *   - Every item has a `preview` image. For images it *is* the
 *     image; for videos it's the upstream poster frame Shopify
 *     ships with `Video.previewImage`. The gallery uses it
 *     unconditionally for thumbnails and as the video's `poster`
 *     attribute, so empty states and slow networks still show
 *     something meaningful.
 *   - `videoSources` is populated only when `kind === "video"`.
 *     Multiple sources let the browser pick the best codec
 *     (Shopify returns mp4 + hls when both exist).
 *
 * Model3D and ExternalVideo media types from Shopify are skipped
 * at the normalisation boundary for now; they round-trip cleanly
 * if/when we surface them later.
 */
export type ProductMediaKind = "image" | "video";

export interface ProductMedia {
  /** Shopify-issued GID — stable, useful as React key. */
  id: string;
  kind: ProductMediaKind;
  preview: ProductImage;
  /** Playable sources, present only for `kind: "video"`. */
  videoSources?: { url: string; mimeType: string }[];
}

/**
 * The PDP-shaped product view, hydrated from Shopify's Storefront
 * Graph (see `lib/shopify/products.ts`).
 *
 * Deliberately separate from `SearchProduct`:
 *
 *   - `SearchProduct` is the *card* view sourced from Salespace's
 *     search index — small, aggregate, includes facetable fields,
 *     covers many results in one round-trip.
 *   - `ProductDetail` is the *page* view sourced from Shopify —
 *     single product, full media gallery, real-time variant
 *     pricing and stock, descriptionHtml, metafields. The source of
 *     truth for "what does this product look like right now".
 *
 * Money is normalised to integer cents on the way in (Shopify
 * returns dollar decimal strings) so the same `<Price>` component
 * the cards use can render PDP prices unchanged.
 *
 * The shape will grow as we add PDP pieces (description, options,
 * variants, gallery, metafields). Round 1 is intentionally minimal
 * — the hero strip only.
 */
export interface ProductDetail {
  id: string;
  handle: string;
  title: string;
  /** Brand / supplier name. Optional because not every product has
   *  one set in Shopify; we hide the field when empty. */
  vendor?: string;

  /** Admin-authored rich-text description from Shopify. May
   *  contain `<p>`, `<ul>`, `<a>`, etc. Rendered through
   *  `dangerouslySetInnerHTML` on the PDP — Shopify admin is a
   *  trusted source, so no client-side sanitiser. Empty string
   *  when the product has no description set. */
  descriptionHtml: string;

  /** At least one variant is purchasable. Drives the "Add to cart"
   *  CTA enabled state and the "Out of stock" badge. */
  availableForSale: boolean;

  /** Hero image. Convenience pointer to the first image in
   *  `media`, surfaced separately for places that only need one
   *  picture (cart drawer thumbnail, social og:image, etc.) and
   *  shouldn't reason about gallery internals. Null for the rare
   *  product with no media at all. */
  featuredImage: ProductImage | null;

  /** Full ordered gallery — images and videos in the order
   *  Shopify admin arranged them. Drives `<ProductGallery>`.
   *  Empty array (not undefined) when no media is set. */
  media: ProductMedia[];

  /** Product's primary collection — the first one Shopify returns
   *  for the product. Used to render a category crumb in the PDP
   *  breadcrumb and (eventually) the "back to {category}" link.
   *  Undefined when the product isn't in any collection. */
  primaryCollection?: {
    handle: string;
    title: string;
  };

  /** Optional subcategory label, extracted from a Shopify tag of
   *  the form `subcategory:Bedding`. Mirrors how the legacy
   *  storefront stores subcategory data — a free-text taxonomy
   *  layer that lives in tags rather than a separate Shopify
   *  collection. Undefined when no `subcategory:` tag is set. */
  subcategory?: string;

  /** Price range across all variants. When `min === max`, the
   *  product has a single price; otherwise the PDP renders a
   *  `$min – $max` band until a variant is picked. */
  priceMinCents: number;
  priceMaxCents: number;
  /** Compare-at (strike-through) price range. Both fields are
   *  populated together when the product has a non-zero
   *  compare-at; otherwise both undefined. */
  compareAtMinCents?: number;
  compareAtMaxCents?: number;
  currency: string;
}
