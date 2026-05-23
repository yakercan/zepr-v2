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
 *   - We run `Intl.NumberFormat` (cached internally by the JS
 *     engine) for the symbol + grouping, then regex-split the
 *     result. Currencies whose format doesn't match
 *     `<sym><dollars>.<cents>` (e.g. JPY) fall back to the plain
 *     formatted string, so nothing breaks for non-USD storefronts.
 *   - The `accent` prop lets the card pass the headline badge's
 *     colour through to the current price. We apply it inline so
 *     the JIT doesn't need to know every possible accent ahead of
 *     time (badges live in CSS vars + theme tokens).
 */
const DEFAULT_LOCALE = "en-US";

interface PriceParts {
  symbol: string;
  dollars: string;
  cents: string;
}

function splitPrice(cents: number, currency: string): PriceParts | null {
  const formatted = new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
  const match = formatted.match(/^(\D*)(\d[\d,]*)\.(\d+)$/);
  if (!match) return null;
  return { symbol: match[1], dollars: match[2], cents: match[3] };
}

export type PriceVariant = "regular" | "compare";

export interface PriceProps {
  /** Amount in integer cents (Salespace's storage format). */
  cents: number;
  currency: string;
  variant?: PriceVariant;
  /** Inline color override for the current price — used by the
   *  product card to tint the price with the headline badge
   *  accent. Ignored on `compare` variants (they stay muted). */
  accent?: string;
  className?: string;
}

export function Price({
  cents,
  currency,
  variant = "regular",
  accent,
  className,
}: PriceProps) {
  const parts = splitPrice(cents, currency);

  if (!parts) {
    return (
      <span className={className}>
        {new Intl.NumberFormat(DEFAULT_LOCALE, {
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

  return (
    <span
      style={accent ? { color: accent } : undefined}
      className={cn(
        "inline-flex items-baseline font-bold leading-none",
        "text-[color:var(--color-ink)]",
        className,
      )}
    >
      <span className="text-xs">{parts.symbol}</span>
      <span className="text-lg">{parts.dollars}</span>
      <span className="text-xs">.{parts.cents}</span>
    </span>
  );
}
