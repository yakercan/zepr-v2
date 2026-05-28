import "server-only";

import { resolveLegalDisclaimerHtml } from "@/lib/legal/disclaimers";
import { parseOffersMetafield, productIdToGid } from "@/lib/offers";
import { shopifyFetch } from "@/lib/shopify/client";
import type {
  CompanionProduct,
  ProductDetail,
  ProductImage,
  ProductMedia,
  ProductOption,
  ProductVariant,
} from "@/types/product";

/**
 * Shopify Storefront product fetcher — single source of truth for
 * "give me the product behind handle X".
 *
 * Round 1: minimum hero data only — id, title, vendor, hero image,
 * price + compare-at range, in-stock flag. The query body is
 * intentionally tiny so the response is small (and fast) until we
 * actually need richer fields. Each subsequent PDP round adds one
 * fragment to the query and one mapping line in `normaliseProduct`.
 *
 * Caching: 1-hour revalidation matches the page's `revalidate`
 * export. Tagged `product:${handle}` so a future `revalidateTag()`
 * call (admin webhook, manual purge) can invalidate one product
 * without sweeping every page.
 */

const PRODUCT_BY_HANDLE_QUERY = /* GraphQL */ `
  query Product($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      vendor
      descriptionHtml
      availableForSale
      tags
      collections(first: 1) {
        nodes {
          handle
          title
        }
      }
      featuredImage {
        url
        altText
        width
        height
      }
      media(first: 50) {
        nodes {
          id
          mediaContentType
          ... on MediaImage {
            image {
              url
              altText
              width
              height
            }
          }
          ... on Video {
            sources {
              url
              mimeType
            }
            previewImage {
              url
              altText
              width
              height
            }
          }
        }
      }
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
      compareAtPriceRange {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
      options {
        name
        values
      }
      variants(first: 100) {
        nodes {
          id
          title
          availableForSale
          selectedOptions {
            name
            value
          }
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          image {
            url
            altText
            width
            height
          }
        }
      }
      deliveryTime: metafield(namespace: "custom", key: "delivery_time") {
        value
      }
      offers: metafield(namespace: "custom", key: "offers") {
        value
      }
      legalDisclaimer: metafield(namespace: "custom", key: "legal_disclaimer") {
        value
      }
      sizeInches: metafield(namespace: "custom", key: "size_inches") {
        value
      }
      sizeCm: metafield(namespace: "custom", key: "size_cm") {
        value
      }
    }
  }
`;

/* ---------- Wire shape (matches the GraphQL response exactly) -------- */

interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

