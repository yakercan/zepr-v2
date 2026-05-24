import "server-only";

import { customerAccountFetch } from "@/lib/shopify/customer-account";
import type {
  CustomerAddress,
  OrderDetail,
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
 * without `server-only`) so client components — the orders list
 * loader, future profile-edit forms — can import them too. This
 * file is the server-only network layer; everything below talks
 * to Shopify and must not be reached by a client bundle.
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
        totalPrice: { amount: string; currencyCode: string };
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
          totalPrice {
            amount
            currencyCode
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

  return {
    id: raw.id,
    name: raw.name,
    processedAt: raw.processedAt,
    statusPageUrl: raw.statusPageUrl,
    totalAmount: Number(raw.totalPrice.amount),
    currencyCode: raw.totalPrice.currencyCode,
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
