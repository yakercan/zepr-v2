"use client";

import { createStore } from "@/lib/external-store";

/**
 * Analytics consent state.
 *
 * Today: defaults to `true` and stays there. We don't ship a
 * banner yet, so events fire on every visit. This matches the
 * shopper-facing experience and produces clean Admin Analytics
 * data from day one.
 *
 * Future: a `<ConsentBanner>` will call `setAnalyticsConsent(...)`
 * based on the visitor's choice and load Shopify's Customer
 * Privacy API (`window.Shopify.loadFeatures(...)`) so the
 * Storefront API + Shopify-side consent cookies stay in sync.
 * The store contract here doesn't change — only the source of
 * the boolean does.
 *
 * Why a store instead of a constant boolean:
 *
 *   - `useShopifyCookies({ hasUserConsent })` needs to react when
 *     consent flips, dropping its cookies if it goes false.
 *   - Every event call should re-check at fire time, not at the
 *     time the surface mounted — a shopper might withdraw
 *     consent mid-session.
 *   - Keeps the future banner code single-source-of-truth.
 *
 * `useAnalyticsConsent()` is the React hook for components that
 * want to reactively follow the value. `getAnalyticsConsent()`
 * is the imperative read for event handlers (cart adds, PDP
 * impressions) where a hook isn't ergonomic.
 */
const consentStore = createStore<boolean>(true, true);

export function setAnalyticsConsent(value: boolean): void {
  consentStore.set(value);
}

export function getAnalyticsConsent(): boolean {
  return consentStore.get();
}

export function useAnalyticsConsent(): boolean {
  return consentStore.use();
}
