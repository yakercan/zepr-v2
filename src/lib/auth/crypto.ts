import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { env } from "@/env";

/**
 * Authenticated symmetric encryption for cookie payloads.
 *
 * Wraps Node's `aes-256-gcm` with a per-purpose HKDF-derived key,
 * so the master `SESSION_SECRET` can safely back multiple cookies
 * — the long-lived session cookie, the short-lived OAuth-state
 * cookie, future flash messages, … — without any of them sharing
 * a literal cipher key. A leak of one purpose's key never weakens
 * another.
 *
 * Tampering returns `null` (not a thrown error) so callers can
 * treat a corrupt cookie the same as a missing one: log the
 * shopper out, clear the cookie, redirect to login.
 *
 * Wire format (compact, URL-safe single string, cookie-friendly):
 *
 *     base64url( iv(12) ‖ tag(16) ‖ ciphertext(…) )
 *
 * Built on `node:crypto` — no third-party dependencies, runs on
 * the Node and edge runtimes Next.js supports.
 */

const ALGO = "aes-256-gcm";
const KEY_LEN = 32; // 256-bit key (AES-256)
const IV_LEN = 12; // 96-bit IV — GCM's recommended size
const TAG_LEN = 16; // 128-bit authentication tag

/**
 * Derive a purpose-bound 256-bit key from `SESSION_SECRET`.
 *
 * The `purpose` string (e.g. `"session"`, `"oauth-state"`) feeds
 * HKDF's `info` parameter — different purposes derive different
 * keys from the same secret, so a compromise of one cookie type
 * doesn't leak the key for any other. Version segment in the
 * info string (`.v1`) leaves room to rotate the derivation
 * scheme later without breaking the secret itself.
 */
function deriveKey(purpose: string): Buffer {
  const ikm = Buffer.from(env.SESSION_SECRET, "utf8");
  /* No salt — the secret already has full entropy (≥256 bits
   * once base64-decoded), and a static empty salt is well-defined
   * for HKDF. Adding a salt here would buy nothing. */
  const salt = Buffer.alloc(0);
  const info = Buffer.from(`zepr.${purpose}.v1`, "utf8");
  const okm = hkdfSync("sha256", ikm, salt, info, KEY_LEN);
  return Buffer.from(okm);
}

/**
 * JSON-serialise `payload`, encrypt with AES-256-GCM, and return
 * a cookie-safe base64url blob. Pair with `open` to reverse.
 *
 * Each call uses a fresh random IV so the same payload sealed
 * twice produces different ciphertexts — leaking nothing through
 * traffic analysis even when the body is predictable.
 */
export function seal<T>(payload: T, purpose: string): string {
  const key = deriveKey(purpose);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

/**
 * Reverse of `seal`. Returns the original payload, or `null` if:
 *
 *   - the input doesn't decode as base64url,
 *   - the cipher / tag fails authentication (cookie was tampered
 *     or sealed with a different secret),
 *   - the decrypted bytes aren't valid JSON.
 *
 * Any of those collapses to the same outcome — "no valid session"
 * — so callers branch on a single nullable result instead of
 * unwrapping nested errors.
 */
export function open<T>(blob: string, purpose: string): T | null {
  try {
    const buf = Buffer.from(blob, "base64url");
    if (buf.length < IV_LEN + TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
    const key = deriveKey(purpose);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}
