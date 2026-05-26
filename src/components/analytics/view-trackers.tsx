"use client";

import { useEffect, useRef } from "react";

import {
  trackCollectionView,
  trackProductView,
  trackSearchView,
} from "@/lib/analytics/events";
import type { ProductInput } from "@/types/analytics";

/**
 * Resource-specific page-view trackers.
 *
 * Each one is a fire-on-mount client island the matching server
 * component mounts at the top of its render tree. They emit the
 * dedicated Shopify Monorail event (PRODUCT_VIEW / COLLECTION_VIEW
 * / SEARCH_VIEW) that powers the per-resource breakdowns in
 * Admin Analytics:
 *
 *   - Admin → Analytics → Top products by views
 *   - Admin → Analytics → Top collections / categories
 *   - Admin → Analytics → Search terms (under Marketing)
 *
 * The generic `<ShopifyAnalytics>` already fires a `PAGE_VIEW` on
 * the same navigation — these riders sit alongside it, sharing the
 * session/visitor cookies already set on the storefront. Shopify's
 * pipeline merges the two for funnel attribution.
 *
 * Why three components, not one:
 *
 *   - Each takes a different shape of input, so prop typing stays
 *     honest (no `unknown` payload).
 *   - Mounting from the existing PDP / category / search server
 *     pages is a single line each — no router-side switch needed.
 *
 * Each tracker dedupes by stable key (`productId`, `collectionId`,
 * `query`) via a ref. A re-render of the parent server component
 * with the same key (e.g. re-mount under Strict Mode, layout
 * transition) won't refire. A different key — i.e. a navigation
 * to a different product / category / search — fires again, which
 * is the intended behaviour.
 */

export function ProductViewTracker({ product }: { product: ProductInput }) {
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastIdRef.current === product.productId) return;
    lastIdRef.current = product.productId;
    trackProductView({ product });
  }, [product]);

  return null;
}

export function CollectionViewTracker({
  collectionId,
  handle,
}: {
  collectionId: string;
  handle: string;
}) {
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastIdRef.current === collectionId) return;
    lastIdRef.current = collectionId;
    trackCollectionView({ collectionId, handle });
  }, [collectionId, handle]);

  return null;
}

export function SearchViewTracker({
  query,
  resultCount,
}: {
  query: string;
  resultCount?: number;
}) {
  const lastQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastQueryRef.current === query) return;
    lastQueryRef.current = query;
    trackSearchView({ query, resultCount });
  }, [query, resultCount]);

  return null;
}
