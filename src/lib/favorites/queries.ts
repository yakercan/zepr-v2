import "server-only";

import { cache } from "react";

import { getSession } from "@/lib/auth/session";
import { fetchWishlist } from "@/lib/favorites/salespace";
import type { FavoriteItem } from "@/lib/favorites/types";

/**
 * Per-request memoised access to the current shopper's wishlist.
 *
 * Single Salespace round-trip per request, fanned out to every
 * Server Component that needs it:
 *
 *   - product grids (home feed, search, category, related on
 *     PDP) call `getCurrentFavoritedIds()` to paint each card's
 *     heart in the right state on first frame
 *   - `/favorites` calls `getCurrentWishlist()` to render the
 *     full snapshot
 *
 * Both helpers are wrapped in React's `cache()` AND
 * `getCurrentFavoritedIds()` derives from `getCurrentWishlist()`,
 * so any combination of calls inside a single request collapses
 * to one Salespace fetch — the `/favorites` page rendering both
 * the page snapshot and any in-page grid pays one round-trip
 * total.
 *
 * Guests short-circuit before the network — no session, no
 * fetch, empty set for grids.
 */

/**
 * Full wishlist snapshot for the current shopper, ordered as
 * Salespace returned it (newest-first per the upstream
 * `addedAt` desc default).
 *
 *   - `null` for guests OR a Salespace failure. The `/favorites`
 *     page distinguishes the two by checking session separately.
 *   - empty array for signed-in shoppers with no saves yet.
 */
export const getCurrentWishlist = cache(
  async (): Promise<ReadonlyArray<FavoriteItem> | null> => {
    const session = await getSession();
    if (!session) return null;
    return fetchWishlist(session.customer.email);
  },
);

/**
 * Set of product GIDs the current shopper has favorited.
 *
 * `.has(productId)` lookups inline next to each `<ProductCard>`
 * keep the per-card render branchless:
 *
 *   const favIds = await getCurrentFavoritedIds();
 *   …
 *   <ProductCard product={p} favorited={favIds.has(p.id)} … />
 *
 * Always returns a set — guests and failure paths both surface
 * as empty rather than null, so call sites never branch on a
 * nullable.
 */
export const getCurrentFavoritedIds = cache(
  async (): Promise<ReadonlySet<string>> => {
    const items = await getCurrentWishlist();
    if (!items) return new Set();
    return new Set(items.map((item) => item.productId));
  },
);