interface RawImage {
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

type RawMediaContentType =
  | "IMAGE"
  | "VIDEO"
  | "EXTERNAL_VIDEO"
  | "MODEL_3D";

interface RawMediaNode {
  id: string;
  mediaContentType: RawMediaContentType;
  /** Present on MediaImage. */
  image?: RawImage | null;
  /** Present on Video. */
  sources?: { url: string; mimeType: string }[];
  previewImage?: RawImage | null;
}

interface RawSelectedOption {
  name: string;
  value: string;
}

interface RawVariantNode {
  id: string;
  title: string;
  availableForSale: boolean;
  selectedOptions: RawSelectedOption[];
  price: MoneyV2;
  compareAtPrice: MoneyV2 | null;
  image: RawImage | null;
}

interface RawOption {
  name: string;
  values: string[];
}

interface RawProduct {
  id: string;
  handle: string;
  title: string;
  vendor: string | null;
  descriptionHtml: string | null;
  availableForSale: boolean;
  tags: string[];
  collections: {
    nodes: { handle: string; title: string }[];
  };
  featuredImage: RawImage | null;
  media: {
    nodes: RawMediaNode[];
  };
  priceRange: {
    minVariantPrice: MoneyV2;
    maxVariantPrice: MoneyV2;
  };
  compareAtPriceRange: {
    minVariantPrice: MoneyV2;
    maxVariantPrice: MoneyV2;
  };
  options: RawOption[];
  variants: {
    nodes: RawVariantNode[];
  };
  /** `custom.delivery_time` metafield — a free-text "min-max"
   *  day range like `"7-14"`. Shopify returns `null` when the
   *  metafield isn't set on this product. */
  deliveryTime: { value: string } | null;
  /** `custom.offers` metafield — drives the tiered-offers picker.
   *  Free-text value normalised in `parseOffersMetafield`; see
   *  `lib/offers.ts` for the recognised shapes. */
  offers: { value: string } | null;
  /** `custom.legal_disclaimer` metafield — the merchant flag /
   *  category selector that drives the PDP Disclaimer section.
   *  Raw text is never rendered; `resolveLegalDisclaimerHtml`
   *  picks a hardcoded HTML body off this value's leading text.
   *  Null when the section should be hidden. */
  legalDisclaimer: { value: string } | null;
  /** `custom.size_inches` / `custom.size_cm` metafields — raw
   *  pipe-delimited, newline-rowed size charts. Either or both
   *  may be `null` when the merchant hasn't filled in that
   *  unit. Parsing lives in `lib/size-chart.ts`. */
  sizeInches: { value: string } | null;
  sizeCm: { value: string } | null;
}

interface ProductByHandleResponse {
  product: RawProduct | null;
}

/* -------------------- Public API -------------------- */

/**
 * Fetch one product by its handle.
 *
 * Returns `null` for unknown handles so callers can branch into
 * `notFound()` cleanly. Network failures bubble up — the route
 * boundary can either render an error UI or rely on Next's default
 * `error.tsx`.
 */
export async function getProductByHandle(
  handle: string,
): Promise<ProductDetail | null> {
  const data = await shopifyFetch<ProductByHandleResponse>(
    PRODUCT_BY_HANDLE_QUERY,
    { handle },
    {
      revalidate: 3600,
      tags: [`product:${handle}`],
    },
  );

  if (!data.product) return null;
  return normaliseProduct(data.product);
}

/* ---------- Companion products (tiered-offers bundle slots) ---------- */

const COMPANION_PRODUCTS_QUERY = /* GraphQL */ `
  query CompanionProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        handle
        title
        availableForSale
        featuredImage {
          url
          altText
          width
          height
        }
        options {
          name
          values
        }
        variants(first: 100) {
          nodes {
            id
            title
            availableForSale
            selectedOptions {
              name
              value
            }
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            image {
              url
              altText
              width
              height
            }
          }
        }
      }
    }
  }
`;

interface RawCompanionNode {
  id?: string;
  handle?: string;
  title?: string;
  availableForSale?: boolean;
  featuredImage?: RawImage | null;
  options?: RawOption[];
  variants?: { nodes: RawVariantNode[] };
}

interface CompanionProductsResponse {
  nodes: Array<RawCompanionNode | null>;
}

/**
 * Fetch the companion products listed by a PDP's `custom.offers`
 * metafield — the bundle pairings that fill slots 1..N of the
 * tiered-offers tiles when the merchant configured them.
 *
 * Inputs are the raw numeric product ids parsed off the metafield
 * (`ParsedOffers.bundleCompanionIds`). Output preserves the input
 * ordering and uses `null` for ids whose lookup failed (deleted,
 * unavailable, network glitch) — the PDP layer treats a `null`
 * slot as "anchor for this position" so the picker still renders
 * cleanly without the bundle pairing.
 *
 * Single Storefront round-trip via `nodes(ids: [...])` — Shopify's
 * batch resolver fetches every companion in parallel server-side
 * so the loader's critical path adds one round-trip total, not
 * one per companion.
 */
export async function getCompanionProducts(
  numericIds: ReadonlyArray<string>,
): Promise<Array<CompanionProduct | null>> {
  if (numericIds.length === 0) return [];
  const gids = numericIds.map(productIdToGid);
  const data = await shopifyFetch<CompanionProductsResponse>(
    COMPANION_PRODUCTS_QUERY,
    { ids: gids },
    {
      revalidate: 3600,
      /* Same tag namespace as the anchor fetcher so a single
       * `revalidateTag("product:<id>")` purges this companion
       * wherever it's been cached, without having to know
       * which PDPs surfaced it. */
      tags: numericIds.map((id) => `product:${id}`),
    },
  );

  return (data.nodes ?? []).map((node) => normaliseCompanion(node));
}

function normaliseCompanion(
  raw: RawCompanionNode | null,
): CompanionProduct | null {
  if (!raw?.id || !raw.handle || !raw.title) return null;
  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    availableForSale: raw.availableForSale ?? true,
    featuredImage: normaliseImage(raw.featuredImage ?? null),
    options: parseOptions(raw.options ?? []),
    variants: parseVariants(raw.variants?.nodes ?? []),
  };
}

