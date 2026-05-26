/**
 * Provider-agnostic shape of analytics events.
 *
 * Every `track*` function in `src/lib/analytics/events.ts` takes
 * one of these payloads and fans it out to every registered
 * provider (Shopify today; GA4 / Meta / TikTok later). Providers
 * own their own format-mapping — these types are the lowest
 * common denominator the storefront commits to.
 *
 * Keeping the shapes flat + primitive on purpose:
 *
 *   - No `ShopifyAnalyticsProduct` / `ShopifyAddToCartPayload`
 *     dependencies here. The day we wire GA4, the types still
 *     read straight.
 *   - Currency is part of every "money" event because each
 *     provider serialises it differently (Shopify wants ISO-4217,
 *     GA4 wants the same, Meta wants it on the outer event).
 */

export interface ProductInput {
  /** Numeric Shopify product id as a string (matches what we
   *  store in favorites / Salespace). Providers that need a GID
   *  prefix it themselves. */
  productId: string;
  /** Specific selected variant. Cart adds always have this;
   *  product views may pass the default variant. */
  variantId: string;
  /** Display name shown in the dashboard event log. */
  name: string;
  /** Optional brand / vendor (Shopify "Vendor", GA4 "item_brand"). */
  brand?: string;
  /** Optional first category — Shopify and GA4 both accept a
   *  single category string at this level. */
  category?: string;
  /** Variant title — "Small / Red" etc. Used by some providers
   *  to disambiguate variants in reports. */
  variantTitle?: string;
  /** Unit price in the natural currency unit (e.g. 19.99 USD,
   *  not 1999 cents). Shopify + GA4 both expect decimals.
   *  Stringified to dodge JS float-rounding on multi-line totals. */
  price: string;
  /** Number of units of *this* line. Defaults to 1 on
   *  product-view events. */
  quantity: number;
  /** ISO-4217 currency code (e.g. `"USD"`). */
  currency: string;
}

export interface PageViewInput {
  /** Resource type the URL points at — drives which Shopify
   *  monorail event is emitted alongside the plain page view
   *  (`product`, `collection`, `search`, or `page` for everything
   *  else). Defaults to `"page"` when omitted. */
  resource?: "page" | "product" | "collection" | "search";
}

export interface ProductViewInput {
  product: ProductInput;
}

export interface CollectionViewInput {
  /** Numeric Shopify collection id as a string. */
  collectionId: string;
  /** Collection handle for cross-referencing (Shopify accepts
   *  it as `resourceId`, GA4 as `list_id`). */
  handle: string;
}

export interface SearchViewInput {
  /** The query string the shopper typed / arrived with. */
  query: string;
  /** Result count, for funnel diagnostics. Optional because
   *  some surfaces show the search header before counts land. */
  resultCount?: number;
}

export interface AddToCartInput {
  /** Shopify cart id (the GID) when in server mode; `null` for
   *  guest carts that haven't been minted into a Shopify cart
   *  yet — Shopify's pipeline tolerates a missing cart id but
   *  attributes the event to a "ghost" cart. */
  cartId: string | null;
  /** Total cents added (for funnel value tracking). String for
   *  the same float-safety reason as `ProductInput.price`. */
  totalValue: string;
  /** Line-level breakdown — one entry per merchandise line
   *  added in this single mutation. */
  products: ProductInput[];
  /** Currency the totals are denominated in. */
  currency: string;
}
