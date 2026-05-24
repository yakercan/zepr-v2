import "server-only";

import { customerAccountFetch } from "@/lib/shopify/customer-account";
import type {
  CustomerAddress,
  CustomerAddressInput,
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
  CustomerAddressInput,
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
        lineItems: {
          nodes: Array<{
            title: string;
            image: { url: string; altText: string | null } | null;
          }>;
        };
      }>;
    };
  };
}

/* Line-item slice is small (title + image only) and capped at 10
 * per order — enough to (a) pick a first image worth showing and
 * (b) count distinct products for the "+N more" badge in the row,
 * without ballooning the payload on orders that genuinely have a
 * couple dozen items. Orders with >10 distinct products end up
 * with a slightly-low `additionalProductCount`; the trade-off is
 * intentional and fine for a dashboard preview. */
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
          lineItems(first: 10) {
            nodes {
              title
              image {
                url
                altText
              }
            }
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
    orders: data.customer.orders.nodes.map((node) => {
      /* First line item carrying an image becomes the row
       * thumbnail — falls back to `null` for image-less orders
       * (rare; the row renders a neutral placeholder in that
       * case). Distinct-product count is "distinct titles" so a
       * shopper buying two sizes of the same shirt reads as one
       * product, not two. */
      const items = node.lineItems.nodes;
      const firstWithImage = items.find((i) => i.image?.url);
      const distinctTitles = new Set(items.map((i) => i.title));

      return {
        id: node.id,
        name: node.name,
        processedAt: node.processedAt,
        totalAmount: Number(node.totalPrice.amount),
        currencyCode: node.totalPrice.currencyCode,
        previewImageUrl: firstWithImage?.image?.url ?? null,
        previewImageAlt:
          firstWithImage?.image?.altText ?? firstWithImage?.title ?? null,
        additionalProductCount: Math.max(0, distinctTitles.size - 1),
      };
    }),
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
            events: {
              nodes: Array<{
                status: string;
                happenedAt: string;
              }>;
            };
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
            id
            firstName
            lastName
            address1
            address2
            city
            province
            zoneCode
            country
            territoryCode
            zip
            phoneNumber
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
              events(first: 50) {
                nodes {
                  status
                  happenedAt
                }
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
    fulfillments: raw.fulfillments.nodes.map((f) => {
      /* Shopify is the primary source for `deliveredAt`. Each
       * fulfilment carries an `events` list (driven by the
       * carrier-side webhooks Shopify already subscribes to), and
       * the `DELIVERED` event's `happenedAt` is the carrier-
       * reported moment of delivery — same value 17track returns
       * for the happy path, only without the extra round-trip,
       * registration dance, or carrier-detection ambiguity. We
       * fall back to 17track in the order-detail page only for
       * fulfilments Shopify hasn't yet logged a DELIVERED event
       * against (rare; usually a freshly-shipped order whose
       * carrier-side update hasn't propagated through Shopify's
       * fulfilment webhook yet). */
      const deliveredEvent = f.events.nodes.find(
        (e) => e.status === "DELIVERED",
      );
      return {
        createdAt: f.createdAt,
        status: f.status,
        trackingNumber: extractTrackingNumber(f.trackingInformation),
        deliveredAt: deliveredEvent?.happenedAt ?? null,
      };
    }),
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
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

/* Shared GraphQL field set for `CustomerAddress` — both the
 * default-address fetch (dashboard) and the full-list fetch
 * (addresses page) read the same shape, and so do the mutation
 * payloads. Inlining the fragment as a template-string constant
 * keeps the GraphQL self-contained (no @fragment directives) and
 * keeps every reader / writer in lockstep on the field list. */
const CUSTOMER_ADDRESS_FIELDS = /* GraphQL */ `
  id
  firstName
  lastName
  address1
  address2
  city
  province
  zoneCode
  country
  territoryCode
  zip
  phoneNumber
`;

interface DefaultAddressResponse {
  customer: {
    defaultAddress: CustomerAddress | null;
  };
}

const DEFAULT_ADDRESS_QUERY = /* GraphQL */ `
  query DefaultAddress {
    customer {
      defaultAddress {
        ${CUSTOMER_ADDRESS_FIELDS}
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

interface AddressesResponse {
  customer: {
    defaultAddress: { id: string } | null;
    addresses: { nodes: CustomerAddress[] };
  };
}

const ADDRESSES_QUERY = /* GraphQL */ `
  query Addresses($first: Int!) {
    customer {
      defaultAddress {
        id
      }
      addresses(first: $first) {
        nodes {
          ${CUSTOMER_ADDRESS_FIELDS}
        }
      }
    }
  }
`;

export interface AddressesPayload {
  addresses: CustomerAddress[];
  /** The id of the address currently marked as default, or `null`
   *  when the customer hasn't designated one. Drives the
   *  "Default" pill + the "Set as default" button visibility on
   *  each card in the addresses page. */
  defaultAddressId: string | null;
}

/**
 * Fetch every saved address for the authenticated customer, plus
 * the id of whichever one is currently default.
 *
 * `first: 50` is a safe upper bound — Shopify caps `Customer
 * .addresses` connections at 50 per page anyway, and shoppers
 * with more than a handful of saved addresses are vanishingly
 * rare. Pagination isn't surfaced for that reason; if a customer
 * ever bumps the ceiling we'll switch to cursor pagination then.
 */
export async function fetchAddresses(): Promise<AddressesPayload> {
  const data = await customerAccountFetch<AddressesResponse>(
    ADDRESSES_QUERY,
    { first: 50 },
  );
  return {
    addresses: data.customer.addresses.nodes,
    defaultAddressId: data.customer.defaultAddress?.id ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Address mutations                                                   */
/* ------------------------------------------------------------------ */

/** Shape of the per-mutation `userErrors` array from Shopify.
 *  Surfaced as-is so server actions can build a human-readable
 *  message ("Phone number is invalid") without re-mapping. */
export interface AddressUserError {
  code: string | null;
  field: string[] | null;
  message: string;
}

interface CustomerAddressCreatePayload {
  customerAddressCreate: {
    customerAddress: { id: string } | null;
    userErrors: AddressUserError[];
  };
}

interface CustomerAddressUpdatePayload {
  customerAddressUpdate: {
    customerAddress: { id: string } | null;
    userErrors: AddressUserError[];
  };
}

interface CustomerAddressDeletePayload {
  customerAddressDelete: {
    deletedAddressId: string | null;
    userErrors: AddressUserError[];
  };
}

/* Tiny helper so each mutation can early-return a typed
 * "first error message" without four near-identical blocks
 * inline. Shopify always returns at least one entry in
 * `userErrors` when the mutation didn't apply cleanly. */
function firstErrorMessage(errors: AddressUserError[]): string | null {
  return errors[0]?.message ?? null;
}

const CUSTOMER_ADDRESS_CREATE = /* GraphQL */ `
  mutation CustomerAddressCreate(
    $address: CustomerAddressInput!
    $defaultAddress: Boolean
  ) {
    customerAddressCreate(address: $address, defaultAddress: $defaultAddress) {
      customerAddress {
        id
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

const CUSTOMER_ADDRESS_UPDATE = /* GraphQL */ `
  mutation CustomerAddressUpdate(
    $addressId: ID!
    $address: CustomerAddressInput
    $defaultAddress: Boolean
  ) {
    customerAddressUpdate(
      addressId: $addressId
      address: $address
      defaultAddress: $defaultAddress
    ) {
      customerAddress {
        id
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

const CUSTOMER_ADDRESS_DELETE = /* GraphQL */ `
  mutation CustomerAddressDelete($addressId: ID!) {
    customerAddressDelete(addressId: $addressId) {
      deletedAddressId
      userErrors {
        code
        field
        message
      }
    }
  }
`;

/** Result envelope every address mutation returns to its server-
 *  action caller. The action funnels both "Shopify returned
 *  userErrors" and "network / GraphQL transport blew up" through
 *  the same `{ ok: false, error }` shape so the form UI has one
 *  branch to render. */
export type AddressMutationResult =
  | { ok: true }
  | { ok: false; error: string };

/* Sanitise a `CustomerAddressInput` before the wire trip — empty
 * strings become `null` so Shopify treats a blank field as
 * "leave it unset" rather than "set to empty string" (which the
 * schema then rejects for fields like phoneNumber). */
function sanitiseAddressInput(input: CustomerAddressInput) {
  const blank = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    firstName: blank(input.firstName),
    lastName: blank(input.lastName),
    address1: blank(input.address1),
    address2: blank(input.address2),
    city: blank(input.city),
    zoneCode: blank(input.zoneCode),
    territoryCode: blank(input.territoryCode),
    zip: blank(input.zip),
    phoneNumber: blank(input.phoneNumber),
  };
}

export async function createCustomerAddress(
  input: CustomerAddressInput,
  defaultAddress: boolean,
): Promise<AddressMutationResult> {
  const data = await customerAccountFetch<CustomerAddressCreatePayload>(
    CUSTOMER_ADDRESS_CREATE,
    {
      address: sanitiseAddressInput(input),
      defaultAddress,
    },
  );
  const error = firstErrorMessage(data.customerAddressCreate.userErrors);
  return error ? { ok: false, error } : { ok: true };
}

export async function updateCustomerAddress(
  addressId: string,
  input: CustomerAddressInput | null,
  defaultAddress: boolean | null,
): Promise<AddressMutationResult> {
  const data = await customerAccountFetch<CustomerAddressUpdatePayload>(
    CUSTOMER_ADDRESS_UPDATE,
    {
      addressId,
      address: input ? sanitiseAddressInput(input) : null,
      defaultAddress,
    },
  );
  const error = firstErrorMessage(data.customerAddressUpdate.userErrors);
  return error ? { ok: false, error } : { ok: true };
}

export async function deleteCustomerAddress(
  addressId: string,
): Promise<AddressMutationResult> {
  const data = await customerAccountFetch<CustomerAddressDeletePayload>(
    CUSTOMER_ADDRESS_DELETE,
    { addressId },
  );
  const error = firstErrorMessage(data.customerAddressDelete.userErrors);
  return error ? { ok: false, error } : { ok: true };
}
