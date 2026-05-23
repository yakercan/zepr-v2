import "server-only";

import { env } from "@/env";

/**
 * Shopify Storefront API client.
 *
 * Server-only — the `"server-only"` import above makes Next refuse to
 * bundle this file (or any of its callers) into a client chunk, which
 * is exactly what we want: the Storefront token must never leave the
 * server. All product / collection / search queries should funnel
 * through here so cache windows and tag conventions stay consistent.
 *
 * Token preference: the **private** Storefront token
 * (`SHOPIFY_STOREFRONT_PRIVATE_TOKEN`) has higher rate limits and is
 * the right choice for server-side calls. The public token is kept
 * as a fallback for compatibility with the legacy Hydrogen env file
 * — if both are present, private wins.
 */

const DEFAULT_REVALIDATE_SEC = 3600;

type ShopifyResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

export interface ShopifyFetchOptions {
  /** Seconds before Next.js will revalidate this fetch's cached
   *  result. `false` disables caching entirely (use sparingly — most
   *  storefront content is fine on a long revalidate). */
  revalidate?: number | false;
  /** Cache tags so callers can target a specific entry via
   *  `revalidateTag()` if/when we need surgical invalidation. */
  tags?: string[];
}

function endpoint(): string {
  return `https://${env.SHOPIFY_STOREFRONT_DOMAIN}/api/${env.SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
}

/** Quick "is the env wired up?" probe for callers that want to gate
 *  Shopify-dependent code behind a feature flag locally. */
export function isShopifyConfigured(): boolean {
  return Boolean(
    env.SHOPIFY_STOREFRONT_DOMAIN &&
      (env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN ?? env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN),
  );
}

export async function shopifyFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: ShopifyFetchOptions = {},
): Promise<T> {
  const privateToken = env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN;
  const publicToken = env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN;
  const token = privateToken ?? publicToken;

  if (!token) {
    throw new Error(
      "Missing Shopify Storefront token. Set SHOPIFY_STOREFRONT_PRIVATE_TOKEN " +
        "(preferred) or SHOPIFY_STOREFRONT_PUBLIC_TOKEN in .env.",
    );
  }

  // Private tokens authenticate via a different header name than public
  // tokens; the API rejects the request if we use the wrong one.
  const authHeader: Record<string, string> = privateToken
    ? { "Shopify-Storefront-Private-Token": privateToken }
    : { "X-Shopify-Storefront-Access-Token": token };

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
    },
    body: JSON.stringify({ query, variables }),
    next: {
      revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SEC,
      tags: options.tags,
    },
  });

  if (!res.ok) {
    throw new Error(`Shopify HTTP ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as ShopifyResponse<T>;

  if (json.errors?.length) {
    // Partial success is real — Shopify can return both `data` and
    // `errors` (e.g. field-level access denied alongside a valid
    // product). Log the errors so they're visible, but don't crash
    // the render if we got usable data back.
    if (json.data) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[shopify] partial GraphQL errors:",
          json.errors.map((e) => e.message),
        );
      }
    } else {
      throw new Error(
        `Shopify GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`,
      );
    }
  }

  if (!json.data) {
    throw new Error("Shopify returned no data");
  }

  return json.data;
}
