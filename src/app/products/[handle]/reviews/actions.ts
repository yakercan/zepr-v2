"use server";

import { updateTag } from "next/cache";

import { getSession } from "@/lib/auth/session";
import {
  deleteProductReview,
  hasShopperReviewed,
  reviewsTag,
  submitProductReview,
} from "@/lib/reviews";
import { deleteReviewMedia, uploadReviewMedia } from "@/lib/reviews/storage";
import { hasPurchasedProduct } from "@/lib/shopify/customer-account-queries";

/**
 * Server actions for writing + deleting reviews.
 *
 * Both actions are auth-gated, identity-bound to the session,
 * and (for submit) gated behind a purchase + duplicate +
 * media-validation pipeline. The shopper-facing rating aggregate
 * on product cards is the backend's responsibility (a Supabase
 * trigger / job keeps the Shopify metafield in sync), so this
 * surface only ever touches the canonical `product_review` row.
 *
 * Both actions return a `{ ok, error? }` discriminated result
 * — the client wraps the call in `useTransition` to get the
 * pending flag and surfaces `error` inline on failure. On
 * success: parent calls `router.refresh()` and the immediate
 * cache-tag expiry below means the next render includes the
 * write.
 */

/* ------------------------------------------------------------------ */
/* Submit                                                              */
/* ------------------------------------------------------------------ */

/**
 * Per-attachment limits — keeps a determined attacker from
 * burning storage with a single huge upload, and keeps even
 * a normal customer's submit round-trip in the few-seconds
 * range. Values picked to match modern e-commerce review
 * defaults (Yotpo / Loox sit in the same range):
 *
 *   - up to 5 attachments per review (mix of photos + videos)
 *   - photos up to 10 MB each
 *   - videos up to 50 MB each
 *
 * No client-side duration check on video — we trust the
 * carrier's 50 MB cap to bound the practical length, and a
 * server-side ffprobe round would be overkill for v1.
 */
const MAX_ATTACHMENTS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const PHOTO_MIME_RE = /^image\/(jpeg|png|webp|gif|heic|heif)$/i;
const VIDEO_MIME_RE = /^video\/(mp4|webm|quicktime|ogg)$/i;

/** Discriminated result returned by `submitReviewAction`. The
 *  client wraps the call in `useTransition` rather than
 *  `useActionState` because the form mixes free-text fields with
 *  a stateful media picker — building the FormData manually at
 *  submit time keeps the React side simple. */
