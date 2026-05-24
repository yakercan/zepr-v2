import { notFound } from "next/navigation";
import {
  ProductAccordion,
  ProductAccordionItem,
} from "@/components/products/product-accordion";
import { ProductLayout } from "@/components/products/product-layout";
import { ProductReviews } from "@/components/products/product-reviews";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { RatingChip } from "@/components/ui/rating-chip";
import { RichText } from "@/components/ui/rich-text";
import { env } from "@/env";
import { getAuthState } from "@/lib/auth/session";
import { getProductReviews } from "@/lib/reviews";
import {
  getCompanionProducts,
  getProductByHandle,
} from "@/lib/shopify/products";
import type { ProductDetail } from "@/types/product";

/**
 * Product Detail Page — Shopify-backed.
 *
 * Layout (md and up):
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
 * Stack on phones (single column, no sticking — too tall).
 *
 * Performance plan:
 *
 *   - `revalidate = 3600` → ISR; first cold visitor pays one
 *     Storefront round-trip (~200 ms), every subsequent visitor in
 *     the next hour gets the prerendered HTML in <50 ms.
 *   - `generateStaticParams` will pre-bake the top-N handles at
 *     build time once we know which products to seed.
 *   - The "Also like" rail will be wrapped in `<Suspense>` and
 *     fetched from Salespace by collection so the hero paints
 *     immediately and the rail streams in below.
 */

export const revalidate = 3600;

interface ProductPageProps {
  params: Promise<{ handle: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { handle } = await params;
  const baseProduct = await getProductByHandle(handle);
  if (!baseProduct) notFound();

  /* Tiered-offers bundle slots — if the `custom.offers` metafield
   * called out companion product ids, fetch them in one extra
   * Storefront round-trip alongside the anchor. We await here
   * (instead of streaming via Suspense) because the buy-form
   * needs companion data on first paint to render the right tier
   * preselect + per-unit pickers without a layout shift.
   *
   * Reviews + auth state run in parallel with the companions
   * because they're independent — bundle data, review summary,
   * and session view all gate parts of the first paint, so we
   * `Promise.all` them and pay the slowest of the three rather
   * than the sum. */
  const [bundleCompanions, reviewsSummary, authState] = await Promise.all([
    getCompanionProducts(baseProduct.offers.bundleCompanionIds),
    getProductReviews(baseProduct.id),
    getAuthState(),
  ]);
  const product: ProductDetail = { ...baseProduct, bundleCompanions };

  /* Section gate — only render the Reviews accordion when
   * there's something for the shopper to see or do. Guests
   * with no reviews to read get a quieter PDP; signed-in
   * shoppers always see the section (so they can write one).
   * Empty `null` summary and `totalCount: 0` are treated
   * identically — see `getProductReviews`'s contract. */
  const reviewsCount = reviewsSummary?.totalCount ?? 0;
  const showReviews = authState.isLoggedIn || reviewsCount > 0;

  const breadcrumbItems = buildBreadcrumb(product);

  /* Buy Now hands off to Shopify's hosted checkout via a cart
   * permalink. Prefer the dedicated checkout subdomain when set,
   * otherwise fall back to the storefront's `.myshopify.com`
   * hostname — Shopify accepts the same `/cart/<variant>:<qty>`
   * shape on both, so the CTA keeps working in either env shape. */
  const checkoutDomain =
    env.SHOPIFY_CHECKOUT_DOMAIN ?? env.SHOPIFY_STOREFRONT_DOMAIN;

  return (
    <main className="page-container pt-3 pb-8 md:pt-4 md:pb-12">
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      {/* Additional PDP accordion sections drop in here as more
       *  <ProductAccordionItem>s alongside "Details" + "Reviews".
       *  Each one is fetched server-side at the top of the route
       *  and gated by simple booleans so the markup stays a flat
       *  list of conditional `&&` items. */}
      <ProductLayout
        product={product}
        checkoutDomain={checkoutDomain}
        extraLeft={
          <ProductAccordion>
            {product.descriptionHtml && (
              <ProductAccordionItem title="Details" defaultOpen>
                <RichText html={product.descriptionHtml} />
              </ProductAccordionItem>
            )}
            {showReviews && (
              <ProductAccordionItem
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
                  productTitle={product.title}
                  summary={reviewsSummary}
                  authState={authState}
                />
              </ProductAccordionItem>
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
              <ProductAccordionItem title="Disclaimer">
                <RichText html={product.legalDisclaimerHtml} />
              </ProductAccordionItem>
            )}
          </ProductAccordion>
        }
      />

      {/* TODO round 7: "You may also like" rail — single Salespace
       *  `searchProducts({ collection })` fetch inside <Suspense>
       *  so the rail streams in below the fold without blocking
       *  the hero paint. */}
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
