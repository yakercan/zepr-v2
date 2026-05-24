/**
 * Source-agnostic review types.
 *
 * The shapes here are the public contract every provider has to
 * map into — pick the smallest superset of fields the storefront
 * UI actually reads, so any new system we wire up later (Salespace
 * pipeline, Judge.me, Yotpo, Stamped, …) only has to fill these
 * in. Provider-specific extras stay inside the provider module
 * and never leak through this barrier.
 *
 * No `any`, no Shopify-specific shapes, no provider IDs in the
 * field names. If a provider gives us richer data later we
 * extend this file — once.
 */

import type { ReviewMedia } from "@/lib/reviews/media";

/** A single customer review. */
export interface ProductReview {
  /** Stable provider-side id. Used for React keys + future
   *  "delete my review" calls (provider-routed). Opaque string. */
  id: string;
  /** 1.0 – 5.0. Half-stars allowed for systems that expose them;
   *  the UI rounds visually. */
  rating: number;
  /** Optional review title — some systems separate "summary"
   *  from "body", others don't. Always optional here. */
  title?: string;
  /** Free-form review text. */
  body: string;
  /** Reviewer display name. */
  authorName: string;
  /** ISO-8601 timestamp (`new Date(createdAt)` must parse). */
  createdAt: string;
  /** True when the provider confirms the reviewer bought this
   *  exact product (Shopify order match, Salespace receipt link,
   *  etc.). Surfaces a "Verified Purchase" pill. */
  verifiedPurchase?: boolean;
  /** Photo + video attachments. URLs already fully-qualified by
   *  the provider; image / video kind already resolved at the
   *  provider boundary (see `lib/reviews/media.ts`). The UI
   *  never has to inspect URLs. Empty / absent = no media row
   *  rendered. */
  media?: ReadonlyArray<ReviewMedia>;
}

/** Aggregate stats + a page of reviews. */
export interface ProductReviewSummary {
  /** Average across every review, 0–5. Pre-computed by the
   *  provider so the UI never re-averages on every render. */
  averageRating: number;
  /** Total count across ALL reviews (not just this page). */
  totalCount: number;
  /** Rating histogram: key is `"1"`–`"5"`, value is count.
   *  Optional because not every provider exposes one — when
   *  absent the UI just skips the histogram strip. */
  ratingHistogram?: Record<"1" | "2" | "3" | "4" | "5", number>;
  /** First page of reviews. Pagination happens through the
   *  fetcher in a future round; round-1 just renders this page
   *  and an `n of total` footer. */
  reviews: ProductReview[];
}
