"use client";

import { Price } from "@/components/ui/price";
import { FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/badges";
import { formatPrice } from "@/lib/format";

/**
 * Sticky footer for the cart drawer.
 *
 * Three rows, top-to-bottom:
 *
 *   1. **Free-shipping progress bar** — visible while the subtotal
 *      is under the threshold; flips to a "you've unlocked free
 *      shipping" pill once cleared. The bar is a single filled
 *      `<div>` inside a track, so width transitions GPU-cheaply.
 *   2. **Subtotal row** — left label + right amount, both bold.
 *      Taxes / shipping / discounts are deferred to checkout, so
 *      we don't surface them here.
 *   3. **Checkout CTA** — brand orange, full-width. Visually it's
 *      the only "primary" thing on the screen at this point, which
 *      keeps the conversion path obvious.
 *
 * The whole footer sits behind a top border, never scrolls with the
 * line list, and uses `bg-[surface]` so the drag-on-scroll feel
 * stays clean against the panel background.
 */
export function CartFooter({
  subtotalCents,
  currency,
}: {
  subtotalCents: number;
  currency: string;
}) {
  return (
    <div className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-4">
      <FreeShippingProgress
        subtotalCents={subtotalCents}
        currency={currency}
      />

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-[color:var(--color-ink)]">
          Subtotal
        </span>
        <Price cents={subtotalCents} currency={currency} className="text-base" />
      </div>
      <p className="mt-1 text-xs text-[color:var(--color-ink-muted)]">
        Shipping and taxes calculated at checkout.
      </p>

      <a href="/checkout" className="btn-primary mt-4 w-full">
        Checkout
      </a>
    </div>
  );
}

function FreeShippingProgress({
  subtotalCents,
  currency,
}: {
  subtotalCents: number;
  currency: string;
}) {
  const threshold = FREE_SHIPPING_THRESHOLD_CENTS;
  const remaining = Math.max(0, threshold - subtotalCents);
  const pct = Math.min(100, (subtotalCents / threshold) * 100);
  const unlocked = remaining === 0;

  return (
    <div>
      <p className="text-xs leading-snug text-[color:var(--color-ink-secondary)]">
        {unlocked ? (
          <span className="font-semibold text-[color:var(--color-success)]">
            You&rsquo;ve unlocked free shipping.
          </span>
        ) : (
          <>
            You&rsquo;re{" "}
            <span className="font-semibold text-[color:var(--color-ink)]">
              {formatPrice(remaining, currency)}
            </span>{" "}
            away from{" "}
            <span className="font-semibold text-[color:var(--color-success)]">
              free shipping
            </span>
            .
          </>
        )}
      </p>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-search)]"
      >
        <div
          className="h-full rounded-full bg-[color:var(--color-success)] transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
