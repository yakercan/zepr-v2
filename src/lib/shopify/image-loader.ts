import type { ImageLoaderProps } from "next/image";

/**
 * `next/image` loader that offloads resizing to Shopify's image CDN
 * instead of Vercel's metered optimizer (`/_next/image`).
 *
 * Why: Shopify Files CDN (`cdn.shopify.com`) already resizes on the
 * fly via the `width` query param and negotiates WebP/AVIF from the
 * request's `Accept` header — the same CDN Shopify's own checkout and
 * Hydrogen use. Routing `<Image>` through it means product imagery
 * never counts against Vercel's Image Optimization quota (the source
 * of the `402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` we hit), with
 * no extra hop — the browser fetches the already-sized asset directly
 * from Shopify's edge.
 *
 * `next/image` calls this once per srcSet candidate width, so the
 * responsive `srcset` / `sizes` / lazy-loading behaviour is unchanged
 * — only the URL each candidate points at differs. Quality is omitted
 * deliberately: Shopify's CDN auto-optimises and exposes no quality
 * knob on this endpoint.
 *
 * Defensive: a non-Shopify or unparseable `src` is returned verbatim
 * so the loader is a safe no-op if ever pointed at another host.
 */
export function shopifyImageLoader({ src, width }: ImageLoaderProps): string {
  try {
    const url = new URL(src);
    if (
      url.hostname === "cdn.shopify.com" ||
      url.hostname.endsWith(".myshopify.com")
    ) {
      url.searchParams.set("width", String(width));
      return url.toString();
    }
    return src;
  } catch {
    return src;
  }
}
