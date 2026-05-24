import "server-only";

import { env } from "@/env";

/**
 * Shopify Customer Account API — OAuth 2.0 + PKCE + OIDC client.
 *
 * One file holds every interaction with Shopify's identity server:
 *
 *   - `buildAuthorizeUrl` — produces the redirect target for the
 *     login button. Browser leaves our domain, Shopify hosts the
 *     credential entry, and the shopper comes back to us with
 *     `?code=…&state=…`.
 *   - `exchangeCodeForTokens` — turns that `code` + the PKCE
 *     verifier we stashed in the oauth-state cookie into the
 *     full token set (access + refresh + id_token).
 *   - `refreshAccessToken` — rotates an expiring access_token
 *     using the refresh_token. Shopify rotates the refresh_token
 *     too, so callers must persist whatever comes back.
 *   - `buildLogoutUrl` — Shopify-hosted logout endpoint; clears
 *     the shopper's session on the identity server and sends
 *     them back to our home page.
 *
 * Everything's expressed as pure functions (no cookies, no
 * framework code) so route handlers and server actions in the
 * `app/` tree stay thin and unit tests only need to mock
 * `fetch`. Failures throw `ShopifyOAuthError` carrying the
 * structured `error` / `error_description` Shopify returned —
 * callers can branch on `code` to render the right UI.
 *
 * Spec references:
 *   - Customer Account API OAuth/OIDC overview (Shopify docs)
 *   - RFC 6749 (OAuth 2.0), RFC 7636 (PKCE), OIDC Core 1.0
 */

/**
 * OIDC base URL — Shopify-hosted, identical for every shop,
 * parameterised by numeric shop ID. The shop ID is the same one
 * visible at `https://shopify.com/{shopId}/admin` and exposed
 * on the Headless channel's Customer Account API settings page.
 */
const OIDC_BASE = `https://shopify.com/authentication/${env.SHOPIFY_SHOP_ID}`;

/**
 * Post-login redirect target. MUST be byte-identical to one of
 * the "Callback URI(s)" registered in the Headless channel —
 * Shopify rejects the authorize request otherwise. The matching
 * Next.js route lives at `src/app/account/authorize/route.ts`;
 * keep these two in sync if either ever moves.
 */
const CALLBACK_URL = `${env.APP_URL}/account/authorize`;

/**
 * Post-logout redirect target. MUST be in the "Logout URI(s)"
 * allowlist on the Headless channel app. We send the shopper
 * back to the home page after Shopify clears its own session.
 */
const POST_LOGOUT_REDIRECT_URL = `${env.APP_URL}/`;

/**
 * OAuth scopes requested at authorize time.
 *
 *   - `openid`                    → required for the id_token (OIDC core).
 *   - `email`                     → email claim in the id_token, used for
 *                                   "is this review by the current shopper?" checks.
 *   - `customer-account-api:full` → full Customer Account GraphQL access.
 *
 * The shorter colon-form is the one Shopify's current
 * (2026-07) docs document and the only one the authorize
 * endpoint accepts — the older URL-form (`https://api.customers
 * .com/auth/customer.graphql`) that shipped with Hydrogen
 * reference examples is rejected with `invalid_scope`.
 */
const SCOPES = "openid email customer-account-api:full";

/**
 * Normalised token bundle stored in our session cookie.
 *
 * Camel-cased and with an absolute `expiresAt` (Unix ms) so any
 * callsite can compare against `Date.now()` without re-tracking
 * when the token was issued.
 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** Absolute expiry — `Date.now() + expires_in * 1000` at the
   *  moment the token endpoint responded. */
  expiresAt: number;
  /** Space-separated scope list Shopify actually granted. Usually
   *  matches `SCOPES`; persisted so downgrades surface in logs. */
  scope: string;
}

