"use client";

import {
  AnalyticsEventName,
  ShopifySalesChannel,
  getClientBrowserParameters,
  sendShopifyAnalytics,
  type ShopifyAnalyticsProduct,
} from "@shopify/hydrogen-react";
import type {
  CurrencyCode,
  LanguageCode,
} from "@shopify/hydrogen-react/storefront-api-types";

import { getAnalyticsConsent } from "@/lib/analytics/consent";
import type { AnalyticsProvider } from "@/lib/analytics/events";
import type {
  AddToCartInput,
  CollectionViewInput,
  ProductInput,
  ProductViewInput,
  SearchViewInput,
} from "@/types/analytics";

/**
 * Shopify analytics provider.
 *
 * Wraps `sendShopifyAnalytics` from `@shopify/hydrogen-react` —
 * Shopify's framework-agnostic helper that POSTs events into the
 * Monorail pipeline. We route them first-party through the
 * storefront's own checkout domain (see `send()` below) rather
 * than the library's third-party default. These events surface in
 * Shopify Admin → Analytics (sessions, top products, conversion
 * funnel, add-to-cart counts) and Live View, and are the only
 * path to make those dashboards work on a headless storefront.
 *
 * Shape of the payloads is dictated by Shopify's Monorail
 * pipeline (Trekkie + Customer events). We feed it the same
 * shape Hydrogen does — `getClientBrowserParameters()` for the
 * client envelope (URL, referrer, viewport, etc.) plus shop /
 * currency / sales-channel context from this module's runtime
 * config.
 *
 * Why a module-level `config` rather than passing on every call:
 *
 *   - The shop id is server-only at boot (it's in
 *     `SHOPIFY_SHOP_ID`, not `NEXT_PUBLIC_*`), so the layout
 *     reads it once during SSR and hands it off to the client
 *     via `<ShopifyAnalytics>`. After that hand-off it never
 *     changes for the session.
 *   - Currency + locale follow the same lifecycle — set once,
 *     read on every event.
 *   - Avoids prop-drilling shop id through every cart action
 *     and PDP component.
 *
 * Why `ShopifySalesChannel.headless`:
 *
 *   - Storefront is registered as the "Headless" channel app
 *     (not a Hydrogen sales channel). `headless` is the
 *     supported enum value for non-Hydrogen custom storefronts
 *     and what Admin Analytics expects for attribution.
 *
 * Consent gate: every fire reads `getAnalyticsConsent()`
 * synchronously and bails when false. Today consent defaults to
 * `true` (no banner yet); when the banner lands, this gate
 * starts taking effect without any change to the provider.
 */

interface ShopifyAnalyticsConfig {
  shopId: string | null;
  /** Headless storefront ID → `hydrogenSubchannelId` in every event.
   *  The trekkie page-view schema that powers Live View *visitors*
   *  attributes the session through this; without it the field is
   *  `"0"` and the visit never lands in the real-time map. */
  storefrontId: string | null;
  /** Shopify-served host under the storefront's own apex (e.g.
   *  `"checkout.zepr.com"`). Passed as the 2nd arg to
   *  `sendShopifyAnalytics`, which then POSTs events to
   *  `https://<checkoutDomain>/.well-known/shopify/monorail/…`
   *  instead of the generic `monorail-edge.shopifysvc.com`.
   *
   *  This is the difference between Live View staying blank and
   *  working: the first-party endpoint is same-site with the
   *  `_shopify_y` / `_shopify_s` cookies (both scoped to the
   *  `.zepr.com` apex), so Shopify attributes the hit to a real
   *  session. The third-party fallback is cross-site, the cookies
   *  don't ride along, and the session never registers in the
   *  real-time map. */
  checkoutDomain: string | null;
  currency: string;
  acceptedLanguage: string;
}

const config: ShopifyAnalyticsConfig = {
  shopId: null,
  storefrontId: null,
  checkoutDomain: null,
  currency: "USD",
  acceptedLanguage: "en",
};

