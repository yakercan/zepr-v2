"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BuyActions,
  buildAnchorCartLine,
  type BuyUnit,
} from "@/components/products/buy-actions";
import { DeliveryBadge } from "@/components/products/delivery-badge";
import {
  OfferUnitPickers,
  type UnitSlotConfig,
} from "@/components/products/offer-unit-pickers";
import { TieredOffers } from "@/components/products/tiered-offers";
import { TrustBadges } from "@/components/products/trust-badges";
import { VariantPicker } from "@/components/products/variant-picker";
import { Price } from "@/components/ui/price";
import {
  type SlotPriceInfo,
  tierPricingFromSlots,
  tiersForCount,
} from "@/lib/offers";
import {
  cascadeSelect,
  defaultSelection,
  findVariant,
  type OptionSelection,
} from "@/lib/variants";
import { cn } from "@/lib/utils";
import type { CartLine } from "@/types/cart";
import type {
  CompanionProduct,
  ProductDetail,
  ProductOption,
  ProductVariant,
} from "@/types/product";

/**
 * The "buy side" of a product — title, delivery promise, price
 * band, discount badge, variant pickers, the tiered-offers picker
 * (when opted in via `custom.offers`), and the Add-to-Cart CTA.
 *
 * Lives in `components/products/` (not under `app/products/`)
 * because two surfaces will render it:
 *
 *   1. The PDP — full-page, in the sticky right column.
 *   2. The product modal opened from a product card's Add-to-cart
 *      button when the product has variants — same chrome inside
 *      a modal shell.
 *
 * Client island. Four pieces of state:
 *
 *   - `selection`           — top picker / unit #1 (shared)
 *   - `tierIndex`           — which tiered-offers tile is active
 *   - `extraUnitSelections` — units #2..#N, indexed by `slot - 1`
 *   - `bundleMode`          — for bundle-enabled products, whether
 *                             the multi-unit tiers compose as "Same
 *                             Item" (anchor × N) or "Best Match"
 *                             (anchor + companion). No effect on
 *                             anchor-only offers (no companion to
 *                             swap in), where the toggle is hidden.
 *
 * Unit #1 is intentionally the top variant picker, not a separate
 * card with synced state — bidirectional `useEffect` syncs are a
 * common source of subtle bugs, and a single shared state slot
 * just doesn't have that problem. The unit-card grid below the
 * tile reuses that same `selection` for unit #1's card, so chip
 * changes in either surface flow through one update path.
 *
 * Two pricing-related invariants worth knowing about:
 *
 *   - `slotSources` is always `product.offers.tilesCount` long
 *     (not `activeTier.quantity`), so every tile's preview row
 *     can sum its own slot prices without running short when a
 *     smaller tier is currently active. Consumers that only care
 *     about the active tier (`unitSlots`, `buyUnits`) slice it
 *     down to `activeTier.quantity` at the point of use.
 *   - The picker defaults to Buy 2 (the lead upsell tier) whenever
 *     offers are active; `extraUnitSelections` lazy-seeds unit #2
 *     from first render and resizes as the shopper changes tier.
 */
export interface BuyFormProps {
  product: ProductDetail;
  className?: string;
  /** Fires after the picker resolves a new variant (or fails to,
   *  in which case the argument is `undefined`). The PDP layout
   *  uses this to nudge the gallery to the variant's image. Skips
   *  the initial mount emission — the layout seeds the gallery
   *  from the default variant directly. */
  onVariantChange?: (variant: ProductVariant | undefined) => void;
}

