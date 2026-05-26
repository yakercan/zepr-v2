"use server";

import { resolveFirstVariantGid } from "@/lib/shopify/cart";
import { getProductByHandle } from "@/lib/shopify/products";
import type { ProductDetail } from "@/types/product";

/**
 * Hydrate a product's full Shopify detail by handle. Used by the
 * card-level variant modal to resolve real variants (Salespace's
 * search index gives us option names + values but not variant ids
 * + per-variant prices) so adds can carry a `merchandiseId` into
 * the cart store.
 *
 * Reads only — wraps the existing `getProductByHandle` so the
 * Storefront fetch cache (1h revalidate, tagged `product:<handle>`)
 * applies the same way it does for the PDP route. Two cards
 * opening the same modal on the same render won't double-fetch;
 * the fetch boundary collapses them. Cross-page hits ride the
 * 1-hour edge cache.
 *
 * A server action (rather than a route handler) keeps the client
 * call site one `await` instead of a `fetch` round-trip plus
 * response handling, and gives us request-level cancellation for
 * free if React tears down the modal mid-flight.
 */
export async function getProductDetailAction(
  handle: string,
): Promise<ProductDetail | null> {
  return getProductByHandle(handle);
}

/**
 * Resolve a product handle to its first variant's Shopify GID.
 *
 * The card-level single-variant add path needs this for guest
 * carts: Salespace `SearchProduct` carries no variant info, but
 * the guest checkout permalink + login-handoff merge both want a
 * concrete `merchandiseId` per line. The cart store fires this
 * in the background after an add so the drawer pops instantly
 * (no waiting on a network round-trip) while the resolved
 * variant id patches in shortly after.
 *
 * The logged-in card add path doesn't need this — its server
 * action resolves the variant on its own and returns the
 * canonical Shopify cart line. Kept here as a thin wrapper of
 * the same `resolveFirstVariantGid` helper so both paths agree
 * on which variant they consider "first" (Storefront API order).
 */
export async function resolveFirstVariantGidAction(
  handle: string,
): Promise<string | null> {
  return resolveFirstVariantGid(handle);
}
