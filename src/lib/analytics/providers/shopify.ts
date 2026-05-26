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
  PageViewInput,
  ProductInput,
  ProductViewInput,
  SearchViewInput,
} from "@/types/analytics";

/**
 * Shopify analytics provider.
 *
 * Wraps `sendShopifyAnalytics` from `@shopify/hydrogen-react` —
 * Shopify's framework-agnostic helper that POSTs events to
 * `monorail-edge.shopifysvc.com`. These events surface in
 * Shopify Admin → Analytics (sessions, top products, conversion
 * funnel, add-to-cart counts) and are the only path to make
 * those dashboards work on a headless storefront.
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
  currency: string;
  acceptedLanguage: string;
}

const config: ShopifyAnalyticsConfig = {
  shopId: null,
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
  if (next.currency !== undefined) config.currency = next.currency;
  if (next.acceptedLanguage !== undefined) {
    config.acceptedLanguage = next.acceptedLanguage;
  }
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
  return {
    ...getClientBrowserParameters(),
    hasUserConsent: getAnalyticsConsent(),
    shopifySalesChannel: ShopifySalesChannel.headless,
    shopId: `gid://shopify/Shop/${config.shopId}`,
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

function pageView(input?: PageViewInput): void {
  const envelope = buildEnvelope();
  if (!envelope) return;

  const eventName = pickPageEventName(input?.resource);
  void sendShopifyAnalytics({
    eventName,
    payload: envelope,
  });
}

function productView({ product }: ProductViewInput): void {
  const envelope = buildEnvelope();
  if (!envelope) return;

  void sendShopifyAnalytics({
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

  void sendShopifyAnalytics({
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
  void sendShopifyAnalytics({
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

  void sendShopifyAnalytics({
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
 * Pick the Monorail event name based on the resource kind.
 *
 * Shopify's pipeline records `PAGE_VIEW` for everything-else
 * traffic and dedicated `PRODUCT_VIEW` / `COLLECTION_VIEW` /
 * `SEARCH_VIEW` events for those resource types. The dedicated
 * events power the per-resource breakdowns in Admin Analytics
 * (top products, top collections, top searches). PDP / category /
 * search trackers call the dedicated `productView` / etc.
 * methods directly — this resolver covers the plain-page case.
 */
function pickPageEventName(
  resource: PageViewInput["resource"],
): keyof typeof AnalyticsEventName {
  switch (resource) {
    case "product":
    case "collection":
    case "search":
      /* The resource-specific trackers handle these; if a caller
       * routes a resource-typed page view through here we still
       * emit a generic PAGE_VIEW so session counting works. */
      return AnalyticsEventName.PAGE_VIEW;
    default:
      return AnalyticsEventName.PAGE_VIEW;
  }
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
