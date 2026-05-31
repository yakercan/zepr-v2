import { NextResponse } from "next/server";

import { SHORTCODE_REDIRECTS } from "@/lib/shortcodes";

/**
 * `GET /api/platform-shortcode-redirects`
 *
 * Salespace's marketing pipeline (boost-post / meta sync) polls
 * this once an hour, does a full TRUNCATE + INSERT of its
 * `shortcode_redirects` table from the response, then joins
 * `shortcode_redirects.handle = products.handle` to resolve each
 * code to a live product. A non-200 (or a throw) makes Salespace
 * keep its stale map — so this route's only jobs are: always 200,
 * always valid JSON, fast.
 *
 * Single source of truth: the body is derived straight from
 * `SHORTCODE_REDIRECTS` (the same map that powers the
 * `zepr.com/<code>` → PDP 308 redirects in `next.config.ts`), so
 * the public redirect and Salespace's view can never drift. Add a
 * code in one place and both the redirect and this feed update
 * together.
 *
 * Contract (enforced by Salespace's `fetchZeprShortcodes`):
 *
 *   { "redirects": [ { "code": "124", "path": "/products/<handle>" }, … ] }
 *
 *   - `code`  — `[a-zA-Z0-9][a-zA-Z0-9-]*`. The shortcode after
 *     `zepr.com/`. Primary key; first occurrence wins on dupes
 *     (object keys are already unique, so this is automatic).
 *   - `path`  — must be exactly `/products/<handle>`; anything
 *     else is silently dropped. The `<handle>` must match the live
 *     Shopify handle byte-for-byte or Salespace's join yields a
 *     null product.
 *   - `shortUrl` / `fullUrl` — intentionally omitted. They're
 *     optional and Salespace derives the canonical
 *     `https://zepr.com/<code>` / `https://zepr.com<path>` itself,
 *     so emitting them here would only risk a www / non-www drift.
 *
 * Empty state (`{ "redirects": [] }`) is valid.
 */

/** A `/products/<handle>` path: `/products/` + one handle segment
 *  (lowercase alphanumeric + hyphens, Shopify's handle alphabet),
 *  no trailing or nested slashes. Non-product shortcodes, if any
 *  ever land in the map, are dropped to satisfy the contract. */
const PRODUCT_PATH = /^\/products\/[a-z0-9][a-z0-9-]*$/i;

/** A valid shortcode key per Salespace's rule. */
const VALID_CODE = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

interface ShortcodeRedirect {
  code: string;
  path: string;
}

export function GET() {
  const redirects: ShortcodeRedirect[] = Object.entries(SHORTCODE_REDIRECTS)
    .filter(([code, path]) => VALID_CODE.test(code) && PRODUCT_PATH.test(path))
    .map(([code, path]) => ({ code, path }));

  return NextResponse.json(
    { redirects },
    {
      headers: {
        /* Tiny, deploy-static payload. Cache at the CDN for a few
         * minutes so Salespace's hourly poll (and any ad-hoc curl)
         * is instant; `stale-while-revalidate` keeps it serving
         * even while a fresh copy is fetched after a deploy. */
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
