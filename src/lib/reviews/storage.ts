import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/env";

/**
 * Supabase Storage helpers for review media.
 *
 * The legacy storefront uploads through `@supabase/supabase-js`,
 * but v2 talks to Supabase entirely via REST — same approach as
 * `providers/supabase.ts` — so we don't pull in 200 KB of SDK
 * for two endpoints. The two operations we need:
 *
 *   - **Upload** one file (photo or video) and return its public
 *     URL. Path is `{uuid}_{sanitised-filename}`, same shape the
 *     legacy code used so the existing CDN cache key conventions
 *     keep working.
 *   - **Remove** a batch of objects by public URL — review delete
 *     extracts the storage paths from the URLs stored on the row
 *     and hands them here.
 *
 * Bucket: `image_review` (legacy name; despite the name it stores
 * videos too — extension on the path tells the consumer).
 *
 * Auth: service-role key. The bucket's RLS denies anon writes
 * (legacy intent) — server context only.
 */

const BUCKET = "image_review";

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
 * Upload one review attachment to the `image_review` bucket and
 * return its public URL.
 *
 * Returns `null` on any failure path (missing env, upload error,
 * URL resolution error). Caller filters nulls before persisting
 * the row — partial uploads land as "review without that one
 * image", which beats failing the whole submission.
 */
export async function uploadReviewMedia(file: File): Promise<string | null> {
  const deps = readDeps();
  if (!deps) {
    console.warn("[reviews/storage] missing SUPABASE_URL / SERVICE_ROLE_KEY");
    return null;
  }

  /* Sanitise the filename — Supabase's storage path grammar
   * rejects whitespace and a handful of punctuation marks. The
   * UUID prefix guarantees uniqueness even when two shoppers
   * upload identically-named files in the same second. */
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const path = `${randomUUID()}_${safeName}`;

  const uploadUrl = `${deps.baseUrl}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`;

  try {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.serviceRoleKey}`,
        "Content-Type": file.type || "application/octet-stream",
        /* `cache-control` is what Supabase forwards to the CDN's
         *  `Cache-Control` header. One day is a sane mid-range:
         *  long enough that re-renders don't refetch the same
         *  image, short enough that a future re-upload-by-name
         *  (won't happen here thanks to the UUID prefix, but
         *  belt-and-braces) wouldn't get pinned forever. */
        "Cache-Control": "max-age=86400",
        /* `x-upsert: false` makes the upload fail on path
         *  collision rather than silently overwriting — the
         *  UUID prefix should make this unreachable, but the
         *  explicit guard makes the contract clear. */
        "x-upsert": "false",
      },
      /* `File` is a `Blob`; `fetch` accepts it as a body
       *  directly and streams the bytes — no base64 round-trip
       *  like the legacy code. */
      body: file,
    });

    if (!res.ok) {
      console.warn(
        `[reviews/storage] upload ${res.status} for ${path}:`,
        await res.text().catch(() => ""),
      );
      return null;
    }
  } catch (err) {
    console.warn(`[reviews/storage] upload failed for ${path}:`, err);
    return null;
  }

  /* Public URL — `image_review` is a public bucket, so this
   * shape is stable and we don't need a signed-URL handshake.
   * If the bucket ever flips private, swap to
   * `/object/sign/...` here and persist the signed URL with
   * a TTL the consumer respects. */
  return `${deps.baseUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}`;
}

/**
 * Best-effort batch-delete the storage objects backing a set of
 * public URLs.
 *
 * Doesn't throw — review row deletion is the source of truth;
 * leaked storage objects are a tolerable failure mode (they
 * cost ~nothing and could be reaped by a future janitor). The
 * row mutation has already committed by the time we get here.
 *
 * Empty / mal-formed URLs are skipped silently.
 */
export async function deleteReviewMedia(
  publicUrls: ReadonlyArray<string>,
): Promise<void> {
  const deps = readDeps();
  if (!deps) return;

  /* Extract the storage path (`{uuid}_{name}`) from each public
   * URL. Anything that doesn't match the public-URL shape is
   * dropped — defensive parse, no crash on schema drift. */
  const prefix = `/storage/v1/object/public/${BUCKET}/`;
  const paths = publicUrls
    .map((url) => {
      const i = url.indexOf(prefix);
      if (i === -1) return null;
      return decodeURIComponent(url.slice(i + prefix.length));
    })
    .filter((p): p is string => p !== null && p.length > 0);

  if (paths.length === 0) return;

  try {
    const res = await fetch(`${deps.baseUrl}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${deps.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) {
      console.warn(
        `[reviews/storage] batch delete ${res.status}:`,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.warn("[reviews/storage] batch delete failed:", err);
  }
}