/* -------------------- Internals -------------------- */

/**
 * Convert a Shopify `MoneyV2` decimal string to integer cents.
 * Storefront returns strings like `"12.99"` — `parseFloat` + `*100`
 * + `Math.round` is the canonical safe path (it sidesteps the
 * `12.99 * 100 = 1298.9999…` float drift you'd hit with a naive
 * cast). Returns `0` for the rare missing field.
 */
function toCents(money: MoneyV2 | null | undefined): number {
  if (!money?.amount) return 0;
  return Math.round(parseFloat(money.amount) * 100);
}

function normaliseImage(raw: RawImage | null): ProductImage | null {
  if (!raw) return null;
  return {
    url: raw.url,
    altText: raw.altText,
    width: raw.width,
    height: raw.height,
  };
}

/**
 * Pull a subcategory label from the product's tags.
 *
 * Legacy convention (carried forward from the original storefront):
 * a tag like `subcategory:Bedding` carries the subcategory name.
 * Returns the first match, or `undefined` if no such tag is set.
 */
function extractSubcategory(tags: string[]): string | undefined {
  const SUBCATEGORY_PREFIX = "subcategory:";
  const tag = tags.find((t) => t.startsWith(SUBCATEGORY_PREFIX));
  return tag ? tag.slice(SUBCATEGORY_PREFIX.length).trim() : undefined;
}

/**
 * Project Shopify's polymorphic Media union into our flat
 * `ProductMedia` shape. Image and Video kinds are surfaced;
 * Model3D / ExternalVideo are skipped (no storefront consumer
 * for them yet, and admitting them silently would mean the
 * gallery has to grow a "?" branch). We log them in dev so it's
 * obvious when a product starts using those types.
 */
function parseMedia(nodes: RawMediaNode[]): ProductMedia[] {
  const out: ProductMedia[] = [];
  for (const node of nodes) {
    if (node.mediaContentType === "IMAGE" && node.image) {
      out.push({
        id: node.id,
        kind: "image",
        preview: normaliseImage(node.image)!,
      });
    } else if (
      node.mediaContentType === "VIDEO" &&
      node.sources?.length &&
      node.previewImage
    ) {
      out.push({
        id: node.id,
        kind: "video",
        preview: normaliseImage(node.previewImage)!,
        videoSources: node.sources,
      });
    } else if (process.env.NODE_ENV === "development") {
      console.warn(
        `[shopify] unsupported media type "${node.mediaContentType}" skipped`,
      );
    }
  }
  return out;
}

/**
 * Project Shopify's options + variants into our flat shape.
 *
 * Shopify always returns a synthetic "Title" option with a single
 * "Default Title" value for products that don't actually have
 * options. We strip it here so consumers can treat an empty
 * `options` array as "no picker needed" without re-checking for
 * the placeholder.
 *
 * Variant compare-at follows the same "drop zero/placeholder"
 * rule as the price-range above — Shopify sometimes returns a
 * compareAtPrice of `"0.0"` rather than `null`, and we don't want
 * a phantom strike-through on the PDP.
 */
