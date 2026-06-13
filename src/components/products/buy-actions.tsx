"use client";

import { useEffect, useRef, useState } from "react";
import { ShopPayBadge } from "@/components/products/shop-pay-badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { addCartLine } from "@/lib/cart/store";
import { cn } from "@/lib/utils";
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
 * `mobileStickyBar` (PDP) swaps the inline button for a viewport-
 * pinned bottom bar below `lg`, and shows the inline button from
 * `lg` up — pure Tailwind breakpoints, so the mobile CTA paints on
 * first render with no device-detection / hydration delay.
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
  /** PDP only. Below `lg` the inline button hides and an Amazon-
   *  style viewport-pinned bottom bar takes over; from `lg` up the
   *  inline button shows and the bar hides. Left `false` in the
   *  modal, which keeps the inline button at every width inside its
   *  own pinned footer. */
  mobileStickyBar?: boolean;
}

export function BuyActions({
  product,
  selectedVariant,
  units: controlledUnits,
  onAdded,
  showInstallmentBadge = true,
  mobileStickyBar = false,
}: BuyActionsProps) {
  const [internalQuantity, setInternalQuantity] = useState(1);
  const stickyBarRef = useRef<HTMLDivElement>(null);

  /* Reserve the pinned bar's height as `<body>` padding so the page
   * (including the global site footer, which is a sibling of the
   * PDP `<main>`) can scroll fully clear of it — a `pb` on `<main>`
   * alone only pads above the footer, leaving its bottom edge under
   * the bar. We mirror the bar's live `offsetHeight`: it's
   * `lg:hidden` (so `display:none`, height `0`, on desktop) and its
   * box already includes the safe-area inset, so the reservation
   * tracks the breakpoint + notch with no JS media query. */
  useEffect(() => {
    if (!mobileStickyBar) return;
    const bar = stickyBarRef.current;
    if (!bar) return;

    const sync = () => {
      document.body.style.paddingBottom = `${bar.offsetHeight}px`;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [mobileStickyBar]);

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
      {/* Inline button row. On the PDP it's desktop-only (`lg` and
       *  up) — the pinned bar below owns the mobile CTA; in the
       *  modal (`mobileStickyBar` false) it shows at every width. */}
      <div
        className={cn(
          "items-stretch gap-3",
          mobileStickyBar ? "hidden lg:flex" : "flex",
        )}
      >
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

      {/* Mobile sticky add-to-cart bar (PDP). `position: fixed`
       *  pins it to the viewport and `lg:hidden` drops it on
       *  desktop — pure CSS, so it paints immediately with no JS
       *  gate. Reuses `handleAddToCart` / `sellable` / `addLabel`,
       *  so it honours tiered-offer units + sold-out state.
       *  Rounded-top + hairline match our Vaul bottom-drawer
       *  dialect (`<Sheet>` / cookie banner); the shadow is a touch
       *  softer since this bar is always present rather than a
       *  transient overlay. */}
      {mobileStickyBar && (
        <div
          ref={stickyBarRef}
          className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border border-b-0 border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-10px_34px_-14px_rgba(0,0,0,0.16)] lg:hidden"
        >
          <div className="py-3">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!sellable}
              className="btn-primary w-full"
            >
              {addLabel}
            </button>
          </div>
        </div>
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
