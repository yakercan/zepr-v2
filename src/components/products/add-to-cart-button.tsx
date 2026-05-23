"use client";

import { useState, type MouseEvent } from "react";
import { VariantSelectorModal } from "@/components/products/variant-selector-modal";
import { CartAddIcon } from "@/components/ui/icons";
import { addCartLine } from "@/lib/cart/store";
import { openCart } from "@/lib/cart/drawer-store";
import { cn } from "@/lib/utils";
import type { SearchProduct } from "@/types/product";

/**
 * Compact Add-to-Cart pill rendered on the product card and any
 * other product surface that wants quick-add behaviour.
 *
 * Visual: outlined pill using the shared `.surface-outline` — soft
 * grey at rest, ink on direct hover — so it visually matches the
 * feed tabs, the card itself, and (later) filter chips. The icon
 * does the heavy lifting; the label is reserved for sites where
 * inline width allows.
 *
 * Click semantics:
 *
 *   - Always calls `e.preventDefault()` and `e.stopPropagation()`
 *     first — the parent `<Link>` would otherwise navigate to the
 *     PDP on click.
 *   - For products with multiple variants (signalled today by
 *     `price_min_cents !== price_max_cents` — the only variant
 *     signal the search type carries) it opens the variant picker
 *     modal so the shopper resolves variant + qty before the line
 *     lands in the cart.
 *   - For single-variant products it adds the line directly and
 *     pops the cart drawer for confirmation.
 *
 * The `e.stopPropagation` matters even though we already
 * `preventDefault` because `<Link>` listens for `onClick` and would
 * still react to the bubble — `preventDefault` only suppresses the
 * default navigation, not the event delivery to ancestors.
 */
export function AddToCartButton({
  product,
  className,
}: {
  product: SearchProduct;
  className?: string;
}) {
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const hasVariants = product.price_max_cents > product.price_min_cents;
  const disabled = !product.available;

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (hasVariants) {
      setVariantModalOpen(true);
      return;
    }

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
    openCart();
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={
          hasVariants
            ? `Choose options for ${product.title}`
            : `Add ${product.title} to cart`
        }
        className={cn(
          // Same hover dialect as the header's icon buttons: soft
          // grey bubble fades in on hover, the whole glyph (cart
          // outline AND the inner `+`) flips from ink to brand via
          // `currentColor`. No border at rest — the bubble carries
          // the affordance.
          //
          // Sizing is matched to the header cart trigger: `h-10`
          // bubble + `h-[26px]` icon. Same footprint on both
          // surfaces so the two glyphs read as the same brand
          // object — no "tiny one here, bigger one there" feel.
          "icon-bubble h-10 w-10 shrink-0",
          className,
        )}
      >
        <CartAddIcon />
      </button>

      <VariantSelectorModal
        product={product}
        open={variantModalOpen}
        onClose={() => setVariantModalOpen(false)}
      />
    </>
  );
}
