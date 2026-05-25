import "server-only";

import { env } from "@/env";
import { parseReviewMedia } from "@/lib/reviews/media";
import type {
  ProductReview,
  ProductReviewSummary,
  ReviewModerationState,
  SubmitReviewInput,
} from "@/lib/reviews/types";

/* Cap on approved reviews rendered per PDP. Most products sit
 * well under this; if a product ever exceeds it the footer can
 * ship "50+" semantics in a later round. */
const DISPLAY_LIMIT = 50;

/* Columns the PDP renders — shared by both reads so we never
 * drift the public list and the own-row fetch out of sync. */
const REVIEW_SELECT =
  "id,rating,title,description,customer,createdAt,images,approved";

/* Wire shape — exactly what Supabase returns from the
 * `product_review` table the legacy Hydrogen storefront writes
 * to. Kept loose because the legacy schema isn't typed; mapping
 * to the strict `ProductReview` shape happens in `toReview`. */
interface SupabaseRow {
  id: number | string;
  rating: number | string | null;
  title: string | null;
  description: string | null;
  customer: { name?: string | null; email?: string | null } | null;
  createdAt: string | null;
  images: ReadonlyArray<string> | null;
  /* Moderation flag.
   *   `true`  — approved, visible to everyone.
   *   `false` — rejected.
   *   `null`  — pending review (default on insert).
   * Anything that isn't `true` is owner-only. */
  approved: boolean | null;
}

/**
 * Supabase-backed review provider.
 *
 * Reads the same `product_review` table the legacy storefront
 * writes to — keyed by Shopify GID — so every review captured
 * before the cutover surfaces here unchanged.
 *
 * Two PostgREST round-trips per PDP, in parallel:
 *
 *   1. Approved page — public list (oldest tail dropped at
 *      `DISPLAY_LIMIT`) + `count=exact` so the aggregate
 *      ★ chip shows the real total even when the list is
 *      paginated.
 *   2. Viewer's own row — only fetched for signed-in shoppers,
 *      so the owner sees their pending/rejected review on the
 *      PDP without an admin surface. Skipped for guests.
 *
 * Service-role key — this provider is `server-only`, the key
 * never reaches the client, and the legacy RLS rules already
 * restrict the table to server-context callers. Fetches
 * participate in Next's data cache with a 1-hour revalidate
 * window + a per-product cache tag; the submit/delete actions
 * call `updateTag(reviewsTag(productId))` to invalidate
 * immediately on write.
 *
 * Failure paths return `null` so the UI just hides / empty-
 * states gracefully:
 *
 *   - Missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
 *   - Non-2xx PostgREST response (RLS denied, schema drift, …).
 *   - Network failure.
 *
 * `{ totalCount: 0, reviews: [] }` is returned for products
 * with no reviews yet — distinguishes "no data system wired"
 * from "system wired, this product has no reviews".
 */
export async function fetchProductReviewsFromSupabase(
  productId: string,
  viewerEmail?: string,
): Promise<ProductReviewSummary | null> {
  const deps = readDeps();
  if (!deps) return null;

  const normaliseEmail = viewerEmail?.trim().toLowerCase() || null;
  const tag = reviewsTagFor(productId);

  try {
    const [approvedResult, ownRow] = await Promise.all([
      fetchApprovedReviews(deps, productId, tag),
      normaliseEmail
        ? fetchOwnReview(deps, productId, normaliseEmail, tag)
        : Promise.resolve(null),
    ]);

    const approvedReviews = approvedResult.rows
      .map((row) => toReview(row, normaliseEmail))
      .filter((r): r is ProductReview => r !== null);

    /* Splice the viewer's row in only when it's NOT already in
     * the approved list (the two queries overlap when the row
     * is live). Newest-first sort puts a pending row at the top
     * naturally, which is the right place for it. */
    const ownReview = ownRow ? toReview(ownRow, normaliseEmail) : null;
    const reviews =
      ownReview && !approvedReviews.some((r) => r.id === ownReview.id)
        ? [ownReview, ...approvedReviews]
        : approvedReviews;

    if (reviews.length === 0) {
      return { averageRating: 0, totalCount: 0, reviews: [] };
    }

    /* Aggregates count approved rows only — the ★ chip mirrors
     * what the public sees, never tilted by a viewer's pending
     * row. */
    const averageRating =
      approvedReviews.length > 0
        ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) /
          approvedReviews.length
        : 0;

    return {
      averageRating: Math.round(averageRating * 10) / 10,
      totalCount: approvedResult.total,
      ratingHistogram: buildHistogram(approvedReviews),
      reviews,
    };
  } catch (err) {
    console.warn(`[reviews/supabase] fetch failed for ${productId}`, err);
    return null;
  }
}