/**
 * Set the runtime config. Called once by `<ShopifyAnalytics>`
 * during the layout's first client paint, before any event
 * fires. Subsequent calls overwrite (used when locale/currency
 * become reactive).
 */
export function hydrateShopifyAnalyticsConfig(
  next: Partial<ShopifyAnalyticsConfig>,
): void {
  if (next.shopId !== undefined) config.shopId = next.shopId;
  if (next.storefrontId !== undefined) config.storefrontId = next.storefrontId;
  if (next.checkoutDomain !== undefined) {
    config.checkoutDomain = next.checkoutDomain;
  }
  if (next.currency !== undefined) config.currency = next.currency;
  if (next.acceptedLanguage !== undefined) {
    config.acceptedLanguage = next.acceptedLanguage;
  }
}

/**
 * Single send path for every event. Forwards the storefront's
 * Shopify-served `checkoutDomain` as `sendShopifyAnalytics`'s second
 * argument so events POST first-party to
 * `https://<checkoutDomain>/.well-known/shopify/monorail/…` (the
 * thing that makes Live View attribute the session). Falls back to
 * the library's third-party default if the domain isn't configured,
 * which keeps the Admin Analytics *reports* working even if the
 * first-party route is ever unavailable.
 */
function send(event: Parameters<typeof sendShopifyAnalytics>[0]): void {
  void sendShopifyAnalytics(event, config.checkoutDomain ?? undefined);
}

/* ────────────────────────────────────────────────────────────
 *  Payload builders
 * ──────────────────────────────────────────────────────────── */

/** Common envelope every event carries — shop context + browser
 *  context. `getClientBrowserParameters()` reads `window` (URL,
 *  referrer, viewport, user agent, etc.), so this builder must
 *  only ever run on the client.
 *
 *  Currency and language are cast to Shopify's enum types
 *  (`CurrencyCode` / `LanguageCode`). The enums are exhaustive
 *  string unions of ISO codes; our config-side values are
 *  validated upstream (env / cart), so the cast is safe —
 *  but a runtime guard against typos would be a worthwhile
 *  follow-up when locale support lands. */
function buildEnvelope() {
  if (!config.shopId) return null;
  /* Consent gate. `getAnalyticsConsent()` defaults to granted, so
   * markets without a banner (US/CA/NZ/AU) always pass. In the
   * opt-in markets (UK/Singapore) `<CookieConsent>` flips it off
   * until the shopper accepts — so a `false` here means "no consent
   * yet / declined" and we send nothing: no event, and
   * `useShopifyCookies` independently withholds the `_shopify_*`
   * cookies on the same signal. Re-checked at fire time (not mount)
   * so withdrawing consent mid-session stops tracking immediately. */
  if (!getAnalyticsConsent()) return null;
  return {
    ...getClientBrowserParameters(),
    hasUserConsent: true,
    shopifySalesChannel: ShopifySalesChannel.headless,
    shopId: `gid://shopify/Shop/${config.shopId}`,
    /* → `hydrogenSubchannelId`. The piece that ties the session to
     * this Headless storefront in Live View; absent it the schema
     * falls back to `"0"` and the hit is unattributed. */
    storefrontId: config.storefrontId ?? undefined,
    /* Consent flags → `analytics_allowed` / `marketing_allowed` /
     * `sale_of_data_allowed` in the customer-tracking schema. They
     * default to `false` when omitted, which makes Shopify drop the
     * event from Analytics + Live View. We only reach this point
     * with consent granted (the gate above), so they're `true`. */
    analyticsAllowed: true,
    marketingAllowed: true,
    saleOfDataAllowed: true,
    currency: config.currency as CurrencyCode,
    acceptedLanguage: config.acceptedLanguage as LanguageCode,
  };
}

/** Map our provider-agnostic `ProductInput` onto Shopify's
 *  Trekkie product shape. Field names + casing here are dictated
 *  by Shopify — don't camelCase `productGid`. */
function toShopifyProduct(p: ProductInput): ShopifyAnalyticsProduct {
  return {
    productGid: toShopifyGid("Product", p.productId),
    variantGid: p.variantId,
    name: p.name,
    variantName: p.variantTitle ?? "",
    brand: p.brand ?? "",
    category: p.category ?? "",
    price: p.price,
    quantity: p.quantity,
  };
}

