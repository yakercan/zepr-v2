import "server-only";

import type { Market } from "@/config/markets";
import { env } from "@/env";
import { getServerMarket } from "@/lib/market/server";
import { PRODUCTS_PAGE_SIZE } from "@/lib/pagination";
import type {
  SearchFacets,
  SearchProduct,
  SearchProductReview,
  SearchResult,
} from "@/types/product";

/**
 * Salespace search client — server-only.
 *
 * Wraps the `/search` endpoint, projects the upstream response onto
 * our `SearchProduct` shape, and leans on Next's built-in fetch
 * cache for revalidation.
 *
 * Ratings note: the upstream used to carry the average rating and
 * count inside the product's Shopify metafields (`custom.review`
 * as a JSON-encoded `rating` object + `custom.rating_count` as
 * `number_integer`). The Salespace pipeline now reads both directly
 * from Supabase and exposes them as first-class fields (`rating`,
 * `rating_count`) on every hit — so the storefront no longer parses
 * metafield strings and the Shopify metafield is no longer the
 * source of truth.
 *
 * On any error (missing key, non-200, network blip) we return an
 * empty `SearchResult` so the calling RSC tree can render a normal
 * empty-state instead of crashing. We log to `console.error` so
 * issues still surface in server logs.
 */

const SALESPACE_API_BASE = "https://api.salespace.com";
const DEFAULT_REVALIDATE_SEC = 60;
// One source of truth for batch size lives in `lib/pagination` so
// the homepage, search, and collection surfaces all use the same
// number. Callers can still override per-request.
const DEFAULT_LIMIT = PRODUCTS_PAGE_SIZE;

const EMPTY_RESULT: SearchResult = {
  hits: [],
  total: 0,
  page: 1,
  limit: DEFAULT_LIMIT,
};

export interface SearchProductsParams {
  /** Free-text query — omitted for tab-driven listings. */
  q?: string;
  /** Salespace sort key, e.g. `best_sellers:desc`. */
  sort?: string;
  collection?: string;
  /** Subcategory filter — repeat in URLSearchParams for multi-select. */
  subcategory?: string | string[];
  campaign?: string | string[];
  /** Inclusive minimum price in whole dollars (not cents). */
  price_min?: number;
  /** Inclusive maximum price in whole dollars (not cents). */
  price_max?: number;
  /** Size variant filter — multi-select. Mapped through the
   *  upstream `filter=options.Size:"VALUE"` syntax. */
  size?: string | string[];
  /** Restrict to in-stock products when `true`. */
  available?: boolean;
  limit?: number;
  page?: number;
}

export interface SearchProductsOptions {
  /** Override the default 60s revalidation when a caller wants
   *  fresher data (e.g. a deal-of-the-day page) or longer staleness. */
  revalidate?: number;
  /** Extra fetch-cache tags so `revalidateTag` can purge subsets. */
  tags?: string[];
}

export async function searchProducts(
  params: SearchProductsParams = {},
  options: SearchProductsOptions = {},
): Promise<SearchResult> {
  const apiKey = env.SALESPACE_SEARCH_API_KEY;
  if (!apiKey) return EMPTY_RESULT;

  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sort) search.set("sort", params.sort);
  if (params.collection) search.set("collections", params.collection);
  search.set("limit", String(params.limit ?? DEFAULT_LIMIT));
  if (params.page) search.set("page", String(params.page));

  // Multi-select params: repeat the same key.
  const multi = (key: string, value: string | string[] | undefined) => {
    if (!value) return;
    for (const v of Array.isArray(value) ? value : [value]) search.append(key, v);
  };
  multi("subcategory", params.subcategory);
  multi("campaign", params.campaign);

  if (params.price_min !== undefined) {
    search.set("price_min", String(params.price_min));
  }
  if (params.price_max !== undefined) {
    search.set("price_max", String(params.price_max));
  }
  if (params.available !== undefined) {
    search.set("available", String(params.available));
  }
  // Size lives in the variant-options space, so it uses the
  // upstream's generic `filter=options.Size:"VALUE"` syntax instead
  // of a top-level param. Repeated for multi-select.
  if (params.size) {
    const sizes = Array.isArray(params.size) ? params.size : [params.size];
    for (const s of sizes) search.append("filter", `options.Size:"${s}"`);
  }

  const url = `${SALESPACE_API_BASE}/search?${search.toString()}`;

  /* Resolve the visitor's market once per call. The Salespace
   * payload carries *every* market's price columns on every hit
   * (USA baseline + the `_au`/`_ca`/`_gb`/`_nz`/`_sg` suffixed
   * sets), so the response bytes are country-agnostic and the
   * fetch cache below stays shared across markets — we just
   * *project* the active market's columns out of the cached
   * payload in `normalizeProduct`. Nothing about the request or
   * cache key changes per country. */
  const market = await getServerMarket();

  try {
    const res = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SEC,
        tags: ["products", ...(options.tags ?? [])],
      },
    });
    if (!res.ok) {
      console.error(
        `[salespace] /search ${res.status}: ${await res.text().catch(() => "")}`,
      );
      return EMPTY_RESULT;
    }
    const raw = (await res.json()) as RawSearchResponse;
    return normalizeSearchResponse(raw, params, market);
  } catch (err) {
    console.error("[salespace] /search error", err);
    return EMPTY_RESULT;
  }
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */
/**
 * Shape of the raw upstream payload — narrowly typed because we only
 * read a handful of fields. `unknown` everywhere else keeps us honest
 * about not depending on undocumented bits.
 */
