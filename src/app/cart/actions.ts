"use server";

import { updateTag } from "next/cache";

import { getAttribution } from "@/lib/attribution/cookie";
import { attributionToCartAttributes } from "@/lib/attribution/format";
import { getSession } from "@/lib/auth/session";
import {
  clearCartHandoffPending,
  getCartId,
  setCartId,
} from "@/lib/cart/cookie";
import {
  cartAttributesUpdate,
  cartCreate,
  cartLinesAdd,
  cartLinesRemove,
  cartLinesUpdate,
  getOrCreateCart,
  resolveFirstVariantGid,
  type Cart,
  type CartLineInput,
} from "@/lib/shopify/cart";

/**
 * Server actions for the logged-in cart path. Mirrors the favorites
 * pattern: one `"use server"` module per surface, every action
 * returns a discriminated `{ ok, ... }` result so callers branch on
 * a single tag.
 *
 * Auth policy — every action gates on `getSession()`. Guests get
 * `{ ok: false, error: "auth_required" }`; the client store
 * short-circuits to the localStorage path for guests and never
 * dispatches here, so this is defence-in-depth (sessions can
 * expire mid-page-life and the action is the authority).
 *
 * Customer-attached carts — every read/write funnels through
 * `getOrCreateCart(cartId, customerAccessToken)`, which attaches
 * `buyerIdentity.customerAccessToken` on the create path. New
 * carts belong to the customer on Shopify's side from line one;
 * checkout pre-fills profile + addresses + saved payment.
 *
 * Cart cookie maintenance — actions write the cart id whenever a
 * fresh cart is created (first add of a session, expired cart
 * recovery, login-handoff replace). The cookie is HTTP-only and
 * carries no payload other than the GID, so writing it from any
 * write path is safe.
 *
 * `updateTag("cart")` after every mutation — Next.js 16's
 * immediate-expiry variant of cache invalidation. Any server-
 * rendered surface that read the cart through `getCurrentCart()`
 * (currently the SSR header badge) picks up the new count on
 * the next navigation without waiting for the stale-while-
 * revalidate window. The client store reconciles locally from
 * the returned cart payload so visual feedback is instant.
 */

export type CartActionResult =
  | { ok: true; cart: Cart }
  | { ok: false; error: "auth_required" | "resolve_failed" | "internal_error" };

export interface AddToCartInput {
  /** Variant GID — when present, used directly. PDP and the
   *  variant-modal flow always supply it. */
  merchandiseId?: string;
  /** Product handle — used to resolve `merchandiseId` for the
   *  card-add path on single-variant products (Salespace search
   *  doesn't carry variant ids). At least one of `merchandiseId`
   *  or `handle` is required. */
  handle?: string;
  quantity: number;
  /** Open-ended line attributes (UTM, source, gift-message). The
   *  store doesn't surface these yet — plumbed through so future
   *  surfaces can attach them without a signature change. */
  attributes?: ReadonlyArray<{ key: string; value: string }>;
}

/**
 * Add a single line to the customer's cart.
 *
 * Creates the cart if there isn't one yet for this session
 * (cookie missing or pointing to an expired cart). Resolves the
 * variant from `handle` when only the handle is known.
 *
 * Stamps the current UTM attribution onto the cart on every
 * call (fresh cart gets it baked into `cartCreate`; existing
 * cart gets a follow-up `cartAttributesUpdate`). Last-touch
 * wins: a shopper who clicked a Meta ad yesterday, browsed
 * around today via an Instagram link, then added to cart now
 * gets the *Instagram* attribution on the resulting order.
 */
