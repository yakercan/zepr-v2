import "server-only";

import { env } from "@/env";
import type {
  SearchProduct,
  SearchProductReview,
  SearchResult,
} from "@/types/product";

/**
 * Salespace search client — server-only.
 *
 * Wraps the `/search` endpoint, projects the upstream response onto
 * our `SearchProduct` shape (so the metafield string-parsing for
 * ratings happens once at the API boundary), and leans on Next's
 * built-in fetch cache for revalidation.
 *
 * On any error (missing key, non-200, network blip) we return an
 * empty `SearchResult` so the calling RSC tree can render a normal
 * empty-state instead of crashing. We log to `console.error` so
 * issues still surface in server logs.
 */

const SALESPACE_API_BASE = "https://api.salespace.com";
const DEFAULT_REVALIDATE_SEC = 60;
const DEFAULT_LIMIT = 24;

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

  const url = `${SALESPACE_API_BASE}/search?${search.toString()}`;

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
    return normalizeSearchResponse(raw, params);
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
}

interface RawSearchProduct {
  id?: string;
  handle?: string;
  title?: string;
  image_url?: string;
  price_min_cents?: number;
  price_max_cents?: number;
  compare_at_min_cents?: number;
  compare_at_max_cents?: number;
  currency?: string;
  available?: boolean;
  badges?: string[];
  metafields?: Record<string, string | number | undefined>;
  /** Option groups keyed by option name — see `SearchProduct.options`.
   *  The sync pipeline strips "Default Title" single-variant products,
   *  so an empty object (or missing field) means no picker needed. */
  options?: Record<string, unknown>;
}

function normalizeSearchResponse(
  raw: RawSearchResponse,
  params: SearchProductsParams,
): SearchResult {
  const hits = (raw.hits ?? [])
    .map(normalizeProduct)
    .filter((p): p is SearchProduct => p !== null);

  return {
    hits,
    total: typeof raw.total === "number" ? raw.total : hits.length,
    page: typeof raw.page === "number" ? raw.page : (params.page ?? 1),
    limit: typeof raw.limit === "number" ? raw.limit : (params.limit ?? DEFAULT_LIMIT),
  };
}

/**
 * Discards rows that don't have the minimum we need to render a card
 * (id, handle, title, price, image). Saves the card itself from
 * defensive null-checks.
 */
function normalizeProduct(raw: RawSearchProduct): SearchProduct | null {
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

  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    image_url: raw.image_url,
    price_min_cents: raw.price_min_cents,
    price_max_cents:
      typeof raw.price_max_cents === "number"
        ? raw.price_max_cents
        : raw.price_min_cents,
    compare_at_min_cents: raw.compare_at_min_cents,
    compare_at_max_cents: raw.compare_at_max_cents,
    currency: raw.currency,
    available: raw.available !== false,
    badges: raw.badges,
    rating: parseReview(raw.metafields?.["custom.review"]),
    rating_count: parseRatingCount(raw.metafields?.["custom.rating_count"]),
    options: parseOptions(raw.options),
  };
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

function parseReview(raw: string | number | undefined): SearchProductReview | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const obj = JSON.parse(raw) as {
      value?: string | number;
      scale_min?: string | number;
      scale_max?: string | number;
    };
    const value = Number(obj.value);
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return {
      value,
      scale_min: Number(obj.scale_min ?? 1),
      scale_max: Number(obj.scale_max ?? 5),
    };
  } catch {
    return undefined;
  }
}

function parseRatingCount(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