interface RawSearchResponse {
  hits?: RawSearchProduct[];
  total?: number;
  page?: number;
  limit?: number;
  /** Pre-validated upstream — we type the wire shape here and
   *  pick only the maps the UI actually consumes. Extra keys are
   *  passed through untouched on the dynamic facet maps. */
  facets?: Record<string, unknown>;
}

interface RawSearchProduct {
  id?: string;
  handle?: string;
  title?: string;
  image_url?: string;
  /* USA baseline price columns (unsuffixed). The payload also
   * carries one suffixed set per non-US market — `price_min_cents_gb`,
   * `compare_at_min_cents_au`, … — which we read dynamically by
   * `${field}${market.salespaceSuffix}` in `marketCents()` rather
   * than enumerating all 20 here. */
  price_min_cents?: number;
  price_max_cents?: number;
  compare_at_min_cents?: number;
  compare_at_max_cents?: number;
  currency?: string;
  available?: boolean;
  badges?: string[];
  metafields?: Record<string, string | number | undefined>;
  /** Average rating (1–5) computed backend-side from approved
   *  Supabase rows. `undefined` / `0` means no reviews yet. */
  rating?: number;
  /** Count of approved reviews backing the `rating` average. */
  rating_count?: number;
  /** Option groups keyed by option name — see `SearchProduct.options`.
   *  The sync pipeline strips "Default Title" single-variant products,
   *  so an empty object (or missing field) means no picker needed. */
  options?: Record<string, unknown>;
}

function normalizeSearchResponse(
  raw: RawSearchResponse,
  params: SearchProductsParams,
  market: Market,
): SearchResult {
  const hits = (raw.hits ?? [])
    .map((p) => normalizeProduct(p, market))
    .filter((p): p is SearchProduct => p !== null);

  return {
    hits,
    total: typeof raw.total === "number" ? raw.total : hits.length,
    page: typeof raw.page === "number" ? raw.page : (params.page ?? 1),
    limit: typeof raw.limit === "number" ? raw.limit : (params.limit ?? DEFAULT_LIMIT),
    facets: normalizeFacets(raw.facets),
  };
}

/* ------------------------------------------------------------------ */
/* Facet normalisation                                                 */
/* ------------------------------------------------------------------ */
/**
 * Type-guard each facet map shape so a malformed upstream key
 * can't poison the UI. We only surface the maps the filter bar
 * actually consumes; everything else flows through opaquely on
 * the `SearchFacets` index signature for future filters.
 */
function normalizeFacets(raw: unknown): SearchFacets | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;

  const out: SearchFacets = {};

  const asCountMap = (v: unknown): Record<string, number> | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const entries = Object.entries(v as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === "number",
    );
    return entries.length ? Object.fromEntries(entries) : undefined;
  };

  out.vendor = asCountMap(r.vendor);
  out.product_type = asCountMap(r.product_type);
  out.tags = asCountMap(r.tags);
  out.collections = asCountMap(r.collections);
  out.available = asCountMap(r.available);
  out.subcategory = asCountMap(r.subcategory);
  out["options.Size"] = asCountMap(r["options.Size"]);
  out.campaigns = asCountMap(r.campaigns);

  if (r.price && typeof r.price === "object") {
    const p = r.price as Record<string, unknown>;
    const min = typeof p.min === "number" ? p.min : undefined;
    const max = typeof p.max === "number" ? p.max : undefined;
    const buckets = asCountMap(p.buckets);
    if (min !== undefined && max !== undefined) {
      out.price = { min, max, buckets: buckets ?? {} };
    }
  }

  return out;
}

/**
 * Discards rows that don't have the minimum we need to render a card
 * (id, handle, title, price, image). Saves the card itself from
 * defensive null-checks.
 *
 * Image / video resolution. Three metafields can override the
 * upstream `image_url` and add hover media:
 *
 *   - `custom.product_image_1` — preferred primary
 *   - `custom.product_image_2` — fallback primary OR hover image
 *   - `custom.product_video`   — looping hover video (wins over
 *                                hover image when both exist)
 *
 * The resolution table:
 *
 *   | img1 | img2 | video | primary    | hover         |
 *   |------|------|-------|------------|---------------|
 *   |   ✓  |   ✓  |   ✓   | img1       | video         |
 *   |   ✓  |   ✓  |       | img1       | img2          |
 *   |   ✓  |      |   ✓   | img1       | video         |
 *   |   ✓  |      |       | img1       | —             |
 *   |      |   ✓  |   ✓   | img2       | video         |
 *   |      |   ✓  |       | img2       | —             |
 *   |      |      |   ✓   | upstream   | video         |
 *   |      |      |       | upstream   | —             |
 */
