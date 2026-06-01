import "server-only";

import type { Market } from "@/config/markets";
import { env } from "@/env";
import { getServerMarket } from "@/lib/market/server";
import { searchProducts } from "@/lib/salespace/search";
import type { SearchProduct } from "@/types/product";

/**
 * Salespace search-suggestions client — server-only.
 *
 * Two paths depending on whether the user has typed yet:
 *
 *   • **With a query** — one server call fans out to two upstream
 *     endpoints in parallel:
 *       - `GET /suggestions?q=…`          → keyword strings
 *       - `GET /autocomplete?q=…&limit=…` → autocomplete products
 *     Failures on either side degrade gracefully via
 *     `Promise.allSettled`; we return whichever half succeeded.
 *
 *   • **Empty query** — the modal needs something to show the
 *     instant the input focuses, before the shopper types anything.
 *     We surface a curated `POPULAR_KEYWORDS` list (cheap to swap
 *     out for analytics later) plus the top best-sellers via the
 *     existing `searchProducts` client. Same `SuggestResult` shape
 *     so the modal doesn't have to branch on data source.
 *
 * Both paths share the Next fetch cache (60s revalidate, tag
 * `search-suggest`) so typing storms and modal re-focuses don't
 * hammer the upstream.
 */

const SALESPACE_API_BASE = "https://api.salespace.com";
const DEFAULT_REVALIDATE_SEC = 60;
const MAX_KEYWORDS = 5;
const MAX_PRODUCTS = 5;

/**
 * Default keyword list shown when the modal opens with no query
 * yet. Hand-picked for a general discount-retailer storefront —
 * once we have search analytics we can swap this for a top-N list
 * generated server-side. The constant stays in this module so it's
 * the only place a future caller needs to update.
 */
const POPULAR_KEYWORDS: readonly string[] = [
  "Cleaning",
  "Snacks",
  "Pet food",
  "Beauty",
  "Kitchen",
];

export interface SuggestProduct {
  id: string;
  handle: string;
  title: string;
  image_url: string;
  price_min_cents: number;
  compare_at_min_cents?: number;
  currency: string;
}

export interface SuggestResult {
  keywords: string[];
  products: SuggestProduct[];
}

const EMPTY: SuggestResult = { keywords: [], products: [] };

export async function getSearchSuggestions(
  query: string,
): Promise<SuggestResult> {
  const trimmed = query.trim();
  return trimmed ? getQuerySuggestions(trimmed) : getPopularSuggestions();
}

/**
 * Read a per-market price column off a raw autocomplete hit — same
 * contract as the search client's projector: column name is the
 * base field plus the market suffix (`""` = USA baseline), and a
 * missing / non-positive value yields `undefined` so the caller
 * falls back to the baseline rather than surfacing a $0.00.
 */
function marketCents(
  raw: Record<string, unknown>,
  baseField: string,
  suffix: string,
): number | undefined {
  const value = raw[`${baseField}${suffix}`];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/* ------------------------------------------------------------------ */
/* Empty-query path — curated keywords + best-sellers                  */
/* ------------------------------------------------------------------ */
async function getPopularSuggestions(): Promise<SuggestResult> {
  try {
    const result = await searchProducts(
      { sort: "best_sellers:desc", limit: MAX_PRODUCTS },
      { tags: ["search-suggest-popular"] },
    );
    return {
      keywords: [...POPULAR_KEYWORDS].slice(0, MAX_KEYWORDS),
      products: result.hits.slice(0, MAX_PRODUCTS).map(toSuggestProduct),
    };
  } catch (err) {
    console.error("[salespace] popular suggestions error", err);
    return {
      keywords: [...POPULAR_KEYWORDS].slice(0, MAX_KEYWORDS),
      products: [],
    };
  }
}

function toSuggestProduct(p: SearchProduct): SuggestProduct {
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    image_url: p.image_url,
    price_min_cents: p.price_min_cents,
    compare_at_min_cents: p.compare_at_min_cents,
    currency: p.currency,
  };
}

/* ------------------------------------------------------------------ */
/* Query path — Salespace /suggestions + /autocomplete                 */
/* ------------------------------------------------------------------ */
async function getQuerySuggestions(query: string): Promise<SuggestResult> {
  const apiKey = env.SALESPACE_SEARCH_API_KEY;
  if (!apiKey) return EMPTY;

  /* Autocomplete hits carry the same all-market price columns as
   * /search, so the upstream response is country-agnostic (shared
   * cache) and we project the active market's columns below. */
  const market = await getServerMarket();

  const headers = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
  };
  const next = {
    revalidate: DEFAULT_REVALIDATE_SEC,
    tags: ["search-suggest"],
  };

  const [keywordsRes, productsRes] = await Promise.allSettled([
    fetch(
      `${SALESPACE_API_BASE}/suggestions?q=${encodeURIComponent(query)}`,
      { headers, next },
    ),
    fetch(
      `${SALESPACE_API_BASE}/autocomplete?q=${encodeURIComponent(query)}&limit=${MAX_PRODUCTS}`,
      { headers, next },
    ),
  ]);

  const [keywords, products] = await Promise.all([
    extractKeywords(keywordsRes),
    extractProducts(productsRes, market),
  ]);

  return { keywords, products };
}

/* ------------------------------------------------------------------ */
/* Per-endpoint extraction — both swallow individual failures so a    */
/* single bad response can't take the whole modal down.               */
/* ------------------------------------------------------------------ */

interface RawSuggestionsResponse {
  suggestions?: unknown[];
}

async function extractKeywords(
  res: PromiseSettledResult<Response>,
): Promise<string[]> {
  if (res.status !== "fulfilled" || !res.value.ok) {
    if (res.status === "rejected") {
      console.error("[salespace] /suggestions error", res.reason);
    }
    return [];
  }
  try {
    const data = (await res.value.json()) as RawSuggestionsResponse;
    return (data.suggestions ?? [])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .slice(0, MAX_KEYWORDS);
  } catch (err) {
    console.error("[salespace] /suggestions parse error", err);
    return [];
  }
}

interface RawAutocompleteSuggestion {
  id?: string;
  handle?: string;
  title?: string;
  image_url?: string;
  price_min_cents?: number;
  compare_at_min_cents?: number;
  currency?: string;
}

interface RawAutocompleteResponse {
  suggestions?: RawAutocompleteSuggestion[];
}

async function extractProducts(
  res: PromiseSettledResult<Response>,
  market: Market,
): Promise<SuggestProduct[]> {
  if (res.status !== "fulfilled" || !res.value.ok) {
    if (res.status === "rejected") {
      console.error("[salespace] /autocomplete error", res.reason);
    }
    return [];
  }
  try {
    const data = (await res.value.json()) as RawAutocompleteResponse;
    return (data.suggestions ?? [])
      .map((p) => normalizeProduct(p, market))
      .filter((p): p is SuggestProduct => p !== null)
      .slice(0, MAX_PRODUCTS);
  } catch (err) {
    console.error("[salespace] /autocomplete parse error", err);
    return [];
  }
}

function normalizeProduct(
  raw: RawAutocompleteSuggestion,
  market: Market,
): SuggestProduct | null {
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
  const suffix = market.salespaceSuffix;
  const rawRecord = raw as Record<string, unknown>;
  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    image_url: raw.image_url,
    price_min_cents:
      marketCents(rawRecord, "price_min_cents", suffix) ?? raw.price_min_cents,
    compare_at_min_cents:
      marketCents(rawRecord, "compare_at_min_cents", suffix) ??
      raw.compare_at_min_cents,
    currency: market.currency,
  };
}
