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
 * (when opted in via `custom.offers`), and the Add-to-cart /
 * Buy Now CTA stack.
 *
 * Lives in `components/products/` (not under `app/products/`)
 * because two surfaces will render it:
 *
 *   1. The PDP — full-page, in the sticky right column.
 *   2. The product modal opened from a product card's Add-to-cart
 *      button when the product has variants — same chrome inside
 *      a modal shell.
 *
 * Client island. Three pieces of state:
 *
 *   - `selection`           — top picker / unit #1 (shared)
 *   - `tierIndex`           — which tiered-offers tile is active
 *   - `extraUnitSelections` — units #2..#N, indexed by `slot - 1`
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
 *   - When the metafield carries bundle companions
 *     ("2:<pid>" / "3:[<p1>,<p2>]") the picker defaults to Buy 2
 *     instead of Buy 1, with `extraUnitSelections` lazy-seeded
 *     so the cart payload is complete from first render.
 */
export interface BuyFormProps {
  product: ProductDetail;
  className?: string;
  /** Shopify checkout hostname — passed through to `<BuyActions>`
   *  so the Buy Now CTA can build its cart permalink. Pre-resolved
   *  in the server route so this client island never reads env. */
  checkoutDomain: string;
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
  checkoutDomain,
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
  const priceAccent = isDiscounted ? "var(--color-brand)" : undefined;

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

  /* When the metafield carries bundle companions ("2:<pid>" /
   * "3:[<p1>,<p2>]"), default-select Buy 2 instead of Buy 1 —
   * the bundle is the merchant's intent, so the picker should
   * land pre-committed to it instead of asking the shopper to
   * click. Anchor-only tiers ("2" / "3") still default to Buy 1
   * since there's no upsell story to lead with. */
  const defaultTierIndex =
    offersActive && product.offers.bundleCompanionIds.length > 0 ? 1 : 0;

  const [tierIndex, setTierIndex] = useState(defaultTierIndex);
  const activeTier = offerTiers[tierIndex];

  /* Per-unit selections for units #2..#N. Length matches
   * `activeTier.quantity - 1`; resizes inline on tier change so
   * the picker never reads past the array. Lazy initialiser
   * seeds entries that match the default tier — so when we
   * default-select Buy 2, unit #2 already has a real selection
   * from first render and the cart payload is complete without
   * waiting for a user click. */
  const [extraUnitSelections, setExtraUnitSelections] = useState<
    OptionSelection[]
  >(() => {
    const tier = offerTiers[defaultTierIndex];
    if (!tier) return [];
    const out: OptionSelection[] = [];
    for (let i = 1; i < tier.quantity; i++) {
      const source = resolveSlotSource(product, i);
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
   * `anchor + companion(s)` without missing slots. Slot 0 is
   * always the anchor; slot k looks up `bundleCompanions[k-1]`,
   * falling back to anchor when the merchant didn't configure
   * (or the loader couldn't resolve) a companion for that
   * position.
   *
   * Consumers that only care about the active tier (the unit
   * picker grid, the cart payload composer) slice this down to
   * `activeTier.quantity` at the point of use — the source of
   * truth stays single. */
  const slotSources = useMemo<ReadonlyArray<SlotSource>>(() => {
    if (!offersActive) return [];
    return Array.from({ length: product.offers.tilesCount }, (_, i) =>
      resolveSlotSource(product, i),
    );
  }, [offersActive, product]);

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
        const source = resolveSlotSource(product, slotIdx);
        padded.push(
          source.kind === "companion"
            ? defaultSelection(source.product.variants)
            : { ...selection },
        );
      }
      return padded;
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
      />

      <div className="flex flex-wrap items-baseline gap-3">
        <Price
          cents={priceMinCents}
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
              cents={priceMaxCents}
              currency={product.currency}
              accent={priceAccent}
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
      />

      {offersActive && selectedVariant && (
        <TieredOffers
          tiers={offerTiers}
          tierPricings={tierPricings}
          selectedIndex={tierIndex}
          onSelect={handleTierChange}
          currency={product.currency}
          /* Skip the expansion when there's nothing for it to show —
           * a Buy 2 of an option-less anchor with no companions
           * would otherwise render two blank thumbnail cards. */
          selectedTierContent={
            unitSlots.length > 1 &&
            unitSlots.some(
              (s) => s.kind === "companion" || s.options.length > 0,
            ) ? (
              <OfferUnitPickers slots={unitSlots} />
            ) : null
          }
        />
      )}

      <BuyActions
        product={product}
        selectedVariant={selectedVariant}
        units={buyUnits}
        checkoutDomain={checkoutDomain}
      />

      <TrustBadges />
    </div>
  );
}

/** Source-product resolution for a tier slot. Slot 0 is anchor;
 *  slot k>=1 is the `k-1`-th bundle companion when configured,
 *  otherwise anchor (the merchant left that slot to "same product
 *  again", or the companion lookup failed and we silently degrade
 *  to anchor for that position). */
type SlotSource =
  | { kind: "anchor"; product: ProductDetail }
  | { kind: "companion"; product: CompanionProduct };

function resolveSlotSource(
  product: ProductDetail,
  slotIdx: number,
): SlotSource {
  if (slotIdx === 0) return { kind: "anchor", product };
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
