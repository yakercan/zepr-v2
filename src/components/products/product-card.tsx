import Link from "next/link";
import { ShimmerImage } from "@/components/ui/shimmer-image";
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
 *   ┌─ aspect-square image tile (rounded-2xl, soft fill bg) ─┐
 *   │   ShimmerImage cross-fades from skeleton to image       │
 *   │   ── group-hover: scale image 1.03 (subtle parallax)    │
 *   │   ── discount badge top-left when compare_at > price    │
 *   │   ── sold-out scrim when not available                  │
 *   └─────────────────────────────────────────────────────────┘
 *   title    (line-clamp-2, ink)
 *   rating   (★ 4.7 (123))
 *   price    (current — bold ink ── strikethrough compare-at — muted)
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

  return (
    <Link
      href={`/products/${product.handle}`}
      prefetch={false}
      className="group flex flex-col gap-2.5"
    >
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-2xl",
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

        {hasDiscount && (
          <span
            className={cn(
              "absolute left-2 top-2 rounded-full",
              "bg-[color:var(--color-ink)] px-2.5 py-1",
              "text-[11px] font-bold leading-none text-white",
            )}
          >
            −{discountPercent}%
          </span>
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

      <div className="flex flex-col gap-1">
        <h3
          className={cn(
            "line-clamp-2 text-sm font-medium leading-snug",
            "text-[color:var(--color-ink)]",
            // Subtle hover affordance — title shifts to the soft
            // secondary tone instead of changing colour entirely, so
            // the grid stays calm during scroll-skim.
            "transition-colors group-hover:text-[color:var(--color-ink-secondary)]",
          )}
        >
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
          <span className="text-sm font-bold text-[color:var(--color-ink)]">
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
