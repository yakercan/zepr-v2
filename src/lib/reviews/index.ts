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
 * Returns `null` when:
 *   - The active provider couldn't reach its backend (network,
 *     missing secrets in CI / preview builds, schema drift).
 *   - The product genuinely has no reviews AND the provider
 *     collapses "missing" with "empty" (only the stub does).
 *
 * Returns `{ totalCount: 0, reviews: [] }` when the provider
 * confirms "system wired, this product has no reviews yet".
 * The PDP route treats `null` and `totalCount === 0` identically
 * for visibility gating, but downstream code can distinguish
 * them if needed.
 */
export async function getProductReviews(
  productId: string,
): Promise<ProductReviewSummary | null> {
  return fetchProductReviewsFromSupabase(productId);
}

export type { ProductReview, ProductReviewSummary } from "@/lib/reviews/types";
