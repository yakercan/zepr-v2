"use client";

import { useEffect, useRef, useState } from "react";
import { DeliveryBadge } from "@/components/products/delivery-badge";
import { VariantPicker } from "@/components/products/variant-picker";
import { Price } from "@/components/ui/price";
import {
  cascadeSelect,
  defaultSelection,
  findVariant,
  type OptionSelection,
} from "@/lib/variants";
import type { ProductDetail, ProductVariant } from "@/types/product";

/**
 * The "buy side" of a product — title, price band, discount
 * badge, variant pickers, and (in Round 5) the Add-to-cart CTA.
 *
 * Lives in `components/products/` (not under `app/products/`)
 * because two surfaces will render it:
 *
 *   1. The PDP — full-page, in the sticky right column.
 *   2. The product modal opened from a product card's
 *      "Add to cart" button when the product has variants —
 *      same buy-form chrome, just inside a modal shell.
 *
 * Keeping a single component means a variant-picker tweak or a
 * CTA copy change lands in both places in one edit.
 *
 * Round 4 turned this into a client island: option selection
 * state lives here, so the title row stays a render away from
 * the picker without prop-drilling. The selected variant drives:
 *
 *   - the headline price (variant's `priceCents`)
 *   - the strike-through compare-at (`variant.compareAtCents`)
 *   - the savings badge percent
 *
 * Falls back to the product-level range when no variant resolves
 * — happens only when the shopper picks an unavailable combo via
 * a strike-through pill in the picker. The range is a useful
 * "no concrete price yet" cue; Round 5's CTA will surface the
 * "Unavailable" affordance for that case.
 */
export interface BuyFormProps {
  product: ProductDetail;
  className?: string;
  /** Fires after the picker resolves a new variant (or fails to,
   *  in which case the argument is `undefined`). The PDP layout
   *  uses this to nudge the gallery to the variant's image; other
   *  surfaces can read off variant-specific metadata for related
   *  side effects. Skips the initial mount emission — the layout
   *  seeds the gallery from the default variant directly. */
  onVariantChange?: (variant: ProductVariant | undefined) => void;
}

export function BuyForm({ product, className, onVariantChange }: BuyFormProps) {
  const [selection, setSelection] = useState<OptionSelection>(() =>
    defaultSelection(product.variants),
  );

  const selectedVariant =
    product.options.length === 0
      ? product.variants[0]
      : findVariant(product.variants, selection);

  /* Skip-first-emit so the initial mount doesn't shout the
   * default variant back at the layout (which already knew about
   * it from `defaultSelection` and seeded the gallery directly).
   * After mount, every selection-driven variant change emits so
   * the gallery can sync to the new image. */
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onVariantChange?.(selectedVariant);
  }, [selectedVariant, onVariantChange]);

  /* Resolved-variant pricing wins over the product-level range
   * the moment we have one. When the picker lands on an invalid
   * combo `selectedVariant` is `undefined` — we fall back to the
   * range so the page never shows "$undefined". */
  const priceMinCents = selectedVariant?.priceCents ?? product.priceMinCents;
  const priceMaxCents = selectedVariant?.priceCents ?? product.priceMaxCents;
  const compareAtCents =
    selectedVariant?.compareAtCents ?? product.compareAtMinCents;

  const hasPriceRange = priceMaxCents > priceMinCents;
  const discountPct =
    compareAtCents && compareAtCents > priceMinCents
      ? Math.round(((compareAtCents - priceMinCents) / compareAtCents) * 100)
      : 0;
  const isDiscounted = discountPct > 0;
  const priceAccent = isDiscounted ? "var(--color-brand)" : undefined;

  const handleSelect = (optionName: string, value: string) => {
    setSelection((prev) =>
      cascadeSelect(product.options, product.variants, prev, optionName, value),
    );
  };

  return (
    <div className={className ?? "flex flex-col gap-5"}>
      <h1 className="text-lg font-bold leading-snug text-[color:var(--color-ink)] md:text-xl">
        {product.title}
      </h1>

      <DeliveryBadge
        deliveryTime={product.deliveryTime}
        priceCents={priceMinCents}
      />

      <div className="flex flex-wrap items-baseline gap-3">
        <Price
          cents={priceMinCents}
          currency={product.currency}
          accent={priceAccent}
          className="text-2xl"
        />
        {hasPriceRange && (
          <>
            <span
              className="text-base text-[color:var(--color-ink-muted)]"
              aria-hidden
            >
              –
            </span>
            <Price
              cents={priceMaxCents}
              currency={product.currency}
              accent={priceAccent}
              className="text-2xl"
            />
          </>
        )}
        {isDiscounted && compareAtCents && (
          <>
            <Price
              cents={compareAtCents}
              currency={product.currency}
              variant="compare"
              className="text-base"
            />
            <DiscountBadge percent={discountPct} />
          </>
        )}
      </div>

      <VariantPicker
        options={product.options}
        variants={product.variants}
        selection={selection}
        onSelect={handleSelect}
      />

      {/* Round 5: Add-to-cart CTA + quantity stepper land here.
          The CTA will read `selectedVariant?.availableForSale`
          and compose the cart line id as `productId:variantId`. */}
    </div>
  );
}

/**
 * Headline "savings" pill — solid brand-orange, white label.
 * Module-private: lives next to its only caller for now. If a
 * second surface picks it up later, lifts to `lib/badges.ts`
 * alongside the other badge primitives.
 */
function DiscountBadge({ percent }: { percent: number }) {
  return (
    <span
      // `self-center` overrides the parent flex row's
      // `items-baseline` so the pill aligns to the digits'
      // visual centre rather than dropping below the baseline.
      className={
        "inline-flex shrink-0 items-center self-center rounded-full " +
        "px-2.5 py-1 text-sm font-semibold tracking-wide text-white " +
        "bg-[color:var(--color-brand)]"
      }
    >
      {percent}% off
    </span>
  );
}
