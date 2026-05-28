import { ZEPR_ICONS, ZeprIcon } from "@/components/ui/icons";
import { qualifiesForFreeShipping } from "@/lib/badges";
import { cn } from "@/lib/utils";

/**
 * "Free Shipping / Arrives Jun 5 – Jun 10 / $5 credit for delay"
 * trust callout shown below the title on the PDP buy form.
 *
 * Visual: a single soft-green card (light-green wash + green
 * hairline border) — the same dialect the v5 alternative
 * storefront settled on, which sits comfortably inside the buy-
 * form panel without competing with the price block. Icons are
 * the same CDN art the legacy zepr storefront uses (truck +
 * medal), so the perk reads the same wherever a shopper sees it.
 *
 * The card splits into two reassurance points:
 *
 *   - **Shipping headline** — always rendered. Two-line "Free
 *     Shipping / Arrives …" when the product clears the free-
 *     shipping threshold; a single arrival line otherwise.
 *   - **Credit-for-delay** — separated by a thin green divider,
 *     grouped into one inline-flex unit so the separator stays
 *     glued to the medal icon if the badge wraps onto two lines.
 *     Shown on every surface (page, modal, mobile sheet) — the
 *     "$5 for late delivery" promise is part of the same trust
 *     beat as the arrival date, hiding it on narrow surfaces
 *     would split the message in half.
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
const CREDIT_AMOUNT_LABEL = "$5.00 credit for delay";

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
  className?: string;
}

export function DeliveryBadge({
  deliveryTime = DEFAULT_DELIVERY_TIME,
  priceCents,
  className,
}: DeliveryBadgeProps) {
  const free = qualifiesForFreeShipping(priceCents);
  const arrivalLabel = formatDeliveryRange(deliveryTime);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5",
        "border-[color:var(--color-success-soft-border)] bg-[color:var(--color-success-soft)]",
        "text-[color:var(--color-success)]",
        className,
      )}
    >
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

      {/* Credit-for-delay block — divider + medal + label live
       *  as one `inline-flex` unit so the parent badge's
       *  `flex-wrap` can drop the entire group to a new row on
       *  narrow surfaces (mobile sheet) without orphaning the
       *  divider from its medal. The unit itself uses the same
       *  `gap-3` as the parent so spacing reads continuous when
       *  everything fits on one row. */}
      <span className="inline-flex items-center gap-3">
        <span
          aria-hidden
          className="h-8 w-px bg-[color:var(--color-success-soft-border)]"
        />
        <ZeprIcon src={ZEPR_ICONS.medal} size={20} />
        <span className="text-sm font-medium">{CREDIT_AMOUNT_LABEL}</span>
      </span>
    </div>
  );
}
