import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/structured-data";

/**
 * `/robots.txt` — global crawl rules.
 *
 * Allow everything by default; `Disallow` only the surfaces that
 * are per-shopper, auth-gated, or pure machinery (no public,
 * rankable content). Indexable-but-not-crawl-worthy pages (legal,
 * cart) additionally carry a `noindex` meta via their own
 * `metadata.robots` — robots.txt governs *crawling*, the meta tag
 * governs *indexing*, and we want both signals aligned.
 *
 * Note we deliberately do NOT disallow `/search`: marketplace-style
 * query landing pages are something we want crawled and indexed
 * (see the page's `robots: { index: true }`).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account", // auth-gated dashboard + sub-pages
        "/cart", // per-shopper
        "/favorites", // auth-gated wishlist
        "/api/", // route handlers, never a page
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
