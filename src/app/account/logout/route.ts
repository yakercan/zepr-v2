import "server-only";

import { NextResponse } from "next/server";

import { env } from "@/env";
import { clearSession, getSession } from "@/lib/auth/session";
import { buildLogoutUrl } from "@/lib/auth/shopify-oauth";
import { clearCartId } from "@/lib/cart/cookie";

/**
 * `/account/logout` — clears our session and bounces the
 * shopper through Shopify's logout endpoint so the identity
 * server's session is killed too.
 *
 * Order matters: we capture the id_token BEFORE clearing our
 * cookie so we can pass it to Shopify as `id_token_hint`.
 * Without that, Shopify would prompt the shopper to confirm
 * which account to log out — the wrong UX from an
 * already-known authenticated state.
 *
 * If there's no session to log out (cookie missing, expired,
 * tampered), we just send the shopper home — no point round-
 * tripping through Shopify with nothing to clear.
 */
export async function GET() {
  const session = await getSession();
  await clearSession();
  /* Drop the cart cookie alongside the session so the shopper
   * lands on a clean slate post-logout — the next page renders
   * as a guest, `<CartHydrator>` flips back into localStorage
   * mode, and Shopify's no-longer-pointed-at cart is left to
   * its natural ~10-day TTL on Shopify's side. */
  await clearCartId();

  if (!session) {
    /* Use `env.APP_URL` rather than the request URL — behind a
     * Cloudflare tunnel `req.nextUrl` resolves to the local
     * socket (`http://localhost:3000`), and we'd bounce the
     * shopper there instead of the public host. */
    return NextResponse.redirect(new URL("/", env.APP_URL));
  }

  const logoutUrl = buildLogoutUrl({ idTokenHint: session.tokens.idToken });
  return NextResponse.redirect(logoutUrl);
}
