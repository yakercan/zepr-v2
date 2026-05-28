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
  domain: "zepr.com",
  shopifyDomain: env.SHOPIFY_STOREFRONT_DOMAIN,
  checkoutDomain: env.SHOPIFY_CHECKOUT_DOMAIN ?? "checkout.zepr.com",
  themeColor: "#f65f14",
} as const;

export type SiteConfig = typeof site;