export function BuyForm({
  product,
  className,
  onVariantChange,
}: BuyFormProps) {
  const [selection, setSelection] = useState<OptionSelection>(() =>
    defaultSelection(product.variants),
  );

  const selectedVariant =
    product.options.length === 0
      ? product.variants[0]
      : findVariant(product.variants, selection);

  /* Skip-first-emit so the initial mount doesn't shout the
   * default variant back at the layout (which already knew about
   * it from `defaultSelection` and seeded the gallery directly). */
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onVariantChange?.(selectedVariant);
  }, [selectedVariant, onVariantChange]);

  /* Resolved-variant pricing wins over the product-level range
   * the moment we have one. When the picker lands on an invalid
   * combo `selectedVariant` is `undefined` — we fall back to the
   * range so the page never shows "$undefined". */
  const priceMinCents = selectedVariant?.priceCents ?? product.priceMinCents;
  const priceMaxCents = selectedVariant?.priceCents ?? product.priceMaxCents;
  const compareAtCents =
    selectedVariant?.compareAtCents ?? product.compareAtMinCents;

  const hasPriceRange = priceMaxCents > priceMinCents;
  const discountPct =
    compareAtCents && compareAtCents > priceMinCents
      ? Math.round(((compareAtCents - priceMinCents) / compareAtCents) * 100)
      : 0;
  const isDiscounted = discountPct > 0;

  const handleSelect = (optionName: string, value: string) => {
    setSelection((prev) =>
      cascadeSelect(product.options, product.variants, prev, optionName, value),
    );
  };

  /* Tiered offers — when `custom.offers` opted the product in,
   * the picker replaces the qty stepper inside `<BuyActions>`. */
  const offerTiers = useMemo(
    () => tiersForCount(product.offers.tilesCount),
    [product.offers.tilesCount],
  );
  const offersActive = offerTiers.length > 0;

  /* Buy 2 (the second tier) is the default selection whenever offers
   * are active — it's the merchant's lead upsell, so the picker lands
   * pre-committed to it rather than the bare anchor. Falls back to
   * index 0 only if there's no second tier (offers inactive). */
  const defaultTierIndex = offerTiers.length > 1 ? 1 : 0;

  const [tierIndex, setTierIndex] = useState(defaultTierIndex);
  const activeTier = offerTiers[tierIndex];

  /* Bundle-enabled products (a companion resolved off the
   * `custom.offers` metafield) let the shopper choose how the
   * multi-unit tiers compose:
   *
   *   - "best" (Best Match) → anchor + companion(s); the merchant's
   *     curated pairing, so it's the default.
   *   - "same" (Same Item)  → anchor × N; just stock up on this one.
   *
   * `useBundle` is the boolean the slot resolver keys off. The toggle
   * only renders when there's a *resolved* companion to swap in
   * (`hasBundleOption`); anchor-only offers ("2" / "3") — and ones
   * whose companion ids failed to resolve (positional `null`s) —
   * ignore the mode entirely since both options would be identical. */
  const hasBundleOption =
    offersActive && product.bundleCompanions.some((c) => c != null);
  const [bundleMode, setBundleMode] = useState<"same" | "best">("best");
  const useBundle = bundleMode === "best";

  /* Per-unit selections for units #2..#N. Length matches
   * `activeTier.quantity - 1`; resizes inline on tier change so
   * the picker never reads past the array. With Buy 2 as the
   * default tier, this lazily seeds unit #2 from first render so
   * the cart payload is complete before the shopper touches the
   * picker. */
  const [extraUnitSelections, setExtraUnitSelections] = useState<
    OptionSelection[]
  >(() => {
    const tier = offerTiers[defaultTierIndex];
    if (!tier) return [];
    const out: OptionSelection[] = [];
    /* Seeds against the default "best" mode (the toggle's default),
     * matching the slot resolver's first-render output. */
    for (let i = 1; i < tier.quantity; i++) {
      const source = resolveSlotSource(product, i, true);
      out.push(
        source.kind === "companion"
          ? defaultSelection(source.product.variants)
          : defaultSelection(product.variants),
      );
    }
    return out;
  });

  const anchorFallbackImageUrl =
    selectedVariant?.image?.url ??
    product.featuredImage?.url ??
    product.media[0]?.preview.url ??
    "";

  /* Per-slot source product for *every* configured tile slot —
   * length matches `product.offers.tilesCount`, not the active
   * tier's quantity. We need full coverage even when Buy 1 is
   * the active tier, so the Buy 2 / Buy 3 preview rows can total
   * their slots without missing any. Slot 0 is always the anchor.
   *
   * In "Best Match" mode (`useBundle`) slot k looks up
   * `bundleCompanions[k-1]`, falling back to anchor when no
   * companion is configured/resolved for that position. In "Same
   * Item" mode every slot is the anchor — so flipping the toggle
   * re-points the whole picker (previews, unit cards, and the cart
   * payload all derive from here).
   *
   * Consumers that only care about the active tier (the unit
   * picker grid, the cart payload composer) slice this down to
   * `activeTier.quantity` at the point of use — the source of
   * truth stays single. */
  const slotSources = useMemo<ReadonlyArray<SlotSource>>(() => {
    if (!offersActive) return [];
    return Array.from({ length: product.offers.tilesCount }, (_, i) =>
      resolveSlotSource(product, i, useBundle),
    );
  }, [offersActive, product, useBundle]);

  const handleTierChange = (idx: number) => {
    setTierIndex(idx);
    const nextTier = offerTiers[idx];
    const nextExtraCount = Math.max(0, (nextTier?.quantity ?? 1) - 1);
    setExtraUnitSelections((prev) => {
      if (prev.length === nextExtraCount) return prev;
      if (prev.length > nextExtraCount) return prev.slice(0, nextExtraCount);
      const padded = prev.slice();
      while (padded.length < nextExtraCount) {
        const slotIdx = padded.length + 1; /* 0-based slot index */
        const source = resolveSlotSource(product, slotIdx, useBundle);
        padded.push(
          source.kind === "companion"
            ? defaultSelection(source.product.variants)
            : { ...selection },
        );
      }
      return padded;
    });
  };

  /* Switching Same Item ⇄ Best Match re-points every extra slot to
   * the other mode's source product, so the previously-picked
   * selections (e.g. a companion's colourway) no longer apply — we
   * re-seed all of the active tier's extra units against the new
   * mode. Anchor slots mirror the top pick; companion slots take the
   * companion's default selection. */
  const handleModeChange = (next: "same" | "best") => {
    if (next === bundleMode) return;
    setBundleMode(next);
    const nextUseBundle = next === "best";
    const extraCount = Math.max(0, (activeTier?.quantity ?? 1) - 1);
    setExtraUnitSelections(() => {
      const out: OptionSelection[] = [];
      for (let slotIdx = 1; slotIdx <= extraCount; slotIdx++) {
        const source = resolveSlotSource(product, slotIdx, nextUseBundle);
        out.push(
          source.kind === "companion"
            ? defaultSelection(source.product.variants)
            : { ...selection },
        );
      }
      return out;
    });
  };

  const handleExtraSelect = (
    extraIdx: number,
    slotOptions: readonly ProductOption[],
    slotVariants: readonly ProductVariant[],
    optionName: string,
    value: string,
  ) => {
    setExtraUnitSelections((prev) =>
      prev.map((sel, i) =>
        i === extraIdx
          ? cascadeSelect(slotOptions, slotVariants, sel, optionName, value)
          : sel,
      ),
    );
  };

  /* Unit slot configs for `<OfferUnitPickers>`. One entry per
   * unit in the *active* tier (sliced from the full
   * `slotSources` list) — slot 0 wires to the top picker so
   * unit #1's chips stay in sync with the page's primary picker;
   * later slots wire to `extraUnitSelections` with the slot's
   * source product (anchor fallback or configured companion). */
  const activeSlotCount = activeTier?.quantity ?? 0;
  const unitSlots = useMemo<ReadonlyArray<UnitSlotConfig>>(() => {
    return slotSources.slice(0, activeSlotCount).map((source, slotIdx) => {
      if (slotIdx === 0) {
        return {
          kind: "anchor",
          title: product.title,
          options: product.options,
          variants: product.variants,
          selection,
          onSelect: handleSelect,
          fallbackImageUrl: anchorFallbackImageUrl,
        };
      }
      const extraIdx = slotIdx - 1;
      const slotOptions = source.product.options;
      const slotVariants = source.product.variants;
      const sel =
        extraUnitSelections[extraIdx] ??
        (source.kind === "companion"
          ? defaultSelection(slotVariants)
          : { ...selection });
      const onSelect = (name: string, value: string) =>
        handleExtraSelect(extraIdx, slotOptions, slotVariants, name, value);
      if (source.kind === "companion") {
        return {
          kind: "companion",
          title: source.product.title,
          handle: source.product.handle,
          options: slotOptions,
          variants: slotVariants,
          selection: sel,
          onSelect,
          fallbackImageUrl: source.product.featuredImage?.url ?? "",
        };
      }
      return {
        kind: "anchor",
        title: product.title,
        options: slotOptions,
        variants: slotVariants,
        selection: sel,
        onSelect,
        fallbackImageUrl: anchorFallbackImageUrl,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slotSources,
    activeSlotCount,
    selection,
    extraUnitSelections,
    anchorFallbackImageUrl,
  ]);

  /** Per-slot price info — one entry per slot in `slotSources`,
   *  resolving each slot's *currently-relevant* variant:
   *
   *    - slot 0 (anchor) → the top picker's `selectedVariant`,
   *      falling back to the product's first variant when the
   *      picker is mid-cascade on an invalid combo.
   *    - slot k>=1 → the slot's matching `extraUnitSelections[k-1]`
   *      variant when the shopper has touched it; otherwise the
   *      slot's *default* variant. This is what makes the preview
   *      rows ("Buy 2" when Buy 1 is selected) total honestly —
   *      we always have a real price to sum per slot, even before
   *      the shopper has expanded the bundle picker.
   *
   *  Drives `tierPricings` below — which in turn feeds the picker
   *  totals — so a multi-product bundle ("2:<pid>") totals
   *  `anchor + companion`, not the old (wrong) `anchor × 2`. */
  const slotPriceInfos = useMemo<ReadonlyArray<SlotPriceInfo>>(() => {
    return slotSources.map((source, slotIdx) => {
      const variants = source.product.variants;
      let variant: ProductVariant | undefined;
      if (slotIdx === 0) {
        variant = selectedVariant ?? variants[0];
      } else {
        const sel = extraUnitSelections[slotIdx - 1];
        variant = sel ? findVariant(variants, sel) : undefined;
        variant ??= findVariant(variants, defaultSelection(variants));
        variant ??= variants[0];
      }
      return {
        priceCents: variant?.priceCents ?? 0,
        compareAtCents: variant?.compareAtCents,
      };
    });
  }, [slotSources, selectedVariant, extraUnitSelections]);

  /** Per-tile preview totals, mirroring `offerTiers` index-for-
   *  index. Each entry is `tier.quantity` slots summed and the
   *  tier's savings % applied. Empty when offers are inactive. */
  const tierPricings = useMemo(
    () => offerTiers.map((tier) => tierPricingFromSlots(tier, slotPriceInfos)),
    [offerTiers, slotPriceInfos],
  );

  /** Cart payload — one `BuyUnit` per resolved variant. Same-line
   *  units (same product + same variant across slots) collapse
   *  into a single payload entry so the drawer and the Shopify
   *  permalink read cleanly when a shopper picks "Blue × 2". Only
   *  the *active* tier's slots contribute (slicing
   *  `slotSources`), so picking Buy 1 doesn't quietly inflate the
   *  cart with the Buy 2 companion. */
  const buyUnits = useMemo<ReadonlyArray<BuyUnit> | undefined>(() => {
    if (!offersActive) return undefined;
    const byId = new Map<string, BuyUnit>();
    slotSources.slice(0, activeSlotCount).forEach((source, slotIdx) => {
      const slotSelection =
        slotIdx === 0 ? selection : extraUnitSelections[slotIdx - 1];
      if (!slotSelection) return;
      const variant = findVariant(source.product.variants, slotSelection);
      if (!variant) return;
      const seed =
        source.kind === "companion"
          ? buildCompanionCartLine(source.product, product.currency, variant)
          : buildAnchorCartLine(product, variant);
      const existing = byId.get(seed.id);
      if (existing) {
        byId.set(seed.id, {
          ...existing,
          quantity: existing.quantity + 1,
        });
      } else {
        byId.set(seed.id, {
          cartLineSeed: seed,
          variantGid: variant.id,
          quantity: 1,
          availableForSale: variant.availableForSale,
        });
      }
    });
    return Array.from(byId.values());
  }, [
    offersActive,
    slotSources,
    activeSlotCount,
    selection,
    extraUnitSelections,
    product,
  ]);

  return (
    <div className={className ?? "flex flex-col gap-5"}>
      <h1 className="text-lg font-bold leading-snug text-[color:var(--color-ink)] md:text-xl">
        {product.title}
      </h1>

      <DeliveryBadge
        deliveryTime={product.deliveryTime}
        priceCents={priceMinCents}
        currency={product.currency}
      />

      <div className="flex flex-wrap items-baseline gap-3">
        <Price
          cents={priceMinCents}
          currency={product.currency}
          discounted={isDiscounted}
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
              cents={priceMaxCents}
              currency={product.currency}
              discounted={isDiscounted}
              className="text-2xl"
            />
          </>
        )}
        {isDiscounted && compareAtCents && (
          <>
            <Price
              cents={compareAtCents}
              currency={product.currency}
              variant="compare"
              className="text-base"
            />
            <DiscountBadge percent={discountPct} />
          </>
        )}
      </div>

      <VariantPicker
        options={product.options}
        variants={product.variants}
        selection={selection}
        onSelect={handleSelect}
        sizeChart={product.sizeChart}
      />

      {offersActive && selectedVariant && (
        <div className="flex flex-col gap-3">
          {hasBundleOption && (
            <OfferModeToggle mode={bundleMode} onChange={handleModeChange} />
          )}
          <TieredOffers
            tiers={offerTiers}
            tierPricings={tierPricings}
            selectedIndex={tierIndex}
            onSelect={handleTierChange}
            currency={product.currency}
            /* Render the per-unit selection inside the selected tile
             * for *every* tier (Buy 1 included) so the in-tile picking
             * experience stays consistent as the shopper moves between
             * tiers. Still skipped when there's nothing to pick — an
             * option-less anchor with no companion would otherwise
             * render blank thumbnail cards. */
            selectedTierContent={
              unitSlots.some(
                (s) => s.kind === "companion" || s.options.length > 0,
              ) ? (
                <OfferUnitPickers slots={unitSlots} />
              ) : null
            }
          />
        </div>
      )}

      {/* Inline Add-to-Cart at every width. With tiered offers the
       *  tier picker drives quantity (controlled mode, no stepper);
       *  without them `buyUnits` is `undefined`, so it falls back to
       *  the uncontrolled path with a quantity stepper. */}
      <BuyActions
        product={product}
        selectedVariant={selectedVariant}
        units={buyUnits}
      />

      <TrustBadges />
    </div>
  );
}

