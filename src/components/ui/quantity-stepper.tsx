import { MinusIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Compact `[− N +]` quantity stepper.
 *
 * Pure presentational — owns no state, no store wiring. The
 * parent decides what "decrement past `min`" means (the cart
 * drawer turns it into a remove via `setCartLineQuantity(id, 0)`,
 * the PDP just bottoms-out at 1). Same dialect everywhere a
 * shopper sees one: pill border, equal-width buttons either
 * side of a tabular number.
 *
 * Two sizes share the same shape:
 *
 *   - `sm` (default) — `h-7` buttons, used inside the cart-drawer
 *     row where it sits in a tight metadata strip beside a trash
 *     button.
 *   - `md` — `h-11` buttons, sized to peer with `.btn-secondary`
 *     and `.btn-primary` so it reads as a first-class CTA-row
 *     citizen on the PDP buy stack.
 *
 * `min` defaults to `1` — the safe choice for any context where
 * the stepper isn't doubling as a remove affordance. Cart-drawer
 * callers pass `min={0}` to keep the "click decrement at 1 to
 * remove" UX their trash button compounds.
 */

export interface QuantityStepperProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  /** Smallest value the decrement button stays enabled at. At
   *  `quantity <= min`, decrement disables. Default `1`. */
  min?: number;
  /** Larger / smaller variant — see file-level docstring. */
  size?: "sm" | "md";
  className?: string;
}

export function QuantityStepper({
  quantity,
  onIncrement,
  onDecrement,
  min = 1,
  size = "sm",
  className,
}: QuantityStepperProps) {
  const isSm = size === "sm";
  const btnClasses = cn(
    "inline-flex items-center justify-center text-[color:var(--color-ink)]",
    "transition-colors hover:bg-[color:var(--color-search)]",
    "first:rounded-l-full last:rounded-r-full",
    "disabled:opacity-40 disabled:hover:bg-transparent",
    isSm ? "h-7 w-7" : "h-11 w-10",
  );
  const labelClasses = cn(
    "text-center font-semibold tabular-nums text-[color:var(--color-ink)]",
    isSm ? "min-w-6 text-sm" : "min-w-8 text-base",
  );

  return (
    <div
      role="group"
      aria-label="Quantity"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-[color:var(--color-surface)]",
        /* `md` sits beside `.btn-secondary` on the PDP buy-row, so
         * it borrows the same 2px strong-border outline for visual
         * parity. `sm` keeps the lighter 1px border that suits the
         * denser cart-drawer row. */
        isSm
          ? "border border-[color:var(--color-border)]"
          : "border-2 border-[color:var(--color-border-strong)]",
        className,
      )}
    >
      <button
        type="button"
        onClick={onDecrement}
        disabled={quantity <= min}
        aria-label="Decrease quantity"
        className={btnClasses}
      >
        <MinusIcon />
      </button>
      <span aria-live="polite" className={labelClasses}>
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label="Increase quantity"
        className={btnClasses}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
