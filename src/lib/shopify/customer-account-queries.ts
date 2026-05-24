import "server-only";

import {
  CustomerAccountError,
  customerAccountFetch,
} from "@/lib/shopify/customer-account";

/**
 * Typed read helpers for the Customer Account API.
 *
 * Each helper is the *minimum* projection that the matching UI
 * needs — pulling fewer fields means a smaller wire payload and a
 * smaller TypeScript surface for the renderer to satisfy. Add a
 * field here when (and only when) a component starts to need it.
 *
 * All helpers are best-effort: they let `CustomerAccountError`
 * bubble up to the caller, which is expected to wrap the call in
 * `Promise.allSettled` (or a try/catch) when a partial render is
 * preferable to a hard failure.
 */

/* ------------------------------------------------------------------ */
/* Recent orders                                                       */
/* ------------------------------------------------------------------ */

export interface RecentOrder {
  id: string;
  /** Display name Shopify assigns to an order, e.g. `#1234`. */
  name: string;
  /** ISO-8601 timestamp the order was processed (≈ placed). */
  processedAt: string;
  totalAmount: number;
  currencyCode: string;
}

interface RecentOrdersResponse {
  customer: {
    orders: {
      nodes: Array<{
        id: string;
        name: string;
        processedAt: string;
        totalPrice: { amount: string; currencyCode: string };
      }>;
    };
  };
}

const RECENT_ORDERS_QUERY = /* GraphQL */ `
  query RecentOrders($first: Int!) {
    customer {
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
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

export async function fetchRecentOrders(
  first: number,
): Promise<RecentOrder[]> {
  const data = await customerAccountFetch<RecentOrdersResponse>(
    RECENT_ORDERS_QUERY,
    { first },
  );

  return data.customer.orders.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    processedAt: node.processedAt,
    totalAmount: Number(node.totalPrice.amount),
    currencyCode: node.totalPrice.currencyCode,
  }));
}

/* ------------------------------------------------------------------ */
/* Default address                                                     */
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

/* ------------------------------------------------------------------ */
/* Error helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * `Promise.allSettled`-friendly wrapper: turns a `rejected` result
 * into `null` while letting `fulfilled` values pass through. Keeps
 * the rendering code free of `if (status === 'fulfilled')` noise
 * for sections that prefer "show nothing" over "crash the page".
 */
export function valueOrNull<T>(
  result: PromiseSettledResult<T>,
): T | null {
  if (result.status === "fulfilled") return result.value;
  /* Log once on the server so a real outage stays visible without
   * spamming when an individual shopper's data is genuinely empty.
   * `not_authenticated` is the one shape that should never reach
   * this branch — the page-level redirect catches it first — so
   * surface it loudly if it ever does. */
  const err = result.reason;
  if (err instanceof CustomerAccountError) {
    console.error(`[customer-account] ${err.code}: ${err.message}`);
  } else {
    console.error("[customer-account] unexpected error:", err);
  }
  return null;
}
