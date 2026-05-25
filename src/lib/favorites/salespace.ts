import "server-only";

import type { FavoriteItem } from "@/lib/favorites/types";

/**
 * Salespace wishlist provider — server-only.
 *
 * Salespace owns the favorites domain end-to-end:
 *
 *   - persistence (one source of truth across devices + sessions)
 *   - product snapshot (handle, title, image, price, available)
 *   - aggregate likes-count (denormalised wishlist_count on each
 *     product, refreshed batch-side — feeds future social-proof
 *     surfaces with no extra wiring)
 *
 * One backend, one round-trip per action. The legacy storefront
 * proxied browser calls through a Remix route for CORS + key
 * hiding; v2 runs every call server-side (from RSC + server
 * actions), so we don't need a proxy layer — `fetch` straight to
 * Salespace, identity sourced from session.
 *
 * Identity policy — v2 simplification:
 *
 *   - Logged-in shoppers: `X-User-Email` header, sourced from
 *     `getSession()` in the caller. The email is the stable
 *     shopper identifier the rest of the app already uses
 *     (reviews, returns).
 *   - Guests: never reach this module. The `<FavoriteButton>`
 *     short-circuits to the sign-in modal before any action
 *     fires. The legacy `X-Device-Id` anonymous path and the
 *     `/wishlist/link` merge-on-login dance both collapse to
 *     zero code as a result.
 *
 * Product id format: numeric Shopify id everywhere in the
 * favorites layer. Salespace's `/search` endpoint returns
 * numeric ids on `SearchProduct.id` (verified live — the
 * legacy storefront stripped GIDs in its wishlist hook
 * specifically because some callers passed GIDs from the
 * Shopify-Storefront-backed PDP). Cards (the only surface
 * with a heart in v2) get their id from Salespace search, so
 * the natural form is numeric. We accept GIDs defensively at
 * the boundary and strip them, in case a future PDP-side
 * heart lands.
 *
 * Failure modes (network / non-2xx / shape drift): reads return
 * `null` so the calling RSC can render an "unable to load
 * favorites right now" empty state without crashing. Writes
 * return `false` so the optimistic `<FavoriteButton>` rolls
 * back the heart on failure. Logs go to the server console.
 */

const SALESPACE_API_BASE = "https://api.salespace.com";

/* Default pull size for the favorites listing. Salespace
 * supports `?page=&limit=`; v2 pulls the full set in one shot
 * (no pagination UI on `/favorites`) so this just caps the wire
 * payload at a reasonable maximum. 500 saved items is well past
 * any realistic power-shopper threshold. */
const LIST_LIMIT = 500;

/* ------------------------------------------------------------------ */
/* Wire shapes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Raw Salespace wishlist item — what `/wishlist` returns inside
 * its `items` array.
 *
 * `shopifyProductId` can come back either numeric ("12345678")
 * or already-GID ("gid://shopify/Product/12345678") depending on
 * how the row was written. The legacy storefront had defensive
 * code that handled both forms — we keep the same normalisation
 * in `toFavoriteItem` so v2 always sees the GID form.
 */
interface RawWishlistItem {
  shopifyProductId: string;
  handle: string;
  title: string;
  imageUrl: string;
  priceMinCents: number;
  priceMaxCents: number;
  compareAtMinCents: number;
  currency: string;
  available: boolean;
  addedAt: string;
}

/* Only the `items` array is read — the upstream also returns
 * `email`, `isAnonymous`, `count`, and `pagination`, but v2 has
 * no UI for any of them. Narrowing the type keeps the wire
 * surface honest about what we actually depend on. */
interface RawWishlistResponse {
  items?: RawWishlistItem[];
}

/* ------------------------------------------------------------------ */
/* Public reads                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch the shopper's full favorites list.
 *
 * Returns the entire wishlist (up to `LIST_LIMIT` items) in
 * Salespace's `addedAt`-desc order — the same order the legacy
 * storefront's `/wishlist` page surfaced. One call covers both
 * the `/favorites` page (renders the snapshots directly) and
 * the per-grid favorited-id lookup (just keys off `productId`).
 *
 * `null` distinguishes "fetch failed" from "the shopper has no
 * favorites yet" (empty list). The page UI renders an error
 * banner for the former and a friendly empty-state for the
 * latter.
 */
