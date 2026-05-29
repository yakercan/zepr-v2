import { env } from "@/env";

/**
 * Single source of truth for site-wide identity. Anything that needs
 * the brand name, tagline, social card copy, or canonical domain
 * should import from here so we never end up with two definitions
 * drifting apart.
 */
export const site = {
  name: "Zepr",
  tagline: "Shop Trends & Explore Deals.",
  description:
    "Discover innovative, trending products. Bundle deals, viral favorites, and a faster way to shop.",
  /** Canonical public storefront host. Drives `metadataBase`
   *  (canonical + OG URLs) and is kept in lock-step with `APP_URL`
   *  so SEO and OAuth redirects agree on one host. We standardise on
   *  `www`; the apex 301-redirects to it at the edge. */
  domain: "www.zepr.com",
  shopifyDomain: env.SHOPIFY_STOREFRONT_DOMAIN,
  checkoutDomain: env.SHOPIFY_CHECKOUT_DOMAIN ?? "checkout.zepr.com",
  /** Apex the Shopify analytics visitor/session cookies are scoped
   *  to, so the same `_shopify_y` / `_shopify_s` pair travels from
   *  the storefront (`www.zepr.com`) to the Shopify-hosted checkout
   *  (`checkout.zepr.com`). An apex domain is readable by every
   *  subdomain; without it the cookies go host-only and Admin
   *  Analytics can't stitch pre-checkout sessions to conversions. */
  cookieDomain: "zepr.com",
  themeColor: "#f65f14",
} as const;

export type SiteConfig = typeof site;
