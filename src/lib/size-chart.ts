/**
 * Size-chart primitives shared by the storefront and any future
 * surface that surfaces the same Shopify metafields.
 *
 * Data shape: two `custom.*` metafields — `size_inches` and
 * `size_cm` — each holding a pipe-delimited, newline-rowed plain
 * string authored in Shopify admin:
 *
 *   "Size | Length | Width\nS | 26 | 18\nM | 27 | 19"
 *
 * Either or both may be set on a product. When both are present
 * the modal exposes a Inches ↔ CM toggle and defaults to inches
 * (matches the legacy storefront's behaviour, and the US-first
 * audience). When only one is present the toggle hides so the
 * shopper never sees an empty tab.
 *
 * Source of truth for parsing rules so the trigger gate
 * (`hasParseableChart`), the modal renderer, and any future
 * consumer (e.g. PDP-embedded chart panel) can never drift on
 * how the metafield's whitespace and empty-row rules are
 * interpreted.
 */

/**
 * Raw size-chart metafield values for a product. Each side is the
 * unparsed pipe-delimited string as authored in Shopify; either
 * (or both) may be `null` / empty when the merchant hasn't filled
 * in that unit. Carrying both sides as one prop keeps the API
 * compact — consumers never have to plumb two separate optional
 * strings — and the modal's unit-toggle logic can branch on
 * presence in one place.
 */
export interface SizeChart {
  inches?: string | null;
  cm?: string | null;
}

/**
 * Parse a pipe-delimited multi-line size-chart string into rows
 * of cells.
 *
 *   "Size | Length | Width\nS | 26 | 18"
 *     → [["Size", "Length", "Width"], ["S", "26", "18"]]
 *
 * Whitespace-only lines and surrounding spaces inside cells are
 * stripped so admins can space their metafield value freely
 * without breaking the table layout.
 *
 * Returns an empty array when nothing parses cleanly — caller
 * branches use that as the "no chart to render" signal so a
 * single malformed metafield never lights up an empty modal.
 */
export function parseSizeTable(raw: string): string[][] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split("|").map((cell) => cell.trim()));
}

/**
 * Does this product carry at least one parseable chart side?
 *
 * Cheap predicate that mirrors the modal's render contract — call
 * it where you'd otherwise leak modal-internal "has anything to
 * show" logic to a parent. The variant picker uses it to gate the
 * "Size guide" trigger so the link only appears when clicking it
 * would actually open a populated chart.
 */
export function hasSizeChart(chart: SizeChart | undefined | null): boolean {
  if (!chart) return false;
  const inches = chart.inches?.trim();
  const cm = chart.cm?.trim();
  return Boolean(
    (inches && parseSizeTable(inches).length > 0) ||
      (cm && parseSizeTable(cm).length > 0),
  );
}

/**
 * Case-insensitive match for the Shopify option that drives the
 * "Size" picker.
 *
 * Admin spelling varies across catalogues — some products carry
 * `Size`, others `size`, occasionally `SIZE`. Centralising the
 * predicate here means the variant picker's "show the size guide
 * link on this row" check stays robust against admin casing and
 * never has to inline a `.toLowerCase()` comparison.
 */
export function isSizeOptionName(name: string): boolean {
  return name.trim().toLowerCase() === "size";
}
