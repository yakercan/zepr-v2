import { formatMarketAmount } from "@/config/markets";
import { ShopPayLogo } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * "Pay in 4 interest-free installments for orders over <min> with
 * [Shop Pay]" — the installment promise under the Add-to-Cart CTA.
 *
 * # Eligibility (market-gated)
 *
 * Shop Pay Installments (serviced by Affirm) is only offered in the
 * US, Canada, and the UK, each with its own order minimum. We gate
 * on the product's presentment `currency`, which maps 1:1 to the
 * visitor's market (USD → US, CAD → CA, GBP → UK). The other six
 * markets — Singapore, New Zealand, Australia, Malaysia, the UAE,
 * and the Philippines (SGD / NZD / AUD / MYR / AED / PHP) — aren't
 * eligible, so the badge renders nothing for them: absence from
 * `INSTALLMENT_MIN_CENTS` is the whole eligibility check, and a new
 * market is opted out by default until it's added there. Minimums
 * follow Shopify's published thresholds:
 *
 *   US → $35 USD     CA → $35 CAD     UK → £50 GBP
 *
 * The minimum is shown in the same currency (and locale-aware
 * formatting) as every other price on the page, so a Canadian sees
 * "$35.00", a UK shopper "£50.00", etc. Shopify still gates the
 * actual eligibility at checkout — this line is the marketing
 * promise, not a hard price check on the current product.
 */

/* TEMPORARY: installment messaging is switched off in every market.
 * Flip this back to `true` to restore it — the eligible markets and
 * their minimums are untouched below, so US / CA / UK return exactly
 * as before with no other edit needed. */
const INSTALLMENTS_ENABLED = false;

/** Per-currency installment minimum, in minor units. Presence in
 *  this map == "Shop Pay Installments available for this market". */
const INSTALLMENT_MIN_CENTS: Readonly<Record<string, number>> = {
  USD: 3500,
  CAD: 3500,
  GBP: 5000,
};

export function ShopPayBadge({
  currency,
  className,
}: {
  /** Product's presentment currency. Gates eligibility (US/CA/UK
   *  only) and sets the minimum amount + its formatting. */
  currency: string;
  className?: string;
}) {
  /* Temporarily off everywhere — see `INSTALLMENTS_ENABLED`. */
  if (!INSTALLMENTS_ENABLED) return null;

  const minCents = INSTALLMENT_MIN_CENTS[currency];
  /* Not an installment market → no badge. */
  if (minCents === undefined) return null;

  const minLabel = formatMarketAmount(minCents, currency);

  return (
    <p
      className={cn(
        "pl-1 text-sm font-medium leading-snug",
        "text-[color:var(--color-ink-secondary)]",
        className,
      )}
    >
      Pay in 4 interest-free installments for orders over {minLabel}{" "}
      {/* Keep "with [Shop Pay]" together so the logo never orphans
          onto a line by itself — if the sentence wraps, the word and
          the wordmark drop to the next line as one unit. `align-middle`
          centres the logo on the text; `-top-px` nudges it the last
          hair up so its baseline sits level with the copy. */}
      <span className="whitespace-nowrap">
        with{" "}
        <ShopPayLogo className="relative -top-px inline-block h-[14px] w-[59px] align-middle" />
      </span>
    </p>
  );
}
