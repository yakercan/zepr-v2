import { formatMarketAmount } from "@/config/markets";
import { ZEPR_ICONS, ZeprIcon } from "@/components/ui/icons";
import { qualifiesForFreeShipping } from "@/lib/badges";
import { cn } from "@/lib/utils";

/**
 * Late-delivery goodwill credit, in minor units, keyed by presentment
 * currency — a flat local amount (not a converted USD figure), the
 * same "flat amount per market" model the free-shipping threshold
 * uses. Most markets sit at 5; Malaysia at 20, since MYR is a
 * lower-value unit where a flat RM 5 wouldn't read as a meaningful
 * gesture. Formatted per market via `formatMarketAmount`, so the
 * symbol follows the currency (RM 20.00, $5.00, £5.00, …).
 */
const DELAY_CREDIT_BY_CURRENCY: Readonly<Record<string, number>> = {
  MYR: 2000,
};

/** Fallback credit for any market without an override — the flat 5. */
const DEFAULT_DELAY_CREDIT_CENTS = 500;

function delayCreditCents(currency: string): number {
  return (
    DELAY_CREDIT_BY_CURRENCY[currency.toUpperCase()] ??
    DEFAULT_DELAY_CREDIT_CENTS
  );
}

/** Shared pill styling for both bubbles — soft-green wash + green
 *  hairline border, the same dialect the v5 alternative storefront
 *  settled on. Tighter inline/block padding on phones (< md) where
 *  the buy-form panel is cramped; full breathing room from md up. */
const BADGE_BUBBLE_CLASSES = cn(
  "flex items-center gap-2 rounded-lg border px-2.5 py-2 md:gap-3 md:px-3 md:py-2.5",
  "border-[color:var(--color-success-soft-border)] bg-[color:var(--color-success-soft)]",
  "text-[color:var(--color-success)]",
);

/**
 * "Free Shipping · Arrives Jun 5 – Jun 10" + "$5 credit for delay"
 * trust callout shown below the title on the PDP buy form.
 *
 * Two independent soft-green pills (truck + medal, the same CDN art
 * the legacy zepr storefront uses) laid out with `flex-wrap`: they
 * sit side by side when the surface has room and cleanly stack as
 * two whole bubbles when it doesn't. There's deliberately no divider
 * between them — a single card with an internal separator left the
 * separator orphaned at the start of the second row whenever the
 * credit segment wrapped; two self-contained pills can't do that.
 *
 * The pills:
 *
 *   - **Shipping headline** — always rendered. Two-line "Free
 *     Shipping / Arrives …" when the product clears the free-
 *     shipping threshold; a single arrival line otherwise.
 *   - **Credit-for-delay** — shown on every surface (page, modal,
 *     mobile sheet); the credit promise is part of the same trust
 *     beat as the arrival date.
 *
 * Dates render synchronously — server-rendered HTML carries the
 * final "Arrives …" string straight to the first paint, so there
 * is no swap-in flash on refresh. The page is ISR-cached at
 * 1 h granularity (see `revalidate` on the PDP route), so the
 * cached date can drift by up to that window vs. the user's
 * real "today"; `suppressHydrationWarning` on the date span
 * silences React's hydration check for the rare boundary where
 * SSR and hydration land on different calendar days. The display
 * is intentionally cache-time, not real-time, since the alternative
 * (re-computing on the client after mount) is exactly the
 * flash the shopper sees today.
 */

const DEFAULT_DELIVERY_TIME = "7-14";

function formatDeliveryRange(deliveryTime: string): string {
  const parts = deliveryTime.split("-").map((s) => Number.parseInt(s.trim(), 10));
  const minDays = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : 7;
  const maxDays =
    Number.isFinite(parts[1]) && parts[1] >= minDays ? parts[1] : minDays;

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() + minDays);
  const to = new Date(today);
  to.setDate(to.getDate() + maxDays);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return minDays === maxDays
    ? `Arrives ${fmt(from)}`
    : `Arrives ${fmt(from)} – ${fmt(to)}`;
}

export interface DeliveryBadgeProps {
  /** `custom.delivery_time` metafield from the product (e.g. `"7-14"`).
   *  Falls back to a conservative `"7-14"` when missing. */
  deliveryTime?: string;
  /** Active variant / product price in cents — drives the
   *  free-shipping headline. */
  priceCents: number;
  /** Presentment currency for `priceCents` — gates the market's
   *  free-shipping threshold and formats the delay-credit amount in
   *  the visitor's currency. */
  currency: string;
  className?: string;
}

export function DeliveryBadge({
  deliveryTime = DEFAULT_DELIVERY_TIME,
  priceCents,
  currency,
  className,
}: DeliveryBadgeProps) {
  const free = qualifiesForFreeShipping(priceCents, currency);
  const arrivalLabel = formatDeliveryRange(deliveryTime);
  const creditLabel = formatMarketAmount(delayCreditCents(currency), currency);

  return (
    // `flex-wrap` with `items-stretch`: the two pills sit on one row
    // when there's room (matching heights) and drop to their own row
    // as whole bubbles when the surface is too narrow — no divider to
    // orphan. `gap-2` keeps them tight on phones, `gap-3` from md up.
    <div
      className={cn(
        "flex flex-wrap items-stretch gap-2 md:gap-3",
        className,
      )}
    >
      <div className={BADGE_BUBBLE_CLASSES}>
        <ZeprIcon src={ZEPR_ICONS.shipping} size={24} />
        {free ? (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Free Shipping</span>
            <span className="text-xs" suppressHydrationWarning>
              {arrivalLabel}
            </span>
          </div>
        ) : (
          <span className="text-sm font-medium" suppressHydrationWarning>
            {arrivalLabel}
          </span>
        )}
      </div>

      {/* `whitespace-nowrap` keeps the credit label on one line inside
       *  its pill; if it can't fit beside the shipping pill the whole
       *  bubble wraps to the next row intact. */}
      <div className={BADGE_BUBBLE_CLASSES}>
        <ZeprIcon src={ZEPR_ICONS.medal} size={20} />
        <span className="whitespace-nowrap text-sm font-medium">
          {creditLabel} credit for delay
        </span>
      </div>
    </div>
  );
}
