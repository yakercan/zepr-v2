import "server-only";

import { env } from "@/env";
import { parseReviewMedia } from "@/lib/reviews/media";
import type {
  ProductReview,
  ProductReviewSummary,
  SubmitReviewInput,
} from "@/lib/reviews/types";

/* Worst-case cap on the page we pull per PDP render.
 *
 * Most products have <50 reviews — fetching them all in one
 * PostgREST round-trip is cheap and lets us compute an honest
 * average + count without a second aggregate query. If a product
 * ever pushes past this cap we ship "100+" semantics in the UI;
 * a real pagination cursor lives in a later round. */
const PAGE_LIMIT = 100;

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
}

/**
 * Supabase-backed review provider.
 *
 * Reads the same `product_review` table the legacy storefront
 * already writes to — keyed by Shopify GID — so every review
 * captured before the cutover surfaces here unchanged.
 *
 * One PostgREST round-trip per PDP. Service-role key — this
 * provider is `server-only`, the key never reaches the client,
 * and the legacy storefront restricts review reads to a server
 * context via RLS (the anon role can't `select` the table).
 * `select` is pruned to only the columns the UI reads,
 * `order=createdAt.desc` + `limit=100` so a runaway product
 * can't balloon the payload. The fetch participates in Next's
 * data cache with a 1-hour revalidate window — same TTL as the
 * PDP shell itself, so the review pane never drifts out of step
 * with the rest of the page.
 *
 * Returns `null` on the failure paths so the UI just hides /
 * empty-states gracefully:
 *
 *   - Missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (CI /
 *     preview builds without secrets).
 *   - Non-2xx PostgREST response (RLS denied, schema drift, …).
 *   - Network failure.
 *
 * A non-null `{ totalCount: 0, reviews: [] }` is returned for
 * products with no reviews yet — distinguishing "no data system
 * wired" from "system wired, this product has no reviews".
 */
export async function fetchProductReviewsFromSupabase(
  productId: string,
  viewerEmail?: string,
): Promise<ProductReviewSummary | null> {
  const deps = readDeps();
  if (!deps) return null;

  const url = new URL("/rest/v1/product_review", deps.baseUrl);
  url.searchParams.set("productId", `eq.${productId}`);
  url.searchParams.set(
    "select",
    "id,rating,title,description,customer,createdAt,images",
  );
  url.searchParams.set("order", "createdAt.desc");
  url.searchParams.set("limit", String(PAGE_LIMIT));

  let rows: SupabaseRow[];
  try {
    const response = await fetch(url.toString(), {
      headers: authHeaders(deps),
      next: { revalidate: 3600, tags: [reviewsTagFor(productId)] },
    });
    if (!response.ok) {
      console.warn(
        `[reviews/supabase] PostgREST ${response.status} for ${productId}`,
      );
      return null;
    }
    rows = (await response.json()) as SupabaseRow[];
  } catch (err) {
    console.warn(`[reviews/supabase] fetch failed for ${productId}`, err);
    return null;
  }

  const normaliseEmail = viewerEmail?.trim().toLowerCase() || null;
  const reviews: ProductReview[] = rows
    .map((row) => toReview(row, normaliseEmail))
    .filter((r): r is ProductReview => r !== null);

  if (reviews.length === 0) {
    return { averageRating: 0, totalCount: 0, reviews: [] };
  }

  const averageRating =
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return {
    averageRating: Math.round(averageRating * 10) / 10,
    totalCount: reviews.length,
    ratingHistogram: buildHistogram(reviews),
    reviews,
  };
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

  return {
    id: String(row.id),
    rating,
    title: row.title?.trim() || undefined,
    body,
    authorName: row.customer?.name?.trim() || "Anonymous",
    createdAt: row.createdAt ?? new Date(0).toISOString(),
    media: media.length > 0 ? media : undefined,
    ...(isOwn ? { isOwn: true } : {}),
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