export async function addToCartAction(
  input: AddToCartInput,
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "auth_required" };

  const quantity = Math.max(1, Math.floor(input.quantity));

  let merchandiseId = input.merchandiseId ?? null;
  if (!merchandiseId && input.handle) {
    merchandiseId = await resolveFirstVariantGid(input.handle);
  }
  if (!merchandiseId) return { ok: false, error: "resolve_failed" };

  const cartId = await getCartId();
  const attribution = await getAttribution();
  const attributionAttrs = attributionToCartAttributes(attribution);

  /* Fresh-cart path bakes attribution into `cartCreate` (one
   * round-trip); existing-cart path stamps via the separate
   * `cartAttributesUpdate` call below (parallel with the line
   * add). The `getOrCreateCart` attributes argument is only
   * consulted on the create branch. */
  const cart = await getOrCreateCart(
    cartId,
    session.tokens.accessToken,
    attributionAttrs.length > 0 ? attributionAttrs : undefined,
  );
  if (!cart) return { ok: false, error: "internal_error" };
  const wasExisting = cart.id === cartId;

  const line: CartLineInput = {
    merchandiseId,
    quantity,
    attributes: input.attributes,
  };

  /* Stamp attribution and add the line in parallel when the
   * cart already existed — saves ~100ms vs sequential mutations.
   * Both write to disjoint parts of the cart so the order
   * doesn't matter. The fresh-cart branch skips the attribute
   * call because `cartCreate` already attached them. */
  const [updated] = await Promise.all([
    cartLinesAdd(cart.id, [line]),
    wasExisting && attributionAttrs.length > 0
      ? cartAttributesUpdate(cart.id, attributionAttrs)
      : Promise.resolve(null),
  ]);
  if (!updated) return { ok: false, error: "internal_error" };

  /* Sync the cookie back — `cart.id` is stable across mutations
   * but a fresh `getOrCreateCart` may have minted a new one. */
  if (updated.id !== cartId) await setCartId(updated.id);
  updateTag("cart");
  return { ok: true, cart: updated };
}

export interface UpdateCartLineInput {
  /** Shopify cart-line id (NOT the variant id). The drawer carries
   *  this on every logged-in line from the cart fetch. */
  lineId: string;
  /** Setting quantity to `0` removes the line — matches the
   *  drawer's "press − past 1 deletes the row" UX. */
  quantity: number;
}

export async function updateCartLineAction(
  input: UpdateCartLineInput,
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "auth_required" };

  const cartId = await getCartId();
  if (!cartId) return { ok: false, error: "internal_error" };

  const quantity = Math.max(0, Math.floor(input.quantity));
  /* The line-update API rejects `quantity: 0` on some accounts;
   * route through `cartLinesRemove` for the deletion case so the
   * "press - past 1" UX works uniformly. */
  const updated =
    quantity === 0
      ? await cartLinesRemove(cartId, [input.lineId])
      : await cartLinesUpdate(cartId, [{ id: input.lineId, quantity }]);

  if (!updated) return { ok: false, error: "internal_error" };

  updateTag("cart");
  return { ok: true, cart: updated };
}

export interface RemoveCartLineInput {
  lineId: string;
}

export async function removeCartLineAction(
  input: RemoveCartLineInput,
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "auth_required" };

  const cartId = await getCartId();
  if (!cartId) return { ok: false, error: "internal_error" };

  const updated = await cartLinesRemove(cartId, [input.lineId]);
  if (!updated) return { ok: false, error: "internal_error" };

  updateTag("cart");
  return { ok: true, cart: updated };
}

/**
 * Empty the customer's cart. Removes every line in one
 * `cartLinesRemove` round-trip; the cart itself stays alive so
 * subsequent adds reuse the same id. Returns a freshly-fetched
 * (now empty) cart for the client to reconcile against.
 *
 * Not surfaced in the drawer today — the trash button on each
 * line covers the common case. Kept here so future "Clear cart"
 * affordances (and the verify path) have one canonical entry.
 */
export async function clearCartAction(): Promise<CartActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "auth_required" };

  const cartId = await getCartId();
  if (!cartId) {
    /* Nothing to clear — fall through to creating an empty cart so
     * the client always reconciles against a real shape rather
     * than branching on null. */
    const fresh = await getOrCreateCart(null, session.tokens.accessToken);
    if (!fresh) return { ok: false, error: "internal_error" };
    await setCartId(fresh.id);
    updateTag("cart");
    return { ok: true, cart: fresh };
  }

  const cart = await getOrCreateCart(cartId, session.tokens.accessToken);
  if (!cart) return { ok: false, error: "internal_error" };

  if (cart.lines.length === 0) {
    updateTag("cart");
    return { ok: true, cart };
  }

  const lineIds = cart.lines.map((l) => l.id);
  const updated = await cartLinesRemove(cart.id, lineIds);
  if (!updated) return { ok: false, error: "internal_error" };

  updateTag("cart");
  return { ok: true, cart: updated };
}

export interface MergeGuestCartInput {
  /** Lines harvested from `localStorage` on the post-login
   *  landing page. Each entry carries the variant GID when known
   *  (PDP-built lines) or just the handle (card-built lines for
   *  single-variant products). Both forms resolve here. */
  lines: ReadonlyArray<MergeGuestCartLine>;
}

export interface MergeGuestCartLine {
  merchandiseId?: string;
  handle?: string;
  quantity: number;
}

