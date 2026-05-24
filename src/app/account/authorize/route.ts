import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { IdTokenError, decodeAndValidateIdToken } from "@/lib/auth/id-token";
import { clearOAuthState, getOAuthState } from "@/lib/auth/oauth-state";
import { setSession, type Session } from "@/lib/auth/session";
import {
  ShopifyOAuthError,
  exchangeCodeForTokens,
} from "@/lib/auth/shopify-oauth";

/**
 * `/account/authorize` — Shopify redirects here after the
 * shopper completes the credential flow.
 *
 * Verifies the response (`state` echo + id_token validation),
 * exchanges the auth code for tokens, persists the session,
 * sends the shopper back to wherever they came from.
 *
 * Every failure mode currently lands at `/`. Auth errors are
 * either user-cancelled (rare, intentional) or fatal config
 * problems (rarer); a silent fallback + server-log breadcrumb
 * is the smallest surface that keeps the production happy path
 * unbreakable. A dedicated error page can be a one-line swap
 * here later if UX justifies it.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const homeUrl = new URL("/", req.nextUrl);

  /* Read + immediately invalidate the one-shot oauth-state
   * cookie. Every exit path below — success, error, CSRF — must
   * leave with the cookie cleared, otherwise a partial flow
   * could replay against the next attempt. */
  const oauthState = await getOAuthState();
  await clearOAuthState();

  if (!oauthState) {
    console.warn("[auth] callback hit without an oauth-state cookie");
    return NextResponse.redirect(homeUrl);
  }

  const error = params.get("error");
  if (error) {
    /* Shopify-side denial — user cancelled, consent withdrawn,
     * etc. Not an error condition for us, just a no-op return. */
    console.info(
      "[auth] Shopify returned error:",
      error,
      params.get("error_description") ?? "",
    );
    return NextResponse.redirect(homeUrl);
  }

  const code = params.get("code");
  const stateFromShopify = params.get("state");

  if (!code || !stateFromShopify) {
    console.warn("[auth] callback missing code or state");
    return NextResponse.redirect(homeUrl);
  }

  if (stateFromShopify !== oauthState.state) {
    /* State mismatch is the canonical CSRF signature — the
     * value Shopify echoed isn't the one we set on the cookie.
     * Reject the request without touching tokens. */
    console.warn("[auth] state mismatch — possible CSRF");
    return NextResponse.redirect(homeUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: oauthState.codeVerifier,
    });

    const claims = decodeAndValidateIdToken(tokens.idToken, oauthState.nonce);

    const session: Session = {
      tokens,
      customer: {
        id: claims.sub,
        email: claims.email ?? "",
        emailVerified: claims.email_verified ?? false,
        firstName: claims.given_name,
        lastName: claims.family_name,
      },
    };

    await setSession(session);

    return NextResponse.redirect(new URL(oauthState.returnTo, req.nextUrl));
  } catch (err) {
    if (err instanceof ShopifyOAuthError) {
      console.error("[auth] token exchange failed:", err.code, err.message);
    } else if (err instanceof IdTokenError) {
      console.error("[auth] id_token validation failed:", err.code, err.message);
    } else {
      console.error("[auth] callback error:", err);
    }
    return NextResponse.redirect(homeUrl);
  }
}
