import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductViewTracker } from "@/components/analytics/view-trackers";
import { ProductLayout } from "@/components/products/product-layout";
import { ProductReviews } from "@/components/products/product-reviews";
import { ProductSectionSkeleton } from "@/components/products/product-section";
import { RelatedProductsSection } from "@/components/products/related-products-section";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { RatingChip } from "@/components/ui/rating-chip";
import { RichText } from "@/components/ui/rich-text";
import { site } from "@/config/site";
import { getAuthState } from "@/lib/auth/session";
import { getProductReviews } from "@/lib/reviews";
import { JsonLd } from "@/lib/seo/json-ld";
import {
  breadcrumbSchema,
  plainText,
  productSchema,
  SITE_URL,
} from "@/lib/seo/structured-data";
import { hasPurchasedProduct } from "@/lib/shopify/customer-account-queries";
import {
  getCompanionProducts,
  getProductByHandle,
} from "@/lib/shopify/products";
import type { ProductInput } from "@/types/analytics";
import type { ProductDetail } from "@/types/product";

/**
 * Product Detail Page — Shopify-backed.
 *
 * Layout (lg and up):
 *
 *   ┌───────────────────────────┬──────────────────────┐
 *   │ Gallery                   │  BuyForm  (sticky)   │
 *   │ ─────────                 │  ──────              │
 *   │ Description               │  title + price       │
 *   │  …long content scrolls    │  variants + CTA      │
 *   │                           │   (later rounds)     │
 *   └───────────────────────────┴──────────────────────┘
 *   ┌──────────────────────────────────────────────────┐
 *   │ You may also like (full-width, scrolls naturally) │
 *   └──────────────────────────────────────────────────┘
 *
 * The buy form is `position: sticky` against the grid container.
 * It clings to the top of the viewport (below the header) as the
 * shopper scrolls through the gallery + description, and naturally
 * "unsticks" when the left column ends — at which point the whole
 * page slides up into the related-products rail.
 *
 * Stack below lg — phones and tablets get a single column, no
 * sticking (the buy form is too tall to pin on a narrow viewport).
 *
 * Rendering model — dynamic shell, streaming Suspense holes:
 *
 *   - The page renders per request. There's intentionally no
 *     `export const revalidate` here because Next.js 16 resolves
 *     `<Suspense>` boundaries *at render time* for static / ISR
 *     pages — meaning the "You may also like" fetch would land
 *     in the critical path before the shell could flush. Dynamic
 *     rendering lets each Suspense boundary stream as its own
 *     chunk, so the buy form paints first and the related rail
 *     fills in below as its Salespace round-trip resolves.
 *   - Per-request render cost stays cheap because every upstream
 *     read (`shopifyFetch`, `searchProducts`) caches at the
 *     `fetch()` layer via `next: { revalidate, tags }` — the page
 *     CPU work is mostly transforming already-cached JSON into
 *     HTML, not waiting on the network.
 *   - `generateStaticParams` is the next step for the top-N
 *     handles by traffic — those get build-time prerender + cache
 *     headers so popular PDPs are served from the edge.
 *   - True PPR (`cacheComponents: true` + `"use cache"`) is the
 *     end state once the root-layout device gate can read the
 *     User-Agent without blocking the shell — see the matching
 *     note in `next.config.ts`.
 */

interface ProductPageProps {
  params: Promise<{ handle: string }>;
}

/**
 * Per-product `<head>`: a real title + description (stripped from
 * the admin's rich-text body, length-capped), a canonical pinned to
 * the bare `/products/{handle}` (variant/UTM query params never
 * fork the canonical), and a social card carrying the hero image.
 *
 * Reads the same `cache()`-wrapped product the page body does, so
 * this costs zero extra upstream fetches. Unknown handle → a
 * `noindex` "not found" stub; the body still calls `notFound()`.
 */
