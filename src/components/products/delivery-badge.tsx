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
        // Phones (< md) get a tighter horizontal rhythm — `gap-2`
        // between the truck/shipping/divider-medal segments instead
        // of `gap-3` — plus a slightly tighter inline+block padding.
        // The buy-form panel on a 360–390px viewport doesn't have
        // room for the full 12px desktop gap to read; tightening
        // by 4px keeps the whole badge on one wrap row more often
        // and prevents the "Arrives …" date span from getting
        // pinched against the trailing divider. Desktop keeps the
        // original gap-3 / px-3 / py-2.5 for full breathing room.
        // `@container` so the credit label can react to the badge's
        // *own* width (container query) rather than the viewport — the
        // buy form / modal / PDP column it lives in are all different
        // widths, and the gallery aspect ratio shifts them around.
        "@container flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2",
        "md:gap-3 md:px-3 md:py-2.5",
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
       *  divider from its medal. The inner gap *intentionally*
       *  tracks the parent's responsive gap (`gap-2` < md,
       *  `gap-3` md+) so spacing reads continuous when everything
       *  fits on one row — if the inner used a fixed gap-3 on
       *  phones, the credit block would look noticeably looser
       *  than the row it sits on. */}
      <span className="inline-flex items-center gap-2 md:gap-3">
        <span
          aria-hidden
          className="h-8 w-px bg-[color:var(--color-success-soft-border)]"
        />
        <ZeprIcon src={ZEPR_ICONS.medal} size={20} />
        {/* Drop the word "credit" when the badge container is narrow
            (< 24rem) so a pinched surface reads "$5.00 for delay" on
            one line; the full "$5.00 credit for delay" returns the
            moment the container has room — no viewport breakpoint, so
            it tracks the actual width at any aspect ratio.
            `whitespace-nowrap` keeps whichever phrase is shown on a
            single line (the credit block wraps as a whole via the
            parent's `flex-wrap`) so a word never orphans onto its own
            row. */}
        <span className="whitespace-nowrap text-sm font-medium">
          $5.00<span className="hidden @min-[24rem]:inline"> credit</span> for
          delay
        </span>
      </span>
    </div>
  );
}
