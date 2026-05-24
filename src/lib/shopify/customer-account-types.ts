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

export interface OrderFulfillmentEvent {
  createdAt: string;
  /** Shopify's fulfillment status enum (`SUCCESS`, `OPEN`,
   *  `IN_PROGRESS`, …). Kept as the raw string so the status
   *  helper in `order-status.ts` is the single place that
   *  decides what counts as "shipped". */
  status: string;
  /** Carrier tracking number, when Shopify has one. This is the
   *  lookup key the order detail page hands to 17track to decide
   *  whether the package has been delivered. */
  trackingNumber: string | null;
  /** ISO-8601 timestamp of when the package was reported delivered.
   *  Shopify's Customer Account API doesn't expose a delivered
   *  state, so this is filled in by the 17track enrichment step
   *  on the order detail page — left `null` everywhere else. */
  deliveredAt: string | null;
}

/** Raw Shopify `ReturnStatus` enum surfaced as a string-literal
 *  union so the timeline builder can switch on it without sprinkling
 *  magic strings around the codebase. Stays in lockstep with the
 *  Customer Account API — add a value here when Shopify adds one. */
export type OrderReturnStatus =
  | "REQUESTED"
  | "OPEN"
  | "CLOSED"
  | "DECLINED"
  | "CANCELED";

export interface OrderReturnEvent {
  id: string;
  /** Display name Shopify assigns to a return, e.g. `#R1234-R1`.
   *  Currently unused in the timeline UI but worth carrying so a
   *  future "Returns" list view doesn't need a second query. */
  name: string;
  status: OrderReturnStatus;
  /** ISO-8601 when the customer first requested the return.
   *  Shopify marks this nullable on the schema even though every
   *  Return we've seen carries one — we keep it nullable to match
   *  the GraphQL contract and degrade gracefully if it ever is. */
  createdAt: string | null;
  /** ISO-8601 of the latest state change. For DECLINED / CLOSED
   *  returns this doubles as the decision timestamp (Shopify
   *  doesn't expose a discrete `approvedAt` / `declinedAt`). */
  updatedAt: string | null;
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
  /** Raw Shopify financial status enum (`PAID`, `PENDING`,
   *  `REFUNDED`, `PARTIALLY_REFUNDED`, …). The status helper
   *  interprets this for both the "Paid" and "Refund" milestones. */
  financialStatus: string | null;
  /** Money breakdown — each may be `null` for digital / promo
   *  orders that don't have that component. `totalAmount` is the
   *  number the customer actually paid. */
  subtotalAmount: number | null;
  totalShippingAmount: number | null;
  totalTaxAmount: number | null;
  totalAmount: number;
  currencyCode: string;
  /** ISO-8601 of when the merchant canceled the order, or `null`
   *  for orders that were never canceled. When non-null, the
   *  timeline swaps its "Delivered" row for an "Order canceled"
   *  one — Shipped / Paid / Placed above it stay as-is, since an
   *  order can be canceled before *or* after shipping. */
  cancelledAt: string | null;
  /** Sum across `Order.refunds[]` as Shopify reports it on
   *  `Order.totalRefunded`. `0` when no refund has been issued. */
  totalRefundedAmount: number;
  /** Latest refund's `createdAt`. Used as the timeline date for
   *  the "Refund issued" row — `null` when no refund exists. */
  lastRefundAt: string | null;
  shippingAddress: CustomerAddress | null;
  lineItems: OrderLineItem[];
  fulfillments: OrderFulfillmentEvent[];
  /** Empty when the shopper hasn't requested any returns yet —
   *  the timeline builder skips the return milestones entirely
   *  in that case. */
  returns: OrderReturnEvent[];
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
