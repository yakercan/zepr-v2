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
const PDP_PANEL_PADDING = "p-4 md:p-6";

export interface ProductLayoutProps {
  product: ProductDetail;
  /** Long-form copy (description / reviews / disclaimer accordion).
   *  Sits below the gallery in the left panel at lg; below the buy
   *  form in the single-column stack under lg. */
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
    /* Responsive shell — mobile-first, driven by `lg-desktop`
     * (width ≥ 64rem AND a desktop-class pointer). Making the
     * single-panel state the *base* and the two columns the
     * `lg-desktop:` override keeps the two states mutually exclusive:
     * one stacked panel for phones, narrow windows, and touch tablets
     * (an iPad in landscape included); two columns only on a wide
     * pointer-driven desktop.
     *
     *   base (< lg) : ONE bordered panel (this element) holds
     *                 everything top-to-bottom — gallery → buy form →
     *                 accordion.
     *   lg+         : two columns — gallery + accordion share the
     *                 bordered LEFT panel; the buy form is the sticky
     *                 RIGHT panel.
     *
     * The trick that serves both from one tree: each inner group
     * carries the full panel chrome (`PANEL_SURFACE_CLASSES` +
     * padding) but is `display:contents` at base. `contents` makes
     * the element generate no box — its border / fill / padding don't
     * paint and its children promote into THIS grid as direct items —
     * so in the mobile base the outer element is the only panel and
     * the three sections stack as one column. On desktop the groups
     * become real boxes (their own panels) and the outer sheds its
     * chrome (`lg-desktop:border-0 …`) down to a bare two-column grid.
     *
     * Base order (gallery → buy form → accordion) is set with `order`
     * utilities; `lg-desktop:order-none` hands back to DOM order (gallery then
     * accordion inside the left panel). `min-w-0` lets long
     * description words wrap instead of stretching a track. */
    <div
      className={cn(
        PANEL_SURFACE_CLASSES,
        PDP_PANEL_PADDING,
        "grid grid-cols-1 gap-6",
        "lg-desktop:grid-cols-[1.2fr_1fr] lg-desktop:items-start lg-desktop:gap-12",
        // Shed the single-panel chrome once the inner groups take over.
        "lg-desktop:rounded-none lg-desktop:border-0 lg-desktop:bg-transparent lg-desktop:p-0",
      )}
    >
      {/* LEFT group — gallery + long-form copy. `contents` at base so
          the gallery and accordion flow straight into the single
          panel; a real bordered flex panel at lg. */}
      <div
        className={cn(
          PANEL_SURFACE_CLASSES,
          PDP_PANEL_PADDING,
          "contents min-w-0 lg-desktop:flex lg-desktop:flex-col lg-desktop:gap-6",
        )}
      >
        <div className="order-1 min-w-0 lg-desktop:order-none">
          <ProductGallery
            media={product.media}
            title={product.title}
            syncedIndex={syncedIndex}
          />
        </div>
        {extraLeft && (
          <div className="order-3 min-w-0 lg-desktop:order-none">{extraLeft}</div>
        )}
      </div>

      {/* RIGHT group — buy form. `contents` at base so it drops into
          the single panel between the gallery (order-1) and accordion
          (order-3) via the inner `order-2` wrapper.
       *
       *   lg+ : its own sticky panel beside the gallery.
       *     - `lg-desktop:self-start` → take only the form's natural
       *       height (grid items default to `stretch`, which would lock
       *       the form to the full row height and break sticky).
       *     - `lg-desktop:sticky lg-desktop:top-[calc(var(--announcement-h)+5rem)]`
       *       → cling 5rem below the header (header is 4rem + 1px border;
       *       5rem leaves a small breathing gap), plus the sticky
       *       announcement bar's height on top so it clears both. When
       *       the left column scrolls past its end the grid row ends,
       *       the sticky context releases, and the page slides on into
       *       whatever comes next. */}
      <div
        className={cn(
          PANEL_SURFACE_CLASSES,
          PDP_PANEL_PADDING,
          "contents lg-desktop:block lg-desktop:sticky lg-desktop:top-[calc(var(--announcement-h)+5rem)] lg-desktop:self-start",
        )}
      >
        <div className="order-2 min-w-0 lg-desktop:order-none">
          <BuyForm product={product} onVariantChange={handleVariantChange} />
        </div>
      </div>
    </div>
  );
}
