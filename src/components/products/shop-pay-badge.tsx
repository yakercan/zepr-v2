import { ShopPayLogo } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * "Pay in 4 interest-free installments for orders over $35.00
 * with [Shop Pay]" — the small installment promise that sits
 * directly under the Buy Now CTA on the PDP.
 *
 * Pure presentational. The legacy storefront renders this for
 * every in-stock product regardless of price (Shopify itself
 * gates the actual eligibility at checkout), so the gate here
 * is "do we have something the shopper can buy?" — managed by
 * the parent CTA stack — not "is the price above $35".
 *
 * Threshold copy is intentionally hardcoded to mirror what the
 * old zepr storefront ships; the value lines up with our
 * `FREE_SHIPPING_THRESHOLD_CENTS` today, but the two are
 * independent concerns and shouldn't be coupled.
 */
export function ShopPayBadge({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "pl-1 text-sm font-medium leading-snug",
        "text-[color:var(--color-ink-secondary)]",
        className,
      )}
    >
      Pay in 4 interest-free installments for orders over $35.00{" "}
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
