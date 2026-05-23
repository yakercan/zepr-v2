"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Price } from "@/components/ui/price";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { addCartLine } from "@/lib/cart/store";
import { openCart } from "@/lib/cart/drawer-store";
import type { SearchProduct } from "@/types/product";

/**
 * Variant picker that opens when the shopper clicks Add-to-Cart on
 * a multi-variant product from any list surface (feed, search,
 * collection, related rails).
 *
 * The Salespace search payload doesn't carry full variant data
 * today — only a `price_min / price_max` range that tells us
 * "options exist". So this iteration is intentionally a stub:
 *
 *   - Renders the product header (image + title + range price)
 *     identically to what the PDP would show, so the modal already
 *     feels like part of the real flow.
 *   - Has a placeholder "options coming soon" section where the
 *     variant pickers (size / colour / etc.) will land once we wire
 *     the PDP fetch.
 *   - The primary CTA still adds the *base* line to the cart so
 *     end-to-end testing works today. When variants land, that CTA
 *     reads the selected variant id from local state.
 *   - Demonstrates the **stacking model** of `<Modal>`: when a
 *     destructive variation is added (currently behind the "Need
 *     help choosing?" link), we can pop a `layer="preview"` modal
 *     above this one without either component knowing about the
 *     other.
 *
 * Animation, focus management, body-scroll lock, Escape close, and
 * backdrop-click close all live in `<Modal>` — this component just
 * owns its content.
 */
export function VariantSelectorModal({
  product,
  open,
  onClose,
}: {
  product: SearchProduct;
  open: boolean;
  onClose: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  function handleAddBase() {
    addCartLine({
      id: product.id,
      productId: product.id,
      handle: product.handle,
      title: product.title,
      imageUrl: product.image_url,
      priceCents: product.price_min_cents,
      compareAtCents: product.compare_at_min_cents,
      currency: product.currency,
    });
    onClose();
    openCart();
  }

  const hasRange = product.price_max_cents > product.price_min_cents;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Select options"
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

          {/* Placeholder for the real variant pickers (size / colour /
              etc.). Reserved height so the modal's vertical rhythm
              survives the eventual upgrade. */}
          <div className="rounded-lg bg-[color:var(--color-search)] px-4 py-6 text-center text-sm text-[color:var(--color-ink-muted)]">
            Option pickers coming soon — adding the base configuration
            for now.
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
              onClick={handleAddBase}
              className="btn-primary"
            >
              Add to cart
            </button>
          </div>
        </div>
      </Modal>

      {/* Stacked modal — opens *on top* of the variant picker via
          `layer="preview"`. Demonstrates the layered z-index model:
          the variant modal stays mounted underneath; this one fades
          in cleanly above it; closing this one returns focus to the
          variant modal without re-running its open animation. */}
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
            don&rsquo;t need to leave the cart flow to pick the right
            variant.
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
