"use server";

import { getSession } from "@/lib/auth/session";
import {
  buildShopifyNote,
  findReturnReason,
  MAX_RETURN_NOTE,
} from "@/lib/returns/reasons";
import { uploadReturnMediaBatch } from "@/lib/returns/storage";
import {
  fetchOrderDetail,
  requestOrderReturn,
  type RequestedReturnLineItemInput,
} from "@/lib/shopify/customer-account-queries";

/**
 * Server action — submit a return request on the signed-in
 * shopper's behalf.
 *
 * Pipeline mirrors the review submit action: auth → parse →
 * validate → Shopify mutation → media upload. The media step
 * runs AFTER the Shopify call so the storage path can key off
 * the freshly-created `Return.id`; if the mutation fails we
 * never touch storage at all.
 *
 * Returns a `{ ok, error? }` discriminated result. The client
 * (`<ReturnRequestButton>`) wraps the call via `MediaFormModal`,
 * which surfaces `error` inline on failure and flashes a success
 * overlay before refreshing the order page on success.
 */

/* Per-attachment limits — identical to the review submit action.
 * Sized for typical mobile photo + short video uploads with
 * comfortable headroom; per-file size + MIME still re-validated
 * server-side so the client picker is a courtesy filter, not a
 * trust boundary. */
const MAX_ATTACHMENTS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const PHOTO_MIME_RE = /^image\/(jpeg|png|webp|gif|heic|heif)$/i;
const VIDEO_MIME_RE = /^video\/(mp4|webm|quicktime|ogg)$/i;

export type RequestReturnResult =
  | { ok: true }
  | { ok: false; error: string };

/** Raw shape the client sends over in the `lines` JSON blob. */
interface ClientLineInput {
  lineItemId: string;
  quantity: number;
  reasonId: string;
  note: string;
}

export async function requestReturnAction(
  /* `orderId` is bound by the caller (`<ReturnRequestButton>`)
   *  before exposing the action to the form, so the FormData
   *  payload only carries fields the shopper actually controls. */
  context: { orderId: string },
  formData: FormData,
): Promise<RequestReturnResult> {
  /* 1. Auth */
  const session = await getSession();
  if (!session) {
    return { ok: false, error: "Please sign in to request a return." };
  }

  /* 2. Parse the per-line payload. The client serialises an
   *    array of `{ fulfillmentLineItemId, quantity, reasonId, note }`
   *    as JSON so we don't have to invent a FormData bracket
   *    convention for nested data. */
  const linesRaw = String(formData.get("lines") ?? "");
  let lines: ClientLineInput[];
  try {
    const parsed = JSON.parse(linesRaw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    lines = parsed as ClientLineInput[];
  } catch {
    return { ok: false, error: "Couldn't read the selected items." };
  }
  if (lines.length === 0) {
    return { ok: false, error: "Pick at least one item to return." };
  }

  /* 3. Validate each line against the order's currently-returnable
   *    items. We re-fetch the order (rather than trusting the
   *    client) so the action is the policy authority — the
   *    client could have stale data, or a malicious caller could
   *    fabricate ids entirely. */
  const order = await fetchOrderDetail(extractNumericId(context.orderId));
  if (!order) {
    return { ok: false, error: "Order not found." };
  }
  const returnableById = new Map(
    order.returnableLineItems.map((item) => [item.lineItemId, item]),
  );

  let anyReasonRequiresMedia = false;
  const requested: RequestedReturnLineItemInput[] = [];

  for (const line of lines) {
    const returnable = returnableById.get(line.lineItemId);
    if (!returnable) {
      return { ok: false, error: "One of the selected items isn't returnable." };
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > returnable.returnableQuantity
    ) {
      return {
        ok: false,
        error: `Invalid quantity for ${returnable.title}.`,
      };
    }
    const reason = findReturnReason(line.reasonId);
    if (!reason) {
      return { ok: false, error: "Please pick a return reason for each item." };
    }
    const note = String(line.note ?? "").trim();
    if (note.length > MAX_RETURN_NOTE) {
      return {
        ok: false,
        error: `Notes are limited to ${MAX_RETURN_NOTE} characters.`,
      };
    }
    if (reason.noteRequired && note.length === 0) {
      return {
        ok: false,
        error: `Please describe the issue when picking "Other" as the reason.`,
      };
    }
    if (reason.mediaRequired) anyReasonRequiresMedia = true;

    requested.push({
      lineItemId: line.lineItemId,
      quantity: line.quantity,
      customerNote: buildShopifyNote(reason, note),
    });
  }

  /* 4. Validate media. Count + MIME + per-file size mirror the
   *    review submit action; the mandatory-media branch lights
   *    up only when at least one selected line carries a reason
   *    flagged `mediaRequired`. */
  const files = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_ATTACHMENTS) {
    return {
      ok: false,
      error: `You can attach up to ${MAX_ATTACHMENTS} photos or videos.`,
    };
  }
  if (anyReasonRequiresMedia && files.length === 0) {
    return {
      ok: false,
      error: "Please add a photo or video for the selected reason.",
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

  /* 5. Submit the Shopify mutation. */
  const result = await requestOrderReturn(context.orderId, requested);
  if (!result.ok) return { ok: false, error: result.error };

  /* 6. Upload media — fan-out, scoped to the new return id.
   *    Partial failures here surface as that file missing in
   *    storage; we don't fail the whole action because the
   *    return itself has already been recorded by Shopify.
   *    A future janitor could reconcile orphaned attachments
   *    against `Return.requestedLineItems[].customerNote`. */
  if (files.length > 0) {
    await uploadReturnMediaBatch(context.orderId, result.returnId, files);
  }

  /* No cache tag to bust — the order detail page renders against
   * `customerAccountFetch` (no-store), so the next render after
   * `router.refresh()` on the client picks up the new return on
   * `Order.returns` and `Order.returnableFulfillments` naturally. */
  return { ok: true };
}

/* `fetchOrderDetail` accepts the numeric id (used by the search
 * filter on the orders connection); the action receives the full
 * GID from the caller. This tiny helper bridges the two without
 * a second import of `extractGidId` (which lives next to the GraphQL
 * helpers and isn't worth re-exporting here for a one-liner). */
function extractNumericId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}
