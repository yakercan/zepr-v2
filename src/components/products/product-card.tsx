import Link from "next/link";
import { ProductBadge } from "@/components/products/badge";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import {
  FREE_SHIPPING_BADGE,
  pickProductBadge,
  qualifiesForFreeShipping,
} from "@/lib/badges";
import { calcDiscountPercent, formatPrice } from "@/lib/format";
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
 *   │   ── sold-out scrim when not available               │
 *   ├──────────────────────────────────────────────────────┤
 *   │  [BADGE] [FREE SHIPPING]                             │
 *   │  title    (line-clamp-2, ink)                        │
 *   │  rating   (★ 4.7 (123))                              │
 *   │  price    (tinted with badge accent · strikethrough) │
 *   └──────────────────────────────────────────────────────┘
 *
 * Badge rules:
 *   • At most ONE product badge (priority-picked from API `badges`).
 *   • PLUS a Free Shipping pill when price clears the threshold —
 *     it doesn't compete for the one-product-badge slot.
 *   • The product badge's accent colour also tints the current
 *     price `<span>`, so the headline tag visually owns the price.
 *     Free Shipping doesn't drive the price tint — it's about
 *     delivery, not about what's special about the product.
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
  const discountPercent = calcDiscountPercent(
    product.price_min_cents,
    product.compare_at_min_cents,
  );
  const hasDiscount = discountPercent > 0;
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

      <div className="flex flex-col gap-1.5 p-3">
        {/* Badge row above the title — one product badge (optional)
            plus the free-shipping pill (optional). When neither
            applies we skip the row entirely so the title sits flush
            with the top of the info section. `flex-wrap` lets the
            second pill drop to a new line on the narrowest tiles
            instead of being clipped. */}
        {(productBadge || showFreeShipping) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {productBadge && <ProductBadge badge={productBadge} />}
            {showFreeShipping && <ProductBadge badge={FREE_SHIPPING_BADGE} />}
          </div>
        )}

        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-[color:var(--color-ink)]">
          {product.title}
        </h3>

        {product.rating && product.rating.value > 0 && (
          <div className="flex items-center gap-1 text-xs text-[color:var(--color-ink-muted)]">
            <span className="text-amber-500" aria-hidden>
              ★
            </span>
            <span>{product.rating.value.toFixed(1)}</span>
            {product.rating_count !== undefined && product.rating_count > 0 && (
              <span>({product.rating_count.toLocaleString("en-US")})</span>
            )}
          </div>
        )}

        <div className="mt-0.5 flex items-baseline gap-2">
          {/* Current price tinted with the product badge's accent —
              same `getTopBadgeColor` semantic zepr uses, just
              inlined: when there's a top badge, the price shares
              its colour; otherwise plain ink. Strikethrough
              compare-at stays muted regardless. */}
          <span
            className="text-sm font-bold text-[color:var(--color-ink)]"
            style={
              productBadge ? { color: productBadge.theme.accent } : undefined
            }
          >
            {formatPrice(product.price_min_cents, product.currency)}
          </span>
          {hasDiscount && product.compare_at_min_cents !== undefined && (
            <span className="text-xs text-[color:var(--color-ink-muted)] line-through">
              {formatPrice(product.compare_at_min_cents, product.currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
