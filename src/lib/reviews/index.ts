import "server-only";

import {
  deleteReviewFromSupabase,
  fetchProductReviewsFromSupabase,
  hasShopperReviewedProduct,
  insertReviewIntoSupabase,
  reviewsTagFor,
} from "@/lib/reviews/providers/supabase";
import type {
  ProductReviewSummary,
  SubmitReviewInput,
} from "@/lib/reviews/types";

/**
 * Reviews dispatcher — the only call site the storefront knows
 * about. Routes the request to the currently-active review
 * provider. Today: Supabase (same `product_review` table the
 * legacy Hydrogen storefront already writes to). Tomorrow:
 * swap to Salespace / Judge.me / Yotpo by changing the imports
 * below — every consumer (PDP read, write modal, future
 * "Recent reviews" rail, future profile review list) flows
 * through this one file so the provider switch never ripples
 * beyond it.
 *
 * `productId` is a Shopify GID (`gid://shopify/Product/123`) —
 * what `ProductDetail.id` carries and what the legacy review
 * rows are keyed on.
 */

/**
 * Fetch the review summary for a PDP render.
 *
 * Returns `null` on provider failure (missing secrets, RLS
 * denied, network error, schema drift). Returns
 * `{ totalCount: 0, reviews: [] }` when the provider confirms
 * the product simply has no reviews yet. The PDP route treats
 * both identically for visibility gating; downstream code can
 * distinguish them if needed.
 *
 * `viewerEmail` — when present, the provider stamps `isOwn: true`
 * on the matching review row so the UI can paint a "Your review"
 * badge + a delete affordance. The email itself is dropped at
 * the provider boundary; nothing past this dispatcher ever sees
 * customer emails for reviews other than the viewer's own.
 */
export async function getProductReviews(
  productId: string,
  viewerEmail?: string,
): Promise<ProductReviewSummary | null> {
  return fetchProductReviewsFromSupabase(productId, viewerEmail);
}

/**
 * Has this shopper already reviewed this product? Used by the
 * submit server action's duplicate-check gate.
 */
export async function hasShopperReviewed(
  productId: string,
  email: string,
): Promise<boolean> {
  return hasShopperReviewedProduct(productId, email);
}

/**
 * Persist a new review row.
 *
 * The caller (the submit server action) handles all the
 * pre-validation (auth, purchase, duplicate, file limits) and
 * pre-uploads media to storage; this function only writes the
 * row. Returns the inserted id on success, `null` on failure.
 */
export async function submitProductReview(
  input: SubmitReviewInput,
): Promise<string | null> {
  return insertReviewIntoSupabase(input);
}

/**
 * Delete one review row scoped to its author. Returns the URLs
 * of any media attachments on the deleted row so the caller can
 * clean up Supabase Storage. Returns `null` when the row didn't
 * exist or wasn't authored by this shopper (treated as a no-op).
 */
export async function deleteProductReview(args: {
  reviewId: string;
  productId: string;
  email: string;
}): Promise<ReadonlyArray<string> | null> {
  return deleteReviewFromSupabase(args.reviewId, args.productId, args.email);
}

/**
 * Cache tag for a product's review summary. Server actions call
 * `revalidateTag(reviewsTag(productId))` after insert/delete so
 * the matching PDP refreshes on its next render without waiting
 * for the 1-hour revalidate window.
 */
export function reviewsTag(productId: string): string {
  return reviewsTagFor(productId);
}

export type {
  ProductReview,
  ProductReviewSummary,
  SubmitReviewInput,
} from "@/lib/reviews/types";