/**
 * Normalise an id to a Shopify GID string regardless of input
 * shape. Handles both:
 *
 *   - Numeric input (`"12345"`) — common from Salespace / search
 *     surfaces where ids come back stripped.
 *   - GID input (`"gid://shopify/Product/12345"`) — what Shopify's
 *     own APIs return on PDP / cart paths.
 *
 * Re-prefixing a GID would produce `gid://shopify/Product/gid://...`
 * which Shopify's pipeline rejects silently; pulling the trailing
 * numeric out first keeps the call sites careless about which
 * shape they hand us.
 */
function toShopifyGid(
  resource: "Product" | "ProductVariant" | "Collection",
  input: string,
): string {
  const match = input.match(/\/(\d+)$/);
  const numeric = match ? match[1] : input;
  return `gid://shopify/${resource}/${numeric}`;
}

/* ────────────────────────────────────────────────────────────
 *  Provider methods
 * ──────────────────────────────────────────────────────────── */

/* Generic page-view / session counter. Resource-typed pages
 * (PDP, category, search) fire their dedicated `productView` /
 * `collectionView` / `searchView` events instead, which power the
 * per-resource breakdowns in Admin Analytics. Everything else
 * lands here as a plain `PAGE_VIEW`. */
function pageView(): void {
  const envelope = buildEnvelope();
  if (!envelope) return;

  send({
    eventName: AnalyticsEventName.PAGE_VIEW,
    payload: envelope,
  });
}

function productView({ product }: ProductViewInput): void {
  const envelope = buildEnvelope();
  if (!envelope) return;

  send({
    eventName: AnalyticsEventName.PRODUCT_VIEW,
    payload: {
      ...envelope,
      resourceId: toShopifyGid("Product", product.productId),
      products: [toShopifyProduct(product)],
    },
  });
}

function collectionView({ collectionId, handle }: CollectionViewInput): void {
  const envelope = buildEnvelope();
  if (!envelope) return;

  send({
    eventName: AnalyticsEventName.COLLECTION_VIEW,
    payload: {
      ...envelope,
      collectionHandle: handle,
      collectionId: toShopifyGid("Collection", collectionId),
    },
  });
}

function searchView({ query }: SearchViewInput): void {
  const envelope = buildEnvelope();
  if (!envelope) return;

  /* `resultCount` is intentionally not surfaced — Shopify's
   * search-view schema only tracks the search string itself
   * (it joins to the result count downstream when the
   * subsequent page-view of the results page lands). Keeping
   * the input field in the provider-agnostic type so future
   * providers (GA4, custom) can use it. */
  send({
    eventName: AnalyticsEventName.SEARCH_VIEW,
    payload: {
      ...envelope,
      searchString: query,
    },
  });
}

function addToCart({
  cartId,
  totalValue,
  products,
}: AddToCartInput): void {
  const envelope = buildEnvelope();
  if (!envelope) return;

  send({
    eventName: AnalyticsEventName.ADD_TO_CART,
    payload: {
      ...envelope,
      /* `cartId` is required by Shopify's ADD_TO_CART schema.
       * Guest-mode shoppers haven't minted a Shopify cart yet
       * (we hold a pure localStorage snapshot), so we send an
       * empty string. The pipeline tolerates the empty value
       * and still attributes the event to the visitor / session
       * cookies. Server-mode adds carry the real `gid://shopify
       * /Cart/<id>`. */
      cartId: cartId ?? "",
      totalValue: Number(totalValue),
      products: products.map(toShopifyProduct),
    },
  });
}

/**
 * The provider object events.ts iterates over. Keeping the
 * surface as a plain object (not a class) so the file's
 * tree-shake-friendly and the future GA4 / Meta providers
 * follow the same one-export pattern.
 */
export const shopifyProvider: AnalyticsProvider = {
  pageView,
  productView,
  collectionView,
  searchView,
  addToCart,
};
