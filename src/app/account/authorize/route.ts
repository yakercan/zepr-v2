import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { IdTokenError, decodeAndValidateIdToken } from "@/lib/auth/id-token";
import { clearOAuthState, getOAuthState } from "@/lib/auth/oauth-state";
import { setSession, type Session } from "@/lib/auth/session";
import {
  ShopifyOAuthError,
  exchangeCodeForTokens,
} from "@/lib/auth/shopify-oauth";
import { fetchCustomerProfileWithToken } from "@/lib/shopify/customer-account-queries";

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
  /* Anchor every redirect target on `env.APP_URL` rather than
   * `req.nextUrl`. Behind a Cloudflare tunnel / reverse proxy
   * the local socket Next.js sees is `http://localhost:3000` —
   * `new URL("/", req.nextUrl)` would happily send the shopper
   * there instead of back to the public host. `APP_URL` is the
   * one explicit, always-correct base. */
  const homeUrl = new URL("/", env.APP_URL);

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

    /* Shopify's id_token frequently omits `given_name` /
     * `family_name` — even when the admin has them set on the
     * customer record. The canonical name lives on the Customer
     * Account API `customer` object, so we fetch it here once
     * at sign-in and seed the session with it. Every page after
     * this point reads `session.customer.firstName` and sees the
     * real value without a per-render API round trip.
     *
     * Best-effort: a Shopify hiccup at this exact moment falls
     * back to id_token claims (which may leave the dashboard
     * showing "Not set" but never blocks login). */
    let profileFirstName = claims.given_name;
    let profileLastName = claims.family_name;
    let profileEmail = claims.email;
    try {
      const profile = await fetchCustomerProfileWithToken(tokens.accessToken);
      profileFirstName = profile.firstName ?? profileFirstName;
      profileLastName = profile.lastName ?? profileLastName;
      profileEmail = profile.email ?? profileEmail;
    } catch (err) {
      console.warn("[auth] profile enrichment failed, using id_token claims:", err);
    }

    const session: Session = {
      tokens,
      customer: {
        email: profileEmail ?? "",
        emailVerified: claims.email_verified ?? false,
        firstName: profileFirstName,
        lastName: profileLastName,
      },
    };

    await setSession(session);

    return NextResponse.redirect(new URL(oauthState.returnTo, env.APP_URL));
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
