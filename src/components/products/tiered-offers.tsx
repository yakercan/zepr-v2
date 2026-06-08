"use client";

import { type ReactNode } from "react";
import { Price } from "@/components/ui/price";
import { qualifiesForFreeShipping } from "@/lib/badges";
import { type OfferTier } from "@/lib/offers";
import { cn } from "@/lib/utils";

/** One tile's preview totals — discounted (what the shopper pays
 *  after the tier % saving) plus compare (sum of strike-through
 *  prices across the tile's slots). The parent computes these
 *  once per tier with full slot context and passes them in; the
 *  picker stays purely presentational about pricing. */
export interface TierPricing {
  discountedTotalCents: number;
  compareTotalCents: number;
}

/**
 * Tiered offers picker — the "Buy 1 / Buy 2 Save 20% / Buy 3
 * Save 30%" tile stack that replaces the qty stepper on PDPs
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
 * Pricing math lives in `lib/offers#tierPricingFromSlots` — the
 * parent in `<BuyForm>` sums each tile's slot prices and hands
 * the totals to this picker as the `tierPricings` array, so the
 * picker itself does no money arithmetic. Frontend preview only:
 * the real discount applies at Shopify checkout once the cart
 * wiring stamps the tier id; display drift can't silently
 * overcharge because the cart math stays server-authoritative.
 */

export interface TieredOffersProps {
  tiers: ReadonlyArray<OfferTier>;
  /** Precomputed totals, one entry per tile in tile order. The
   *  parent has the full slot context (anchor variant +
   *  per-companion selections), so per-tile pricing is computed
   *  there and passed in — this picker stays purely
   *  presentational about money. */
  tierPricings: ReadonlyArray<TierPricing>;
  selectedIndex: number;
  onSelect: (index: number) => void;
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
  tierPricings,
  selectedIndex,
  onSelect,
  currency,
  selectedTierContent,
  className,
}: TieredOffersProps) {
  if (tiers.length === 0) return null;

  /* When the anchor tier (Buy 1, single unit) already crosses the
   * free-shipping threshold, every higher tier ships free by
   * definition — surfacing "+ Free Shipping" on each row adds no
   * information and crowds the floating badge cluster. We compute
   * the gate once here so the chip is either enabled across the
   * whole picker or suppressed across it, consistently. */
  const baseAlreadyShipsFree = qualifiesForFreeShipping(
    tierPricings[0]?.discountedTotalCents ?? 0,
    currency,
  );

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
            pricing={tierPricings[idx]}
            isSelected={isSelected}
            onSelect={() => onSelect(idx)}
            currency={currency}
            baseAlreadyShipsFree={baseAlreadyShipsFree}
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
  pricing: TierPricing | undefined;
  isSelected: boolean;
  onSelect: () => void;
  currency: string;
  /** When `true`, the product's anchor tier already qualifies for
   *  free shipping on its own — every tier inherits the perk, so
   *  the "+ Free Shipping" chip is redundant and suppressed across
   *  the whole picker. Decided once by the parent. */
  baseAlreadyShipsFree: boolean;
  expansionContent?: ReactNode;
}

function OfferRow({
  tier,
  pricing,
  isSelected,
  onSelect,
  currency,
  baseAlreadyShipsFree,
  expansionContent,
}: OfferRowProps) {
  /* `pricing` is always defined in practice — the parent maps
   * `tiers` and `tierPricings` from the same source. The fallback
   * here is a safety net for hot-reload races / future callers
   * that forget to pass the matching array; it keeps the row
   * rendering with zeros rather than throwing. */
  const discountedTotalCents = pricing?.discountedTotalCents ?? 0;
  const compareTotalCents = pricing?.compareTotalCents ?? 0;
  const showCompare = compareTotalCents > discountedTotalCents;
  const hasExpansion = isSelected && !!expansionContent;
  /* The free-shipping threshold lives at the *cart-total* level
   * upstream, and a tiered-offer add-to-cart commits the whole
   * tier as a single line item — so the tier's discounted total
   * is the right number to gate against. The chip surfaces only
   * when *this* tier crosses the threshold *and* the anchor tier
   * didn't already; that way the badge always communicates new
   * value, never restates what the shopper already gets at base
   * price. Same threshold + same green pill the product card
   * uses, so the perk reads identically wherever the shopper
   * sees it. */
  const tierUnlocksFreeShipping =
    !baseAlreadyShipsFree &&
    qualifiesForFreeShipping(discountedTotalCents, currency);

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

        {/* `min-h` reserves the height of a full two-line price
            (discounted `text-base` + `mt-0.5` + compare `text-xs`,
            all `leading-none` ≈ 1.875rem) and `justify-center`
            centres the content within it. So a row without a
            compare (Buy 1) keeps its single price vertically
            centred *and* matches the closed height of the rows that
            do show a compare. */}
        <span className="flex min-h-[1.875rem] flex-shrink-0 flex-col items-end justify-center leading-tight">
          <Price
            cents={discountedTotalCents}
            currency={currency}
            accent={isSelected ? "var(--color-brand)" : undefined}
            className="text-base"
          />
          {showCompare && (
            <Price
              cents={compareTotalCents}
              currency={currency}
              variant="compare"
              className="mt-0.5"
            />
          )}
        </span>
      </button>

      {hasExpansion && (
        <div className="border-t border-[color:var(--color-border)] px-4 pb-4 pt-3">
          {expansionContent}
        </div>
      )}

      {(tier.badge || tierUnlocksFreeShipping) && (
        <div
          /* Floating-chip cluster pinned to the top-right border
             of the tile. `pointer-events-none` so the chips never
             intercept clicks meant for the tile itself, and
             `-translate-y-1/2` centres the row on the border for
             the floating-chip look. Inner `gap-1.5` spaces the
             two chips evenly when both render; when only one is
             present the gap collapses naturally.
             Order — `[+ FREE SHIPPING] [MOST POPULAR]` — puts the
             durable perk on the left and the merchandising tag on
             the right, closest to the top-right corner that the
             eye returns to. */
          className={cn(
            "pointer-events-none absolute right-3 top-0 -translate-y-1/2",
            "flex items-center gap-1.5",
          )}
        >
          {tierUnlocksFreeShipping && (
            <span
              /* Green stays solid regardless of selection — the
                 perk doesn't change when the shopper picks this
                 tier, and a brand-orange flip would read as a
                 second CTA competing with the headline accent. */
              className={cn(
                "whitespace-nowrap rounded-full px-2 py-0.5",
                "text-[10px] font-bold uppercase tracking-wide text-white",
                "bg-[color:var(--color-success)]",
              )}
            >
              {/* The `+` glyph in Inter sits noticeably below the
                  cap height of the surrounding uppercase letters
                  because it's centred on the math axis, not the
                  cap line. Nudging it up 1px with
                  `relative -top-px` lands it on the same visual
                  midline as `FREE SHIPPING` so the chip reads as
                  one continuous label rather than a symbol
                  drooping below the text. */}
              <span className="relative -top-px">+</span> Free Shipping
            </span>
          )}
          {tier.badge && (
            <span
              className={cn(
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
