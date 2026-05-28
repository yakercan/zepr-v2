"use client";

import { useState, type MouseEvent } from "react";
import { ProductModal } from "@/components/products/product-modal";
import { CartAddIcon } from "@/components/ui/icons";
import { addProductToCart } from "@/lib/cart/store";
import { hasVariants } from "@/lib/products";
import { cn } from "@/lib/utils";
import type { SearchProduct } from "@/types/product";

/**
 * Compact Add-to-Cart pill rendered on the product card.
 *
 * Visual: circle bubble using the shared `.icon-bubble` — soft
 * grey halo + ink→brand glyph flip on hover, same dialect as the
 * header cart icon. The `<CartAddIcon>` inside carries the meaning
 * (cart + plus); no label is needed (`aria-label` covers screen
 * readers).
 *
 * Click semantics:
 *
 *   - Always `preventDefault` + `stopPropagation` on the click so
 *     the parent `<Link>` doesn't navigate to the PDP. The
 *     `stopPropagation` is required even with `preventDefault` —
 *     the latter only suppresses the link's default navigation,
 *     not the click event bubbling up to ancestor handlers.
 *   - **Multi-variant products** open the `<ProductModal>` so the
 *     shopper resolves variant + qty before the line lands in the
 *     cart.
 *   - **Single-variant products** add the base line directly and
 *     pop the cart drawer for confirmation — no modal hop needed
 *     when there's nothing to choose.
 *   - This branch lives exclusively in the *card-level* Add. PDPs
 *     have their own inline Add-to-Cart and never route through
 *     `<ProductModal>` (the PDP already exposes the pickers
 *     inline).
 *
 * Variant detection uses `hasVariants(product)` (see
 * `lib/products`) — single source of truth so any other surface
 * that needs to know "does this need a picker?" reads the same
 * predicate.
 *
 * Disabled when the product is sold out — `.icon-bubble`'s
 * disabled state suppresses the hover bubble and dims the glyph
 * automatically.
 */
export function AddToCartButton({
  product,
  className,
}: {
  product: SearchProduct;
  className?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const disabled = !product.available;
  const needsModal = hasVariants(product);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (needsModal) {
      setModalOpen(true);
      return;
    }

    addProductToCart(product);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={
          needsModal
            ? `Choose options for ${product.title}`
            : `Add ${product.title} to cart`
        }
        className={cn(
          // Same hover dialect as the header cart icon: soft grey
          // bubble fades in on hover, glyph (cart outline + inner
          // `+`) flips from ink to brand via `currentColor`. Sized
          // to match the header trigger so both surfaces read as
          // the same brand object.
          "icon-bubble h-10 w-10 shrink-0",
          className,
        )}
      >
        <CartAddIcon />
      </button>

      {/* Only mount the modal for products that actually need it.
          Saves the per-card cost (state + portal subtree) on every
          single-variant tile in a grid that may render 60+ at a
          time.
        
          # Why the wrapping stopPropagation span
        
          `<ProductCard>` is, structurally, a Next.js `<Link>` —
          the entire card is one big anchor. `<AddToCartButton>`
          renders here as one of that anchor's children, and so
          does the `<ProductModal>` it mounts.
        
          The modal opens via a portal (Vaul's `Drawer.Portal` /
          our `<Modal>` primitive's `createPortal`), so its DOM
          lives at `document.body` and *DOM* click events
          correctly stop at the body — they never bubble back up
          to the card's anchor.
        
          But React's synthetic event system bubbles through the
          **component tree**, not the DOM tree. Every click
          inside the modal subtree — gallery thumbs, lightbox
          close, variant chip, even empty space in the
          `<Drawer.Overlay>` — bubbles up through React's
          fibers (modal → AddToCartButton → ProductCard's Link)
          and lands on the Link's onClick, which routes the
          shopper to the PDP mid-interaction.
        
          This `<span>` sits *between* the modal subtree and
          the card-level Link in React's tree. A single
          `onClick={stopPropagation}` here intercepts every
          click from inside the modal before it can escape and
          trigger the navigation. Zero layout impact (span is
          inline and empty in DOM terms once Vaul portals its
          children out). The `<button>` above already
          stop-propagates its own click; this is the same
          discipline applied to everything the modal owns. */}
      {needsModal && (
        <span onClick={(e) => e.stopPropagation()}>
          <ProductModal
            product={product}
            open={modalOpen}
            onClose={() => setModalOpen(false)}
          />
        </span>
      )}
    </>
  );
}
