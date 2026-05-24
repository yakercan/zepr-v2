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
   * intentionally NOT enabled here yet. Turning `cacheComponents: true`
   * on forces every dynamic read (cookies, headers) into a Suspense
   * boundary so the static shell can stream first — and the root
   * layout's SSR device gate reads `headers()`/`cookies()` to set
   * `<html data-device>` *before* any Suspense fence can be drawn,
   * which means the layout itself would have to be reshaped before
   * we can flip the flag.
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