async function fetchApprovedReviews(
  deps: SupabaseDeps,
  productId: string,
  tag: string,
): Promise<{ rows: SupabaseRow[]; total: number }> {
  const url = new URL("/rest/v1/product_review", deps.baseUrl);
  url.searchParams.set("productId", `eq.${productId}`);
  url.searchParams.set("approved", "eq.true");
  url.searchParams.set("select", REVIEW_SELECT);
  url.searchParams.set("order", "createdAt.desc");
  url.searchParams.set("limit", String(DISPLAY_LIMIT));

  const response = await fetch(url.toString(), {
    headers: { ...authHeaders(deps), Prefer: "count=exact" },
    next: { revalidate: 3600, tags: [tag] },
  });
  if (!response.ok) {
    throw new Error(`PostgREST ${response.status} approved fetch`);
  }

  const rows = (await response.json()) as SupabaseRow[];
  const total = parseContentRangeTotal(response.headers.get("content-range"));
  return { rows, total: total ?? rows.length };
}

async function fetchOwnReview(
  deps: SupabaseDeps,
  productId: string,
  email: string,
  tag: string,
): Promise<SupabaseRow | null> {
  const url = new URL("/rest/v1/product_review", deps.baseUrl);
  url.searchParams.set("productId", `eq.${productId}`);
  url.searchParams.set("customer->>email", `eq.${email}`);
  url.searchParams.set("select", REVIEW_SELECT);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: authHeaders(deps),
    next: { revalidate: 3600, tags: [tag] },
  });
  if (!response.ok) {
    throw new Error(`PostgREST ${response.status} own-review fetch`);
  }

  const rows = (await response.json()) as SupabaseRow[];
  return rows[0] ?? null;
}

/* PostgREST returns the `count=exact` total in the
 * `Content-Range: 0-9/42` header. We only need the trailing
 * number; `"*"` means "exact count unavailable". */
function parseContentRangeTotal(
  contentRange: string | null,
): number | null {
  if (!contentRange) return null;
  const total = contentRange.split("/")[1];
  if (!total || total === "*") return null;
  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Write path — insert / delete / duplicate check                      */
/* ------------------------------------------------------------------ */

/**
 * Has this shopper already reviewed this product?
 *
 * One PostgREST round-trip; matches the legacy storefront's
 * duplicate-check predicate exactly (`customer->>email` is the
 * PostgREST syntax for "extract `email` from the JSONB `customer`
 * column as text", which is how the legacy rows store the email).
 */
export async function hasShopperReviewedProduct(
  productId: string,
  email: string,
): Promise<boolean> {
  const deps = readDeps();
  if (!deps) return false;

  const url = new URL("/rest/v1/product_review", deps.baseUrl);
  url.searchParams.set("productId", `eq.${productId}`);
  url.searchParams.set("customer->>email", `eq.${email}`);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: authHeaders(deps),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: unknown }>;
    return rows.length > 0;
  } catch (err) {
    console.warn(`[reviews/supabase] duplicate-check failed`, err);
    return false;
  }
}

/**
 * Insert a new review row. Returns the created row id on
 * success, `null` on any failure path.
 *
 * The card-aggregate (`custom.review` + `custom.rating_count`
 * metafield on the Shopify product) is owned by the backend —
 * a Supabase-side trigger reflects insert / delete events into
 * Shopify so the storefront never needs an Admin API key to
 * keep those numbers fresh.
 */
export async function insertReviewIntoSupabase(
  input: SubmitReviewInput,
): Promise<string | null> {
  const deps = readDeps();
  if (!deps) return null;

  const url = new URL("/rest/v1/product_review", deps.baseUrl);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        ...authHeaders(deps),
        "Content-Type": "application/json",
        /* `return=representation` makes PostgREST echo the new
         *  row back so we get its server-assigned id without a
         *  second round-trip. */
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        productId: input.productId,
        productHandle: input.productHandle,
        rating: input.rating,
        title: input.title ?? null,
        description: input.body,
        customer: {
          name: input.customerName,
          email: input.customerEmail.toLowerCase(),
        },
        createdAt: new Date().toISOString(),
        images: [...input.mediaUrls],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        `[reviews/supabase] insert ${res.status}:`,
        await res.text().catch(() => ""),
      );
      return null;
    }

    const rows = (await res.json()) as Array<{ id: number | string }>;
    return rows[0] ? String(rows[0].id) : null;
  } catch (err) {
    console.warn("[reviews/supabase] insert failed:", err);
    return null;
  }
}

/**
 * Delete one review row scoped to its owning shopper.
 *
 * The `customer->>email` filter guarantees we can't accidentally
 * (or maliciously) delete someone else's review even if the
 * frontend sent the wrong id — the shopper's email is sourced
 * from session, not from the request body.
 *
 * Returns the deleted row's media URLs so the caller can fan
 * out a storage cleanup. Returns `null` when the row didn't
 * exist or didn't belong to this shopper (= no-op success at
 * the UI layer, no need to surface an error).
 */
