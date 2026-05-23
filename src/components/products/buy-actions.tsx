"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShopPayBadge } from "@/components/products/shop-pay-badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { addCartLine } from "@/lib/cart/store";
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
 * The quantity stepper sits on the left of Add to Cart in the
 * same row; Buy Now stretches full-width below it. Both CTAs
 * read the same `quantity` state — the picker is the single
 * source of truth, so a shopper who bumps the count from 1 to 3
 * has it apply to whichever path they take.
 *
 *   1. **Add to Cart** — secondary "outline" pill (`.btn-secondary`).
 *      Adds the resolved variant to the cart store and lets the
 *      shared `openCart()` side-effect inside `addCartLine` pop
 *      the drawer as confirmation. Same code path as the product-
 *      card add and the modal add, so a future change to the
 *      add-to-cart UX lands everywhere at once.
 *   2. **Buy Now - Fast Checkout** — primary brand-orange pill
 *      (`.btn-primary`). Adds silently (no drawer pop — the
 *      shopper is leaving for checkout, not staying on the page)
 *      then routes to `/checkout`. The real Shopify checkout
 *      handoff is a future swap inside this handler; everywhere
 *      else stays unchanged.
 *
 * Below the buttons, `<ShopPayBadge>` paints the "Pay in 4
 * interest-free…" caption when the selection is purchasable —
 * mirrors how the legacy storefront only surfaces the installment
 * promise for buyable products.
 *
 * Disabled / label states:
 *
 *   - No `selectedVariant` (matrix-unavailable combo) — Add-to-cart
 *     reads "Select options" and both CTAs disable. With
 *     cascading selection in place this is a defensive branch:
 *     the picker should never land the user here, but it's safer
 *     than throwing on an unresolved variant.
 *   - `availableForSale === false` — Add-to-cart reads "Sold out",
 *     both CTAs disable, Shop Pay badge hides.
 *
 * Client component so the click handlers + router live where the
 * buttons do; the parent `<BuyForm>` already declared `"use client"`
 * for the picker, so no extra render-boundary cost.
 */

export interface BuyActionsProps {
  product: ProductDetail;
  selectedVariant: ProductVariant | undefined;
}

export function BuyActions({ product, selectedVariant }: BuyActionsProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);

  const sellable = !!selectedVariant?.availableForSale;

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    addCartLine(buildCartLine(product, selectedVariant), quantity);
  };

  const handleBuyNow = () => {
    if (!selectedVariant) return;
    addCartLine(buildCartLine(product, selectedVariant), quantity, {
      silent: true,
    });
    /* TODO: Swap for the real Shopify fast-checkout handoff when
     *       the checkout flow lands. Until then, route to the
     *       same `/checkout` placeholder the cart drawer uses so
     *       both paths converge on a single integration point. */
    router.push("/checkout");
  };

  const addLabel = !selectedVariant
    ? "Select options"
    : sellable
      ? "Add to Cart"
      : "Sold out";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-3">
        <QuantityStepper
          quantity={quantity}
          onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
          onIncrement={() => setQuantity((q) => q + 1)}
          size="md"
        />
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
      {sellable && <ShopPayBadge className="mt-1" />}
    </div>
  );
}

/** Compose a `CartLine` from the resolved PDP variant. Centralised
 *  so the cart-line key (`productId:variantId`) stays consistent
 *  across both CTAs and matches the dedupe convention documented
 *  on `cart/store.ts`. Return type is anchored to `CartLine` so a
 *  future field gain (e.g. `subscriptionPlan`) trips the compiler
 *  here instead of silently dropping the field on PDP adds. */
function buildCartLine(
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
    variant.image?.url ?? product.featuredImage?.url ?? product.media[0]?.preview.url ?? "";

  return {
    id: `${product.id}:${variant.id}`,
    productId: product.id,
    handle: product.handle,
    title: product.title,
    imageUrl,
    priceCents: variant.priceCents,
    compareAtCents: variant.compareAtCents,
    currency: product.currency,
    variantTitle,
  };
}
