"use client";

import { type ReactNode } from "react";
import { Price } from "@/components/ui/price";
import { tierPricingCents, type OfferTier } from "@/lib/offers";
import { cn } from "@/lib/utils";
import type { ProductVariant } from "@/types/product";

/**
 * Tiered offers picker — the "Buy 1 / Buy 2 Save 15% / Buy 3
 * Save 20%" tile stack that replaces the qty stepper on PDPs
 * whose `custom.offers` metafield opts in.
 *
 * Layout:
 *   - Vertical full-width rows (one tile per tier). Lets each row
 *     carry its own savings copy + total without competing for
 *     column width; the eye scans top-to-bottom and the totals
 *     align in one rightmost column for trivial $-vs-$ compare.
 *   - Inside each row's header: radio dot, headline (with brand-
 *     orange savings accent), and the discounted total + strike
 *     compare on the right.
 *   - Floating "MOST POPULAR" / "BEST VALUE" badge pinned to the
 *     top-right edge so it can't reflow the row.
 *   - Selected tile reveals an *expansion area* below its header,
 *     separated by a hairline divider, where the parent can drop
 *     per-unit variant pickers (`<OfferUnitPickers>`). The slot
 *     is a sibling of the header `<button>` — interactive
 *     descendants live outside the click target so accessibility
 *     doesn't fight us with nested-button warnings.
 *
 * Selection:
 *   - Index `0` is the preselected Buy 1 anchor (the parent seeds
 *     this; the picker itself is purely presentational).
 *   - Selected tile gets the brand-orange treatment (border +
 *     orange-tint wash + filled radio dot). Idle tiles wear the
 *     storefront's standard selectable-surface look so the chosen
 *     tile draws the eye without the others looking dead.
 *
 * Pricing math lives in `lib/offers#tierPricingCents` — frontend
 * preview only. The real discount applies at Shopify checkout
 * once the cart wiring stamps the tier id; display drift can't
 * silently overcharge because the cart math stays server-
 * authoritative.
 */

export interface TieredOffersProps {
  tiers: ReadonlyArray<OfferTier>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  variant: ProductVariant;
  currency: string;
  /** Optional body rendered INSIDE the currently-selected tile,
   *  below its header row, separated by a hairline divider. The
   *  PDP plugs `<OfferUnitPickers>` in here so the per-unit picks
   *  visually belong to the tile the shopper just committed to.
   *  Sits as a sibling of the header `<button>` — interactive
   *  children (chip buttons, dropdowns) don't nest inside a
   *  button, so no a11y conflict. */
  selectedTierContent?: ReactNode;
  className?: string;
}

export function TieredOffers({
  tiers,
  selectedIndex,
  onSelect,
  variant,
  currency,
  selectedTierContent,
  className,
}: TieredOffersProps) {
  if (tiers.length === 0) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Choose your offer"
      /* `pt-2` reserves room for any floating badge on the first
         row so it doesn't visually collide with the section above. */
      className={cn("flex flex-col gap-4 pt-2", className)}
    >
      {tiers.map((tier, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <OfferRow
            key={tier.id}
            tier={tier}
            isSelected={isSelected}
            onSelect={() => onSelect(idx)}
            variant={variant}
            currency={currency}
            /* Only render the expansion body in the selected tile
             * — keeps the picker compact when an idle tile happens
             * to share the same content shape, and avoids paying
             * the unit-picker render cost N times. */
            expansionContent={isSelected ? selectedTierContent : null}
          />
        );
      })}
    </div>
  );
}

interface OfferRowProps {
  tier: OfferTier;
  isSelected: boolean;
  onSelect: () => void;
  variant: ProductVariant;
  currency: string;
  expansionContent?: ReactNode;
}

function OfferRow({
  tier,
  isSelected,
  onSelect,
  variant,
  currency,
  expansionContent,
}: OfferRowProps) {
  const { discountedTotalCents, compareTotalCents } = tierPricingCents(
    tier,
    variant,
  );
  const showCompare = compareTotalCents > discountedTotalCents;
  const hasExpansion = isSelected && !!expansionContent;

  return (
    /* Outer wrapper owns the border, selection state, and floating
     * badge so the inner header `<button>` stays just the click
     * target — interactive expansion content sits as a sibling
     * and doesn't nest inside a button. */
    <div
      role="radio"
      aria-checked={isSelected}
      className={cn(
        "group/tier relative rounded-xl border-2 transition-colors duration-150",
        isSelected
          ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand)]/5"
          : "border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] hover:border-[color:var(--color-ink)]",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[color:var(--color-brand)] focus-visible:ring-offset-2",
        )}
      >
        <RadioDot selected={isSelected} />

        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-sm font-bold text-[color:var(--color-ink)]">
            {tier.headline}
            {tier.accent && (
              <span className="text-[color:var(--color-brand)]">
                {tier.accent}
              </span>
            )}
            {tier.accentSuffix}
          </span>
        </span>

        <span className="flex flex-shrink-0 flex-col items-end leading-tight">
          <Price
            cents={discountedTotalCents}
            currency={currency}
            accent={isSelected ? "var(--color-brand)" : undefined}
            className="text-base"
          />
          {showCompare ? (
            <Price
              cents={compareTotalCents}
              currency={currency}
              variant="compare"
              className="mt-0.5"
            />
          ) : (
            /* Reserve the compare-line slot so rows align
             * vertically whether or not a compare is shown. */
            <span aria-hidden className="mt-0.5 text-xs leading-none">
              &nbsp;
            </span>
          )}
        </span>
      </button>

      {hasExpansion && (
        <div className="border-t border-[color:var(--color-border)] px-4 pb-4 pt-3">
          {expansionContent}
        </div>
      )}

      {tier.badge && (
        <span
          /* `pointer-events-none` so the badge never intercepts
             clicks meant for the tile itself. `-translate-y-1/2`
             centres it on the top border for the floating-chip
             look. */
          className={cn(
            "pointer-events-none absolute right-3 top-0 -translate-y-1/2",
            "whitespace-nowrap rounded-full px-2 py-0.5",
            "text-[10px] font-bold uppercase tracking-wide text-white",
            isSelected
              ? "bg-[color:var(--color-brand)]"
              : "bg-[color:var(--color-ink)]",
          )}
        >
          {tier.badge}
        </span>
      )}
    </div>
  );
}

/** Outer ring + inner dot. Selected fills the dot with brand
 *  orange; idle paints just the ring in muted grey. Scaled on
 *  selection change so the affordance feels physical. */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2",
        "transition-colors duration-150",
        selected
          ? "border-[color:var(--color-brand)]"
          : "border-[color:var(--color-border-strong)]",
      )}
    >
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full transition-transform duration-150",
          selected
            ? "scale-100 bg-[color:var(--color-brand)]"
            : "scale-0 bg-transparent",
        )}
      />
    </span>
  );
}