export async function fetchWishlist(
  email: string,
): Promise<ReadonlyArray<FavoriteItem> | null> {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;

  const url = new URL(`${SALESPACE_API_BASE}/wishlist`);
  url.searchParams.set("limit", String(LIST_LIMIT));

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: identityHeaders(normalised),
      /* Per-request freshness — wishlist state changes on every
       * toggle and v2's React `cache()` wrapper around
       * `getCurrentWishlist` is the right granularity for
       * "share within one render, refetch on the next". */
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[favorites/salespace] list ${res.status}`);
      return null;
    }
    const data = (await res.json()) as RawWishlistResponse;
    return (data.items ?? [])
      .map(toFavoriteItem)
      .filter((i): i is FavoriteItem => i !== null);
  } catch (err) {
    console.warn("[favorites/salespace] list failed:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Public writes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Add a product to the shopper's wishlist. Idempotent on the
 * Salespace side (a second add for the same product is a no-op),
 * so a rapid double-click never produces a duplicate.
 *
 * `productId` accepts either the numeric Shopify id (what
 * `SearchProduct.id` from Salespace search carries — the hot
 * path for cards) or the full GID (what `ProductDetail.id` from
 * the Shopify Storefront carries — future PDP-side heart);
 * both coerce to numeric at the URL boundary.
 */
export async function addFavorite(
  email: string,
  productId: string,
): Promise<boolean> {
  const numericId = toNumericProductId(productId);
  const normalised = normaliseEmail(email);
  if (!numericId || !normalised) return false;

  try {
    const res = await fetch(
      `${SALESPACE_API_BASE}/wishlist/${encodeURIComponent(numericId)}`,
      {
        method: "POST",
        headers: {
          ...identityHeaders(normalised),
          "Content-Type": "application/json",
        },
        /* Salespace ignores the body — the path carries the
         * product id, the header carries identity. Sending `{}`
         * matches what the legacy proxy sent and keeps any
         * upstream content-length expectations satisfied. */
        body: JSON.stringify({}),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      console.warn(`[favorites/salespace] add ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[favorites/salespace] add failed:", err);
    return false;
  }
}

/**
 * Remove a product from the shopper's wishlist. Idempotent on
 * the "wasn't favorited anyway" path — Salespace returns 200
 * regardless, so a stale optimistic flip can fire the action
 * without surfacing a spurious failure.
 *
 * Scoped to the calling shopper by the `X-User-Email` header
 * sourced from session — a tampered request body can't delete
 * another shopper's row.
 */
export async function removeFavorite(
  email: string,
  productId: string,
): Promise<boolean> {
  const numericId = toNumericProductId(productId);
  const normalised = normaliseEmail(email);
  if (!numericId || !normalised) return false;

  try {
    const res = await fetch(
      `${SALESPACE_API_BASE}/wishlist/${encodeURIComponent(numericId)}`,
      {
        method: "DELETE",
        headers: identityHeaders(normalised),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      console.warn(`[favorites/salespace] remove ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[favorites/salespace] remove failed:", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Internals                                                            */
/* ------------------------------------------------------------------ */

/**
 * Identity header for every wishlist call. The legacy storefront
 * supports both `X-User-Email` (logged-in) and `X-Device-Id`
 * (anonymous); v2 ships logged-in only — guests never reach this
 * module — so we always send `X-User-Email`. No `X-API-Key`:
 * Salespace's wishlist endpoints authenticate by identity
 * header, not by API key (verified against the legacy proxy
 * implementation).
 */
function identityHeaders(email: string): Record<string, string> {
  return { "X-User-Email": email };
}

/**
 * Trim + lowercase the email so the same shopper hitting the
 * endpoint from two surfaces always lands on the same Salespace
 * row. Returns `null` for empty/whitespace input — callers
 * short-circuit on that.
 */
function normaliseEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Coerce a Shopify product id to its numeric form.
 *
 * Salespace's wishlist endpoints address products by numeric
 * id. v2 sees two id shapes depending on the surface:
 *
 *   - Salespace search → numeric ("12345678") — what cards get
 *   - Shopify Storefront → GID
 *     ("gid://shopify/Product/12345678") — what the PDP gets
 *
 * Cards are the only heart surface today, so the numeric path
 * is the hot one; the GID path is here so a future PDP-side
 * heart works without further plumbing.
 *
 *   "gid://shopify/Product/12345678"  → "12345678"
 *   "12345678"                         → "12345678"
 *   "garbage"                          → null
 */
function toNumericProductId(input: string): string | null {
  if (!input) return null;
  if (/^\d+$/.test(input)) return input;
  const match = input.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

/**
 * Normalise a Salespace wishlist row into the strict v2
 * `FavoriteItem` shape. Drops malformed rows rather than
 * letting them through with missing fields and breaking the
 * card render downstream.
 *
 * `productId` is the numeric Shopify id, regardless of which
 * form Salespace happened to store. This matches what
 * `SearchProduct.id` carries on cards, so the favorited-id
 * `Set` returned by `getCurrentFavoritedIds()` is directly
 * usable as `favoritedIds.has(product.id)` next to each
 * `<ProductCard>` — no per-card normalisation needed.
 */
function toFavoriteItem(raw: RawWishlistItem): FavoriteItem | null {
  if (
    !raw?.shopifyProductId ||
    !raw.handle ||
    !raw.title ||
    !raw.imageUrl ||
    !raw.currency ||
    typeof raw.priceMinCents !== "number"
  ) {
    return null;
  }

  const productId = toNumericProductId(raw.shopifyProductId);
  if (!productId) return null;

  /* Match v2's compare-at convention: zero / missing → undefined
   * so cards never render a phantom strike-through. */
  const compareAtMin =
    raw.compareAtMinCents > raw.priceMinCents ? raw.compareAtMinCents : undefined;

  return {
    productId,
    handle: raw.handle,
    title: raw.title,
    imageUrl: raw.imageUrl,
    priceMinCents: raw.priceMinCents,
    priceMaxCents:
      typeof raw.priceMaxCents === "number"
        ? raw.priceMaxCents
        : raw.priceMinCents,
    compareAtMinCents: compareAtMin,
    currency: raw.currency,
    available: raw.available !== false,
    addedAt: raw.addedAt,
  };
}
