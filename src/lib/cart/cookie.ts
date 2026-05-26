import "server-only";

import { cookies } from "next/headers";

/**
 * `__Host-zepr_cart` — the encrypted-by-Shopify cart GID for the
 * current shopper.
 *
 * Set whenever a server action creates or mutates a Shopify
 * Storefront cart, cleared on logout and on cart deletion. The
 * value is opaque (`gid://shopify/Cart/...`) — Shopify owns the
 * cart contents; we only persist the pointer.
 *
 * Why a separate cookie (not part of the session blob):
 *
 *   - Guests can have a cart cookie without a session. The login
 *     handoff path actually relies on that — a freshly-logged-in
 *     shopper with an existing guest cart still needs the server
 *     to know which Shopify cart it's replacing.
 *   - Independent TTL. Shopify carts live ~10 days; the session
 *     is 30 days rolling. Keeping them decoupled avoids cookies
 *     drifting out of sync.
 *
 * Naming uses the `__Host-` prefix for the same reason
 * `__Host-zepr_session` does — browser-enforced `Secure`, no
 * `Domain`, `Path=/`. A misconfigured cookie that violates any of
 * those is silently rejected at the browser, so production can't
 * accidentally weaken the surface.
 *
 * Not encrypted with our app secret. The value is a public-ish
 * Shopify GID — useless to an attacker without the Storefront
 * token, and the `httpOnly + Secure + SameSite=lax` posture
 * already keeps it out of cross-origin JS / cleartext sniffers.
 * Encrypting would force every read into the same async crypto
 * round-trip the session pays, for no security gain on a value
 * the Storefront API itself can't act on without our token.
 */

export const CART_COOKIE = "__Host-zepr_cart";

/**
 * 10-day cap matches Shopify's documented cart TTL: a cart goes
 * stale ~10 days after its last update. Holding our pointer the
 * same length means we don't keep referencing carts Shopify has
 * already garbage-collected (`cart()` returns `null` for an
 * expired id; the `getOrCreateCart` helper handles that path
 * regardless, so this is belt-and-braces).
 *
 * `sameSite: "lax"` is required for the post-checkout redirect
 * path — Shopify's hosted checkout returns the shopper to our
 * domain via a top-level GET, which `lax` allows.
 */
export const CART_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 10, // 10 days
} as const;

export async function getCartId(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

export async function setCartId(cartId: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, cartId, CART_COOKIE_OPTIONS);
}

/**
 * Same write-context constraint as `clearSession`: callable only
 * from Server Actions, Route Handlers, and middleware.
 *
 * Uses `set("", { maxAge: 0 })` rather than `delete` so the
 * cookie carries the same attributes (`Secure`, `Path=/`,
 * `__Host-` prefix) that the original was set with — required for
 * the browser to match-and-overwrite rather than leaving a stale
 * sibling cookie at a different scope.
 */
export async function clearCartId(): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, "", {
    ...CART_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

/* ------------------------------------------------------------------ */
/* Post-login handoff signal                                            */
/* ------------------------------------------------------------------ */

/**
 * `__Host-zepr_cart_handoff` — short-lived flag that tells the
 * next render "the shopper just completed sign-in; run the
 * guest→server cart merge once".
 *
 * Lifecycle:
 *
 *   1. `/account/authorize` sets it after a successful OAuth
 *      round-trip, alongside `setSession`. The cookie is the
 *      ONLY signal — no URL parameters, no localStorage marker,
 *      no client-side message bus. Keeps the post-login URL
 *      visually identical to the deep link the shopper started
 *      from.
 *   2. The next layout render reads the cookie server-side and
 *      forwards a `pending` bool to the `<CartLoginHandoff>`
 *      client island.
 *   3. The client harvests `localStorage`, calls
 *      `mergeGuestCartAction`, which clears the cookie before
 *      doing anything else. Subsequent renders see no cookie
 *      and skip the handoff.
 *
 * The 5-minute TTL is a belt-and-braces fallback for the cases
 * where the action never runs (browser closed mid-redirect,
 * service-worker hijack, etc.) — without it, a stranded cookie
 * could trip the handoff weeks later when the shopper revisits
 * with a fresh guest cart they don't want merged.
 *
 * Carries no payload other than the presence bit; the merge
 * payload itself comes from `localStorage` on the client.
 */
export const CART_HANDOFF_COOKIE = "__Host-zepr_cart_handoff";

const CART_HANDOFF_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 5,
} as const;

export async function setCartHandoffPending(): Promise<void> {
  const store = await cookies();
  store.set(CART_HANDOFF_COOKIE, "1", CART_HANDOFF_OPTIONS);
}

export async function getCartHandoffPending(): Promise<boolean> {
  const store = await cookies();
  return store.get(CART_HANDOFF_COOKIE)?.value === "1";
}

export async function clearCartHandoffPending(): Promise<void> {
  const store = await cookies();
  store.set(CART_HANDOFF_COOKIE, "", {
    ...CART_HANDOFF_OPTIONS,
    maxAge: 0,
  });
}
