import "server-only";

import { env } from "@/env";
import { getSession } from "@/lib/auth/session";

/**
 * Shopify Customer Account API GraphQL client.
 *
 * Sibling to `shopifyFetch` (Storefront API) — same idea, but
 * authenticated as the currently-signed-in shopper. The session
 * module owns the `access_token`; this file owns the wire shape
 * (endpoint URL, auth header, error mapping). Every per-customer
 * read (orders, addresses, default-address-on-checkout, …) flows
 * through here.
 *
 * Notable quirks worth knowing about:
 *
 *   - The `Authorization` header carries the bare access_token,
 *     NOT `Bearer <token>`. Other Shopify APIs use various other
 *     header names; this one is its own thing per the Customer
 *     Account API docs.
 *   - The endpoint lives on the same `shopify.com/{shop_id}`
 *     base as the OAuth handshake — see `endpoint()` below.
 *   - `cache: "no-store"` by default. Customer data is
 *     per-shopper and must never share across requests. Callers
 *     that know a query is safe to cache (rare — maybe a static
 *     "country list" lookup) can override with `revalidate`.
 *
 * Failures throw `CustomerAccountError` so the dashboard /
 * orders pages can render a friendly "Something went wrong"
 * fallback without unwrapping nested error shapes.
 */

/* The Customer Account API GraphQL endpoint lives on the same
 * `shopify.com/{shop_id}` base as the OAuth endpoints — *not* on
 * the `.myshopify.com` storefront domain. (Some docs print a
 * `{shopDomain}/customer/api/…` shape; that's the discovery
 * pattern, not the canonical URL — which is the one Hydrogen and
 * Shopify's own SDK target.)
 */
function endpoint(): string {
  return `https://shopify.com/${env.SHOPIFY_SHOP_ID}/account/customer/api/${env.SHOPIFY_CUSTOMER_ACCOUNT_API_VERSION}/graphql`;
}

export interface CustomerAccountFetchOptions {
  /** Cache TTL in seconds. Omit (the default) to bypass Next's
   *  fetch cache entirely — customer data shouldn't be shared
   *  across requests. */
  revalidate?: number;
  /** Optional cache tags for `revalidateTag` invalidation. Only
   *  meaningful alongside `revalidate`. */
  tags?: string[];
}

export class CustomerAccountError extends Error {
  constructor(
    public readonly code:
      | "not_authenticated"
      | "http_error"
      | "graphql_error",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CustomerAccountError";
  }
}

interface GraphQLResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

/**
 * Run a GraphQL query against the Customer Account API as the
 * current shopper. Returns the typed `data` payload, throws
 * `CustomerAccountError` on any failure path.
 *
 * The session lookup is the only cost paid by anonymous-shopper
 * code paths that accidentally land here — `getSession()` is
 * memoised per request by React's `cache()`, so this check is
 * effectively free if the calling render already touched session.
 */
export async function customerAccountFetch<
  TData,
  TVariables extends Record<string, unknown> = Record<string, unknown>,
>(
  query: string,
  variables?: TVariables,
  options: CustomerAccountFetchOptions = {},
): Promise<TData> {
  const session = await getSession();
  if (!session) {
    throw new CustomerAccountError(
      "not_authenticated",
      "No active session — sign in before calling the Customer Account API",
    );
  }

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      /* Bare access_token — NOT `Bearer …`. This is what the
       * Customer Account API docs prescribe; other Shopify APIs
       * use different header conventions. */
      Authorization: session.tokens.accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: options.revalidate === undefined ? "no-store" : undefined,
    next:
      options.revalidate === undefined
        ? undefined
        : { revalidate: options.revalidate, tags: options.tags },
  });

  if (!res.ok) {
    /* Read the body even on non-OK responses — Shopify embeds
     * the actual GraphQL parse / validation error in there, and
     * silently throwing a bare status code makes "which field
     * is wrong?" debugging guesswork. Falls back to `null` if
     * the body isn't JSON (e.g. a 502 from an upstream proxy). */
    const detail = await res
      .clone()
      .json()
      .catch(() => null);
    const messages = (detail as GraphQLResponse<TData> | null)?.errors
      ?.map((e) => e.message)
      .join("; ");
    throw new CustomerAccountError(
      "http_error",
      messages
        ? `Customer Account API returned ${res.status}: ${messages}`
        : `Customer Account API returned ${res.status}`,
      res.status,
    );
  }

  const json = (await res.json()) as GraphQLResponse<TData>;
  if (json.errors?.length) {
    /* GraphQL-level error — surface every message joined so a
     * caller (or the dev terminal) sees the full picture in one
     * line; the original response keeps the structured array if
     * we ever want richer reporting upstream. */
    const messages = json.errors.map((e) => e.message).join("; ");
    throw new CustomerAccountError("graphql_error", messages);
  }

  if (!json.data) {
    throw new CustomerAccountError(
      "graphql_error",
      "Customer Account API returned no data",
    );
  }

  return json.data;
}
