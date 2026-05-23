import { Price } from "@/components/ui/price";
import type { ProductDetail } from "@/types/product";

/**
 * The "buy side" of a product — title, price band, discount
 * badge, and (in later rounds) options, variant picker, quantity
 * stepper, Add-to-cart CTA, delivery promise, etc.
 *
 * Lives in `components/products/` (not under `app/products/`)
 * because two surfaces will render it:
 *
 *   1. The PDP — full-page, in the sticky right column.
 *   2. The product modal opened from a product card's
 *      "Add to cart" button when the product has variants —
 *      same buy-form chrome, just inside a modal shell.
 *
 * Keeping a single component means a variant-picker tweak or a
 * CTA copy change lands in both places in one edit. The modal
 * will pass a tighter `className` (or a `compact` prop later) to
 * trim margins for the smaller surface — round 2 is just the
 * baseline.
 *
 * Stays a server component until it actually needs interactive
 * state (round 4: variant selection). Until then there's nothing
 * for the client bundle to ship.
 */
export interface BuyFormProps {
  product: ProductDetail;
  className?: string;
}

export function BuyForm({ product, className }: BuyFormProps) {
  const hasPriceRange = product.priceMaxCents > product.priceMinCents;
  /* Same headline-tint rule cards use: brand-orange only when
   * there's a real compare-at savings. Falls back to ink black. */
  const discountPct =
    product.compareAtMinCents && product.compareAtMinCents > product.priceMinCents
      ? Math.round(
          ((product.compareAtMinCents - product.priceMinCents) /
            product.compareAtMinCents) *
            100,
        )
      : 0;
  const isDiscounted = discountPct > 0;
  const priceAccent = isDiscounted ? "var(--color-brand)" : undefined;

  return (
    <div className={className ?? "flex flex-col gap-4"}>
      <h1 className="text-lg font-bold leading-snug text-[color:var(--color-ink)] md:text-xl">
        {product.title}
      </h1>

      <div className="flex flex-wrap items-baseline gap-3">
        <Price
          cents={product.priceMinCents}
          currency={product.currency}
          accent={priceAccent}
          className="text-2xl"
        />
        {hasPriceRange && (
          <>
            <span
              className="text-base text-[color:var(--color-ink-muted)]"
              aria-hidden
            >
              –
            </span>
            <Price
              cents={product.priceMaxCents}
              currency={product.currency}
              accent={priceAccent}
              className="text-2xl"
            />
          </>
        )}
        {isDiscounted && (
          <>
            <Price
              cents={product.compareAtMinCents!}
              currency={product.currency}
              variant="compare"
              className="text-base"
            />
            <DiscountBadge percent={discountPct} />
          </>
        )}
      </div>

      {/* Round 4 lands the variant picker block here.
          Round 5 lands the Add-to-cart CTA + quantity stepper. */}
    </div>
  );
}

/**
 * Headline "savings" pill — solid brand-orange, white label.
 * Module-private: lives next to its only caller for now. If a
 * second surface picks it up later, lifts to `lib/badges.ts`
 * alongside the other badge primitives.
 */
function DiscountBadge({ percent }: { percent: number }) {
  return (
    <span
      // `self-center` overrides the parent flex row's
      // `items-baseline` so the pill aligns to the digits'
      // visual centre rather than dropping below the baseline.
      className={
        "inline-flex shrink-0 items-center self-center rounded-full " +
        "px-2.5 py-1 text-sm font-semibold tracking-wide text-white " +
        "bg-[color:var(--color-brand)]"
      }
    >
      {percent}% off
    </span>
  );
}
