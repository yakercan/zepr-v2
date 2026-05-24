import type { ReactNode } from "react";
import { ProductGridSkeleton } from "@/components/products/product-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewAllLink } from "@/components/ui/view-all-link";
import { cn } from "@/lib/utils";

/**
 * Titled product section — the generic "label + right-aligned
 * View-all + body slot" organizer that every drop-in product
 * surface on top of another page composes:
 *
 *   - "You may also like" on the PDP — `<RelatedProductsLoader>`
 *     as the body, owns its own server-action-driven See more.
 *   - "Shop best sellers" / "Recently viewed" / future rails —
 *     drop a `<ProductGrid>` (with optional `<ViewMoreButton>`)
 *     into the body for a fixed snapshot or URL-paginated grid.
 *
 * Pure presentation by design. The only thing this primitive
 * owns is the header chrome (heading + optional View-all link)
 * and the accessible landmark wrapper; the body is whatever
 * the caller hands in. Keeping it that minimal means every
 * surface composes the right pagination story for its context
 * without forking the section component:
 *
 *   - The PDP rail wants in-place server-action reveal (no URL
 *     touch, no skeleton flash) — it nests its own client
 *     loader inside the body.
 *   - A homepage best-sellers rail wants URL-driven pagination
 *     (refresh-safe, shareable) — it nests `<ViewMoreButton>`.
 *   - A fixed "Recently viewed" surface needs no pagination at
 *     all — it just drops a `<ProductGrid>` and is done.
 *
 * Server component — composes whatever the caller passes
 * through `children`. The caller decides which parts are
 * server- vs client-rendered.
 *
 * Visual shape:
 *
 *     ┌──────────────────────────────────────────────────────┐
 *     │ Title                                  View all →    │
 *     ├──────────────────────────────────────────────────────┤
 *     │                       (body)                          │
 *     └──────────────────────────────────────────────────────┘
 */

export interface ProductSectionProps {
  /** Section heading, e.g. `"You may also like"`. Drives both
   *  the visible `<h2>` and the `aria-labelledby` on the
   *  wrapping landmark. */
  title: string;
  /** Optional "View all →" link in the section header — usually
   *  the destination category / collection page. Omit on
   *  sections that don't have a natural "see everything" target. */
  viewAllHref?: string;
  viewAllLabel?: string;
  /** Body slot — typically a `<ProductGrid>`, a paginating
   *  client loader, or a wrapper around both. */
  children: ReactNode;
  className?: string;
}

export function ProductSection({
  title,
  viewAllHref,
  viewAllLabel,
  children,
  className,
}: ProductSectionProps) {
  /* `id` from the title so multiple sections on the same page
   * (e.g. "Best sellers" + "Recently viewed") each carry their
   * own accessible landmark name. */
  const labelId = `section-${slugify(title)}`;

  return (
    <section
      aria-labelledby={labelId}
      className={cn("flex flex-col gap-6", className)}
    >
      <div className="flex items-end justify-between gap-3">
        <h2
          id={labelId}
          className="text-xl font-semibold leading-tight text-[color:var(--color-ink)] md:text-2xl"
        >
          {title}
        </h2>
        {viewAllHref && (
          <ViewAllLink href={viewAllHref} label={viewAllLabel} />
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Shape-matched skeleton for `<Suspense fallback>`. Pair with
 * `<ProductSection>` so the post-fetch swap doesn't reflow.
 * `count` defaults to 10 — the typical band size — and matches
 * `RELATED_PRODUCTS_PAGE_SIZE` from `lib/pagination`. Bump for
 * sections that fetch larger batches.
 */
export function ProductSectionSkeleton({
  count = 10,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)} aria-busy>
      {/* Header row mirrors `<ProductSection>` exactly — same
       *  `items-end justify-between` shape, same heading text
       *  classes wrapping the placeholder so `h-[1lh]` resolves
       *  to the same pixel height the real `<h2>` will print at.
       *  No View-all skeleton on the right: when the link does
       *  appear it's shorter than the heading and aligns to its
       *  baseline, so the row's overall height is unchanged. The
       *  result is a zero-CLS swap when the section streams in. */}
      <div className="flex items-end justify-between gap-3">
        <div className="text-xl font-semibold leading-tight md:text-2xl">
          <Skeleton className="block h-[1lh] w-48" rounded="md" />
        </div>
      </div>
      <ProductGridSkeleton count={count} />
    </div>
  );
}

/* Minimal kebab-case slugifier — enough to produce a stable
 * `aria-labelledby` anchor for the section's title. Lowercase,
 * collapse runs of non-alphanumerics into single dashes, trim. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
