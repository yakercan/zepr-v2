import "server-only";

import {
  customerAccountFetch,
  customerAccountFetchWithToken,
} from "@/lib/shopify/customer-account";
import type {
  CustomerAddress,
  CustomerAddressInput,
  OrderDetail,
  OrderReturnStatus,
  OrdersPage,
  ReturnableLineItem,
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
  ReturnableLineItem,
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
        returnInformation: {
          returnableLineItems: {
            nodes: Array<{
              quantity: number;
              lineItem: {
                id: string;
                title: string;
                variantTitle: string | null;
                image: { url: string; altText: string | null } | null;
              };
            }>;
          };
        } | null;
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
 * versions of "what fields exist on Order").
 *
 * Returns connection — explicitly newest-first
 * (`sortKey: ID, reverse: true`) and capped at 50. Shopify's
 * default sort on `Order.returns` is ID-ascending, which during
 * internal testing started clipping the latest return off the
 * tail once a single order accumulated more than 10 records:
 * the timeline showed old returns but not the freshly-submitted
 * one. Flipping the sort + raising the cap means the user's
 * latest activity is always inside the page, and 50 stays
 * comfortably ahead of even heavy real-world usage (most orders
 * carry 0–2 returns). */
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
          # Newest-first, capped at 50 — see the JS comment above
          # the query for the rationale.
          returns(first: 50, sortKey: ID, reverse: true) {
            nodes {
              id
              name
              status
              createdAt
              updatedAt
            }
          }
          returnInformation {
            returnableLineItems(first: 50) {
              nodes {
                quantity
                lineItem {
                  id
                  title
                  variantTitle
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
    /* Project `returnInformation.returnableLineItems` into the
     * flat array the modal renders. Zero-quantity entries (fully
     * returned in a prior request) are filtered out so the UI
     * never sees an un-actionable row. The empty case naturally
     * gates the "Return request" button off the order page.
     * `returnInformation` itself is nullable on Shopify's schema
     * for orders that haven't been fulfilled at all yet — treat
     * that as "nothing returnable" by falling back to []. */
    returnableLineItems:
      raw.returnInformation?.returnableLineItems.nodes
        .filter((node) => node.quantity > 0)
        .map((node): ReturnableLineItem => ({
          lineItemId: node.lineItem.id,
          title: node.lineItem.title,
          variantTitle: node.lineItem.variantTitle,
          imageUrl: node.lineItem.image?.url ?? null,
          imageAlt: node.lineItem.image?.altText ?? null,
          returnableQuantity: node.quantity,
        })) ?? [],
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
/* Customer profile (read)                                             */
/* ------------------------------------------------------------------ */

interface CustomerProfileResponse {
  customer: {
    firstName: string | null;
    lastName: string | null;
    emailAddress: { emailAddress: string | null } | null;
  };
}

const CUSTOMER_PROFILE_QUERY = /* GraphQL */ `
  query CustomerProfile {
    customer {
      firstName
      lastName
      emailAddress {
        emailAddress
      }
    }
  }
`;

export interface CustomerProfile {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

/**
 * Fetch the canonical first / last / email straight off the
 * customer record.
 *
 * Exists because Shopify's id_token frequently omits
 * `given_name` / `family_name` even when the admin has them set
 * — so the OAuth callback enriches the about-to-be-sealed
 * session with these values before writing the cookie. After
 * that the dashboard renders fast off `session.customer` and
 * never needs to hit this query at render time.
 *
 * Takes the access token explicitly because the only caller
 * (the `/account/authorize` route) hasn't sealed the session
 * cookie yet — so `customerAccountFetch`'s session lookup would
 * see nothing.
 */
export async function fetchCustomerProfileWithToken(
  accessToken: string,
): Promise<CustomerProfile> {
  const data = await customerAccountFetchWithToken<CustomerProfileResponse>(
    CUSTOMER_PROFILE_QUERY,
    accessToken,
  );
  return {
    firstName: data.customer.firstName,
    lastName: data.customer.lastName,
    email: data.customer.emailAddress?.emailAddress ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Purchase verification                                               */
/* ------------------------------------------------------------------ */

interface PurchasedProductsResponse {
  customer: {
    orders: {
      nodes: Array<{
        lineItems: {
          nodes: Array<{ productId: string | null }>;
        };
      }>;
    };
  };
}

const PURCHASED_PRODUCTS_QUERY = /* GraphQL */ `
  query CustomerPurchasedProducts($first: Int!, $itemsPerOrder: Int!) {
    customer {
      orders(first: $first) {
        nodes {
          lineItems(first: $itemsPerOrder) {
            nodes {
              productId
            }
          }
        }
      }
    }
  }
`;

/**
 * Has the currently-signed-in shopper purchased this product?
 *
 * One Customer Account API round-trip — pulls the (productId-only)
 * line items off the customer's most-recent N orders and checks
 * if any of them match the target GID. Replaces the legacy
 * Admin-API-backed `orders(query: "email:...")` lookup with a
 * scope-respecting variant: this query only sees the orders the
 * signed-in shopper actually owns, so there's no email-forgery
 * risk and no Admin token to provision.
 *
 * Caps:
 *   - 250 orders. Covers virtually every account; super-heavy
 *     shoppers beyond that get an honest `false` (rather than a
 *     timeout from following 4× as many cursors), which the UI
 *     surfaces as "we couldn't confirm the purchase".
 *   - 100 line items per order. A real order rarely exceeds 10
 *     lines; 100 is the connection's hard cap and covers every
 *     practical case in one shot.
 *
 * Returns `false` on any error (network blip, GraphQL error,
 * session missing) — the review gate stays *closed* on failure
 * by design, so a transient fault doesn't open a write path.
 */
export async function hasPurchasedProduct(productId: string): Promise<boolean> {
  try {
    const data = await customerAccountFetch<PurchasedProductsResponse>(
      PURCHASED_PRODUCTS_QUERY,
      { first: 250, itemsPerOrder: 100 },
    );
    for (const order of data.customer.orders.nodes) {
      for (const item of order.lineItems.nodes) {
        if (item.productId === productId) return true;
      }
    }
    return false;
  } catch (err) {
    console.warn("[customer-account] purchase check failed:", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Address mutations                                                   */
/* ------------------------------------------------------------------ */

/** Shape of the per-mutation `userErrors` array from Shopify.
 *  Surfaced as-is so server actions can build a human-readable
 *  message ("Phone number is invalid") without re-mapping.
 *  Shopify uses an identical `{ code, field, message }` triple
 *  for every userError list across the Customer Account API,
 *  so this one alias covers address mutations + profile updates
 *  + anything else we plumb through later. */
export interface MutationUserError {
  code: string | null;
  field: string[] | null;
  message: string;
}

interface CustomerAddressCreatePayload {
  customerAddressCreate: {
    customerAddress: { id: string } | null;
    userErrors: MutationUserError[];
  };
}

interface CustomerAddressUpdatePayload {
  customerAddressUpdate: {
    customerAddress: { id: string } | null;
    userErrors: MutationUserError[];
  };
}

interface CustomerAddressDeletePayload {
  customerAddressDelete: {
    deletedAddressId: string | null;
    userErrors: MutationUserError[];
  };
}

/* Tiny helper so each mutation can early-return a typed
 * "first error message" without near-identical blocks inline.
 * Shopify always returns at least one entry in `userErrors`
 * when the mutation didn't apply cleanly. */
function firstErrorMessage(errors: MutationUserError[]): string | null {
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

/** Result envelope every Customer Account API mutation returns
 *  to its server-action caller. The action funnels both "Shopify
 *  returned userErrors" and "network / GraphQL transport blew
 *  up" through the same `{ ok: false, error }` shape so the
 *  form UI has one branch to render. Generic over the whole
 *  mutation surface (addresses, profile, …) since each caller
 *  only cares whether the call succeeded. */
export type MutationResult =
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
): Promise<MutationResult> {
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
): Promise<MutationResult> {
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
): Promise<MutationResult> {
  const data = await customerAccountFetch<CustomerAddressDeletePayload>(
    CUSTOMER_ADDRESS_DELETE,
    { addressId },
  );
  const error = firstErrorMessage(data.customerAddressDelete.userErrors);
  return error ? { ok: false, error } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Profile mutation                                                    */
/* ------------------------------------------------------------------ */

/** Form input shape for the `customerUpdate` mutation. Mirrors
 *  Shopify's `CustomerUpdateInput`, which today carries only
 *  `firstName` + `lastName`. Email is OIDC-managed and cannot
 *  be edited from the customer-facing API at all, so the form
 *  doesn't collect it. */
export interface CustomerProfileInput {
  firstName: string;
  lastName: string;
}

interface CustomerUpdatePayload {
  customerUpdate: {
    customer: {
      firstName: string | null;
      lastName: string | null;
    } | null;
    userErrors: MutationUserError[];
  };
}

const CUSTOMER_UPDATE = /* GraphQL */ `
  mutation CustomerUpdate($input: CustomerUpdateInput!) {
    customerUpdate(input: $input) {
      customer {
        firstName
        lastName
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

/** Mutation-result variant that *also* returns the freshly-
 *  saved profile fields when the call succeeded. Lets the
 *  caller re-seal the session cookie off the values Shopify
 *  actually persisted (which may have been trimmed or
 *  case-normalised) rather than the raw form input. */
export type CustomerProfileMutationResult =
  | { ok: true; firstName: string | null; lastName: string | null }
  | { ok: false; error: string };

export async function updateCustomerProfile(
  input: CustomerProfileInput,
): Promise<CustomerProfileMutationResult> {
  const blank = (s: string) => (s.trim() === "" ? null : s.trim());
  const data = await customerAccountFetch<CustomerUpdatePayload>(
    CUSTOMER_UPDATE,
    {
      input: {
        firstName: blank(input.firstName),
        lastName: blank(input.lastName),
      },
    },
  );
  const error = firstErrorMessage(data.customerUpdate.userErrors);
  if (error) return { ok: false, error };
  return {
    ok: true,
    firstName: data.customerUpdate.customer?.firstName ?? null,
    lastName: data.customerUpdate.customer?.lastName ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Return request                                                      */
/* ------------------------------------------------------------------ */

/** Input shape for `orderRequestReturn`. Mirrors Shopify's
 *  `RequestedLineItemInput`. The `lineItemId` is the plain
 *  `LineItem.id` (e.g. `gid://shopify/LineItem/353882977`) —
 *  the same id `Order.returnInformation.returnableLineItems[]
 *  .lineItem.id` returns. `returnReason: OTHER` is the only
 *  value we ever send; our predefined reasons (from
 *  `lib/returns/reasons.ts`) are encoded into the `customerNote`
 *  so the merchant still sees what the shopper picked, without
 *  us fighting Shopify's taxonomy. */
export interface RequestedReturnLineItemInput {
  lineItemId: string;
  quantity: number;
  /** Pre-formatted note: `"[Our reason]: [their note]"` (or just
   *  the reason name when no note). Built by the caller. */
  customerNote: string;
}

interface OrderRequestReturnPayload {
  orderRequestReturn: {
    return: {
      id: string;
      status: OrderReturnStatus;
    } | null;
    userErrors: MutationUserError[];
  };
}

const ORDER_REQUEST_RETURN = /* GraphQL */ `
  mutation OrderRequestReturn(
    $orderId: ID!
    $requestedLineItems: [RequestedLineItemInput!]!
  ) {
    orderRequestReturn(
      orderId: $orderId
      requestedLineItems: $requestedLineItems
    ) {
      return {
        id
        status
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

/** Result envelope for `requestOrderReturn` — same `{ ok, error }`
 *  shape as the address mutations, but also returns the newly-
 *  created Return id when successful so the caller can name the
 *  Supabase media folder after it. */
export type OrderReturnRequestResult =
  | { ok: true; returnId: string }
  | { ok: false; error: string };

/**
 * Submit a return request on behalf of the signed-in customer.
 *
 * Shopify's `orderRequestReturn` mutation only models "the merchant
 * will review this" — it doesn't directly create the Return; it
 * queues it as `REQUESTED` for merchant approval. Photos / videos
 * are NOT part of this mutation's input (the schema has no media
 * field), so the storefront uploads them to our own Supabase bucket
 * keyed by the freshly-returned `Return.id`.
 */
export async function requestOrderReturn(
  orderId: string,
  lineItems: RequestedReturnLineItemInput[],
): Promise<OrderReturnRequestResult> {
  const data = await customerAccountFetch<OrderRequestReturnPayload>(
    ORDER_REQUEST_RETURN,
    {
      orderId,
      requestedLineItems: lineItems.map((line) => ({
        lineItemId: line.lineItemId,
        quantity: line.quantity,
        returnReason: "OTHER",
        customerNote: line.customerNote,
      })),
    },
  );

  const error = firstErrorMessage(data.orderRequestReturn.userErrors);
  if (error) return { ok: false, error };

  const id = data.orderRequestReturn.return?.id;
  if (!id) {
    /* No userErrors and no return id is schema-illegal per
     *  Shopify's contract, but we guard against it so the caller
     *  never sees an `ok: true` without an id. */
    return { ok: false, error: "Return request failed unexpectedly." };
  }
  return { ok: true, returnId: id };
}
