"use client";

import { VariantDropdown } from "@/components/products/variant-dropdown";
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
 * Pure presentation — selection state lives in `<BuyForm>`.
 */
export interface VariantPickerProps {
  options: readonly ProductOption[];
  variants: readonly ProductVariant[];
  selection: OptionSelection;
  onSelect: (optionName: string, value: string) => void;
  className?: string;
}

export function VariantPicker({
  options,
  variants,
  selection,
  onSelect,
  className,
}: VariantPickerProps) {
  if (options.length === 0) return null;

  /* All-dropdown PDPs lay their triggers out side-by-side like a
   * chip row — single visual line for Color + Size + Material.
   * Mixed (some dropdowns, some chips) or all-chips stay in the
   * vertical stack so each chip row keeps its label header. */
  const allDropdowns = options.every(shouldUseDropdownForPdp);

  return (
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

        return (
          <div key={option.name} className="flex flex-col gap-3">
            {/* Label row: "Color: Blue" — the picked value is
             *  inline with the option name so a shopper scanning
             *  the page sees the resolved configuration at a
             *  glance, without scanning every pill row for the
             *  inked one. Plain div + h3 instead of fieldset +
             *  legend so the flex `gap` lands reliably (legend's
             *  default placement floats outside the fieldset
             *  flow and ignores parent gaps in some browsers). */}
            <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
              {option.name}:
              {currentValue && (
                <span className="ml-1.5 font-medium text-[color:var(--color-ink)]">
                  {currentValue}
                </span>
              )}
            </h3>
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
  );
}
