import { DEFAULT_CATEGORIES } from "@/config/categories";
import { site } from "@/config/site";
import type { JsonLdNode } from "@/lib/seo/json-ld";
import type { ProductDetail } from "@/types/product";

/**
 * Structured-data (JSON-LD) builders — the schema.org graph the
 * storefront feeds to Google. Ported from the legacy storefront's
 * `app/lib/seo.server.ts` and reshaped into plain builder functions
 * that pair with `<JsonLd>`. Every URL is absolute (schema.org wants
 * fully-qualified URLs, unlike Next's `metadata` which resolves
 * relative paths against `metadataBase`).
 */

/** Canonical origin, e.g. `https://www.zepr.com`. The single base all
 *  absolute SEO URLs derive from. */
export const SITE_URL = `https://${site.domain}`;

/** Resolve an app-relative path to an absolute storefront URL.
 *  Pass-through for values that are already absolute. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

const CONTEXT = "https://schema.org" as const;

/**
 * `Organization` — the brand identity node. Rendered once in the
 * root layout so it's present on every page. `sameAs` ties the
 * storefront to its social profiles in Google's Knowledge Graph.
 */
export function organizationSchema(): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    name: site.name,
    alternateName: `${site.name}.com`,
    url: SITE_URL,
    logo: absoluteUrl(site.logoPath),
    sameAs: [...site.social],
  };
}

/**
 * `WebSite` + `SearchAction` — enables Google's sitelinks search box
 * (a search field rendered directly in the brand's search result).
 * Home-page only; the `urlTemplate` points at our real, now-indexed
 * `/search?q=` surface.
 */
export function websiteSchema(): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    name: site.name,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * `ItemList` of top-level `SiteNavigationElement`s — the main
 * category nav, surfaced so Google can render category sitelinks
 * under the brand result. Built from the static category list (no
 * fetch) so the home page stays render-cheap; a "Search" entry leads
 * the list to match the legacy storefront.
 */
export function siteNavigationSchema(): JsonLdNode {
  const items = [
    {
      "@type": "SiteNavigationElement",
      position: 1,
      name: "Search",
      url: `${SITE_URL}/search`,
    },
    ...DEFAULT_CATEGORIES.map((category, index) => ({
      "@type": "SiteNavigationElement",
      position: index + 2,
      name: category.name,
      url: `${SITE_URL}/categories/${category.handle}`,
    })),
  ];
  return {
    "@context": CONTEXT,
    "@type": "ItemList",
    name: "Main Navigation",
    itemListElement: items,
  };
}

/** One step in a breadcrumb trail. The final crumb (current page)
 *  conventionally omits `url`. */
export interface BreadcrumbStep {
  name: string;
  url?: string;
}

/**
 * `BreadcrumbList` — the trail Google renders in place of the raw
 * URL in a result. Accepts the same crumb data the on-page
 * `<Breadcrumb>` renders, so the visible trail and the structured
 * one can't disagree.
 */
export function breadcrumbSchema(steps: BreadcrumbStep[]): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: steps.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      ...(step.url ? { item: absoluteUrl(step.url) } : {}),
    })),
  };
}

/**
 * `Product` — the rich-result powerhouse: price, availability,
 * brand, images, and (when the page shows reviews) an
 * `aggregateRating` for star snippets. Offers collapse to a single
 * `Offer` for fixed-price products and an `AggregateOffer`
 * (low/high band) for multi-variant ones, matching what the PDP
 * actually displays.
 *
 * `aggregateRating` is only included when `ratingCount > 0` — Google
 * requires review structured data to reflect reviews genuinely
 * visible on the page, which the PDP's Reviews accordion satisfies.
 */
export function productSchema({
  product,
  ratingValue,
  ratingCount,
}: {
  product: ProductDetail;
  ratingValue?: number;
  ratingCount?: number;
}): JsonLdNode {
  const url = absoluteUrl(`/products/${product.handle}`);
  const images = product.media
    .filter((m) => m.kind === "image")
    .map((m) => m.preview.url);
  const image = images.length
    ? images
    : product.featuredImage
      ? [product.featuredImage.url]
      : [];

  const availability = product.availableForSale
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  const offers =
    product.priceMinCents === product.priceMaxCents
      ? {
          "@type": "Offer",
          price: (product.priceMinCents / 100).toFixed(2),
          priceCurrency: product.currency,
          availability,
          url,
        }
      : {
          "@type": "AggregateOffer",
          lowPrice: (product.priceMinCents / 100).toFixed(2),
          highPrice: (product.priceMaxCents / 100).toFixed(2),
          priceCurrency: product.currency,
          offerCount: product.variants.length,
          availability,
          url,
        };

  return {
    "@context": CONTEXT,
    "@type": "Product",
    name: product.title,
    description: plainText(product.descriptionHtml),
    ...(image.length ? { image } : {}),
    ...(product.vendor
      ? { brand: { "@type": "Brand", name: product.vendor } }
      : {}),
    offers,
    url,
    ...(ratingCount && ratingCount > 0 && ratingValue
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingValue.toFixed(1),
            reviewCount: ratingCount,
          },
        }
      : {}),
  };
}

/**
 * `CollectionPage` — the schema counterpart of a category landing
 * page. Lightweight on purpose (name + description + url); the
 * product links themselves carry their own `Product` schema on their
 * PDPs, so we don't duplicate an `ItemList` of the grid here.
 */
export function collectionPageSchema({
  name,
  description,
  path,
  image,
}: {
  name: string;
  description: string;
  path: string;
  image?: string | null;
}): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "CollectionPage",
    name,
    description,
    url: absoluteUrl(path),
    ...(image ? { image: absoluteUrl(image) } : {}),
  };
}

/**
 * Strip HTML to a plain, single-line, length-capped string for use
 * in `description` fields (both `<meta>` and JSON-LD). Mirrors the
 * legacy storefront's `truncate(…, 155)`. Entities the admin editor
 * commonly emits are decoded so descriptions read cleanly.
 */
export function plainText(html: string | undefined, max = 155): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
