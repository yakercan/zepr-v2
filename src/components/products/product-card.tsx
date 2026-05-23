import Link from "next/link";
import { ProductBadge, RatingBadge } from "@/components/products/badge";
import { Price } from "@/components/ui/price";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import {
  FREE_SHIPPING_BADGE,
  pickProductBadge,
  qualifiesForFreeShipping,
} from "@/lib/badges";
import { cn } from "@/lib/utils";
import type { SearchProduct } from "@/types/product";

/**
 * Product card — single source of truth for how a product looks
 * inside any grid on the storefront.
 *
 * Server component (no state, no client hooks) so it ships zero JS
 * per card except what `<ShimmerImage>` needs for the loading
 * shimmer. The card itself is a plain `<Link>` so client-side
 * navigation, prefetch, and "open in new tab" all work without
 * custom handlers.
 *
 * Visual layering:
 *
 *   ┌─ rounded-2xl card · white surface · 2px border ──────┐
 *   │ aspect-square image tile · full-bleed (top + sides)  │
 *   │   ShimmerImage cross-fades from skel to image        │
 *   │   ── group-hover: image scale 1.03 (parallax)        │
 *   │                                  [FREE SHIPPING]     │
 *   │   ── sold-out scrim when not available               │
 *   ├──────────────────────────────────────────────────────┤
 *   │  [★ 4.7] [BADGE] Product title that wraps onto the   │
 *   │  second line if it's long (line-clamp-2)             │
 *   │  price    (tinted with badge accent · strikethrough) │
 *   └──────────────────────────────────────────────────────┘
 *
 * Badge rules:
 *   • At most ONE product badge (priority-picked from API `badges`)
 *     plus the rating, both inline with the title as outlined pills.
 *   • Free Shipping shows on the image as a solid green callout —
 *     it's a delivery promise, not a product attribute, so it lives
 *     on the media to read like a sticker rather than a tag.
 *   • The product badge's accent colour tints the current price
 *     `<span>` so the headline tag visually owns the price. Free
 *     Shipping doesn't drive the price tint (different domain).
 *
 * Border behaviour mirrors the main-feed tabs: soft gray at rest,
 * snaps to full ink on hover. The whole card hovers as one unit,
 * which lets the title / rating / price block participate in the
 * affordance even though the visible animation is on the image.
 */
export interface ProductCardProps {
  product: SearchProduct;
  /** Eager-load the image. Pass `true` for the first row of cards
   *  (above-the-fold) and leave `false` for the rest so the browser
   *  lazy-loads naturally. */
  eager?: boolean;
}

export function ProductCard({ product, eager = false }: ProductCardProps) {
  const hasDiscount =
    product.compare_at_min_cents !== undefined &&
    product.compare_at_min_cents > product.price_min_cents;
  const isSoldOut = !product.available;

  // Up to one product badge (priority-picked from the API tags),
  // plus a separate free-shipping badge — the latter doesn't count
  // toward the one-badge product limit because it answers a
  // different question ("will this ship for free?" vs "what's
  // special about this product?").
  const productBadge = pickProductBadge(product.badges);
  const showFreeShipping = qualifiesForFreeShipping(product.price_min_cents);

  return (
    <Link
      href={`/products/${product.handle}`}
      prefetch={false}
      className={cn(
        // The card itself wears the outline — same `border-2` weight
        // + `--color-border-strong` rest / `--color-ink` hover the
        // main-feed tabs use, so the whole page speaks one visual
        // language for "interactive surface".
        //
        // `overflow-hidden` on the card lets the image bleed flush
        // to the top + side edges (its corners are clipped by the
        // card's `rounded-2xl`); only the info block below carries
        // padding, so the media reads as the dominant surface.
        "group flex flex-col overflow-hidden rounded-2xl",
        "bg-[color:var(--color-surface)]",
        "border-2 border-[color:var(--color-border-strong)]",
        "transition-colors duration-150",
        "hover:border-[color:var(--color-ink)]",
      )}
    >
      <div
        className={cn(
          "relative aspect-square overflow-hidden",
          "bg-[color:var(--color-search)]",
        )}
      >
        <ShimmerImage
          src={product.image_url}
          alt={product.title}
          loading={eager ? "eager" : "lazy"}
          wrapperClassName="block h-full w-full"
          className={cn(
            "h-full w-full object-cover",
            "transition-transform duration-300 ease-out",
            "group-hover:scale-[1.03]",
          )}
          skeletonRounded="lg"
        />

        {/* Free Shipping — full-width solid green banner pinned to
            the bottom edge of the media. Lives on the image (not
            the meta row) because it answers a delivery question,
            not a "what's special?" question. Spanning edge-to-edge
            (with squared corners since they're flush against the
            card's clipping `overflow-hidden`) makes it read like
            a sticker, not a tag. Hidden on sold-out tiles since
            the promise is moot there. */}
        {showFreeShipping && !isSoldOut && (
          <ProductBadge
            badge={FREE_SHIPPING_BADGE}
            variant="solid"
            className="absolute inset-x-0 bottom-0 justify-center rounded-none"
          />
        )}

        {isSoldOut && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              "bg-white/60 backdrop-blur-[1px]",
              "text-[11px] font-bold uppercase tracking-wide text-[color:var(--color-ink)]",
            )}
          >
            Sold out
          </div>
        )}
      </div>

      {/* `flex-1` lets the info section grow to fill whatever
          height the grid stretches the card to, so `mt-auto` on
          the price row reliably pins it to the bottom edge —
          every card in a row prints its price on the same
          baseline regardless of how long the title is or whether
          a promo badge takes up space. */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* Badges sit *inline* with the title — they flow as
            inline-flex pills inside the `<h3>` so the title text
            wraps naturally around them, and the line-clamp clips
            the whole composition (badges + text) as a single block
            of two lines max. `align-middle` lines each pill up with
            the title's x-height instead of dropping it to the
            baseline. Order: rating leads (every product has one, so
            it's the row's anchor) → promo badge (only the standouts
            get one) → title. Free Shipping is intentionally not in
            this row — it lives on the media as a callout sticker. */}
        {/* `leading-relaxed` instead of `snug` so the line carrying
            the badge pills (which are taller than plain text because
            of their 1px border + py-0.5) doesn't crowd the wrapped
            title text below. Applied unconditionally so cards with
            and without badges share the same title rhythm — keeps
            the row baseline-consistent. */}
        <h3 className="line-clamp-2 text-sm font-medium leading-relaxed text-[color:var(--color-ink)]">
          {product.rating && (
            <RatingBadge
              value={product.rating.value}
              className="mr-1.5 align-middle"
            />
          )}
          {productBadge && (
            <ProductBadge
              badge={productBadge}
              className="mr-1.5 align-middle"
            />
          )}
          {product.title}
        </h3>

        {/* Price row — `mt-auto` pushes it to the bottom of the
            grown info column. The current price inherits the
            headline badge's accent (so a Hot Deal card prints its
            price in pink, a Best Seller in brand orange, default
            ink otherwise). The compare-at sits next to it in the
            muted compare variant — same `<Price>` component, just
            a different `variant`. */}
        <div className="mt-auto flex items-baseline gap-2 pt-2">
          <Price
            cents={product.price_min_cents}
            currency={product.currency}
            accent={productBadge?.theme.accent}
          />
          {hasDiscount && product.compare_at_min_cents !== undefined && (
            <Price
              cents={product.compare_at_min_cents}
              currency={product.currency}
              variant="compare"
            />
          )}
        </div>
      </div>
    </Link>
  );
}
