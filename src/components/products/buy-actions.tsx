"use client";

import { useState } from "react";
import { ShopPayBadge } from "@/components/products/shop-pay-badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { addCartLine } from "@/lib/cart/store";
import type { CartLine } from "@/types/cart";
import type { ProductDetail, ProductVariant } from "@/types/product";

/**
 * Add-to-Cart CTA — an "Add to Cart" button (optionally preceded by
 * a quantity stepper) plus the Shop Pay installment promise.
 *
 * Layout:
 *
 *   [Qty]  [          Add to Cart          ]
 *   Pay in 4 interest-free… [Shop Pay]
 *
 * Two operating modes:
 *
 *   1. **Uncontrolled (single line)** — pass `selectedVariant`
 *      with no `units`. The internal stepper drives the quantity
 *      and the button adds a single cart line built from the
 *      anchor product.
 *   2. **Controlled multi-line** — pass `units`, a pre-built
 *      list of `{ cartLineSeed, variantGid, quantity }`. The
 *      stepper hides and the button adds the whole payload — Buy 2
 *      mixed (Blue × 1 + Red × 1) adds two cart lines. Companion-
 *      bundle units travel here too: the parent embeds the
 *      companion's product context inside `cartLineSeed`, so this
 *      component never has to know about `CompanionProduct`.
 *
 * Add to Cart loops `addCartLine`, suppressing the drawer pop on
 * every line but the first so the drawer opens exactly once as the
 * confirmation signal.
 *
 * The button is inline at every width on both surfaces (PDP buy
 * column + quick-add modal) — no viewport-pinned variant.
 *
 * Disabled / label states:
 *
 *   - No `selectedVariant` (matrix-unavailable combo on the top
 *     picker) — reads "Select options", disabled. Defensive —
 *     cascading selection should prevent it.
 *   - Any unit unavailable (controlled) OR top variant sold out
 *     (uncontrolled) — reads "Sold out", disabled, Shop Pay badge
 *     hides.
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
   *  the Add-to-Cart button. Defaults to `true` (PDP behaviour);
   *  pass `false` for compact surfaces like the quick-add modal
   *  where the installment line adds vertical noise to a CTA stack
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
            onDecrement={() => setInternalQuantity((q) => Math.max(1, q - 1))}
            onIncrement={() => setInternalQuantity((q) => q + 1)}
            size="md"
          />
        )}
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!sellable}
          className="btn-primary flex-1"
        >
          {addLabel}
        </button>
      </div>

      {sellable && showInstallmentBadge && (
        <ShopPayBadge currency={product.currency} className="mt-1" />
      )}
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