/**
 * Typed error surfaced by every async function in this module.
 *
 * `code` is Shopify's machine-readable `error` field (e.g.
 * `invalid_grant`, `invalid_request`, `invalid_client`) when
 * available, otherwise a generic `shopify_token_error`. UI can
 * branch on it to render targeted messaging ("Your session
 * expired" vs. "Something went wrong, please try again").
 */
export class ShopifyOAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ShopifyOAuthError";
  }
}

/**
 * Build the authorize redirect URL.
 *
 * The route handler that wraps this also writes the encrypted
 * oauth-state cookie carrying `{ state, nonce, codeVerifier }`
 * — those must outlive the redirect because the callback needs
 * them to validate Shopify's response.
 */
export function buildAuthorizeUrl(params: {
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(`${OIDC_BASE}/oauth/authorize`);
  url.searchParams.set("client_id", env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", CALLBACK_URL);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Build the Shopify logout URL.
 *
 * `id_token_hint` tells Shopify which session to terminate — we
 * pass the id_token from our session cookie. Without it Shopify
 * shows a "Which account?" picker, which is the wrong UX from
 * an already-authenticated state.
 */
export function buildLogoutUrl(params: { idTokenHint: string }): string {
  const url = new URL(`${OIDC_BASE}/logout`);
  url.searchParams.set("id_token_hint", params.idTokenHint);
  url.searchParams.set("post_logout_redirect_uri", POST_LOGOUT_REDIRECT_URL);
  return url.toString();
}

/**
 * Exchange the authorization code returned by Shopify for the
 * token set. Called from the `/account/authorize` callback once
 * `state` has been verified against the oauth-state cookie.
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
}): Promise<TokenSet> {
  return postTokenEndpoint({
    grant_type: "authorization_code",
    client_id: env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    code: params.code,
    code_verifier: params.codeVerifier,
  });
}

/**
 * Rotate an expiring access_token using the stored refresh_token.
 *
 * Shopify rotates the refresh_token on every refresh — the
 * response body always contains a new `refresh_token` value, so
 * the caller MUST overwrite the cookie payload with whatever
 * comes back here. Reusing the old refresh_token after rotation
 * gives `invalid_grant`.
 */
export async function refreshAccessToken(params: {
  refreshToken: string;
}): Promise<TokenSet> {
  return postTokenEndpoint({
    grant_type: "refresh_token",
    client_id: env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID,
    refresh_token: params.refreshToken,
  });
}

/**
 * Single chokepoint for every token-endpoint POST. Centralises
 * the wire-format (form-encoded body), the `Origin` header
 * Shopify validates against the Public client's configured
 * JavaScript Origins, and the snake_case → camelCase mapping.
 *
 * `cache: "no-store"` keeps Next.js from cacheing OAuth
 * responses — those are per-shopper secrets and must never be
 * shared across requests.
 */
async function postTokenEndpoint(
  body: Record<string, string>,
): Promise<TokenSet> {
  const res = await fetch(`${OIDC_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      /* Shopify checks `Origin` against the Public client's
       * JavaScript-Origins allowlist; missing or wrong value
       * comes back as `invalid_client` / `invalid_request`. */
      Origin: env.APP_URL,
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    let code = "shopify_token_error";
    let description = `Token endpoint returned ${res.status}`;
    try {
      const errorBody = (await res.json()) as {
        error?: string;
        error_description?: string;
      };
      if (errorBody.error) code = errorBody.error;
      if (errorBody.error_description) description = errorBody.error_description;
    } catch {
      /* Some error responses don't carry a JSON body — the
       * status alone is enough to act on. Swallow the parse
       * failure rather than masking the original HTTP error. */
    }
    throw new ShopifyOAuthError(code, description, res.status);
  }

  const json = (await res.json()) as RawTokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    scope: json.scope,
  };
}

/** Raw shape Shopify's token endpoint returns. Snake-cased per
 *  the OAuth 2.0 spec — mapped to camelCase `TokenSet` once. */
interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}
