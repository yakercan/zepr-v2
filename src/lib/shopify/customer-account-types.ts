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
  /** First line-item image on the order. `null` when none of the
   *  items carry one (rare — typically a digital / gift-card
   *  order). Drives the thumbnail rendered by `OrderRow`. */
  previewImageUrl: string | null;
  previewImageAlt: string | null;
  /** Distinct products beyond the first, rendered as a "+N" badge
   *  overlaid on the thumbnail. Distinctness is by line-item title
   *  so variants of the same product fold together — buying two
   *  sizes of one shirt reads as a single product, not two. */
  additionalProductCount: number;
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
   *  Sourced from Shopify's `Fulfillment.events` (the `DELIVERED`
   *  event's `happenedAt`) where possible — that's the same
   *  carrier-reported timestamp 17track returns, and it costs
   *  nothing extra to fetch on the same query. `null` means
   *  Shopify hasn't logged a DELIVERED event yet; the order detail
   *  page then asks 17track as a fallback for those specific
   *  fulfilments. */
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

/**
 * One returnable item — flattened off
 * `Order.returnInformation.returnableLineItems` so the UI loop
 * is one-dimensional. Each entry already maps 1:1 to a single
 * `LineItem` on the order; the `quantity` field is what's still
 * eligible to be returned (i.e. ordered minus already-returned).
 *
 * `lineItemId` is the plain LineItem GID — that's what the
 * `orderRequestReturn` mutation's `RequestedLineItemInput.lineItemId`
 * field accepts in the Customer Account API.
 */
export interface ReturnableLineItem {
  /** GID of the line item, e.g. `gid://shopify/LineItem/353882977`.
   *  Passed verbatim as the `lineItemId` field on
   *  `RequestedLineItemInput`. */
  lineItemId: string;
  title: string;
  variantTitle: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  /** Maximum quantity of this item still eligible for return.
   *  Always ≥ 1 (zero-quantity entries are filtered out at the
   *  query boundary so the UI never sees an un-actionable row). */
  returnableQuantity: number;
}

export interface OrderDetail {
  id: string;
  /** Display name Shopify assigns to an order, e.g. `#1234`. */
  name: string;
  processedAt: string;
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
  /** ISO-8601 of when the merchant cancelled the order, or `null`
   *  for orders that were never cancelled. When non-null, the
   *  timeline swaps its "Delivered" row for an "Order cancelled"
   *  one (and drops the Shipped row if the order never actually
   *  shipped). Otherwise Shipped / Paid / Placed stay as-is — an
   *  order can be cancelled before *or* after shipping. */
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
  /** Items still eligible for return, flattened across all
   *  fulfilments. Empty array gates the "Return request" button
   *  off the order page entirely. */
  returnableLineItems: ReturnableLineItem[];
}

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

/**
 * One of the customer's saved addresses, as it comes back from
 * `customer.addresses` / `customer.defaultAddress` / the
 * `customerAddress*` mutations.
 *
 * Two parallel views of "where in the world is this":
 *
 *   - `province` / `country` are the *human-readable* names
 *     ("California" / "United States") used by the dashboard
 *     and address-page card UI when displaying an address.
 *   - `zoneCode` / `territoryCode` are the *codes* ("CA" / "US")
 *     that Shopify's `CustomerAddressInput` accepts on write,
 *     so the edit form pre-fills its country / region inputs
 *     off the codes (not the names) to stay round-trippable.
 *
 *  `id` is null only on the orphan address inside
 *  `Order.shippingAddress` — that's a snapshot the customer
 *  never edits, so the type stays nullable instead of forking
 *  into two shapes. Live addresses (the ones the addresses page
 *  CRUDs) always carry one.
 */
export interface CustomerAddress {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  /** Human-readable region name, e.g. "California". Display only. */
  province: string | null;
  /** ISO-style region code, e.g. "CA". The edit form's region
   *  input rides on this so a round-trip update doesn't lossily
   *  re-resolve the name back to a code. */
  zoneCode: string | null;
  /** Human-readable country name, e.g. "United States". Display
   *  only. */
  country: string | null;
  /** ISO 3166-1 alpha-2 country code, e.g. "US". The edit form's
   *  country input rides on this for the same reason as above. */
  territoryCode: string | null;
  zip: string | null;
  /** E.164-formatted phone number, e.g. "+16135551111". Shopify
   *  rejects anything else on write. `null` when none was saved. */
  phoneNumber: string | null;
}

/**
 * Form-shaped input for `customerAddressCreate` /
 * `customerAddressUpdate`. Mirrors `CustomerAddressInput` from
 * Shopify's GraphQL schema — empty strings are coerced to `null`
 * at the mutation boundary so the server treats a blank field as
 * "unset", not "set to empty string".
 *
 * Note the codes-not-names rule: `territoryCode` and `zoneCode`
 * are what Shopify accepts, so the form collects codes too.
 */
export interface CustomerAddressInput {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  zoneCode: string;
  territoryCode: string;
  zip: string;
  phoneNumber: string;
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
