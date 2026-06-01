/**
 * Multi-market / multi-currency configuration — the single source
 * of truth that maps a visitor's country onto everything the
 * storefront needs to price and format for that market.
 *
 * Six live markets today: the USA baseline plus AU · CA · GB · NZ ·
 * SG. Country codes are ISO 3166-1 alpha-2, which is exactly what
 * both Shopify's `CountryCode` enum (`@inContext(country:)`) and the
 * Salespace per-market columns key off — so `country` doubles as the
 * Shopify context code with no translation table.
 *
 * Each market carries:
 *
 *   - `currency`        ISO 4217 code. The authoritative label for
 *                       prices in this market. For Salespace-sourced
 *                       prices we derive the code from here (the
 *                       Salespace payload's own `currency` field
 *                       stays the shop default); for Shopify-sourced
 *                       prices `@inContext` returns the code itself.
 *   - `locale`          BCP-47 tag handed to `Intl.NumberFormat` for
 *                       symbol + grouping + decimal placement.
 *   - `salespaceSuffix` Column suffix on the Salespace search payload
 *                       (`price_min_cents_gb`, …). Empty string for
 *                       the USA baseline (unsuffixed columns).
 *
 * This module is intentionally pure (no `server-only`, no env) so
 * both the server data layer and the client `Price` component can
 * import it.
 */

/** ISO 3166-1 alpha-2 codes for the markets we serve. `GB` (not
 *  `UK`) is correct — it's the alpha-2 code Shopify and Meta both
 *  use for the United Kingdom. */
export type MarketCountry = "US" | "GB" | "CA" | "SG" | "NZ" | "AU";

export interface Market {
  country: MarketCountry;
  currency: string;
  locale: string;
  /** Salespace column suffix; `""` for the USA baseline. */
  salespaceSuffix: string;
}

export const MARKETS: Readonly<Record<MarketCountry, Market>> = {
  US: { country: "US", currency: "USD", locale: "en-US", salespaceSuffix: "" },
  GB: { country: "GB", currency: "GBP", locale: "en-GB", salespaceSuffix: "_gb" },
  CA: { country: "CA", currency: "CAD", locale: "en-CA", salespaceSuffix: "_ca" },
  SG: { country: "SG", currency: "SGD", locale: "en-SG", salespaceSuffix: "_sg" },
  NZ: { country: "NZ", currency: "NZD", locale: "en-NZ", salespaceSuffix: "_nz" },
  AU: { country: "AU", currency: "AUD", locale: "en-AU", salespaceSuffix: "_au" },
} as const;

/** USA is the baseline: unsuffixed Salespace columns, no shortcode,
 *  same price + compare-at as the shop default. Every unknown /
 *  unsupported country falls back here. */
export const DEFAULT_MARKET: Market = MARKETS.US;

/**
 * Resolve a raw country code (Vercel geo header, override cookie,
 * Shopify context) to a supported `Market`. Case-insensitive;
 * anything outside the six live markets falls back to the USA
 * default so callers never have to null-check.
 */
export function resolveMarket(
  countryCode: string | null | undefined,
): Market {
  if (!countryCode) return DEFAULT_MARKET;
  const code = countryCode.trim().toUpperCase();
  return (MARKETS as Record<string, Market>)[code] ?? DEFAULT_MARKET;
}

/**
 * Map an ISO 4217 currency code to the BCP-47 locale we format it
 * in. Lets the `Price` component stay a pure, prop-driven component
 * (it already receives `currency`) and pick the right
 * `Intl.NumberFormat` locale without a React context or any
 * prop-drilling. Unknown currencies fall back to `en-US`, which
 * still formats correctly — it just won't be the "native" grouping
 * for that currency.
 */
const CURRENCY_LOCALE: Readonly<Record<string, string>> = {
  USD: "en-US",
  GBP: "en-GB",
  CAD: "en-CA",
  SGD: "en-SG",
  NZD: "en-NZ",
  AUD: "en-AU",
};

export function localeForCurrency(currency: string): string {
  return CURRENCY_LOCALE[currency.toUpperCase()] ?? "en-US";
}
