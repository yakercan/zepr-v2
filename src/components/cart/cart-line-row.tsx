"use client";

import Link from "next/link";
import { Price } from "@/components/ui/price";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import {
  removeCartLine,
  setCartLineQuantity,
} from "@/lib/cart/store";
import { closeCart } from "@/lib/cart/drawer-store";
import { cn } from "@/lib/utils";
import type { CartLine } from "@/types/cart";

/**
 * Single row inside the cart drawer.
 *
 * Layout:
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ [image] Title (clamps to 2 lines)              $price         │
 *   │  80×80  variant (optional)                     $compare       │
 *   │         [- 1 +]  [trash]                                      │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Notes:
 *
 *   - Image is a Salespace CDN url — fed through `<ShimmerImage>`
 *     so the row never reveals a half-painted thumbnail. Aspect is
 *     forced to 1:1 by the wrapper.
 *   - Title links to the PDP. Clicking it closes the drawer so the
 *     user lands on the product page cleanly (no leftover overlay
 *     blocking interactions).
 *   - Quantity is a stepper. `-` past 1 calls `setCartLineQuantity`
 *     with 0, which routes through `removeCartLine` in the store —
 *     one mental model: "go below 1 and the line is gone". The
 *     trash button is a one-click escape hatch for the common case.
 *   - Prices use the shared `<Price>` component, compact variant so
 *     a busy drawer stays scannable. The line total = unit × qty;
 *     compare-at is shown only on discounted lines.
 */
export function CartLineRow({ line }: { line: CartLine }) {
  const totalCents = line.priceCents * line.quantity;
  const compareTotal =
    line.compareAtCents !== undefined
      ? line.compareAtCents * line.quantity
      : undefined;
  const hasDiscount =
    compareTotal !== undefined && compareTotal > totalCents;

  return (
    <li className="flex gap-3 py-4">
      <Link
        href={`/products/${line.handle}`}
        onClick={closeCart}
        className="relative block aspect-square h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
      >
        <ShimmerImage
          src={line.imageUrl}
          alt={line.title}
          wrapperClassName="block h-full w-full"
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/products/${line.handle}`}
            onClick={closeCart}
            className="line-clamp-2 text-sm font-medium leading-snug text-[color:var(--color-ink)] hover:text-[color:var(--color-brand)]"
          >
            {line.title}
          </Link>

          <div className="flex flex-col items-end gap-0.5">
            <Price
              cents={totalCents}
              currency={line.currency}
              className="text-sm"
            />
            {hasDiscount && (
              <Price
                cents={compareTotal!}
                currency={line.currency}
                variant="compare"
              />
            )}
          </div>
        </div>

        {line.variantTitle && (
          <div className="mt-0.5 text-xs text-[color:var(--color-ink-muted)]">
            {line.variantTitle}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <QuantityStepper
            quantity={line.quantity}
            onDecrement={() =>
              setCartLineQuantity(line.id, line.quantity - 1)
            }
            onIncrement={() =>
              setCartLineQuantity(line.id, line.quantity + 1)
            }
          />

          <button
            type="button"
            onClick={() => removeCartLine(line.id)}
            aria-label={`Remove ${line.title} from cart`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink-muted)] transition-colors hover:bg-[color:var(--color-search)] hover:text-[color:var(--color-ink)]"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Compact `[- N +]` stepper. The current quantity sits between two
 * round-ish buttons so the touch target is obvious without dominating
 * the row. Decrement is *not* disabled at 1 — going below removes the
 * line (see `setCartLineQuantity` in the store). Increment is open
 * upward; per-product caps land when inventory lands.
 */
function QuantityStepper({
  quantity,
  onIncrement,
  onDecrement,
}: {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const stepperBtn = cn(
    "inline-flex h-7 w-7 items-center justify-center text-[color:var(--color-ink)]",
    "transition-colors hover:bg-[color:var(--color-search)]",
    "first:rounded-l-full last:rounded-r-full",
    "disabled:cursor-not-allowed disabled:opacity-40",
  );

  return (
    <div
      className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
      role="group"
      aria-label="Quantity"
    >
      <button
        type="button"
        onClick={onDecrement}
        aria-label="Decrease quantity"
        className={stepperBtn}
      >
        <MinusIcon />
      </button>
      <span
        aria-live="polite"
        className="min-w-6 text-center text-sm font-semibold tabular-nums text-[color:var(--color-ink)]"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label="Increase quantity"
        className={stepperBtn}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