export async function deleteReviewFromSupabase(
  reviewId: string,
  productId: string,
  email: string,
): Promise<ReadonlyArray<string> | null> {
  const deps = readDeps();
  if (!deps) return null;

  const url = new URL("/rest/v1/product_review", deps.baseUrl);
  url.searchParams.set("id", `eq.${reviewId}`);
  url.searchParams.set("productId", `eq.${productId}`);
  url.searchParams.set("customer->>email", `eq.${email.toLowerCase()}`);

  try {
    const res = await fetch(url.toString(), {
      method: "DELETE",
      headers: {
        ...authHeaders(deps),
        /* `return=representation` so we get the deleted row's
         *  `images` column back and can clean up storage. The
         *  legacy code did a SELECT-then-DELETE — one round-trip
         *  fewer here. */
        Prefer: "return=representation",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[reviews/supabase] delete ${res.status}`);
      return null;
    }
    const rows = (await res.json()) as Array<{
      images: ReadonlyArray<string> | null;
    }>;
    if (rows.length === 0) return null;
    return (rows[0].images ?? []).filter((u): u is string => typeof u === "string");
  } catch (err) {
    console.warn("[reviews/supabase] delete failed:", err);
    return null;
  }
}

/**
 * Cache tag for a product's review summary — pass into
 * `revalidateTag` from server actions after insert/delete so
 * the PDP reads the fresh page on its next render without
 * waiting for the 1-hour `revalidate` window to expire.
 */
export function reviewsTagFor(productId: string): string {
  return `reviews:${productId}`;
}

/* ------------------------------------------------------------------ */
/* Internals                                                            */
/* ------------------------------------------------------------------ */

interface SupabaseDeps {
  baseUrl: string;
  apiKey: string;
}

function readDeps(): SupabaseDeps | null {
  const baseUrl = env.SUPABASE_URL;
  /* Service-role key — required, NOT anon. The legacy RLS rules
   * on `product_review` only allow server-context reads/writes.
   * This file is `server-only` so the key never reaches the
   * browser. */
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

function authHeaders(deps: SupabaseDeps): Record<string, string> {
  return {
    apikey: deps.apiKey,
    Authorization: `Bearer ${deps.apiKey}`,
  };
}

/* Strict mapping from the loose wire row to the public review
 * shape. Drops malformed rows (no body, non-numeric rating)
 * rather than rendering broken UI — invariants enforced at the
 * provider boundary, never beyond.
 *
 * `viewerEmail` (already trimmed + lowercased by the caller)
 * lets us compute `isOwn` here and then DROP the row's email
 * from the public projection — the strict "no PII past this
 * boundary" invariant stays intact. */
function toReview(
  row: SupabaseRow,
  viewerEmail: string | null,
): ProductReview | null {
  const rating = Number(row.rating);
  if (!Number.isFinite(rating) || rating <= 0) return null;

  const body = (row.description ?? "").trim();
  if (!body) return null;

  /* Normalise the legacy `images` column (which actually holds a
   * mixed bag of image + video URLs once we add video uploads)
   * into typed `ReviewMedia[]` at the provider boundary — the
   * UI never has to sniff URL extensions. */
  const media = parseReviewMedia(row.images ?? []);

  const rowEmail = row.customer?.email?.trim().toLowerCase() || null;
  const isOwn = !!viewerEmail && rowEmail === viewerEmail;

  /* Surface the moderation flag only to the row's owner — public
   * traffic never sees non-approved rows in the first place, so
   * it would always be `"approved"` there anyway. Keeping it
   * scoped to `isOwn` keeps the public projection unchanged. */
  const moderationState: ReviewModerationState =
    row.approved === true
      ? "approved"
      : row.approved === false
        ? "rejected"
        : "pending";

  return {
    id: String(row.id),
    rating,
    title: row.title?.trim() || undefined,
    body,
    authorName: row.customer?.name?.trim() || "Anonymous",
    createdAt: row.createdAt ?? new Date(0).toISOString(),
    media: media.length > 0 ? media : undefined,
    ...(isOwn ? { isOwn: true, moderationState } : {}),
  };
}

function buildHistogram(
  reviews: ReadonlyArray<ProductReview>,
): NonNullable<ProductReviewSummary["ratingHistogram"]> {
  const buckets: Record<"1" | "2" | "3" | "4" | "5", number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };
  for (const r of reviews) {
    const k = String(Math.round(r.rating)) as keyof typeof buckets;
    if (k in buckets) buckets[k] += 1;
  }
  return buckets;
}
