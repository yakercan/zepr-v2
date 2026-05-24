"use server";

import { RELATED_PRODUCTS_PAGE_SIZE } from "@/lib/pagination";
import { searchProducts } from "@/lib/salespace/search";
import type { SearchProduct } from "@/types/product";
import type {
  LoadRelatedProductsParams,
  LoadRelatedProductsResult,
} from "./related-products-types";

/**
 * Server actions powering the PDP "You may also like" rail.
 *
 * One entry point — `loadRelatedProducts` — is called both for
 * the initial server-render (from `<RelatedProductsSection>`)
 * and for each "See more" click (from `<RelatedProductsLoader>`,
 * via RPC). Same logic, same dedup contract, same cursor shape;
 * the only difference is whose process the result is consumed in.
 *
 * Sourcing strategy:
 *
 *   - Subcategory pool first (closer match — the shopper is on
 *     a product in that subcategory shelf right now).
 *   - Category pool fills the remainder (same aisle, different
 *     shelf), only consumed once the subcategory pool is either
 *     exhausted or temporarily out of fresh items.
 *
 * Salespace's subcategory filter is *additive* on top of the
 * collection filter — i.e. a subcategory hit is also a category
 * hit — so a naive merge would double-list the subcategory items.
 * The `shownHandles` set passed in by the caller is the dedup
 * source of truth: it carries the current PDP product's handle
 * plus every product already revealed in the rail, so each pool's
 * fresh items are filtered against the same set.
 *
 * Pagination model — incremental, no URL touch:
 *
 *   - Cursor (sub/cat page + per-pool exhausted flags) lives in
 *     client state on the loader. Each click sends the cursor in,
 *     gets fresh items back, and updates state. Nobody deep-links
 *     "page 4" of a PDP rail, so the URL stays clean.
 *   - Each call fetches one Salespace page per still-needed pool
 *     (`limit = RELATED_PRODUCTS_PAGE_SIZE`). When a pool's page
 *     comes back partially deduplicated by the upstream overlap
 *     between sub/cat results, we retry up to one more page so
 *     a click never visibly returns zero fresh cards — bounded
 *     so a pathological upstream can't fan out indefinitely.
 *
 * Cache: defers to `searchProducts`' fetch-cache (60 s default),
 * so identical cursors across users hit a warm Salespace cache.
 */

const SORT = "best_sellers:desc";
/* Per-pool retry cap inside a single call — handles the case
 * where one Salespace page comes back mostly deduplicated by
 * the sub-vs-cat overlap. Two is enough for the typical PDP:
 * the first page either has fresh items or doesn't, and the
 * second covers the long tail. Bumping this would buy more
 * cards-per-click at the cost of more upstream calls per
 * click — keep it low. */
const MAX_PAGES_PER_POOL_PER_CALL = 2;

export async function loadRelatedProducts(
  params: LoadRelatedProductsParams,
): Promise<LoadRelatedProductsResult> {
  const seen = new Set<string>(params.shownHandles);
  const out: SearchProduct[] = [];
  const want = RELATED_PRODUCTS_PAGE_SIZE;

  let { subPageNext, catPageNext, subExhausted, catExhausted } = params.cursor;
  /* Captured from the subcategory pool's first upstream response
   * in this call — Salespace already returns `total` alongside
   * the hits, so the View-all-destination decision doesn't need
   * a separate probe round-trip. `null` when the subcategory
   * pool wasn't fetched on this call. */
  let subcategoryTotal: number | null = null;

  /* Pool 1 — subcategory. Skipped when the product has no
   * subcategory tag, or when the cursor says the pool is already
   * exhausted. */
  if (params.subcategory && !subExhausted) {
    const drained = await drainPool(
      {
        collection: params.collection,
        subcategory: params.subcategory,
        sort: SORT,
      },
      [`related:${params.collection}:${params.subcategory}`],
      subPageNext,
      want,
      seen,
      out,
    );
    subPageNext = drained.pageNext;
    subExhausted = drained.exhausted;
    subcategoryTotal = drained.firstTotal;
  } else if (!params.subcategory) {
    /* Nothing to fetch from this pool — mark it as exhausted so
     * `hasMore` collapses to the category pool's state. */
    subExhausted = true;
  }

  /* Pool 2 — category. Fills the gap when the subcategory pool
   * didn't provide a full band's worth (typical near subcategory
   * exhaustion, or when the product simply has no subcategory). */
  if (out.length < want && !catExhausted) {
    const drained = await drainPool(
      { collection: params.collection, sort: SORT },
      [`related:${params.collection}`],
      catPageNext,
      want,
      seen,
      out,
    );
    catPageNext = drained.pageNext;
    catExhausted = drained.exhausted;
  }

  return {
    products: out,
    cursor: { subPageNext, catPageNext, subExhausted, catExhausted },
    hasMore: !subExhausted || !catExhausted,
    subcategoryTotal,
  };
}

/* ------------------------------------------------------------------ */
/* Pool drain                                                          */
/* ------------------------------------------------------------------ */
/**
 * Pulls fresh items from a single Salespace pool (either
 * subcategory or category) into the shared `out` array, in
 * place. Walks at most `MAX_PAGES_PER_POOL_PER_CALL` upstream
 * pages so a single "See more" click can't fan out into an
 * unbounded number of upstream requests if every page comes
 * back mostly deduplicated.
 *
 * The pool params and cache tags are decided by the caller —
 * this helper just paginates and dedupes.
 */
async function drainPool(
  baseParams: {
    collection: string;
    subcategory?: string;
    sort: string;
  },
  cacheTags: string[],
  pageStart: number,
  want: number,
  seen: Set<string>,
  out: SearchProduct[],
): Promise<{ pageNext: number; exhausted: boolean; firstTotal: number }> {
  let page = pageStart;
  let exhausted = false;
  let attempts = 0;
  /* The pool size as reported by the first upstream response in
   * this drain — `total` is stable across pages, so capturing it
   * once is enough. Threaded out for the caller to use without
   * a probe round-trip. */
  let firstTotal = 0;

  while (
    out.length < want &&
    !exhausted &&
    attempts < MAX_PAGES_PER_POOL_PER_CALL
  ) {
    const result = await searchProducts(
      { ...baseParams, limit: want, page },
      { tags: cacheTags },
    );
    if (attempts === 0) firstTotal = result.total;
    attempts++;
    page++;

    /* A short page (or an empty one) is the signal that this pool
     * has nothing more to give. Mark exhausted *before* the dedup
     * loop so the caller stops consulting the pool on the next
     * call too. */
    if (result.hits.length < want) exhausted = true;

    for (const p of result.hits) {
      if (seen.has(p.handle)) continue;
      seen.add(p.handle);
      out.push(p);
      if (out.length >= want) break;
    }
  }

  return { pageNext: page, exhausted, firstTotal };
}
