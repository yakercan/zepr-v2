import "server-only";

import { env } from "@/env";
import type { ProductReview, ProductReviewSummary } from "@/lib/reviews/types";

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
): Promise<ProductReviewSummary | null> {
  const baseUrl = env.SUPABASE_URL;
  /* Service-role key — required, NOT anon. The legacy RLS rules
   * on `product_review` only allow server-context reads. This
   * file is `server-only` so the key never reaches the browser. */
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !apiKey) return null;

  const url = new URL("/rest/v1/product_review", baseUrl);
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
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 3600 },
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

  const reviews: ProductReview[] = rows
    .map(toReview)
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

/* Strict mapping from the loose wire row to the public review
 * shape. Drops malformed rows (no body, non-numeric rating)
 * rather than rendering broken UI — invariants enforced at the
 * provider boundary, never beyond. */
function toReview(row: SupabaseRow): ProductReview | null {
  const rating = Number(row.rating);
  if (!Number.isFinite(rating) || rating <= 0) return null;

  const body = (row.description ?? "").trim();
  if (!body) return null;

  /* Drop any non-string / empty entries the legacy may have
   * left behind — keeps the UI loop safe without an extra
   * runtime guard there. */
  const images = (row.images ?? []).filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );

  return {
    id: String(row.id),
    rating,
    title: row.title?.trim() || undefined,
    body,
    authorName: row.customer?.name?.trim() || "Anonymous",
    createdAt: row.createdAt ?? new Date(0).toISOString(),
    images: images.length > 0 ? images : undefined,
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
