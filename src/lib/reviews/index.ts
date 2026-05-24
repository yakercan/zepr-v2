import "server-only";

import { fetchProductReviewsFromSupabase } from "@/lib/reviews/providers/supabase";
import type { ProductReviewSummary } from "@/lib/reviews/types";

/**
 * Reviews dispatcher — the only call site the storefront knows
 * about. Routes the request to the currently-active review
 * provider. Today: Supabase (same `product_review` table the
 * legacy Hydrogen storefront already writes to). Tomorrow:
 * swap to Salespace / Judge.me / Yotpo by changing the import
 * below — every consumer (PDP, future "Recent reviews" rail,
 * future profile review list) reads through this function so
 * the provider switch never ripples beyond this file.
 *
 * `productId` is a Shopify GID (`gid://shopify/Product/123`) —
 * what `ProductDetail.id` carries and what the legacy review
 * rows are keyed on.
 *
 * Returns `null` on provider failure (missing secrets, RLS
 * denied, network error, schema drift). Returns
 * `{ totalCount: 0, reviews: [] }` when the provider confirms
 * the product simply has no reviews yet. The PDP route treats
 * both identically for visibility gating; downstream code can
 * distinguish them if needed.
 */
export async function getProductReviews(
  productId: string,
): Promise<ProductReviewSummary | null> {
  return fetchProductReviewsFromSupabase(productId);
}

export type { ProductReview, ProductReviewSummary } from "@/lib/reviews/types";
