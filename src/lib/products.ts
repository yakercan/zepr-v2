import type { SearchProduct } from "@/types/product";

/**
 * Does this product have option groups the shopper needs to pick
 * from (Size, Color, Material, …)?
 *
 * Reads from `product.options`, which the Salespace sync pipeline
 * normalises so that single-variant "Default Title" products show
 * up with no options at all (the upstream API strips them via
 * `extractProductOptions`). That means a non-empty `options` map
 * == "real picker needed", and an empty/missing one == "single
 * configuration, just add it".
 *
 * Why not the price-range trick (`price_max > price_min`)? That
 * signal misses every product whose variants are priced
 * identically (e.g. five colours of the same shirt, one price).
 * `options` is the authoritative source.
 *
 * Single source of truth — the card's quick-add today, future PDP
 * inline pickers, cart-line "edit variant" flow, and any other
 * surface that needs the same answer all read this one predicate.
 * When the API later exposes a denormalised scalar (`option_count`
 * or similar), this is the only line that changes.
 */
export function hasVariants(product: SearchProduct): boolean {
  return product.options !== undefined && Object.keys(product.options).length > 0;
}
