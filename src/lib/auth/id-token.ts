import "server-only";

import { env } from "@/env";

/**
 * Decode + validate the id_token Shopify returns at the token
 * endpoint.
 *
 * Signature verification is intentionally skipped: we receive
 * this token over TLS in a direct POST to Shopify's `/oauth/token`
 * endpoint, which OIDC Core 1.0 §3.1.3.7 explicitly permits as
 * a substitute for cryptographic signature verification. The
 * TLS handshake already proved we're talking to Shopify; the
 * id_token came back on the same connection.
 *
 * The other three checks are NOT optional, and we do all of them:
 *
 *   - `aud`   must equal our client_id (or include it for
 *             array-form audiences).
 *   - `exp`   must be in the future (with 60s clock skew).
 *   - `nonce` must match the value we sent in the authorize
 *             step — the OIDC replay guard.
 *
 * Together these defeat token-substitution and replay attacks
 * even though we're trusting TLS for authenticity.
 *
 * `sub` is intentionally NOT validated here. Shopify's own docs
 * state the `sub` is an opaque internal identifier the platform
 * uses to dedupe customers — it's "not accessible through API
 * or the Shopify admin." Our session keys on `email` instead
 * (which is the field every other Shopify surface uses to
 * identify a customer), so requiring `sub` was an OIDC reflex
 * that doesn't match Shopify's actual contract.
 */

export interface IdTokenClaims {
  iss: string;
  /** Opaque Shopify-internal subject. Optional — Shopify's
   *  docs explicitly classify `sub` as an internal-only field
   *  ("not accessible through API or the Shopify admin"), so
   *  we type it as `string | undefined` and let email play the
   *  stable-identity role instead. */
  sub?: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
}

export class IdTokenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IdTokenError";
  }
}

/** Generous skew to absorb the few seconds of clock drift that
 *  can sit between Shopify's clock and ours without inviting
 *  meaningful replay risk. */
const CLOCK_SKEW_SEC = 60;

/**
 * Decode the JWT payload, run the three mandatory checks, and
 * return the typed claim set. Any failure throws `IdTokenError`
 * with a machine-readable `code` the callback route logs and
 * collapses to a generic "sign-in failed" UI.
 */
export function decodeAndValidateIdToken(
  idToken: string,
  expectedNonce: string,
): IdTokenClaims {
  const claims = decodeJwtPayload(idToken);

  const audValid = Array.isArray(claims.aud)
    ? claims.aud.includes(env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID)
    : claims.aud === env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID;
  if (!audValid) {
    throw new IdTokenError(
      "invalid_audience",
      "id_token aud does not match client_id",
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || nowSec > claims.exp + CLOCK_SKEW_SEC) {
    throw new IdTokenError("expired", "id_token is expired");
  }

  if (claims.nonce !== expectedNonce) {
    throw new IdTokenError(
      "invalid_nonce",
      "id_token nonce does not match the value sent at authorize time",
    );
  }

  return claims;
}

/**
 * Pull the payload segment out of a `header.payload.signature`
 * JWT, base64url-decode it, and parse as JSON. Doesn't touch
 * the signature — see file-header comment for why.
 */
function decodeJwtPayload(jwt: string): IdTokenClaims {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new IdTokenError("malformed", "id_token is not a valid JWT");
  }
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload) as IdTokenClaims;
  } catch {
    throw new IdTokenError("malformed", "id_token payload is not valid JSON");
  }
}