export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { handle } = await params;
  const product = await getProductByHandle(handle);
  if (!product) {
    return { title: "Product not found", robots: { index: false } };
  }

  const description =
    plainText(product.descriptionHtml) ||
    `Shop ${product.title} at ${site.name}. Trending products with exclusive bundle deals and free shipping.`;
  const path = `/products/${product.handle}`;
  const image = product.featuredImage?.url;

  return {
    title: product.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title: product.title,
      description,
      url: `${SITE_URL}${path}`,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { handle } = await params;
  const baseProduct = await getProductByHandle(handle);
  if (!baseProduct) notFound();

  /* Auth resolves first — it's a tiny in-process cookie decrypt
   * (no network), and the reviews fetch needs `viewerEmail` to
   * stamp `isOwn: true` on the matching row. After that, the
   * network-bound reads run in parallel so the page pays the
   * slowest of the bunch rather than the sum.
   *
   * `hasPurchasedProduct` is skipped entirely for guests — no
   * point asking the Customer Account API "did this anonymous
   * visitor buy something?" — and the lookup is hard-falsed
   * via a resolved-`false` promise so the `Promise.all` shape
   * stays uniform. */
  const authState = await getAuthState();
  const [bundleCompanions, reviewsSummary, hasPurchased] = await Promise.all([
    getCompanionProducts(baseProduct.offers.bundleCompanionIds),
    getProductReviews(baseProduct.id, authState.customerEmail),
    authState.isLoggedIn
      ? hasPurchasedProduct(baseProduct.id)
      : Promise.resolve(false),
  ]);
  const product: ProductDetail = { ...baseProduct, bundleCompanions };
  const canWriteReview = authState.isLoggedIn && hasPurchased;

  /* Section gate — only render the Reviews accordion when
   * there's something for the shopper to see or do. Signed-in
   * shoppers always see the section (the inner panel decides
   * whether to show a write CTA, an eligibility hint, or just
   * the "already reviewed" acknowledgement); guests only see it
   * when reviews already exist to read, so a fresh product
   * doesn't badger them to sign in for something they may not
   * have bought. Empty `null` summary and `totalCount: 0` are
   * treated identically — see `getProductReviews`'s contract. */
  const reviewsCount = reviewsSummary?.totalCount ?? 0;
  const showReviews = authState.isLoggedIn || reviewsCount > 0;

  const breadcrumbItems = buildBreadcrumb(product);
  const analyticsProduct = toAnalyticsProduct(product);

  return (
    <main className="page-container pt-3 pb-12 md:pt-4">
      <ProductViewTracker product={analyticsProduct} />
      {/* Product rich result (price, availability, brand, hero
          image — plus a star rating when reviews exist) and the
          breadcrumb trail, built from the same data the visible
          UI renders so the structured + on-page views agree. */}
      <JsonLd
        data={[
          productSchema({
            product,
            ratingValue: reviewsSummary?.averageRating,
            ratingCount: reviewsCount,
          }),
          breadcrumbSchema(
            breadcrumbItems.map((item) => ({
              name: item.label,
              url: item.href,
            })),
          ),
        ]}
      />
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      {/* Additional PDP accordion sections drop in here as more
       *  <AccordionItem>s alongside "Details" + "Reviews". Each
       *  one is fetched server-side at the top of the route and
       *  gated by simple booleans so the markup stays a flat
       *  list of conditional `&&` items. */}
      <ProductLayout
        product={product}
        extraLeft={
          <Accordion>
            {product.descriptionHtml && (
              <AccordionItem title="Details" defaultOpen>
                <RichText html={product.descriptionHtml} />
              </AccordionItem>
            )}
            {showReviews && (
              <AccordionItem
                title="Reviews"
                titleAside={
                  reviewsCount > 0 && reviewsSummary ? (
                    <RatingChip
                      value={reviewsSummary.averageRating}
                      count={reviewsCount}
                    />
                  ) : null
                }
              >
                <ProductReviews
                  productId={product.id}
                  productHandle={product.handle}
                  productTitle={product.title}
                  summary={reviewsSummary}
                  authState={authState}
                  canWriteReview={canWriteReview}
                />
              </AccordionItem>
            )}
            {/* Legal disclaimer — last in the stack. Hidden when
             *  the merchant didn't set `custom.legal_disclaimer`
             *  on this product; otherwise the resolver picked
             *  either the cosmetics / wellness default or a
             *  category-specific variant (see
             *  `lib/legal/disclaimers.ts`). Defaults closed so
             *  it doesn't overwhelm the more shopper-relevant
             *  sections above it. */}
            {product.legalDisclaimerHtml && (
              <AccordionItem title="Disclaimer">
                <RichText html={product.legalDisclaimerHtml} />
              </AccordionItem>
            )}
          </Accordion>
        }
      />

      {/* "You may also like" — subcategory + category Salespace
       *  fetch inside <Suspense> so the section streams in below
       *  the fold while the hero stays interactive. Gated on the
       *  product actually belonging to a collection so we don't
       *  flash a skeleton for products that won't render the
       *  section anyway. */}
      {product.primaryCollection && (
        <Suspense
          fallback={
            <ProductSectionSkeleton className="mt-10 md:mt-14" />
          }
        >
          <div className="mt-10 md:mt-14">
            <RelatedProductsSection product={product} />
          </div>
        </Suspense>
      )}
    </main>
  );
}

/**
 * Build the breadcrumb trail from the product's category metadata.
 *
 *     Home → Category → Subcategory → Product
 *
 * Category and subcategory crumbs only render when their data is
 * present on the product (`primaryCollection` and the
 * `subcategory:` tag respectively). The links route into our
 * `/categories/[handle]` shell — for the subcategory step we also
 * pass `?subcategory=…` so the destination opens with that
 * subcategory pre-filtered, matching the legacy storefront's URL
 * shape.
 *
 * The `<Breadcrumb>` itself truncates the final crumb when the
 * trail would overflow, so no length-guarding logic is needed
 * here.
 */
function buildBreadcrumb(product: ProductDetail): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: "Home", href: "/" }];

  if (product.primaryCollection) {
    items.push({
      label: product.primaryCollection.title,
      href: `/categories/${product.primaryCollection.handle}`,
    });

    if (product.subcategory) {
      items.push({
        label: product.subcategory,
        href: `/categories/${product.primaryCollection.handle}?subcategory=${encodeURIComponent(
          product.subcategory,
        )}`,
      });
    }
  }

  items.push({ label: product.title });
  return items;
}

/**
 * Project a `ProductDetail` onto the provider-agnostic
 * `ProductInput` shape consumed by the analytics layer.
 *
 * Uses the first variant for `variantId` (the shopper hasn't
 * picked one yet on PDP arrival) and the min price band as the
 * representative unit price. Currency carries through verbatim
 * — every variant on a product shares the same currency in
 * Shopify, so there's no ambiguity to resolve.
 */
function toAnalyticsProduct(product: ProductDetail): ProductInput {
  const firstVariant = product.variants[0];
  return {
    productId: product.id,
    variantId: firstVariant?.id ?? "",
    name: product.title,
    brand: product.vendor,
    category: product.primaryCollection?.title,
    price: (product.priceMinCents / 100).toFixed(2),
    quantity: 1,
    currency: product.currency,
  };
}
