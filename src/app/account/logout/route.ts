import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { clearSession, getSession } from "@/lib/auth/session";
import { buildLogoutUrl } from "@/lib/auth/shopify-oauth";

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
export async function GET(req: NextRequest) {
  const session = await getSession();
  await clearSession();

  if (!session) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  const logoutUrl = buildLogoutUrl({ idTokenHint: session.tokens.idToken });
  return NextResponse.redirect(logoutUrl);
}
