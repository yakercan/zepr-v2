import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

/**
 * Validate the env schema at boot so a misconfigured deploy fails
 * loudly at `next build` rather than later at first request. The
 * import has the side-effect of running the Zod schema.
 */
import "./src/env";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Cache Components (`'use cache'` directive + cacheLife / cacheTag) is
   * intentionally NOT enabled here. With cacheComponents on, every
   * dynamic data read (cookies, headers) must be wrapped in Suspense
   * so the static shell can stream first — which conflicts with our
   * SSR device gate that needs `<html data-device>` set before paint.
   *
   * Instead we get the same first-paint speed via the simpler
   * Next.js data cache: each `fetch(..., { next: { revalidate } })`
   * inside `shopifyFetch` caches at the edge, and PDP / collection
   * routes opt into build-time prerender via `generateStaticParams`.
   * The cookie-reading layout stays normal; the heavy page content
   * is cached HTML.
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
