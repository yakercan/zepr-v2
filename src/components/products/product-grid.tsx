import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Generic product tile grid used everywhere the storefront lists
 * products — the homepage main feed, category pages, search results,
 * related-products buy-box on the PDP, the wishlist page, etc.
 *
 * Children-based by design: each call site decides what tile to drop
 * into the grid (`ProductCard`, a sponsored slot, a promo banner,
 * an "add to wishlist" empty-state CTA, …) and how to map its own
 * data. The grid only owns the responsive layout and pairs cleanly
 * with `ProductGridSkeleton` for `<Suspense>` fallbacks of identical
 * shape, so post-fetch swaps don't reflow.
 *
 * The responsive stair-step (2/3/4/5 columns) is tuned for the
 * 1360px page-container — keeps tile width around ~220px at every
 * breakpoint, which is where card typography starts feeling natural
 * without the image collapsing.
 */
export const PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export interface ProductGridProps {
  children: ReactNode;
  /** Override className when a section needs a tighter/looser
   *  grid (e.g. PDP "you may also like" with 6 columns). */
  className?: string;
}

export function ProductGrid({ children, className }: ProductGridProps) {
  return <div className={cn(PRODUCT_GRID_CLASS, className)}>{children}</div>;
}

/**
 * Shape-identical skeleton for the grid. `count` defaults to 10 —
 * the typical above-the-fold tile count at desktop sizes. Callers
 * can bump it for taller initial paints (`<ProductGridSkeleton
 * count={20} />`) or shrink it for narrow buy-box rows.
 */
export function ProductGridSkeleton({
  count = 10,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn(PRODUCT_GRID_CLASS, className)} aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <Skeleton className="aspect-square w-full" rounded="lg" />
          <Skeleton className="h-4 w-3/4" rounded="md" />
          <Skeleton className="h-4 w-1/3" rounded="md" />
        </div>
      ))}
    </div>
  );
}
