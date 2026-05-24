import "server-only";

/**
 * Storefront-side auth/session view of the current shopper.
 *
 * Only fields the UI actually reads — name + email is enough to
 * gate "Write a review" + render an own-review badge. Anything
 * richer (saved addresses, order history, loyalty tier) belongs
 * on the dedicated account dashboard, NOT in this session view.
 */
export interface AuthState {
  isLoggedIn: boolean;
  /** Display name for greeting / own-review attribution. */
  customerName?: string;
  /** Used for "is this review by the current shopper?" checks
   *  that need a stable key without exposing customer ids. */
  customerEmail?: string;
}

/**
 * Resolve the current shopper's session.
 *
 * Stub today — returns `{ isLoggedIn: false }` until the
 * Shopify Customer Account API (or our own session layer) lands.
 * Every PDP / cart / review surface that needs login state goes
 * through THIS function so wiring up the real auth backend is a
 * single-file change, not a sweep across the storefront.
 *
 * Async on purpose — every real implementation will read cookies
 * + hit a session endpoint, and we don't want callers to refactor
 * their `await` chains when that lands.
 */
export async function getAuthState(): Promise<AuthState> {
  return { isLoggedIn: false };
}
