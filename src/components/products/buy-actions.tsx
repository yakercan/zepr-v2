"use client";

import { useState } from "react";
import { ShopPayBadge } from "@/components/products/shop-pay-badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { addCartLine, buyNow } from "@/lib/cart/store";
import type { CartLine } from "@/types/cart";
import type { ProductDetail, ProductVariant } from "@/types/product";

/**
 * PDP buy-stack CTAs — the pair of buttons (Add to cart +
 * Buy Now) plus the Shop Pay installment promise underneath.
 *
 * Layout:
 *
 *   [Qty]  [          Add to Cart          ]
 *   [          Buy Now - Fast Checkout     ]
 *   Pay in 4 interest-free… [Shop Pay]
 *
 * Two operating modes:
 *
 *   1. **Uncontrolled (single line)** — pass `selectedVariant`
 *      with no `units`. The internal stepper drives the quantity
 *      and both CTAs operate on a single cart line built from
 *      the anchor product.
 *   2. **Controlled multi-line** — pass `units`, a pre-built
 *      list of `{ cartLineSeed, variantGid, quantity }`. The
 *      stepper hides and both CTAs operate on the multi-line
 *      payload — Buy 2 mixed (Blue × 1 + Red × 1) adds two cart
 *      lines and Buy Now opens a multi-line Shopify cart
 *      permalink. Companion-bundle units travel here too: the
 *      parent embeds the companion's product context inside
 *      `cartLineSeed`, so this component never has to know about
 *      `CompanionProduct`.
 *
   * Buy Now uses a Shopify hosted-checkout permalink — bypasses the
 * local cart entirely so the shopper goes from intent to paid
 * order in one click. The permalink construction lives in the
 * cart store's `buyNow()` so the same code path attaches the
 * current UTM attribution (`attributes[_utm_*]=…`) on the way
 * out, regardless of whether this CTA or a card / modal CTA
 * fires it. Add to Cart loops `addCartLine`, suppressing the
 * drawer pop on every line but the first so the drawer opens
 * exactly once as the confirmation signal.
 *
 * Disabled / label states:
 *
 *   - No `selectedVariant` (matrix-unavailable combo on the top
 *     picker) — Add-to-cart reads "Select options" and both CTAs
 *     disable. Defensive — cascading selection should prevent it.
 *   - Any unit unavailable (controlled) OR top variant sold out
 *     (uncontrolled) — Add-to-cart reads "Sold out", both CTAs
 *     disable, Shop Pay badge hides.
 */

export interface BuyUnit {
  /** Pre-built cart-line payload (`addCartLine` dedupes on `id`,
   *  so same-variant units across tiers collapse into one row in
   *  the cart drawer automatically). */
  cartLineSeed: Omit<CartLine, "quantity">;
  /** Storefront variant gid — the source of truth for the
   *  numeric id baked into the Shopify cart permalink. */
  variantGid: string;
  quantity: number;
  availableForSale: boolean;
}

export interface BuyActionsProps {
  product: ProductDetail;
  /** Currently-resolved top-picker variant. Drives the sellable
   *  check + button labels even in controlled mode, because the
   *  top picker is the "primary" pick the rest of the buy-stack
   *  semantics anchor on (price band, Shop Pay). */
  selectedVariant: ProductVariant | undefined;
  /** Controlled cart payload — one entry per resolved variant.
   *  When provided, the stepper hides and both CTAs operate on
   *  this list. Pass `undefined` for the uncontrolled single-
   *  variant path (stepper visible, qty defaults to 1). */
  units?: ReadonlyArray<BuyUnit>;
  /** Fires after Add to Cart commits the resolved units. Used by
   *  the card-level quick-add modal to dismiss itself once the
   *  shopper has added — the drawer is what opens next, so
   *  leaving the modal up just stacks one overlay on top of
   *  another. PDP doesn't pass this (the buy column stays
   *  visible after the drawer pops). */
  onAdded?: () => void;
  /** Whether to render the Shop Pay "Pay in 4…" promise below
   *  the Buy Now CTA. Defaults to `true` (PDP behaviour); pass
   *  `false` for compact surfaces like the quick-add modal where
   *  the installment line adds vertical noise to a CTA stack
   *  that's already inside a dialog frame. */
  showInstallmentBadge?: boolean;
}

