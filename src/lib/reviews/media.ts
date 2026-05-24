/**
 * Review media — what a single attachment on a review looks like
 * after we've inspected the URL and decided whether it's an image
 * or a video.
 *
 * The provider barrier stores attachments as a flat array of
 * public URLs (Supabase storage, Judge.me CDN, whatever the
 * active provider hands back). The storefront UI, however, has
 * to render images and videos very differently — thumbnail
 * markup, lightbox markup, even the `<video>` `<source>` mime
 * type — so we infer the kind once at the parsing boundary and
 * never let raw strings reach the UI.
 *
 * Kind inference is extension-based:
 *
 *     .mp4 .m4v .mov         → video/mp4
 *     .webm                  → video/webm
 *     .ogv .ogg              → video/ogg
 *     everything else        → image
 *
 * Querystrings (`...mp4?token=…`) are tolerated by the regex —
 * Supabase signed URLs append one and we still want the kind
 * detection to win. URLs without a recognisable extension fall
 * through to "image" which is the safer default (a broken
 * `<img>` is more debuggable than a broken `<video>`).
 */

export type ReviewMediaKind = "image" | "video";

export interface ReviewMedia {
  kind: ReviewMediaKind;
  url: string;
  /** Pre-resolved mime type for videos so the `<source>` element
   *  can hand the browser an exact type without re-sniffing the
   *  extension on render. Absent for images. */
  mimeType?: string;
}

const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|ogv|ogg)(?:\?|#|$)/i;

/**
 * Normalise a raw `string[]` of attachment URLs into typed
 * `ReviewMedia[]`. Filters out empties + non-strings up front
 * so the rest of the pipeline doesn't have to.
 */
export function parseReviewMedia(
  urls: ReadonlyArray<unknown>,
): ReviewMedia[] {
  return urls
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .map(toReviewMedia);
}

function toReviewMedia(url: string): ReviewMedia {
  const match = url.match(VIDEO_EXT_RE);
  if (!match) return { kind: "image", url };
  return { kind: "video", url, mimeType: mimeFromExt(match[1].toLowerCase()) };
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case "mp4":
    case "m4v":
    case "mov":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "ogv":
    case "ogg":
      return "video/ogg";
    default:
      return "video/mp4";
  }
}