export type SubmitReviewResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitReviewAction(
  context: { productId: string; productHandle: string },
  formData: FormData,
): Promise<SubmitReviewResult> {
  /* 1. Auth — session is the source of truth for identity. */
  const session = await getSession();
  if (!session) {
    return { ok: false, error: "Please sign in to write a review." };
  }
  const customerEmail =
    session.customer.email?.trim().toLowerCase() || "";
  if (!customerEmail) {
    return {
      ok: false,
      error: "We couldn't read your account email. Please sign in again.",
    };
  }

  /* 2. Field parse + basic shape validation. */
  const rating = Number(formData.get("rating"));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Please pick a rating between 1 and 5." };
  }
  const body = String(formData.get("body") ?? "").trim();
  if (body.length === 0) {
    return { ok: false, error: "Please write your review before posting." };
  }
  if (body.length > 1500) {
    return {
      ok: false,
      error: "Reviews are limited to 1500 characters of body text.",
    };
  }
  const titleRaw = String(formData.get("title") ?? "").trim();
  const title = titleRaw.length > 0 ? titleRaw.slice(0, 80) : undefined;

  /* `nickname` is the public reviewer name — required. The
   * client pre-fills it from the session's first name so most
   * shoppers never see an empty field, but they can edit it for
   * privacy. We reject an empty submission outright (no silent
   * "Anonymous" fallback) so the row never carries a default
   * the shopper didn't explicitly accept. */
  const nickname = String(formData.get("nickname") ?? "").trim().slice(0, 40);
  if (nickname.length === 0) {
    return {
      ok: false,
      error: "Please add a display name so other shoppers know who's reviewing.",
    };
  }

  /* 3. Media validation — count, type, per-file size. */
  const files = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > MAX_ATTACHMENTS) {
    return {
      ok: false,
      error: `You can attach up to ${MAX_ATTACHMENTS} photos or videos.`,
    };
  }
  for (const file of files) {
    const isPhoto = PHOTO_MIME_RE.test(file.type);
    const isVideo = VIDEO_MIME_RE.test(file.type);
    if (!isPhoto && !isVideo) {
      return {
        ok: false,
        error: `Unsupported file type: ${file.name || "attachment"}.`,
      };
    }
    if (isPhoto && file.size > MAX_PHOTO_BYTES) {
      return {
        ok: false,
        error: `Photos must be under ${MAX_PHOTO_BYTES / (1024 * 1024)} MB. (${file.name})`,
      };
    }
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      return {
        ok: false,
        error: `Videos must be under ${MAX_VIDEO_BYTES / (1024 * 1024)} MB. (${file.name})`,
      };
    }
  }

  /* 4. Purchase check — Customer Account API, scoped to this
   *    shopper's own orders (no email forgery surface). */
  const purchased = await hasPurchasedProduct(context.productId);
  if (!purchased) {
    return {
      ok: false,
      error: "You can only review products you've purchased.",
    };
  }

  /* 5. Duplicate check — one review per shopper per product. */
  const alreadyReviewed = await hasShopperReviewed(
    context.productId,
    customerEmail,
  );
  if (alreadyReviewed) {
    return {
      ok: false,
      error:
        "You've already reviewed this product. Delete your existing review to write a new one.",
    };
  }

  /* 6. Upload media — fan-out, then filter nulls. Partial
   *    upload failures (one of N files fails) submit the
   *    review with what landed; we don't fail the whole
   *    review for a single attachment that didn't make it. */
  const uploadedUrls =
    files.length > 0
      ? (await Promise.all(files.map(uploadReviewMedia))).filter(
          (url): url is string => url !== null,
        )
      : [];

  /* 7. Insert row. */
  const inserted = await submitProductReview({
    productId: context.productId,
    productHandle: context.productHandle,
    customerEmail,
    customerName: nickname,
    rating: Math.round(rating),
    title,
    body,
    mediaUrls: uploadedUrls,
  });

  if (!inserted) {
    /* Storage uploads succeeded but the row insert didn't —
     * orphan the storage objects (a future janitor can sweep
     * them) and surface a clean error to the shopper. Better
     * than partially-applied state. */
    return {
      ok: false,
      error: "We couldn't save your review. Please try again in a moment.",
    };
  }

  /* 8. Invalidate the PDP's review-summary cache so the next
   *    render picks up the new row instead of waiting for the
   *    1-hour revalidate window. `updateTag` (Next.js 16) is the
   *    immediate-expiry variant — `revalidateTag` defaults to
   *    stale-while-revalidate now, which would briefly show the
   *    shopper a page that *doesn't* include the review they
   *    just posted. Immediate expiry matches the user's mental
   *    model on a write they just performed. */
  updateTag(reviewsTag(context.productId));

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

export type DeleteReviewResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteReviewAction(context: {
  productId: string;
  reviewId: string;
}): Promise<DeleteReviewResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: "Please sign in to manage your review." };
  }
  const email = session.customer.email?.trim().toLowerCase() || "";
  if (!email) {
    return {
      ok: false,
      error: "We couldn't read your account email. Please sign in again.",
    };
  }

  const orphanedUrls = await deleteProductReview({
    reviewId: context.reviewId,
    productId: context.productId,
    email,
  });
  if (orphanedUrls === null) {
    /* Provider returned null = row didn't exist, didn't belong
     * to this shopper, or PostgREST threw. Treated as a soft
     * no-op at the UI level — the row vanishes on next render
     * regardless. */
    return { ok: false, error: "We couldn't delete that review." };
  }

  /* Best-effort storage cleanup — review row deletion is the
   * source of truth; orphaned objects are tolerable. Never
   * blocks the success response on this. */
  if (orphanedUrls.length > 0) {
    await deleteReviewMedia(orphanedUrls);
  }

  updateTag(reviewsTag(context.productId));
  return { ok: true };
}
