"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { addFavorite, removeFavorite } from "@/lib/favorites/salespace";

/**
 * Server action — toggle a product's favorited state for the
 * currently signed-in shopper.
 *
 * Single endpoint instead of separate add / remove actions —
 * the client passes the *next* state it wants to land in (the
 * post-toggle value), so the action knows whether to insert or
 * delete without a pre-read. Matches the optimistic-UI pattern
 * on the client: `useOptimistic` flips immediately, the action
 * persists, and the result reconciles.
 *
 * Auth policy:
 *
 *   - No session → `{ ok: false, error: "auth_required" }`.
 *     The client `<FavoriteButton>` short-circuits to the
 *     sign-in modal before calling this for known-guest cases,
 *     but the action still enforces because:
 *       (a) the session can expire mid-page-life
 *       (b) the action is the policy authority, not a UI hint
 *
 *   - Session exists → trust the customer email from the
 *     session cookie. NEVER from the request body. Same posture
 *     reviews + returns hold.
 *
 * `revalidatePath("/favorites")` busts the favorites page's
 * Next route cache so a navigation to `/favorites` right after
 * toggling shows the fresh list. In-page grids re-read via
 * `getCurrentWishlist` (which is `cache: "no-store"` under the
 * hood) on the next render naturally.
 */

export type ToggleFavoriteResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: "auth_required" | "internal_error" };

export interface ToggleFavoriteInput {
  /** Shopify product id in either numeric or GID form — cards
   *  carry numeric (from Salespace search), the PDP carries
   *  GID (from Shopify Storefront). The Salespace provider
   *  coerces to numeric at the URL boundary. */
  productId: string;
  /** State to land in after the toggle: `true` to save, `false`
   *  to unsave. Computed by the client from the current
   *  optimistic state. */
  favorited: boolean;
}

export async function toggleFavoriteAction(
  input: ToggleFavoriteInput,
): Promise<ToggleFavoriteResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: "auth_required" };
  }

  /* Defence-in-depth — the client builds this from server-
   * rendered props so we never expect to hit it in normal use. */
  if (!input.productId) {
    return { ok: false, error: "internal_error" };
  }

  const email = session.customer.email;
  const ok = input.favorited
    ? await addFavorite(email, input.productId)
    : await removeFavorite(email, input.productId);

  if (!ok) return { ok: false, error: "internal_error" };

  revalidatePath("/favorites");

  return { ok: true, favorited: input.favorited };
}
