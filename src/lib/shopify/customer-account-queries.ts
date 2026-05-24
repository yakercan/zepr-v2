import "server-only";

import { customerAccountFetch } from "@/lib/shopify/customer-account";
import type {
  CustomerAddress,
  OrderDetail,
  OrderReturnStatus,
  OrdersPage,
} from "@/lib/shopify/customer-account-types";

/**
 * Typed read helpers for the Customer Account API.
 *
 * Each helper is the *minimum* projection that the matching UI
 * needs — pulling fewer fields means a smaller wire payload and a
 * smaller TypeScript surface for the renderer to satisfy. Add a
 * field here when (and only when) a component starts to need it.
 *
 * Types live in `customer-account-types.ts` (a sibling module
 * without `server-only`) so client components — the order-row
 * link, future profile-edit forms — can import them without
 * dragging the server-only fetch layer along. This file is the
 * server-only network layer; everything below talks to Shopify
 * and must not be reached by a client bundle.
 *
 * All helpers are best-effort: they let `CustomerAccountError`
 * bubble up to the caller, which is expected to wrap the call in
 * `Promise.allSettled` (or a try/catch) when a partial render is
 * preferable to a hard failure.
 */

/* Re-export the shared types so server callers that already
 * `import { fetchOrdersPage, type OrderSummary } from
 * customer-account-queries` keep working — one import path for
 * the server side, no rippling churn through page files. */
export type {
  CustomerAddress,
  OrderDetail,
  OrderLineItem,
  OrderReturnEvent,
  OrderReturnStatus,
  OrderSummary,
  OrdersPage,
  OrdersPageInfo,
} from "@/lib/shopify/customer-account-types";
export { extractGidId } from "@/lib/shopify/customer-account-types";

/* ------------------------------------------------------------------ */
/* Orders list (paginated)                                             */
/* ------------------------------------------------------------------ */

interface OrdersPageResponse {
  customer: {
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        name: string;
        processedAt: string;
        totalPrice: { amount: string; currencyCode: string };
      }>;
    };
  };
}

