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
 *   - Each call fetches AT MOST one Salespace page per still-needed
 *     pool (`limit = RELATED_PRODUCTS_PAGE_SIZE`). So a batch is a
 *     single ~10-item request when the subcategory pool fills the
 *     band, and at most two (sub + a category top-up) only when the
 *     subcategory is too shallow to reach a full band on its own —
 *     that second request is genuine sourcing, not waste.
 *
 * Why a single page per pool (no retry): the band size is the unit
 * of work *and* the unit of fetch — "show 10" means "fetch ~10".
 * The previous version retried a second full page per pool when a
 * page came back partially deduplicated, which meant a single batch
 * could fan out to 2 pools × 2 pages × 10 = 40 products pulled from
 * Salespace just to surface 10 (the rest discarded). That defeats
 * the whole point of the small PDP band, so we accept the rare
 * partially-deduplicated short band instead — `hasMore` stays true,
 * so "See more" simply fetches the next page.
 *
 * Cache: defers to `searchProducts`' fetch-cache (60 s default),
 * so identical cursors across users hit a warm Salespace cache.
 */

const SORT = "best_sellers:desc";
/* One Salespace page per pool per call — keeps each "See more"
 * batch to a single ~10-item fetch per still-needed pool instead
 * of fanning out into retry pages we'd mostly discard. A band that
 * comes back short after dedup is fine: `hasMore` stays true and
 * the next click picks up where this one left off. */
const MAX_PAGES_PER_POOL_PER_CALL = 1;

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