export function BuyActions({
  product,
  selectedVariant,
  units: controlledUnits,
  onAdded,
  showInstallmentBadge = true,
}: BuyActionsProps) {
  const [internalQuantity, setInternalQuantity] = useState(1);

  const isControlled = controlledUnits !== undefined;
  const effectiveUnits: ReadonlyArray<BuyUnit> = isControlled
    ? controlledUnits
    : selectedVariant
      ? [
          {
            cartLineSeed: buildAnchorCartLine(product, selectedVariant),
            variantGid: selectedVariant.id,
            quantity: internalQuantity,
            availableForSale: selectedVariant.availableForSale,
          },
        ]
      : [];

  const sellable =
    !!selectedVariant?.availableForSale &&
    effectiveUnits.length > 0 &&
    effectiveUnits.every((u) => u.availableForSale);

  const handleAddToCart = () => {
    if (!sellable) return;
    /* First add pops the drawer; the rest are silent so the
     * drawer opens once with every line already inside. */
    effectiveUnits.forEach((unit, i) => {
      addCartLine(unit.cartLineSeed, unit.quantity, { silent: i > 0 });
    });
    onAdded?.();
  };

  const handleBuyNow = () => {
    if (!sellable) return;
    buyNow(
      effectiveUnits.map((u) => ({
        variantGid: u.variantGid,
        quantity: u.quantity,
      })),
    );
  };

  const addLabel = !selectedVariant
    ? "Select options"
    : sellable
      ? "Add to Cart"
      : "Sold out";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-3">
        {!isControlled && (
          <QuantityStepper
            quantity={internalQuantity}
            onDecrement={() =>
              setInternalQuantity((q) => Math.max(1, q - 1))
            }
            onIncrement={() => setInternalQuantity((q) => q + 1)}
            size="md"
          />
        )}
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!sellable}
          className="btn-secondary flex-1"
        >
          {addLabel}
        </button>
      </div>
      <button
        type="button"
        onClick={handleBuyNow}
        disabled={!sellable}
        className="btn-primary w-full"
      >
        Buy Now - Fast Checkout
      </button>
      {sellable && showInstallmentBadge && <ShopPayBadge className="mt-1" />}
    </div>
  );
}

/** Compose a `CartLine` seed for an anchor-slot variant.
 *  Exported so the BuyForm can pre-build seeds at the slot level
 *  and the CTAs stay slot-agnostic. The id convention
 *  (`<productId>:<variantId>`) matches the cart store's dedupe
 *  key so same-variant units collapse into a single cart row. */
export function buildAnchorCartLine(
  product: ProductDetail,
  variant: ProductVariant,
): Omit<CartLine, "quantity"> {
  const variantTitle =
    variant.selectedOptions.length > 0
      ? variant.selectedOptions
          .map((opt) => `${opt.name}: ${opt.value}`)
          .join(" / ")
      : undefined;

  const imageUrl =
    variant.image?.url ??
    product.featuredImage?.url ??
    product.media[0]?.preview.url ??
    "";

  return {
    id: `${product.id}:${variant.id}`,
    productId: product.id,
    /* Shopify Storefront variant GID. Required by the
     * `cartLinesAdd` mutation in server mode, and also feeds the
     * guest-mode checkout permalink builder so the same line
     * shape works on both paths without re-deriving it. */
    merchandiseId: variant.id,
    handle: product.handle,
    title: product.title,
    imageUrl,
    priceCents: variant.priceCents,
    compareAtCents: variant.compareAtCents,
    currency: product.currency,
    variantTitle,
  };
}
