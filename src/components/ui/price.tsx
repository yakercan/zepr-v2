import { currencySign, localeForCurrency } from "@/config/markets";
import { cn } from "@/lib/utils";

/**
 * Storefront price renderer — the single source of truth for how
 * a money amount displays in the UI. Splits the localised string
 * into `symbol / dollars / cents` so the visual hierarchy can be:
 *
 *   • `regular`  → `$` and `.cents` small, dollars large + bold
 *                  (the cents read like a footnote on the dollars)
 *   • `compare`  → uniform small, muted, line-through
 *                  (the "original" price, dimmer than the active one)
 *
 * Used on the product card today; will be reused for PDP, cart,
 * checkout, promo banners, etc. — anything that prints money.
 *
 * Implementation notes:
 *
 *   - Cents are stored as integers everywhere (Salespace + our
 *     types), so the component takes `cents` and divides once.
 *     Callers never have to remember "is this dollars or cents?".
 *   - Multi-market formatting is driven entirely by the `currency`
 *     prop: the locale is derived from it via `localeForCurrency`,
 *     so a GBP amount renders `£1,234.56` (en-GB) with no context,
 *     no prop-drilling, and no client-side FX conversion — the
 *     amount is already the market's presentment price (Salespace
 *     per-market column or Shopify `@inContext`), we only localise
 *     its *display*. The one tweak on top of the raw locale output
 *     is the dollar sign: the non-US dollar markets would each
 *     format as a bare `$` in their own locale, so `currencySign`
 *     swaps in the disambiguated `CA$` / `AU$` / `S$` / `NZ$` (USA
 *     stays a plain `$`).
 *   - We run `Intl.NumberFormat` (cached internally by the JS
 *     engine) for the symbol + grouping, then regex-split the
 *     result. Currencies whose format doesn't match
 *     `<sym><dollars>.<cents>` (e.g. JPY) fall back to the plain
 *     formatted string, so nothing breaks for non-decimal currencies.
 *   - The `accent` prop lets the card pass the headline badge's
 *     colour through to the current price. We apply it inline so
 *     the JIT doesn't need to know every possible accent ahead of
 *     time (badges live in CSS vars + theme tokens).
 */

interface PriceParts {
  symbol: string;
  dollars: string;
  cents: string;
}

function splitPrice(cents: number, currency: string): PriceParts | null {
  const formatted = new Intl.NumberFormat(localeForCurrency(currency), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
  const match = formatted.match(/^(\D*)(\d[\d,]*)\.(\d+)$/);
  if (!match) return null;
  /* Prefer the storefront's disambiguated dollar sign (CA$ / AU$ /
   * S$ / NZ$) over the native locale's bare `$`; non-overridden
   * currencies keep the symbol Intl produced. */
  return { symbol: currencySign(currency) ?? match[1], dollars: match[2], cents: match[3] };
}

export type PriceVariant = "regular" | "compare";

/** The storefront-wide tint for a current price that's been
 *  marked down from a compare-at. Centralised here so PDP /
 *  product modal / cart drawer / order detail all read from one
 *  source — change this once and every "this is on sale" price
 *  in the app follows. */
export const DISCOUNT_PRICE_ACCENT = "var(--color-brand)";

export interface PriceProps {
  /** Amount in integer cents (Salespace's storage format). */
  cents: number;
  currency: string;
  variant?: PriceVariant;
  /** Inline color override for the current price — used by the
   *  product card to tint the price with the headline badge
   *  accent. Ignored on `compare` variants (they stay muted).
   *  Takes precedence over `discounted` when both are set, so a
   *  badge-tinted card price isn't silently re-coloured when the
   *  product is also on sale. */
  accent?: string;
  /** When `true`, paints the current price in the brand-orange
   *  "discounted" accent (`DISCOUNT_PRICE_ACCENT`). The semantic
   *  way for the PDP, the quick-add modal, the cart drawer, and
   *  the order detail page to flag "this price is the marked-
   *  down one" without each caller repeating the CSS variable.
   *  Ignored on `compare` variants (they stay muted). Ignored
   *  when an explicit `accent` is provided (the card's badge
   *  tint wins, see `accent` above). */
  discounted?: boolean;
  className?: string;
}

export function Price({
  cents,
  currency,
  variant = "regular",
  accent,
  discounted = false,
  className,
}: PriceProps) {
  const parts = splitPrice(cents, currency);

  if (!parts) {
    return (
      <span className={className}>
        {new Intl.NumberFormat(localeForCurrency(currency), {
          style: "currency",
          currency,
        }).format(cents / 100)}
      </span>
    );
  }

  if (variant === "compare") {
    return (
      <span
        className={cn(
          "text-xs font-normal leading-none line-through",
          "text-[color:var(--color-ink-muted)]",
          className,
        )}
      >
        {parts.symbol}
        {parts.dollars}.{parts.cents}
      </span>
    );
  }

  /* Resolution order: explicit `accent` (badge tint on cards) →
   * `discounted` (semantic flag for marked-down prices) → none
   * (default ink). Keeps the brand-orange decision in one place
   * while leaving the card's badge accent free to override. */
  const effectiveAccent =
    accent ?? (discounted ? DISCOUNT_PRICE_ACCENT : undefined);

  return (
    <span
      style={effectiveAccent ? { color: effectiveAccent } : undefined}
      className={cn(
        // Wrapper font-size is the *dollars* size. Symbol + cents
        // scale off it (see the `em`-relative spans below) so a
        // caller setting `text-3xl` here gets a proportionally
        // larger symbol and cents for free. Default `text-lg`
        // matches the original card price size byte-for-byte.
        "inline-flex items-baseline font-bold leading-none text-lg",
        "text-[color:var(--color-ink)]",
        className,
      )}
    >
      <span className="text-[0.667em]">{parts.symbol}</span>
      <span>{parts.dollars}</span>
      <span className="text-[0.667em]">.{parts.cents}</span>
    </span>
  );
}
