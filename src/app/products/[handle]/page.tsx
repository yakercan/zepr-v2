import { notFound } from "next/navigation";
import { BuyForm } from "@/components/products/buy-form";
import {
  ProductAccordion,
  ProductAccordionItem,
} from "@/components/products/product-accordion";
import { ProductGallery } from "@/components/products/product-gallery";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { RichText } from "@/components/ui/rich-text";
import { getProductByHandle } from "@/lib/shopify/products";
import { PANEL_SURFACE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ProductDetail } from "@/types/product";

/** Shared inner padding for both PDP columns so the gallery / buy
 *  form sit at the same vertical inset inside their panels. */
const PDP_PANEL_PADDING = "p-5 md:p-6";

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
  const product = await getProductByHandle(handle);
  if (!product) notFound();

  const breadcrumbItems = buildBreadcrumb(product);

  return (
    <main className="page-container pt-3 pb-8 md:pt-4 md:pb-12">
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.2fr_1fr] md:gap-12 md:items-start">
        {/* Left column — gallery + long-form copy. Wrapped in the
            same `PANEL_SURFACE_CLASSES` panel as the right column
            so the two sides frame the page as a pair. `min-w-0`
            because grid tracks otherwise refuse to shrink past
            their content's intrinsic min-width, which collapses
            the right column when the description has long words. */}
        <div
          className={cn(
            PANEL_SURFACE_CLASSES,
            PDP_PANEL_PADDING,
            "flex min-w-0 flex-col gap-6",
          )}
        >
          <ProductGallery media={product.media} title={product.title} />
          <ProductAccordion>
            {product.descriptionHtml && (
              <ProductAccordionItem title="Details" defaultOpen>
                <RichText html={product.descriptionHtml} />
              </ProductAccordionItem>
            )}
            {/* Future sections (Reviews, Disclaimer, etc.) drop
             *  in here as additional <ProductAccordionItem>s. */}
          </ProductAccordion>
        </div>

        {/* Right column — buy form, sticky.
         *
         *   - `md:self-start`  → take only the form's natural height
         *                        (grid items default to `stretch`,
         *                        which would lock the form to the
         *                        full row height and break sticky).
         *   - `md:sticky md:top-20` → cling to `5rem` (header is
         *                        4rem + 1px border; 5rem leaves a
         *                        small breathing gap).
         *   - When the left column scrolls past its end, the grid
         *     row ends, the sticky context releases, and the page
         *     continues into the related rail.
         *
         * The buy form's panel framing matches the left column; the
         * modal variant renders <BuyForm> bare because the modal
         * shell already owns its own surface treatment. */}
        <div className="md:sticky md:top-20 md:self-start">
          <div className={cn(PANEL_SURFACE_CLASSES, PDP_PANEL_PADDING)}>
            <BuyForm product={product} />
          </div>
        </div>
      </div>

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