const ORDERS_PAGE_QUERY = /* GraphQL */ `
  query OrdersPage($first: Int!, $after: String) {
    customer {
      orders(
        first: $first
        after: $after
        sortKey: PROCESSED_AT
        reverse: true
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          name
          processedAt
          totalPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

/**
 * Fetch one page of the authenticated customer's orders.
 *
 * - First call: pass only `first` for the initial slice.
 * - Subsequent calls: pass the previous response's `pageInfo.endCursor`
 *   as `after` to extend the list (Relay cursor pagination).
 *
 * The dashboard uses `fetchOrdersPage(5)` and ignores `pageInfo`;
 * the full `/account/orders` page uses both halves.
 */
export async function fetchOrdersPage(
  first: number,
  after?: string | null,
): Promise<OrdersPage> {
  const data = await customerAccountFetch<OrdersPageResponse>(
    ORDERS_PAGE_QUERY,
    { first, after: after ?? null },
  );

  return {
    orders: data.customer.orders.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      processedAt: node.processedAt,
      totalAmount: Number(node.totalPrice.amount),
      currencyCode: node.totalPrice.currencyCode,
    })),
    pageInfo: data.customer.orders.pageInfo,
  };
}

/* ------------------------------------------------------------------ */
/* Tracking number extraction                                          */
/* ------------------------------------------------------------------ */

/**
 * Pull a usable tracking number out of Shopify's
 * `Fulfillment.trackingInformation` array, accepting either of
 * the two ways Shopify populates it in practice:
 *
 *   1. The `.number` field is set — the normal path.
 *   2. The `.number` field is null but `.url` points to a
 *      17track / carrier link that carries the number in a
 *      `nums=` (or `?n=`) query-string parameter.
 *
 * Returns the first hit across all entries, or `null` if neither
 * shape applies. The matching regex is broad on purpose — Shopify
 * URL hosts and parameter casing aren't consistent across the
 * carriers / fulfilment apps merchants use.
 */
function extractTrackingNumber(
  entries: Array<{ number: string | null; url: string | null }> | null,
): string | null {
  if (!entries) return null;
  for (const entry of entries) {
    if (entry.number) return entry.number;
    if (entry.url) {
      const fromUrl = trackingNumberFromUrl(entry.url);
      if (fromUrl) return fromUrl;
    }
  }
  return null;
}

function trackingNumberFromUrl(url: string): string | null {
  /* Match `nums=…` (17track's canonical shape, `?nums=ABC123` or
   * `#nums=ABC123`) and `n=…` (a few carrier links use this). The
   * captured group stops at typical URL delimiters so we don't
   * eat a trailing `&foo=bar`. */
  const match = url.match(/[#?&](?:nums|n)=([A-Za-z0-9-]+)/);
  return match ? match[1] : null;
}

/* ------------------------------------------------------------------ */
/* Order detail                                                        */
/* ------------------------------------------------------------------ */

interface OrderDetailResponse {
  customer: {
    orders: {
      nodes: Array<{
        id: string;
        name: string;
        processedAt: string;
        statusPageUrl: string | null;
        financialStatus: string | null;
        cancelledAt: string | null;
        totalPrice: { amount: string; currencyCode: string };
        subtotal: { amount: string; currencyCode: string } | null;
        totalShipping: { amount: string; currencyCode: string } | null;
        totalTax: { amount: string; currencyCode: string } | null;
        totalRefunded: { amount: string; currencyCode: string };
        refunds: Array<{ createdAt: string | null }>;
        shippingAddress: CustomerAddress | null;
        lineItems: {
          nodes: Array<{
            title: string;
            variantTitle: string | null;
            quantity: number;
            image: { url: string; altText: string | null } | null;
            totalPrice: { amount: string; currencyCode: string } | null;
          }>;
        };
        fulfillments: {
          nodes: Array<{
            createdAt: string;
            status: string;
            trackingInformation: Array<{
              number: string | null;
              url: string | null;
            }>;
          }>;
        };
        returns: {
          nodes: Array<{
            id: string;
            name: string;
            status: OrderReturnStatus;
            createdAt: string | null;
            updatedAt: string | null;
          }>;
        };
      }>;
    };
  };
}

/* Look up a single order via the orders connection with a Shopify
 * search-query filter (`id:<numeric>`). Customer Account API does
 * not expose a top-level `customer.order(id:)` field in 2026-04 —
 * the connection-with-filter pattern is the documented way to
 * fetch one order, and conveniently re-uses the same connection
 * the dashboard already runs against (so we never end up with two
 * versions of "what fields exist on Order"). */
const ORDER_DETAIL_QUERY = /* GraphQL */ `
  query OrderDetail($query: String!) {
    customer {
      orders(query: $query, first: 1) {
        nodes {
          id
          name
          processedAt
          statusPageUrl
          financialStatus
          cancelledAt
          totalPrice {
            amount
            currencyCode
          }
          subtotal {
            amount
            currencyCode
          }
          totalShipping {
            amount
            currencyCode
          }
          totalTax {
            amount
            currencyCode
          }
          totalRefunded {
            amount
            currencyCode
          }
          refunds {
            createdAt
          }
          shippingAddress {
            firstName
            lastName
            company
            address1
            address2
            city
            province
            country
            zip
          }
          lineItems(first: 100) {
            nodes {
              title
              variantTitle
              quantity
              image {
                url
                altText
              }
              totalPrice {
                amount
                currencyCode
              }
            }
          }
          fulfillments(first: 10) {
            nodes {
              createdAt
              status
              trackingInformation {
                number
                url
              }
            }
          }
          returns(first: 10) {
            nodes {
              id
              name
              status
              createdAt
              updatedAt
            }
          }
        }
      }
    }
  }
`;

export async function fetchOrderDetail(
  numericId: string,
): Promise<OrderDetail | null> {
  const data = await customerAccountFetch<OrderDetailResponse>(
    ORDER_DETAIL_QUERY,
    /* Shopify search-query syntax — `id:` matches the order's
     *  numeric identifier (not the GID; the search engine strips
     *  the prefix internally). Wrapped in a connection that
     *  always returns ≤ 1 node, so the caller treats the result
     *  as a single optional order. */
    { query: `id:${numericId}` },
  );

  const raw = data.customer.orders.nodes[0];
  if (!raw) return null;

  /* Latest refund timestamp drives the "Refund issued" row in
   * the timeline. Shopify doesn't promise ordering on `refunds[]`,
   * so we sort lexicographically (safe for ISO 8601) and take the
   * tail. Null timestamps — schema-allowed but rare in practice —
   * are filtered out before the sort. */
  const lastRefundAt =
    raw.refunds
      .map((r) => r.createdAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

  return {
    id: raw.id,
    name: raw.name,
    processedAt: raw.processedAt,
    statusPageUrl: raw.statusPageUrl,
    financialStatus: raw.financialStatus,
    totalAmount: Number(raw.totalPrice.amount),
    currencyCode: raw.totalPrice.currencyCode,
    subtotalAmount: raw.subtotal ? Number(raw.subtotal.amount) : null,
    totalShippingAmount: raw.totalShipping
      ? Number(raw.totalShipping.amount)
      : null,
    totalTaxAmount: raw.totalTax ? Number(raw.totalTax.amount) : null,
    cancelledAt: raw.cancelledAt,
    totalRefundedAmount: Number(raw.totalRefunded.amount),
    lastRefundAt,
    shippingAddress: raw.shippingAddress,
    lineItems: raw.lineItems.nodes.map((node) => ({
      title: node.title,
      variantTitle: node.variantTitle,
      quantity: node.quantity,
      imageUrl: node.image?.url ?? null,
      imageAlt: node.image?.altText ?? null,
      totalAmount: node.totalPrice ? Number(node.totalPrice.amount) : null,
      currencyCode: node.totalPrice?.currencyCode ?? null,
    })),
    fulfillments: raw.fulfillments.nodes.map((f) => ({
      createdAt: f.createdAt,
      status: f.status,
      trackingNumber: extractTrackingNumber(f.trackingInformation),
      deliveredAt: null,
    })),
    returns: raw.returns.nodes.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Default address                                                     */
/* ------------------------------------------------------------------ */

interface DefaultAddressResponse {
  customer: {
    defaultAddress: CustomerAddress | null;
  };
}

const DEFAULT_ADDRESS_QUERY = /* GraphQL */ `
  query DefaultAddress {
    customer {
      defaultAddress {
        firstName
        lastName
        company
        address1
        address2
        city
        province
        country
        zip
      }
    }
  }
`;

export async function fetchDefaultAddress(): Promise<CustomerAddress | null> {
  const data = await customerAccountFetch<DefaultAddressResponse>(
    DEFAULT_ADDRESS_QUERY,
  );
  return data.customer.defaultAddress;
}
