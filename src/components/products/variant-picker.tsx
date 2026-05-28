"use client";

import { useState } from "react";

import { SizeChartModal } from "@/components/products/size-chart-modal";
import { VariantDropdown } from "@/components/products/variant-dropdown";
import { ViewAllLink } from "@/components/ui/view-all-link";
import {
  hasSizeChart,
  isSizeOptionName,
  type SizeChart,
} from "@/lib/size-chart";
import {
  availableValuesFor,
  shouldUseDropdownForPdp,
  type OptionSelection,
} from "@/lib/variants";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ProductOption, ProductVariant } from "@/types/product";

/**
 * Option picker for the PDP — one row per option group (Color,
 * Size, Material…). Each option independently picks its
 * presentation via `shouldUseDropdownForPdp`:
 *
 *   - ≤ 8 values → chips with a "Color: Blue" header above the
 *     wrap row. Stays scannable at a glance and one tap commits.
 *   - > 8 values → dropdown. The collapsed pill trades a visual
 *     catalogue for one extra click but stops a 12-colour row
 *     from blowing the buy column out vertically.
 *
 * Layout adapts to the mix:
 *
 *   - All dropdowns → wrap-flowing row of pill triggers, just
 *     like a chip row. Side-by-side compresses a Color + Size +
 *     Material PDP onto a single visual line.
 *   - Anything else → vertical stack so each chip row keeps its
 *     own "Color: Blue" header above its wrap row.
 *
 * Visual language: `pillClasses(active, "outline")` for both
 * modes so "Pick one of these" reads the same dialect across the
 * storefront — chip pills, dropdown triggers, filter pills, tab
 * pills all share one shape.
 *
 * Cascade: only values that are *reachable* given the current
 * upstream selection are rendered. The first option group shows
 * everything; later ones narrow as the shopper picks above. We
 * never paint a strike-through "you can't reach this" pill — the
 * caller's `onSelect` handler (`cascadeSelect`) keeps the
 * downstream selection valid, so impossible combos simply don't
 * appear.
 *
 * # Size guide
 *
 * When `sizeChart` is passed AND the product has at least one
 * parseable chart side, the Size option's chip-row header grows
 * a right-aligned "View guide →" trigger that opens
 * `<SizeChartModal>`. Renders through `<ViewAllLink>` (the
 * same primitive the account dashboard uses for "Manage" /
 * "Edit" and section headers use for "View all") so the
 * affordance reads as part of the storefront's standard
 * "more this way" dialect rather than a one-off control.
 *
 * Edge case: when the Size option happens to be a dropdown
 * (>8 values, very rare for Size in practice — most apparel
 * tops out around 5 sizes) the inline placement is skipped.
 * We could synthesise a standalone row for the link in that
 * case, but the trade-off isn't worth the extra layout branch
 * for a configuration we don't ship today.
 *
 * Pure presentation — selection state lives in `<BuyForm>`.
 * The chart modal's open/close state is owned here because the
 * trigger and the modal are both internal concerns; lifting
 * either to the parent would just bounce state through one
 * extra layer.
 */
export interface VariantPickerProps {
  options: readonly ProductOption[];
  variants: readonly ProductVariant[];
  selection: OptionSelection;
  onSelect: (optionName: string, value: string) => void;
  /** Raw size-chart metafields from Shopify. When parseable, a
   *  "Size guide" link appears in the Size option's chip-row
   *  header and clicking it opens `<SizeChartModal>`. Omit (or
   *  pass an empty chart) to suppress the link entirely. */
  sizeChart?: SizeChart;
  className?: string;
}

export function VariantPicker({
  options,
  variants,
  selection,
  onSelect,
  sizeChart,
  className,
}: VariantPickerProps) {
  const [chartOpen, setChartOpen] = useState(false);

  if (options.length === 0) return null;

  /* All-dropdown PDPs lay their triggers out side-by-side like a
   * chip row — single visual line for Color + Size + Material.
   * Mixed (some dropdowns, some chips) or all-chips stay in the
   * vertical stack so each chip row keeps its label header. */
  const allDropdowns = options.every(shouldUseDropdownForPdp);

  /* Single canonical "should this product show a size guide?"
   * answer — used both to gate the inline trigger and to decide
   * whether to mount the modal at all. */
  const chartAvailable = hasSizeChart(sizeChart);

  return (
    <>
      <div
        role="group"
        aria-label="Product options"
        className={cn(
          allDropdowns ? "flex flex-wrap gap-2" : "flex flex-col gap-5",
          className,
        )}
      >
        {options.map((option) => {
          const currentValue = selection[option.name];
          const reachable = availableValuesFor(
            options,
            variants,
            selection,
            option.name,
          );
          /* Walk the admin-authored value list (stable left-to-
           * right order) and keep only the ones still reachable
           * under the current upstream selection. Empty rows are
           * dropped entirely so the picker never paints a blank
           * label header with no chips below. */
          const visibleValues = option.values.filter((v) => reachable.has(v));
          if (visibleValues.length === 0) return null;

          if (shouldUseDropdownForPdp(option)) {
            /* The dropdown trigger already carries the "Color:
             * Blue" composition, so we skip the chip-mode header. */
            return (
              <VariantDropdown
                key={option.name}
                optionName={option.name}
                currentValue={currentValue}
                values={visibleValues}
                onSelect={(value) => onSelect(option.name, value)}
              />
            );
          }

          const isSizeRow = isSizeOptionName(option.name);
          const showSizeGuide = isSizeRow && chartAvailable;

          return (
            <div key={option.name} className="flex flex-col gap-3">
              {/* Label row: "Color: Blue" — the picked value is
               *  inline with the option name so a shopper scanning
               *  the page sees the resolved configuration at a
               *  glance, without scanning every pill row for the
               *  inked one. Plain div + h3 instead of fieldset +
               *  legend so the flex `gap` lands reliably (legend's
               *  default placement floats outside the fieldset
               *  flow and ignores parent gaps in some browsers).
               *
               *  Size rows with a parseable chart grow a trailing
               *  "View guide →" trigger — `justify-between`
               *  pushes it to the row's right edge so it never
               *  crowds the resolved-value text. */}
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
                  {option.name}:
                  {currentValue && (
                    <span className="ml-1.5 font-medium text-[color:var(--color-ink)]">
                      {currentValue}
                    </span>
                  )}
                </h3>
                {showSizeGuide && (
                  <ViewAllLink
                    label="View guide"
                    onClick={() => setChartOpen(true)}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleValues.map((value) => {
                  const selected = currentValue === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onSelect(option.name, value)}
                      aria-pressed={selected}
                      className={cn(
                        pillClasses(selected, "outline"),
                        // Tighter than the feed-tab default — variant
                        // pills sit inside a denser column and "S",
                        // "M", "L" benefit from less air around them.
                        "px-4 py-2",
                      )}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mount the chart modal once at the picker root — `<Modal>`
       *  portals to `document.body`, so position in the picker
       *  tree doesn't matter, but mounting it here keeps the
       *  trigger and its target colocated in one component. */}
      {chartAvailable && sizeChart && (
        <SizeChartModal
          open={chartOpen}
          onClose={() => setChartOpen(false)}
          chart={sizeChart}
        />
      )}
    </>
  );
}