/**
 * Read a per-market price column off the raw hit.
 *
 * Builds the column name from the canonical base field plus the
 * market's suffix (`""` for USA → the unsuffixed baseline column,
 * `"_gb"` → `price_min_cents_gb`, …). Returns `undefined` for
 * missing / non-positive values so the caller can fall back to the
 * USA baseline — the columns are `NOT NULL DEFAULT 0`, so a `0`
 * means "no per-market price for this row" and we'd rather show the
 * baseline than a $0.00.
 */
function marketCents(
  raw: RawSearchProduct,
  baseField: string,
  suffix: string,
): number | undefined {
  const value = (raw as Record<string, unknown>)[`${baseField}${suffix}`];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function normalizeProduct(
  raw: RawSearchProduct,
  market: Market,
): SearchProduct | null {
  if (
    !raw.id ||
    !raw.handle ||
    !raw.title ||
    !raw.image_url ||
    !raw.currency ||
    typeof raw.price_min_cents !== "number"
  ) {
    return null;
  }

  /* Project the active market's columns. USA uses an empty suffix,
   * so this same path reads the unsuffixed baseline for the home
   * market with no special-casing. Currency is the market's ISO
   * code (the payload's own `currency` stays the shop default);
   * the displayed number is the market column, the label is the
   * market currency, and `Price` localises the pair. */
  const suffix = market.salespaceSuffix;
  const priceMin = marketCents(raw, "price_min_cents", suffix) ?? raw.price_min_cents;
  const priceMax =
    marketCents(raw, "price_max_cents", suffix) ??
    (typeof raw.price_max_cents === "number" ? raw.price_max_cents : priceMin);
  const compareMin =
    marketCents(raw, "compare_at_min_cents", suffix) ?? raw.compare_at_min_cents;
  const compareMax =
    marketCents(raw, "compare_at_max_cents", suffix) ?? raw.compare_at_max_cents;

  const img1 = parseMetafieldUrl(raw.metafields?.["custom.product_image_1"]);
  const img2 = parseMetafieldUrl(raw.metafields?.["custom.product_image_2"]);
  const video = parseMetafieldUrl(raw.metafields?.["custom.product_video"]);

  const image_url = img1 ?? img2 ?? raw.image_url;
  // Hover image is only meaningful when both metafield images are
  // present — otherwise the "second" image is already on display
  // as the primary, so there's nothing to swap to.
  const hover_image_url = img1 && img2 ? img2 : undefined;

  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    image_url,
    hover_image_url,
    hover_video_url: video,
    price_min_cents: priceMin,
    price_max_cents: priceMax,
    compare_at_min_cents: compareMin,
    compare_at_max_cents: compareMax,
    currency: market.currency,
    available: raw.available !== false,
    badges: raw.badges,
    rating: parseRating(raw.rating),
    rating_count: parseRatingCount(raw.rating_count),
    options: parseOptions(raw.options),
  };
}

/**
 * Reads a metafield expected to carry a usable URL string. Returns
 * `undefined` for missing, non-string, or empty values so the
 * resolution table above collapses to plain `??` / truthy checks.
 */
function parseMetafieldUrl(
  raw: string | number | undefined,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The raw payload may carry `options` as `unknown` (the upstream
 * type is loose). We narrow it to `Record<string, string[]>` and
 * drop anything that doesn't fit. Returning `undefined` when
 * there's nothing usable lets `SearchProduct.options` stay
 * optional and lets `hasVariants()` collapse the check to a
 * single truthy + length test.
 */
function parseOptions(
  raw: Record<string, unknown> | undefined,
): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string[]> = {};
  for (const [name, values] of Object.entries(raw)) {
    if (!Array.isArray(values)) continue;
    const strings = values.filter((v): v is string => typeof v === "string");
    if (strings.length > 0) out[name] = strings;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Wrap the upstream's plain numeric `rating` into our internal
 * `SearchProductReview` shape. Keeping the wrapper means the
 * consuming components stay untouched after the metafield → first-
 * class-field migration — they still read `product.rating.value`.
 * The scale is fixed at 1–5 (matches the Supabase write path and
 * the legacy metafield shape).
 */
function parseRating(raw: number | undefined): SearchProductReview | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return { value: raw, scale_min: 1, scale_max: 5 };
}

function parseRatingCount(raw: number | undefined): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return undefined;
  }
  return raw;
}
