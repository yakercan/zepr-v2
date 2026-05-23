"use client";

import Link from "next/link";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { TrashIcon } from "@/components/ui/icons";
import {
  removeCartLine,
  setCartLineQuantity,
} from "@/lib/cart/store";
import { closeCart } from "@/lib/cart/drawer-store";
import type { CartLine } from "@/types/cart";

/**
 * Single row inside the cart drawer.
 *
 * Layout:
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ [image] Title (clamps to 2 lines)                     $price  │
 *   │  80×80  variant (optional)                            $compare│
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
 *   - Prices use the shared `<Price>` component, compact variant
 *     so a busy drawer stays scannable. The line total = unit × qty;
 *     compare-at sits below the active price on discounted lines.
 *     The price block is `absolute`-positioned in the title row's
 *     top-right corner with `pr-20` reserving the space, so a
 *     compare-at line growing the block can't push the variant
 *     title downward — left and right sides flow independently
 *     in that row.
 *   - The qty stepper + trash row sits OUTSIDE the title row's
 *     `pr-20` reserve so the trash anchors to the full right edge
 *     of the line. `justify-between` on a column-wide flex puts
 *     the stepper on the left and the trash on the right.
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
        {/* Title row — `pr-20` reserves the right column for the
         *  absolute-positioned price block so a compare-at line
         *  growing the block can't push the variant title down. */}
        <div className="relative pr-20">
          <Link
            href={`/products/${line.handle}`}
            onClick={closeCart}
            className="line-clamp-2 text-sm font-medium leading-snug text-[color:var(--color-ink)] hover:text-[color:var(--color-brand)]"
          >
            {line.title}
          </Link>

          <div className="absolute right-0 top-0 flex flex-col items-end gap-0.5 leading-tight">
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

          {line.variantTitle && (
            <div className="mt-0.5 text-xs text-[color:var(--color-ink-muted)]">
              {line.variantTitle}
            </div>
          )}
        </div>

        {/* Qty + trash row — sibling of the title row (NOT inside
         *  its `pr-20` reserve) so the trash anchors to the full
         *  right edge of the line, not 5rem in from it. */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {/* `min={0}` keeps the cart-row UX where clicking − at qty 1
              removes the line via `setCartLineQuantity(id, 0)`, paired
              with the trash button as a one-click escape hatch. PDP
              callers leave `min` at its default `1`. */}
          <QuantityStepper
            quantity={line.quantity}
            min={0}
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
