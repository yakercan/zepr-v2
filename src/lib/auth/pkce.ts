import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Cryptographic primitives for Shopify's Customer Account API
 * OAuth 2.0 + PKCE + OIDC handshake.
 *
 * Every helper returns a URL-safe base64 string (no `+`, no `/`,
 * no padding) so the values drop straight into query parameters
 * and `Set-Cookie` headers without further encoding. 32 bytes of
 * entropy each — comfortably above the 43-char / 32-byte minimum
 * RFC 7636 sets for PKCE verifiers, and the same budget covers
 * `state` + `nonce` so attackers can't brute-force any of them.
 */

const ENTROPY_BYTES = 32;

/**
 * PKCE code verifier — random secret known only to our server,
 * persisted in the encrypted oauth-state cookie until Shopify
 * redirects back. The token-exchange step proves we own the
 * verifier by sending it to Shopify; that's what stops an
 * attacker who intercepted the authorization code from
 * completing the exchange.
 */
export function generateCodeVerifier(): string {
  return randomBytes(ENTROPY_BYTES).toString("base64url");
}

/**
 * PKCE code challenge — `SHA-256(verifier)`, URL-safe base64.
 * Sent to Shopify in the authorize redirect; Shopify hashes the
 * verifier we present at the token endpoint and compares.
 */
export function computeCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * OAuth `state` parameter — CSRF token round-tripped through the
 * Shopify authorize redirect. We persist the value alongside the
 * verifier and verify Shopify echoes the exact same value back
 * to the callback. Mismatch ⇒ reject the request.
 */
export function generateState(): string {
  return randomBytes(ENTROPY_BYTES).toString("base64url");
}

/**
 * OIDC `nonce` — replay-protection value embedded in the
 * `id_token` Shopify returns. We compare the `nonce` claim in
 * the decoded id_token against this value to confirm the
 * response is fresh and matches the request we just made.
 */
export function generateNonce(): string {
  return randomBytes(ENTROPY_BYTES).toString("base64url");
}
