import type { ProductOption, ProductVariant } from "@/types/product";

/**
 * Variant resolution — the pure-function brain behind the PDP
 * picker.
 *
 * One file, zero React imports: the picker UI binds these helpers
 * to component state; the cart store will reuse `findVariant` for
 * "do we have a real variant id to attach to this cart line?"
 * Single source of truth for the question "which variant matches
 * the current selection?" — every other surface that asks (modal,
 * future buy-again rail, gift-card flow) reads the same logic.
 */

/** Picker state — option name keyed to the currently-picked value. */
export type OptionSelection = Record<string, string>;

/**
 * Find the variant whose `selectedOptions` exactly matches every
 * entry in `selection`. Returns `undefined` when the selection is
 * partial (some options unset) or refers to a combination the
 * product doesn't carry (e.g. "Color: Blue + Size: XS" where that
 * pair was never produced).
 */
export function findVariant(
  variants: readonly ProductVariant[],
  selection: OptionSelection,
): ProductVariant | undefined {
  return variants.find((v) =>
    v.selectedOptions.every((o) => selection[o.name] === o.value),
  );
}

/**
 * Seed the picker with the first available variant's options so
 * the PDP opens with a concrete, purchasable configuration —
 * matches the behaviour every well-known storefront ships with.
 * Falls back to the first variant overall if none are in stock,
 * so the picker is still populated even on fully sold-out
 * products.
 *
 * Returns an empty selection when the product carries no
 * variants at all (defensive — shouldn't happen in real data).
 */
export function defaultSelection(
  variants: readonly ProductVariant[],
): OptionSelection {
  const variant =
    variants.find((v) => v.availableForSale) ?? variants[0];
  if (!variant) return {};
  const selection: OptionSelection = {};
  for (const { name, value } of variant.selectedOptions) {
    selection[name] = value;
  }
  return selection;
}

/**
 * The set of values that are valid picks for `optionName`, given
 * only the selections of the options that come *before* it in the
 * authored option order.
 *
 * Cascade model — first option is "master", every later option
 * narrows based on the prior selection:
 *
 *   - First option (e.g. Color): all values that any variant
 *     carries (nothing to narrow against yet).
 *   - Second option (e.g. Size): only sizes that pair with the
 *     currently-picked Color.
 *   - Third option (e.g. Material): only materials that pair with
 *     the currently-picked Color *and* Size.
 *
 * The picker hides values that aren't in this set, so a shopper
 * never sees a value that would land them on a non-existent
 * variant. The CASCADE direction follows the option order
 * Shopify admin authored — change the admin order to change which
 * option drives which.
 *
 * Stock-out is intentionally NOT filtered here: a combo that
 * exists but is sold out still shows in the picker, so the
 * shopper can see the configuration and the CTA can explain
 * "Out of stock" downstream. Hiding sold-out values would
 * disappear options without telling the user why.
 */
export function availableValuesFor(
  options: readonly ProductOption[],
  variants: readonly ProductVariant[],
  selection: OptionSelection,
  optionName: string,
): Set<string> {
  const optionIdx = options.findIndex((o) => o.name === optionName);
  if (optionIdx < 0) return new Set();
  const priorNames = new Set(
    options.slice(0, optionIdx).map((o) => o.name),
  );

  const valid = new Set<string>();
  for (const variant of variants) {
    let matchesPrior = true;
    let valueForThis: string | undefined;
    for (const o of variant.selectedOptions) {
      if (o.name === optionName) {
        valueForThis = o.value;
        continue;
      }
      if (
        priorNames.has(o.name) &&
        selection[o.name] !== undefined &&
        selection[o.name] !== o.value
      ) {
        matchesPrior = false;
        break;
      }
    }
    if (matchesPrior && valueForThis !== undefined) {
      valid.add(valueForThis);
    }
  }
  return valid;
}

/**
 * Update the selection with a single option change, auto-
 * correcting any downstream options whose current value is no
 * longer valid under the new upstream selection.
 *
 * Walks options left-to-right starting *after* the changed one:
 * for each later option, if its current pick is still available
 * we leave it alone; otherwise we swap to the first value that
 * is available, in the admin-authored value order (so the
 * fallback is deterministic and matches the visual left-to-right
 * order the shopper sees).
 *
 * Single source of truth for "the picker just moved" — the
 * VariantPicker UI is stateless, the BuyForm wires this in as
 * the `onSelect` handler, and any future surface (modal,
 * buy-again rail) that wants to react to an option change can
 * reuse it without re-deriving the cascade.
 */
export function cascadeSelect(
  options: readonly ProductOption[],
  variants: readonly ProductVariant[],
  prev: OptionSelection,
  changedOption: string,
  newValue: string,
): OptionSelection {
  const next: OptionSelection = { ...prev, [changedOption]: newValue };
  const changedIdx = options.findIndex((o) => o.name === changedOption);
  if (changedIdx < 0) return next;

  for (let i = changedIdx + 1; i < options.length; i++) {
    const opt = options[i];
    const valid = availableValuesFor(options, variants, next, opt.name);
    if (next[opt.name] !== undefined && valid.has(next[opt.name])) continue;
    const fallback = opt.values.find((v) => valid.has(v));
    if (fallback !== undefined) {
      next[opt.name] = fallback;
    } else {
      delete next[opt.name];
    }
  }
  return next;
}
