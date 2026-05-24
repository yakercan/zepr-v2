import type { SearchProduct } from "@/types/product";

/**
 * Shared types + initial state for the PDP related-products
 * loader and its server action.
 *
 * Lives in its own module because the action file (with
 * top-level `"use server"`) is restricted to async-function
 * exports — it can't ship plain constants. Splitting these
 * out also keeps the loader's client bundle clean: the type
 * imports erase at compile time, and `INITIAL_RELATED_CURSOR`
 * is a tiny POJO with no upstream dependencies.
 */

/**
 * Opaque cursor the loader hands back to the server on each
 * "See more" click. Tracks where we are in each Salespace
 * pool and whether either has been exhausted, so the action
 * is stateless and can be cached / retried freely.
 */
export interface RelatedProductsCursor {
  /** Next subcategory page to fetch (1-indexed; 1 = the page
   *  the initial server-render consumes once for the initial
   *  10). */
  subPageNext: number;
  /** Next category page to fetch (same shape as `subPageNext`). */
  catPageNext: number;
  /** `true` once a subcategory fetch comes back short of the
   *  requested limit — that pool has no more pages and won't
   *  be consulted again. */
  subExhausted: boolean;
  /** Same as `subExhausted`, for the category pool. */
  catExhausted: boolean;
}

/** Starting position before the first batch fetch. Pass to
 *  `loadRelatedProducts` for the initial server render. */
export const INITIAL_RELATED_CURSOR: RelatedProductsCursor = {
  subPageNext: 1,
  catPageNext: 1,
  subExhausted: false,
  catExhausted: false,
};

export interface LoadRelatedProductsParams {
  /** Collection (= category) handle from the PDP product. */
  collection: string;
  /** Subcategory tag, or `null` when the product has none. */
  subcategory: string | null;
  /** Every handle that should NOT appear in the result — the
   *  current PDP product plus every handle already revealed in
   *  the rail. */
  shownHandles: ReadonlyArray<string>;
  /** Where to resume from. Pass `INITIAL_RELATED_CURSOR` for
   *  the first call. */
  cursor: RelatedProductsCursor;
}

export interface LoadRelatedProductsResult {
  products: SearchProduct[];
  cursor: RelatedProductsCursor;
  /** `false` once both pools are exhausted — the loader uses
   *  this to hide the "See more" button. */
  hasMore: boolean;
  /** Subcategory pool size reported by Salespace on this call's
   *  subcategory fetch (the response already carries `total`),
   *  or `null` when the product has no subcategory or this
   *  call didn't fetch the subcategory pool. Used by the
   *  initial server render to pick the View-all destination
   *  without an extra round-trip; subsequent reveal clicks
   *  ignore it. */
  subcategoryTotal: number | null;
}
