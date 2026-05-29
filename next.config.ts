import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

/**
 * Validate the env schema at boot so a misconfigured deploy fails
 * loudly at `next build` rather than later at first request. The
 * import has the side-effect of running the Zod schema.
 */
import "./src/env";

import { LEGACY_REDIRECTS, SHORTCODE_REDIRECTS } from "./src/lib/shortcodes";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Hosts allowed to load dev-server resources (HMR sockets,
   * `/_next/*` chunks). Production builds ignore this — it only
   * affects `next dev`. `localhost` is allowed by default, so we
   * only need to add the Cloudflare-tunnel hostname we develop
   * through. Safe to leave forever: a dev-only allowlist can't
   * widen anything at runtime.
   */
  allowedDevOrigins: ["dev.zepr.com"],

  /**
   * Cache Components (`'use cache'` directive + cacheLife / cacheTag) is
   * intentionally NOT enabled here yet. Turning `cacheComponents: true`
   * on forces every dynamic read (cookies, headers) into a Suspense
   * boundary so the static shell can stream first. The root layout no
   * longer does any per-request reads (device is resolved from the
   * viewport in CSS + a client matchMedia hook), so that former blocker
   * is gone — but the dynamic reads still living in `SiteHeader` (auth /
   * cart / taxonomy) would each need a Suspense fence before flipping
   * the flag, so this stays a deliberate, separate migration.
   *
   * Until then, our caching story is the simpler `fetch()`-level
   * one: every Shopify Storefront, Salespace, and Supabase read
   * goes through `next: { revalidate, tags }`, so the upstream
   * round-trips are cached at the edge and per-request rendering
   * cost is mostly JSON-to-HTML transform. Routes render
   * dynamically so `<Suspense>` actually streams (static / ISR
   * pages resolve Suspense at render time and emit complete
   * HTML — useless for "shell first, dynamic hole streams in"
   * UX). `generateStaticParams` on the top-traffic PDP / category
   * handles is the next optimisation pass once we have analytics
   * to seed the list.
   */

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com", pathname: "/s/files/**" },
      { protocol: "https", hostname: "**.myshopify.com" },
      { protocol: "https", hostname: "cdn.salespace.com" },
      /* Supabase public storage — user-uploaded review photos
       * served straight from the storage CDN. Scoped to the
       * public objects path so the optimizer never proxies the
       * authenticated REST surface. */
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  experimental: {
    optimizePackageImports: ["clsx", "tailwind-merge"],

    /**
     * Review submission ships up to 5 attachments of mixed photos
     * (10 MB cap each) and videos (50 MB cap each) through a Server
     * Action. Default body limits chokes that on two layers, so we
     * lift both:
     *
     *   - `serverActions.bodySizeLimit` — the cap the action itself
     *     enforces. Default 1 MB.
     *   - `proxyClientMaxBodySize` — how much of the request body
     *     the proxy pipeline (proxy.ts) buffers before truncating.
     *     Default 10 MB; truncation here surfaces as a misleading
     *     "Unexpected end of form" at the action. Renamed from
     *     `middlewareClientMaxBodySize` in Next.js 16 — the old
     *     name still works but logs a deprecation warning.
     *
     * Both ceilings are sized to the worst-case payload (5 × 50 MB
     * = 250 MB) with a small headroom for FormData encoding. Per-
     * file size validation still happens in `submitReviewAction`,
     * so these caps only widen the transport pipe — not the policy.
     */
    serverActions: {
      bodySizeLimit: "260mb",
    },
    proxyClientMaxBodySize: "260mb",
  },

  /**
   * Two redirect tables, both compiled into Next's edge redirect
   * layer — the rule fires before any RSC, middleware, or page
   * renders (zero JS per visit) and the original query string
   * survives the hop, so attribution params like `?utm_source=ig`
   * carry through.
   *
   *   - `SHORTCODE_REDIRECTS` — marketing short links (`/101` →
   *     PDP). Source is a bare code, prefixed with `/` here.
   *   - `LEGACY_REDIRECTS`    — legacy Shopify route paths
   *     (`/pages/contact` → `/contact`). Source is already a
   *     full path; passed through verbatim.
   *
   * Both use `permanent: true` (308, the modern equivalent of
   * 301) so search engines coalesce the old URL into the new
   * one and browsers can cache the hop. See `shortcodes.ts` for
   * the "when not to use `permanent: true`" caveat (marketing
   * re-pointings).
   */
  async redirects() {
    return [
      ...Object.entries(SHORTCODE_REDIRECTS).map(([code, destination]) => ({
        source: `/${code}`,
        destination,
        permanent: true,
      })),
      ...Object.entries(LEGACY_REDIRECTS).map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      /**
       * Legacy Shopify collection paths. The old storefront browsed
       * under `/collections/<handle>`; v2 serves the same surface at
       * `/categories/<handle>`. The `:path*` wildcard forwards the
       * whole tail (handle + any nested segments) verbatim and bare
       * `/collections` maps to `/categories` too. Query strings carry
       * through automatically, so filter/sort params survive the hop.
       * Lives here rather than in the exact-match `LEGACY_REDIRECTS`
       * map because that table is deliberately pattern-free.
       */
      {
        source: "/collections/:path*",
        destination: "/categories/:path*",
        permanent: true,
      },
    ];
  },

  /**
   * Baseline security headers. Conservative defaults — they don't
   * break the storefront and they keep us out of trivial-XSS / clickjacking
   * territory. CSP is intentionally omitted here: it's worth wiring
   * once we've finalized which third-party origins (analytics, embeds,
   * iframes) we actually depend on so the policy is tight instead of
   * permissive-by-default.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
