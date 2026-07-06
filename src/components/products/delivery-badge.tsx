"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { formatMarketAmount } from "@/config/markets";
import { ZEPR_ICONS, ZeprIcon } from "@/components/ui/icons";
import { qualifiesForFreeShipping } from "@/lib/badges";
import { cn } from "@/lib/utils";

/* Runs before paint on the client so the divider's wrap state is
 * settled in the same frame the badge appears (no flash of a
 * dangling separator), and falls back to `useEffect` on the server
 * to skip React's "useLayoutEffect does nothing on the server"
 * warning. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Late-delivery goodwill credit, in minor units, keyed by presentment
 * currency — a flat local amount (not a converted USD figure), the
 * same "flat amount per market" model the free-shipping threshold
 * uses. Most markets sit at 5; the lower-value-unit markets carry a
 * larger flat figure so the gesture still reads as meaningful:
 * Malaysia RM 20, UAE AED 20, and the Philippines ₱200. Formatted per
 * market via `formatMarketAmount`, so the symbol follows the currency
 * (RM 20.00, AED 20.00, ₱200.00, $5.00, £5.00, …).
 */
const DELAY_CREDIT_BY_CURRENCY: Readonly<Record<string, number>> = {
  MYR: 2000,
  AED: 2000,
  PHP: 20000,
};

/** Fallback credit for any market without an override — the flat 5. */
const DEFAULT_DELAY_CREDIT_CENTS = 500;

function delayCreditCents(currency: string): number {
  return (
    DELAY_CREDIT_BY_CURRENCY[currency.toUpperCase()] ??
    DEFAULT_DELAY_CREDIT_CENTS
  );
}

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
 *   - **Credit-for-delay** — a medal icon + label, preceded by a
 *     thin green divider that separates it from the shipping
 *     headline. When the badge is too narrow to keep both on one
 *     row, the credit drops to its own line and the divider hides
 *     (a separator only reads as one when it sits *between* two
 *     things on the same row — leading a wrapped row it's just a
 *     stray tick). Wrap is measured, not guessed at a breakpoint,
 *     since it depends on the arrival-date and currency label
 *     widths. Shown on every surface (page, modal, mobile sheet) —
 *     the "$5 for late delivery" promise is part of the same trust
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

  /* Hide the divider when the credit block has wrapped onto its own
   * row. We compare the credit block's top against the badge's first
   * item (the truck icon): on the same row the two tops line up (bar
   * a few px of center-alignment); once wrapped, the credit sits a
   * full row lower. Re-measured on any resize of the badge — wrap
   * depends on the arrival-date and currency label widths, so there's
   * no fixed breakpoint to key off. The divider stays in flow while
   * hidden (`invisible`, not removed), so toggling it can't change
   * the wrap outcome and feed back into a flicker loop. */
  const rootRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLSpanElement>(null);
  const [creditWrapped, setCreditWrapped] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    const credit = creditRef.current;
    if (!root || !credit) return;
    const measure = () => {
      const first = root.firstElementChild;
      if (!first) return;
      const firstRect = first.getBoundingClientRect();
      const creditRect = credit.getBoundingClientRect();
      setCreditWrapped(creditRect.top - firstRect.top > firstRect.height / 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [free, arrivalLabel, creditLabel]);

  return (
    <div
      ref={rootRef}
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

      {/* Divider — a parent-level flex item (not inside the credit
       *  group), so when the credit wraps to its own row the divider
       *  stays behind on the first row rather than leading the new
       *  one. `invisible` (kept in flow, not removed) hides it on wrap
       *  without changing layout, so its toggle can never flip the
       *  wrap decision back and flicker. */}
      <span
        aria-hidden
        className={cn(
          "h-8 w-px bg-[color:var(--color-success-soft-border)]",
          creditWrapped && "invisible",
        )}
      />

      {/* Credit-for-delay block — medal + label as one `inline-flex`
       *  unit so the parent's `flex-wrap` drops it to a new row whole.
       *  The inner gap *intentionally* tracks the parent's responsive
       *  gap (`gap-2` < md, `gap-3` md+) so spacing reads continuous
       *  when everything fits on one row. */}
      <span ref={creditRef} className="inline-flex items-center gap-2 md:gap-3">
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
          {creditLabel}
          <span className="hidden @min-[24rem]:inline"> credit</span> for delay
        </span>
      </span>
    </div>
  );
}
