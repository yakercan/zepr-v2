import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/env";
import {
  extractGidId,
  type RequestedReturnLineItemInput,
} from "@/lib/shopify/customer-account-queries";

/**
 * Supabase Storage helpers for return-request media.
 *
 * Shopify's `orderRequestReturn` mutation does not accept media
 * attachments — the request input is `lineItemId` + `quantity` +
 * `returnReason` + `customerNote`, nothing more. So we upload to
 * our own private Supabase bucket and key the storage path off
 * the freshly-created `Return.id`, which gives the merchant (or
 * a future janitor) a clean way to find every file tied to one
 * return request.
 *
 * Path shape:
 *   `{orderNumericId}/{returnNumericId}/{uuid}_{safeName}`
 *
 * The leading orderId + returnId let admin tooling browse one
 * return's media as a directory; the UUID prefix on the leaf
 * guarantees no collision when a shopper uploads two files with
 * the same name in the same request.
 *
 * Bucket: `returns` (private; service-role-only write/read; the
 * customer-facing page never reads media back, only the merchant
 * admin does).
 */

const BUCKET = "returns";

interface StorageDeps {
  baseUrl: string;
  serviceRoleKey: string;
}

function readDeps(): StorageDeps | null {
  const baseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceRoleKey) return null;
  return { baseUrl, serviceRoleKey };
}

/**
 * Upload one return attachment under the matching return folder.
 *
 * Returns the storage path on success, `null` on any failure
 * path (missing env / upload error). Callers fan out via
 * `Promise.all`, so a single failure surfaces as that file
 * missing — the rest still land, and the return request itself
 * (the Shopify mutation) already committed.
 *
 * Bucket is private; no public URL is generated. If the merchant
 * surface ever needs to display these files, a signed-URL helper
 * goes here next to this function.
 */
export async function uploadReturnMedia(
  orderId: string,
  returnId: string,
  file: File,
): Promise<string | null> {
  const deps = readDeps();
  if (!deps) {
    console.warn("[returns/storage] missing SUPABASE_URL / SERVICE_ROLE_KEY");
    return null;
  }

  /* Both ids arrive as GIDs (`gid://shopify/Order/123`) — strip
   *  the prefix so paths read as plain numerics in admin tooling
   *  (`123/456/uuid_filename.jpg` is a lot easier to scan than
   *  `gid%3A%2F%2F...`). */
  const orderNumeric = extractGidId(orderId);
  const returnNumeric = extractGidId(returnId);

  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const path = `${orderNumeric}/${returnNumeric}/${randomUUID()}_${safeName}`;

  const uploadUrl = `${deps.baseUrl}/storage/v1/object/${BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  try {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.serviceRoleKey}`,
        "Content-Type": file.type || "application/octet-stream",
        /* No CDN caching — these are private review-only files
         *  and never re-served at scale. */
        "Cache-Control": "no-store",
        /* Fail on collision rather than silently overwrite — the
         *  UUID makes this unreachable, but the explicit guard
         *  makes the contract clear. */
        "x-upsert": "false",
      },
      body: file,
    });

    if (!res.ok) {
      console.warn(
        `[returns/storage] upload ${res.status} for ${path}:`,
        await res.text().catch(() => ""),
      );
      return null;
    }
  } catch (err) {
    console.warn(`[returns/storage] upload failed for ${path}:`, err);
    return null;
  }

  return path;
}

/** Mass-upload helper — runs uploads in parallel and returns the
 *  list of successfully-uploaded paths. Sized for the modal's 5-
 *  attachment ceiling; bigger batches don't need a queue. */
export async function uploadReturnMediaBatch(
  orderId: string,
  returnId: string,
  files: ReadonlyArray<File>,
): Promise<string[]> {
  if (files.length === 0) return [];
  const results = await Promise.all(
    files.map((file) => uploadReturnMedia(orderId, returnId, file)),
  );
  return results.filter((p): p is string => p !== null);
}

/* Re-export the typed input shape on the off-chance a caller
 * pulls both modules together — keeps `RequestedReturnLineItemInput`
 * accessible without a second import. */
export type { RequestedReturnLineItemInput };
