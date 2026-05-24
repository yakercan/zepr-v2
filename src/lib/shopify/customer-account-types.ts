/**
 * Customer Account API — type contracts + pure utilities.
 *
 * Lives in its own file (separate from `customer-account-queries.ts`)
 * so anything client-safe — types and stateless helpers — can be
 * imported into client components without dragging the server-only
 * fetch layer along. The split is invisible to server callers:
 * `customer-account-queries.ts` re-exports everything below, so
 * server code can still pick whichever import path it prefers.
 *
 * Rule of thumb: anything that doesn't talk to the network or read
 * cookies belongs here. Anything that does belongs in
 * `customer-account-queries.ts` (which is gated by `server-only`).
 */

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

/**
 * Summary projection of an order — the shape every "list of
 * orders" surface (dashboard recent-rail, full orders page,
 * future order-search) reads from. The detail page upgrades to
 * `OrderDetail` for richer fields.
 */
export interface OrderSummary {
  id: string;
  /** Display name Shopify assigns to an order, e.g. `#1234`. */
  name: string;
  /** ISO-8601 timestamp the order was processed (≈ placed). */
  processedAt: string;
  totalAmount: number;
  currencyCode: string;
}

export interface OrdersPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface OrdersPage {
  orders: OrderSummary[];
  pageInfo: OrdersPageInfo;
}

export interface OrderLineItem {
  title: string;
  variantTitle: string | null;
  quantity: number;
  imageUrl: string | null;
  imageAlt: string | null;
  totalAmount: number | null;
  currencyCode: string | null;
}

export interface OrderDetail {
  id: string;
  /** Display name Shopify assigns to an order, e.g. `#1234`. */
  name: string;
  processedAt: string;
  /** Hosted Shopify "Order status" page — the canonical tracking
   *  destination. We surface a CTA instead of re-implementing the
   *  fulfilment / tracking UI inside the dashboard. */
  statusPageUrl: string | null;
  totalAmount: number;
  currencyCode: string;
  shippingAddress: CustomerAddress | null;
  lineItems: OrderLineItem[];
}

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

export interface CustomerAddress {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

/**
 * Extract the numeric suffix off a Shopify GID — turns
 * `gid://shopify/Order/123` into `123`. Used to put short,
 * email-shareable IDs in URLs; the page on the other side passes
 * the numeric back to the `id:` search filter the orders
 * connection accepts.
 */
export function extractGidId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}
