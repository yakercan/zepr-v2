"use client";

import Link from "next/link";
import { VariantDropdown } from "@/components/products/variant-dropdown";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { ExternalLinkIcon } from "@/components/ui/icons";
import {
  availableValuesFor,
  findVariant,
  shouldUseDropdownForOfferUnit,
  type OptionSelection,
} from "@/lib/variants";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ProductOption, ProductVariant } from "@/types/product";

/**
 * One unit's picker configuration — what the buy-form hands the
 * picker for each slot in the active tier.
 *
 * Anchor slots point at the PDP product; companion slots point at
 * the bundled product fetched server-side off the `custom.offers`
 * metafield. The card uses the shape it's given — no knowledge of
 * the underlying product types — so the BuyForm stays the single
 * place that knows whether a slot is the anchor or a bundle pair.
 *
 * Slot #1 is wired to the top variant picker's `selection` +
 * `onSelect`; chip changes propagate via shared state instead of
 * a two-way sync effect.
 */
export interface UnitSlotConfig {
  kind: "anchor" | "companion";
  /** Companion product title — surfaced as the card header for
   *  companion slots. `undefined` on anchor (the page already
   *  shows the anchor's title up top). */
  title?: string;
  /** Companion product handle — used to build the open-in-new-tab
   *  arrow link. `undefined` on anchor. */
  handle?: string;
  options: readonly ProductOption[];
  variants: readonly ProductVariant[];
  selection: OptionSelection;
  onSelect: (optionName: string, value: string) => void;
  fallbackImageUrl: string;
}

/**
 * Per-unit variant pickers shown inside the *selected* tiered-
 * offers tile.
 *
 * One card per slot (always — including unit #1). The card for
 * unit #1 is wired to the top variant picker's selection +
 * handler, so changing chips in either place updates both
 * surfaces in lockstep — single shared state, no two-way sync
 * effect to keep in step. Slots ≥ 2 carry independent state and
 * may point at a bundle companion product instead of the anchor.
 *
 * Layout per card:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ #1  [thumb]  Color: [Red] [Blue]                           │
 *   ├────────────────────────────────────────────────────────────┤
 *   │ #2  [thumb]  Companion title  Color: [Red] [Blue]      [↗]│
 *   └────────────────────────────────────────────────────────────┘
 *
 *   - Anchor slots carry just the `#N` index — the PDP already
 *     shows the anchor's title up top, repeating it on every
 *     card would just be noise.
 *   - Companion slots carry the companion title inline, with the
 *     open-in-new-tab arrow pinned to the right edge of the row so
 *     a shopper can inspect the bundled product without losing
 *     their current cart configuration.
 *
 * Per-option presentation via `shouldUseDropdownForOfferUnit`:
 *
 *   - 1 option, ≤ 3 values → inline chips
 *   - > 1 option OR > 3 values → dropdown (compact size)
 *
 * Tighter than the PDP top picker's threshold on purpose — the
 * unit cards are dense single-row strips, so even modest chip
 * rows benefit from folding into a dropdown sooner.
 *
 * Pure presentation. All state lives in `<BuyForm>` because the
 * Add-to-cart + Buy Now CTAs need it to compose the cart payload;
 * this component is purely controlled.
 */

export interface OfferUnitPickersProps {
  slots: ReadonlyArray<UnitSlotConfig>;
}

export function OfferUnitPickers({ slots }: OfferUnitPickersProps) {
  if (slots.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {slots.map((slot, idx) => (
        <UnitCard key={idx} unitNumber={idx + 1} slot={slot} />
      ))}
    </div>
  );
}

interface UnitCardProps {
  unitNumber: number;
  slot: UnitSlotConfig;
}

function UnitCard({ unitNumber, slot }: UnitCardProps) {
  /* Variant resolution — the unit's thumbnail swaps to the picked
   * colourway, falling through to the slot's fallback when the
   * selection is partial or lands on an unmade combo. */
  const variant = findVariant(slot.variants, slot.selection);
  const thumbUrl = variant?.image?.url ?? slot.fallbackImageUrl;
  const isCompanion = slot.kind === "companion";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2.5">
      <span
        className="shrink-0 text-xs font-bold tabular-nums text-[color:var(--color-ink)]"
        aria-label={`Item ${unitNumber}`}
      >
        #{unitNumber}
      </span>

      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[color:var(--color-bubble)]">
        {thumbUrl && (
          <ShimmerImage
            src={thumbUrl}
            alt={variant?.image?.altText ?? `Item ${unitNumber} preview`}
            wrapperClassName="block h-full w-full"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
        {isCompanion && slot.title && (
          <span className="line-clamp-1 text-xs font-semibold text-[color:var(--color-ink)]">
            {slot.title}
          </span>
        )}

        {slot.options.map((option) => {
          const currentValue = slot.selection[option.name];
          const reachable = availableValuesFor(
            slot.options,
            slot.variants,
            slot.selection,
            option.name,
          );
          const visibleValues = option.values.filter((v) => reachable.has(v));
          if (visibleValues.length === 0) return null;

          if (shouldUseDropdownForOfferUnit(slot.options, option)) {
            return (
              <VariantDropdown
                key={option.name}
                optionName={option.name}
                currentValue={currentValue}
                values={visibleValues}
                onSelect={(value) => slot.onSelect(option.name, value)}
                size="sm"
              />
            );
          }

          return (
            <div
              key={option.name}
              className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
            >
              <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-muted)]">
                {option.name}:
              </span>
              {visibleValues.map((value) => {
                const selected = currentValue === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => slot.onSelect(option.name, value)}
                    aria-pressed={selected}
                    aria-label={`Item ${unitNumber}, ${option.name}: ${value}`}
                    className={cn(
                      pillClasses(selected, "outline"),
                      /* Tighter than the top picker — these chips
                       * sit inside an inline wrap-row, so the
                       * smaller pad keeps a multi-option product
                       * from blowing out the card's vertical
                       * height. */
                      "px-3 py-1 text-xs",
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {isCompanion && slot.handle && (
        <Link
          href={`/products/${slot.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={
            slot.title
              ? `Open ${slot.title} in a new tab`
              : "Open product in a new tab"
          }
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-bubble)] hover:text-[color:var(--color-brand)]"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