/**
 * One-shot guest → logged-in cart conversion.
 *
 *   - **Empty guest** → no-op. The customer's existing Shopify
 *     cart (if any) is preserved; the buyer identity is touched
 *     up to make sure the cart belongs to them post-login.
 *   - **Non-empty guest** → guest-wins. Create a fresh cart
 *     with the guest lines + buyer identity, replace the cart
 *     cookie. The customer's previous saved cart on Shopify is
 *     abandoned (we lose its id when the cookie flips); this
 *     matches the "guest wins" merge policy the team confirmed.
 *
 * Lines missing a `merchandiseId` are resolved by `handle` via
 * `resolveFirstVariantGid`. Lines that don't resolve to a variant
 * are silently skipped — they can't be added on Shopify's side
 * and the alternative is failing the whole merge for one bad
 * line.
 *
 * Idempotent on the empty-guest path: calling it twice with no
 * lines just re-attaches buyer identity. On the non-empty path
 * it's expected to be called exactly once (the login landing
 * page clears localStorage on success).
 */
export async function mergeGuestCartAction(
  input: MergeGuestCartInput,
): Promise<CartActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "auth_required" };

  /* Clear the post-login signal cookie unconditionally on the
   * happy auth path. The handoff is one-shot by design: if the
   * action fails downstream the shopper's `localStorage` lines
   * are still in their browser and recoverable on next add, so
   * we'd rather not strand the cookie and trip the merge again
   * on every subsequent page-view. */
  await clearCartHandoffPending();

  const accessToken = session.tokens.accessToken;
  const attribution = await getAttribution();
  const attributionAttrs = attributionToCartAttributes(attribution);

  /* Empty-guest path — keep whatever cart the customer already
   * has on Shopify (or create a fresh empty one), make sure it's
   * attached to them, and return. */
  if (input.lines.length === 0) {
    const existingId = await getCartId();
    const cart = await getOrCreateCart(
      existingId,
      accessToken,
      attributionAttrs.length > 0 ? attributionAttrs : undefined,
    );
    if (!cart) return { ok: false, error: "internal_error" };
    if (cart.id !== existingId) await setCartId(cart.id);
    /* Re-stamp on the existing-cart branch — `getOrCreateCart`'s
     * `attributes` argument only fires on create, so an existing
     * cart needs the follow-up to pick up the latest UTMs. */
    if (cart.id === existingId && attributionAttrs.length > 0) {
      await cartAttributesUpdate(cart.id, attributionAttrs);
    }
    updateTag("cart");
    return { ok: true, cart };
  }

  /* Non-empty guest — resolve every line to a merchandiseId,
   * collapse duplicates (same variant across multiple cards
   * adds), and build one `cartCreate` payload. */
  const inputLines: CartLineInput[] = [];
  const resolved = await Promise.all(
    input.lines.map(async (l) => {
      const id =
        l.merchandiseId ??
        (l.handle ? await resolveFirstVariantGid(l.handle) : null);
      const qty = Math.max(1, Math.floor(l.quantity));
      return id ? { merchandiseId: id, quantity: qty } : null;
    }),
  );

  /* Same-merchandiseId dedupe — cards adding the same single-
   * variant product twice would otherwise sit as two cart rows;
   * Shopify accepts duplicates but the drawer reads better with
   * a single accumulated row. */
  const byMerchandise = new Map<string, number>();
  for (const r of resolved) {
    if (!r) continue;
    byMerchandise.set(
      r.merchandiseId,
      (byMerchandise.get(r.merchandiseId) ?? 0) + r.quantity,
    );
  }
  for (const [merchandiseId, quantity] of byMerchandise) {
    inputLines.push({ merchandiseId, quantity });
  }

  if (inputLines.length === 0) {
    /* Every line failed to resolve — fall through to the empty-
     * guest path so the client still finishes the handoff
     * cleanly (and we don't strand a useless cookie). */
    const existingId = await getCartId();
    const cart = await getOrCreateCart(
      existingId,
      accessToken,
      attributionAttrs.length > 0 ? attributionAttrs : undefined,
    );
    if (!cart) return { ok: false, error: "internal_error" };
    if (cart.id !== existingId) await setCartId(cart.id);
    if (cart.id === existingId && attributionAttrs.length > 0) {
      await cartAttributesUpdate(cart.id, attributionAttrs);
    }
    updateTag("cart");
    return { ok: true, cart };
  }

  const cart = await cartCreate({
    lines: inputLines,
    buyerIdentity: { customerAccessToken: accessToken },
    attributes: attributionAttrs.length > 0 ? attributionAttrs : undefined,
  });
  if (!cart) return { ok: false, error: "internal_error" };

  await setCartId(cart.id);
  updateTag("cart");
  return { ok: true, cart };
}
