"use client";

import { Price } from "@/components/ui/price";
import { FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/badges";
import { useCartCheckoutUrl } from "@/lib/cart/store";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Cart summary footer — free-shipping progress, subtotal, and the
 * checkout CTA. Used by:
 *
 *   - **Cart drawer** as a sticky footer pinned to the bottom of
 *     the panel, with the drawer adding its own `border-t` +
 *     surface bg so the footer reads as separate from the
 *     scrolling line list.
 *   - **Cart page** wrapped in a rounded `PANEL_SURFACE_THIN`
 *     card on the right column, no top border needed because the
 *     card itself frames the content.
 *
 * Component is surface-agnostic on purpose — the chrome decisions
 * (border, background, rounding) live with each caller because
 * they're a function of the layout context, not the footer's own
 * concern. Internal padding (`px-5 py-4`) stays here because every
 * caller wants the same content inset.
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
 * Checkout URL routing — `useCartCheckoutUrl()` returns the right
 * link per mode:
 *
 *   - Logged-in shopper → Shopify-issued `cart.checkoutUrl` with
 *     buyer identity pre-filled (no second sign-in at checkout,
 *     saved addresses + payment methods available immediately).
 *   - Guest → `cart/<variant>:<qty>,…` permalink built from the
 *     current lines + checkout domain. Same path the PDP "Buy Now"
 *     CTA has used since v1.
 *
 * When no usable URL is available (e.g. a guest line missing its
 * variant GID — rare, but possible across schema migrations) the
 * CTA falls back to a disabled button so the shopper isn't sent
 * down a dead link.
 */
export function CartFooter({
  subtotalCents,
  currency,
  className,
}: {
  subtotalCents: number;
  currency: string;
  className?: string;
}) {
  const checkoutUrl = useCartCheckoutUrl();

  return (
    <div className={cn("px-5 py-4", className)}>
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

      {checkoutUrl ? (
        <a
          href={checkoutUrl}
          className="btn-primary mt-4 w-full"
          /* Native top-level navigation — Shopify-hosted checkout
           * lives on a different origin and there's nothing the
           * drawer needs to keep alive after handoff. Lets the
           * browser tear down our SPA context cleanly. */
        >
          Checkout
        </a>
      ) : (
        <button
          type="button"
          disabled
          className={cn("btn-primary mt-4 w-full")}
          aria-disabled="true"
        >
          Checkout
        </button>
      )}
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
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-muted)]"
      >
        <div
          className="h-full rounded-full bg-[color:var(--color-success)] transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
