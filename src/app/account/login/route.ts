import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { setOAuthState } from "@/lib/auth/oauth-state";
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from "@/lib/auth/pkce";
import { buildAuthorizeUrl } from "@/lib/auth/shopify-oauth";

/**
 * `/account/login` — kicks off the Shopify Customer Account API
 * OAuth flow.
 *
 *   1. Pull `?return_to=/path` off the query, normalise it to a
 *      safe same-origin path (open-redirect protection).
 *   2. Generate fresh PKCE verifier, OIDC nonce, OAuth state.
 *   3. Seal `{ codeVerifier, state, nonce, returnTo }` into the
 *      one-shot oauth-state cookie.
 *   4. Redirect the browser to Shopify's authorize endpoint.
 *
 * The callback at `/account/authorize` verifies the cookie
 * matches what Shopify echoes back and uses `codeVerifier` to
 * redeem the auth code for tokens.
 */
export async function GET(req: NextRequest) {
  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("return_to"));

  const codeVerifier = generateCodeVerifier();
  const state = generateState();
  const nonce = generateNonce();

  await setOAuthState({ codeVerifier, state, nonce, returnTo });

  const authorizeUrl = buildAuthorizeUrl({
    state,
    nonce,
    codeChallenge: computeCodeChallenge(codeVerifier),
  });

  return NextResponse.redirect(authorizeUrl);
}

/**
 * Collapse an arbitrary `return_to` value to a safe same-origin
 * path. Anything that doesn't start with `/`, or that looks
 * protocol-relative (`//evil.com/...`), or that's missing,
 * falls back to `/`. Belt-and-suspenders against the classic
 * open-redirect attack where a phishing site sends shoppers
 * through our login flow only to bounce them somewhere else.
 */
function sanitizeReturnTo(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}
