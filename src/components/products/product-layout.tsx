"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { BuyForm } from "@/components/products/buy-form";
import { ProductGallery } from "@/components/products/product-gallery";
import { defaultSelection, findVariant } from "@/lib/variants";
import { PANEL_SURFACE_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ProductDetail, ProductVariant } from "@/types/product";

/**
 * PDP grid wrapper — thin client island whose only job is to
 * keep the gallery and the buy form in sync.
 *
 * The two halves of the PDP each own their own interactive
 * state (gallery active index; picker selection), but a variant
 * with an attached image needs them to converse: picking
 * "Color: Blue" should jump the gallery to the blue colourway's
 * photo. Lifting just the bridge state up here — without
 * collapsing both children into one big controlled super-component —
 * keeps each child's concerns intact while giving us one place
 * to plumb the variant → media handoff.
 *
 * Children that don't need the bridge (description accordion,
 * future reviews block) pass straight through as `extraLeft` so
 * the layout still owns the panel shape but doesn't have to know
 * what's inside them.
 *
 * Initial sync: the gallery is seeded from the default variant's
 * image at mount, so the page paints with the matched image on
 * first render — no visible jump animation when the layout
 * hydrates.
 */
const PDP_PANEL_PADDING = "p-5 md:p-6";

export interface ProductLayoutProps {
  product: ProductDetail;
  /** Content rendered below the gallery inside the left panel —
   *  description accordion today, more long-form sections later. */
  extraLeft?: ReactNode;
}

export function ProductLayout({ product, extraLeft }: ProductLayoutProps) {
  /* Pre-built `url → media index` map. Variants reference their
   * image by URL (Shopify's variant.image is a separate node from
   * the product's media gallery, but they share image URLs when
   * admin reuses an existing media item — the common case). One
   * O(n) walk at mount; per-variant lookup is O(1) thereafter. */
  const urlToIndex = useMemo(() => {
    const map = new Map<string, number>();
    product.media.forEach((m, i) => map.set(m.preview.url, i));
    return map;
  }, [product.media]);

  /* Initial sync: figure out which gallery item the default
   * variant's image points at (if any) and seed the gallery
   * there. Falls back to `undefined` when there's no match, in
   * which case the gallery starts at its own default (index 0). */
  const initialSyncedIndex = useMemo(() => {
    const variants = product.variants;
    const seed =
      product.options.length === 0
        ? variants[0]
        : findVariant(variants, defaultSelection(variants));
    const url = seed?.image?.url;
    return url ? urlToIndex.get(url) : undefined;
  }, [product.options.length, product.variants, urlToIndex]);

  const [syncedIndex, setSyncedIndex] = useState<number | undefined>(
    initialSyncedIndex,
  );

  const handleVariantChange = useCallback(
    (variant: ProductVariant | undefined) => {
      const url = variant?.image?.url;
      if (!url) return;
      const idx = urlToIndex.get(url);
      if (idx === undefined) return;
      setSyncedIndex(idx);
    },
    [urlToIndex],
  );

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.2fr_1fr] md:gap-12 md:items-start">
      {/* Left column — gallery + long-form copy. `min-w-0` because
          grid tracks otherwise refuse to shrink past their content's
          intrinsic min-width, which would collapse the right column
          when the description has long words. */}
      <div
        className={cn(
          PANEL_SURFACE_CLASSES,
          PDP_PANEL_PADDING,
          "flex min-w-0 flex-col gap-6",
        )}
      >
        <ProductGallery
          media={product.media}
          title={product.title}
          syncedIndex={syncedIndex}
        />
        {/* `display: contents` wrapper unmounts itself visually so
            the panel's `flex flex-col gap-6` still sees the
            interpolated children directly, but the JSX runtime
            sees a stable single JSX literal sibling to the gallery
            — sidesteps React's "child in a list needs a key"
            warning for the interpolated prop. */}
        {extraLeft && <div className="contents">{extraLeft}</div>}
      </div>

      {/* Right column — buy form, sticky.
       *
       *   - `md:self-start`  → take only the form's natural height
       *                        (grid items default to `stretch`,
       *                        which would lock the form to the
       *                        full row height and break sticky).
       *   - `md:sticky md:top-20` → cling to `5rem` (header is
       *                        4rem + 1px border; 5rem leaves a
       *                        small breathing gap).
       *   - When the left column scrolls past its end, the grid
       *     row ends, the sticky context releases, and the page
       *     continues into whatever comes after the layout. */}
      <div className="md:sticky md:top-20 md:self-start">
        <div className={cn(PANEL_SURFACE_CLASSES, PDP_PANEL_PADDING)}>
          <BuyForm product={product} onVariantChange={handleVariantChange} />
        </div>
      </div>
    </div>
  );
}
