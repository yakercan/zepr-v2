"use client";

import { availableValuesFor, type OptionSelection } from "@/lib/variants";
import { pillClasses } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ProductOption, ProductVariant } from "@/types/product";

/**
 * Option picker for the PDP — one row per option group (Color,
 * Size, Material…), each row a wrap-flowing strip of pills.
 *
 * Visual language: reuses `pillClasses(active, "outline")`, the
 * same component the search-page filter chips and homepage feed
 * tabs render with. "Pick one of these" looks the same wherever
 * the storefront asks the question.
 *
 * Cascade: only values that are *reachable* given the current
 * upstream selection are rendered. The first option group shows
 * everything; later ones narrow as the shopper picks above. We
 * never paint a strike-through "you can't reach this" pill — the
 * caller's `onSelect` handler (`cascadeSelect`) keeps the
 * downstream selection valid, so impossible combos simply don't
 * appear. Cleaner than the cross-out treatment and matches the
 * legacy storefront's feel.
 *
 * Pure presentation — selection state lives in `<BuyForm>`. The
 * picker is fed a `selection` and an `onSelect(name, value)`
 * callback; it never mutates anything itself. Lets us share the
 * same picker in the future product-modal-on-card flow without
 * its state leaking back to the card.
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

  return (
    <div
      role="group"
      aria-label="Product options"
      className={cn("flex flex-col gap-5", className)}
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
        const visibleValues = option.values.filter((v) =>
          reachable.has(v),
        );
        if (visibleValues.length === 0) return null;

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
