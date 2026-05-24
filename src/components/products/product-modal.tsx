"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Price } from "@/components/ui/price";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { addProductToCart } from "@/lib/cart/store";
import type { SearchProduct } from "@/types/product";

/**
 * Product modal — quick variant picker that opens from a product
 * card's Add-to-Cart pill when (and only when) the product carries
 * real option groups (`hasVariants(product) === true`). Single-
 * configuration products skip the modal and add directly; that
 * branch lives in `<AddToCartButton>`.
 *
 * Card flow only. PDPs (full product pages) keep their own inline
 * Add-to-Cart with the pickers already on-page, so they never
 * route through this modal.
 *
 * Contents today:
 *
 *   - Product header (image + title + price + optional price range)
 *     so the modal already feels like the real flow.
 *   - Placeholder "option pickers" section where the real swatches
 *     (Color, Size, Material…) will land. The data is already on
 *     `product.options` — when the picker UI ships it reads
 *     straight from there, no extra fetch.
 *   - Primary CTA currently adds the base configuration. When the
 *     picker is wired in, the CTA will compose
 *     `productId:variantId` as the cart-line id and pass that to
 *     `addCartLine` directly.
 *   - Secondary "Need help choosing?" link demonstrates the
 *     **stacking model** of `<Modal>` — opens a `layer="preview"`
 *     modal above this one with no awareness between them.
 *
 * Drawer pop is handled globally by `addProductToCart` — this
 * component only closes itself on success. Animation, focus
 * management, body-scroll lock, Escape close, and backdrop-click
 * close all live in `<Modal>`; this component just owns content.
 */
export function ProductModal({
  product,
  open,
  onClose,
}: {
  product: SearchProduct;
  open: boolean;
  onClose: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  function handleAdd() {
    addProductToCart(product);
    onClose();
  }

  const hasRange = product.price_max_cents > product.price_min_cents;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Quick add"
        className="max-w-md"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex gap-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[color:var(--color-border)]">
              <ShimmerImage
                src={product.image_url}
                alt={product.title}
                wrapperClassName="block h-full w-full"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-col">
              <h3 className="line-clamp-2 text-sm font-semibold text-[color:var(--color-ink)]">
                {product.title}
              </h3>
              <div className="mt-1 flex items-baseline gap-1.5">
                <Price
                  cents={product.price_min_cents}
                  currency={product.currency}
                />
                {hasRange && (
                  <span className="text-xs text-[color:var(--color-ink-muted)]">
                    – {formatRange(product)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Picker stub — lists the actual option groups carried
              on `product.options` (Color, Size, Material…). When
              the real swatches ship they slot into this same
              container, so the modal's vertical rhythm carries
              over. Reserved height keeps the layout stable. */}
          <div className="rounded-lg bg-[color:var(--color-surface-muted)] px-4 py-6 text-sm text-[color:var(--color-ink-muted)]">
            <p className="text-center">
              Option pickers coming soon — adding the base
              configuration for now.
            </p>
            {product.options && (
              <p className="mt-2 text-center text-xs text-[color:var(--color-ink-muted)]">
                You&rsquo;ll choose:{" "}
                <span className="font-medium text-[color:var(--color-ink-secondary)]">
                  {Object.keys(product.options).join(" · ")}
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="text-xs font-medium text-[color:var(--color-ink-muted)] underline-offset-2 hover:text-[color:var(--color-ink)] hover:underline"
            >
              Need help choosing?
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="btn-primary"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </Modal>

      {/* Stacked modal — opens *on top* of the product modal via
          `layer="preview"`. Demonstrates the layered z-index model:
          the parent modal stays mounted underneath; this one fades
          in cleanly above it; closing returns focus to the parent
          without re-running its open animation. */}
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        layer="preview"
        title="Need help?"
        className="max-w-sm"
      >
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-[color:var(--color-ink-secondary)]">
            Once option pickers ship, this dialog will surface the
            size / fit / colour guidance the PDP carries — so you
            don&rsquo;t need to leave the cart flow to pick the
            right variant.
          </p>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="btn-primary w-full"
          >
            Got it
          </button>
        </div>
      </Modal>
    </>
  );
}

function formatRange(product: SearchProduct): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency,
  }).format(product.price_max_cents / 100);
}
