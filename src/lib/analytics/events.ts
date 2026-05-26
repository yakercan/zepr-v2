"use client";

import { shopifyProvider } from "@/lib/analytics/providers/shopify";
import type {
  AddToCartInput,
  CollectionViewInput,
  PageViewInput,
  ProductViewInput,
  SearchViewInput,
} from "@/types/analytics";

/**
 * Public analytics surface.
 *
 * Everything in the storefront — cart actions, PDP impressions,
 * page-view trackers — calls these `track*` functions. They fan
 * the same payload out to every registered provider. Today the
 * `providers` array holds just `shopifyProvider`; adding GA4
 * (or Meta Pixel, or TikTok) later means writing one new file
 * under `providers/` and appending it to the array — zero
 * callsite changes anywhere else.
 *
 * Design intent:
 *
 *   - **Single import surface.** Callers never reach for a
 *     specific provider. That's what keeps the wiring decoupled
 *     and the extension cheap.
 *   - **Fire-and-forget.** Every `track*` returns `void`. None
 *     of them block UI on the network. Provider implementations
 *     handle their own errors silently (a failed Monorail POST
 *     shouldn't kill an add-to-cart success path).
 *   - **No provider-specific shapes leak.** The `*Input` types
 *     in `types/analytics.ts` are provider-agnostic. Each
 *     provider owns the mapping to its own wire format.
 *
 * Consent is checked inside each provider on every call, so
 * there's no gate at this layer.
 */

/* The minimum contract a provider has to satisfy. Every method
 * is optional — a future provider that only cares about
 * conversion events can ship `addToCart` alone and leave the
 * rest undefined. The fan-out loop in each `track*` function
 * uses optional chaining. */
export interface AnalyticsProvider {
  pageView?(input?: PageViewInput): void;
  productView?(input: ProductViewInput): void;
  collectionView?(input: CollectionViewInput): void;
  searchView?(input: SearchViewInput): void;
  addToCart?(input: AddToCartInput): void;
}

const providers: ReadonlyArray<AnalyticsProvider> = [shopifyProvider];

export function trackPageView(input?: PageViewInput): void {
  for (const p of providers) p.pageView?.(input);
}

export function trackProductView(input: ProductViewInput): void {
  for (const p of providers) p.productView?.(input);
}

export function trackCollectionView(input: CollectionViewInput): void {
  for (const p of providers) p.collectionView?.(input);
}

export function trackSearchView(input: SearchViewInput): void {
  for (const p of providers) p.searchView?.(input);
}

export function trackAddToCart(input: AddToCartInput): void {
  for (const p of providers) p.addToCart?.(input);
}