/**
 * Same Item ⇄ Best Match segmented toggle, shown above the tier rows
 * for bundle-enabled products. A two-segment radiogroup styled as a
 * pill: the active segment wears the brand fill, the idle one stays
 * muted. Order follows the shopper's mental model — "just this one"
 * (Same Item) before the upsell (Best Match).
 */
const OFFER_MODES = [
  { value: "same", label: "Same Item" },
  { value: "best", label: "Best Match" },
] as const;

function OfferModeToggle({
  mode,
  onChange,
}: {
  mode: "same" | "best";
  onChange: (next: "same" | "best") => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Offer type"
      className="grid grid-cols-2 gap-1 rounded-full border border-[color:var(--color-border-strong)] p-1"
    >
      {OFFER_MODES.map((option) => {
        const selected = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3 py-2 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-[color:var(--color-brand)] focus-visible:ring-offset-1",
              selected
                ? "bg-[color:var(--color-brand)] text-white"
                : "text-[color:var(--color-ink-secondary)] hover:text-[color:var(--color-ink)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Source-product resolution for a tier slot. Slot 0 is always the
 *  anchor. For slots k>=1:
 *
 *    - `useBundle` false ("Same Item" mode) → anchor again, so the
 *      tier is just N of the PDP product.
 *    - `useBundle` true ("Best Match" mode) → the `k-1`-th bundle
 *      companion when configured, otherwise anchor (the merchant
 *      left that slot to "same product again", or the companion
 *      lookup failed and we silently degrade to anchor). */
type SlotSource =
  | { kind: "anchor"; product: ProductDetail }
  | { kind: "companion"; product: CompanionProduct };

function resolveSlotSource(
  product: ProductDetail,
  slotIdx: number,
  useBundle: boolean,
): SlotSource {
  if (slotIdx === 0 || !useBundle) return { kind: "anchor", product };
  const companion = product.bundleCompanions[slotIdx - 1];
  if (!companion) return { kind: "anchor", product };
  return { kind: "companion", product: companion };
}

/** Compose a `CartLine` seed for a companion-slot variant. Mirrors
 *  the shape `buildAnchorCartLine` produces; the only differences
 *  are the source product object (companion instead of PDP anchor)
 *  and that we borrow the anchor's currency since the companion
 *  type doesn't carry one (companions live in the same store, so
 *  currency is invariant). */
function buildCompanionCartLine(
  companion: CompanionProduct,
  currency: string,
  variant: ProductVariant,
): Omit<CartLine, "quantity"> {
  const variantTitle =
    variant.selectedOptions.length > 0
      ? variant.selectedOptions
          .map((opt) => `${opt.name}: ${opt.value}`)
          .join(" / ")
      : undefined;

  const imageUrl =
    variant.image?.url ?? companion.featuredImage?.url ?? "";

  return {
    id: `${companion.id}:${variant.id}`,
    productId: companion.id,
    merchandiseId: variant.id,
    handle: companion.handle,
    title: companion.title,
    imageUrl,
    priceCents: variant.priceCents,
    compareAtCents: variant.compareAtCents,
    currency,
    variantTitle,
  };
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