function parseVariants(nodes: RawVariantNode[]): ProductVariant[] {
  return nodes.map((node) => {
    const priceCents = toCents(node.price);
    const compareAt = node.compareAtPrice;
    const compareAtCents = compareAt ? toCents(compareAt) : 0;
    return {
      id: node.id,
      title: node.title,
      availableForSale: node.availableForSale,
      /* Shopify's synthetic `Title: Default Title` placeholder
       * lives on single-variant products' `selectedOptions` as
       * well as on the product-level option list — `parseOptions`
       * strips it from the option list, mirror that here so the
       * variantTitle composed for cart lines (`Name: Value / …`)
       * doesn't echo "Title: Default Title" in the drawer. */
      selectedOptions: node.selectedOptions
        .filter(
          (o) => !(o.name === "Title" && o.value === "Default Title"),
        )
        .map((o) => ({
          name: o.name,
          value: o.value,
        })),
      priceCents,
      compareAtCents:
        compareAtCents > 0 && compareAtCents > priceCents
          ? compareAtCents
          : undefined,
      image: normaliseImage(node.image) ?? undefined,
    };
  });
}

function parseOptions(rawOptions: RawOption[]): ProductOption[] {
  return rawOptions
    .filter(
      (o) =>
        !(o.name === "Title" && o.values.length === 1 && o.values[0] === "Default Title"),
    )
    .map((o) => ({ name: o.name, values: o.values }));
}

function normaliseProduct(raw: RawProduct): ProductDetail {
  const priceMinCents = toCents(raw.priceRange.minVariantPrice);
  const priceMaxCents = toCents(raw.priceRange.maxVariantPrice);

  const compareMinCents = toCents(raw.compareAtPriceRange.minVariantPrice);
  const compareMaxCents = toCents(raw.compareAtPriceRange.maxVariantPrice);
  /* Shopify always returns a `compareAtPriceRange` object — even
   * when the product has no compare-at set, in which case both
   * sides are `"0.0"`. Treat any zero side as "no compare-at" so
   * the PDP's strike-through only renders for genuine discounts. */
  const hasCompareAt = compareMinCents > 0 && compareMaxCents > 0;

  const primaryCollection = raw.collections.nodes[0]
    ? {
        handle: raw.collections.nodes[0].handle,
        title: raw.collections.nodes[0].title,
      }
    : undefined;

  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    vendor: raw.vendor || undefined,
    descriptionHtml: raw.descriptionHtml ?? "",
    primaryCollection,
    subcategory: extractSubcategory(raw.tags),
    availableForSale: raw.availableForSale,
    featuredImage: normaliseImage(raw.featuredImage),
    media: parseMedia(raw.media.nodes),
    options: parseOptions(raw.options),
    variants: parseVariants(raw.variants.nodes),
    deliveryTime: raw.deliveryTime?.value?.trim() || undefined,
    /* Carry the raw size-chart strings through unchanged —
     * parsing is the modal's job. Collapse to `undefined` when
     * both sides are empty so the variant picker's
     * `hasSizeChart()` gate reads as a clean nullish check. */
    sizeChart:
      raw.sizeInches?.value?.trim() || raw.sizeCm?.value?.trim()
        ? {
            inches: raw.sizeInches?.value ?? null,
            cm: raw.sizeCm?.value ?? null,
          }
        : undefined,
    offers: parseOffersMetafield(raw.offers?.value),
    /* Resolve to HTML at the fetcher boundary so the PDP route
     * just renders the result through `<RichText>`. The resolver
     * is server-only — the legalese constants live in
     * `lib/legal/disclaimers.ts` and never leak into the client
     * bundle; only the resolved HTML rides the RSC payload, the
     * same way `descriptionHtml` does today. */
    legalDisclaimerHtml:
      resolveLegalDisclaimerHtml(raw.legalDisclaimer?.value) ?? undefined,
    /* Hydrated by the PDP server route (`getCompanionProducts`)
     * after the anchor product lands; the fetcher leaves it
     * empty so callers that don't care about bundles (modal
     * preview, cart card, etc.) skip the companion fetch
     * entirely. */
    bundleCompanions: [],
    priceMinCents,
    priceMaxCents,
    compareAtMinCents: hasCompareAt ? compareMinCents : undefined,
    compareAtMaxCents: hasCompareAt ? compareMaxCents : undefined,
    currency: raw.priceRange.minVariantPrice.currencyCode,
  };
}
