/**
 * Tiered Offers — the "Buy 1 / Buy 2 Save 15% / Buy 3 Save 20%"
 * picker that can replace the legacy quantity stepper on PDPs.
 *
 * Activation is per-product, driven by Shopify's `custom.offers`
 * metafield (single text value). Recognised forms:
 *
 *   - empty / missing / "0"     → picker hidden, qty stepper shown
 *   - "2"                       → 2 tiles, both slots are anchor
 *                                  (Buy 2 of the same product)
 *   - "2:<pid>"                 → 2 tiles, slot 0 = anchor, slot 1 =
 *                                  companion product `<pid>`
 *   - "3"                       → 3 tiles, all slots anchor
 *   - "3:<pid>"                 → 3 tiles, slot 1 = companion `<pid>`,
 *                                  slot 2 = anchor again
 *   - "3:[<p1>,<p2>]"           → 3 tiles, slot 1 = `<p1>`,
 *                                  slot 2 = `<p2>`
 *
 * Slot 0 is ALWAYS the anchor (the PDP product) — companion ids
 * fill slots 1..N positionally. Companion ids are surfaced as
 * digit-only strings so callers can build a Storefront gid
 * (`gid://shopify/Product/<id>`) without re-parsing.
 *
 * Display vs cart math:
 *
 *   - Per-tile preview totals are computed client-side from the
 *     active variant's `priceCents`. They are previews only —
 *     the actual discount is applied at Shopify checkout (the
 *     storefront stamps a cart-line attribute carrying the
 *     tier id when the cart wiring lands). Display drift between
 *     the preview and the cart can't quietly overcharge because
 *     the cart math stays server-authoritative.
 *   - The legacy storefront uses cart attribute `_offer` keyed
 *     to the tier id (`buy_2_save_15`, `buy_3_save_20`). When
 *     we wire the Shopify cart API up, this file's `id` strings
 *     are the contract — keep them stable.
 */

/** Master kill switch. Flip to `false` to fall back to the qty
 *  stepper everywhere; the metafield is ignored. */
export const TIERED_OFFERS_ENABLED = true;

/** Cart-line attribute key the picker will eventually stamp when
 *  the Shopify cart wiring lands. Exported now so analytics /
 *  future discount rules can reference it without magic-stringing. */
export const OFFER_CART_ATTRIBUTE_KEY = "_offer";

export const BUY_1_TIER_ID = "buy_1";
export const BUY_2_TIER_ID = "buy_2_save_15";
export const BUY_3_TIER_ID = "buy_3_save_20";

/**
 * One tile in the picker.
 *
 *   - `id` doubles as the future cart-attribute value. Stable.
 *   - `headline` / `accent` / `accentSuffix` together compose the
 *     title — `headline` + `<accent in brand orange>` +
 *     `accentSuffix`. Keeping just the percentage in `accent`
 *     ("Buy 2, Get **15%** OFF") lets the brand orange highlight
 *     the savings number and nothing else.
 *   - `badge` floats above the tile ("MOST POPULAR" / "BEST
 *     VALUE"). `null` to suppress.
 */
export interface OfferTier {
  id: string;
  quantity: number;
  headline: string;
  accent: string | null;
  accentSuffix: string | null;
  savingsPercent: number;
  badge: string | null;
}

const BUY_1_TIER: OfferTier = {
  id: BUY_1_TIER_ID,
  quantity: 1,
  headline: "Buy 1",
  accent: null,
  accentSuffix: null,
  savingsPercent: 0,
  badge: null,
};

const BUY_2_TIER: OfferTier = {
  id: BUY_2_TIER_ID,
  quantity: 2,
  headline: "Buy 2, Get ",
  accent: "15%",
  accentSuffix: " OFF",
  savingsPercent: 15,
  badge: "MOST POPULAR",
};

const BUY_3_TIER: OfferTier = {
  id: BUY_3_TIER_ID,
  quantity: 3,
  headline: "Buy 3, Get ",
  accent: "20%",
  accentSuffix: " OFF",
  savingsPercent: 20,
  badge: "BEST VALUE",
};

/**
 * Materialise the tier list for a given `tilesCount`. Mirrors the
 * legacy storefront's promotion rule: when Buy 3 isn't on screen,
 * Buy 2 absorbs the headline badge ("BEST VALUE") so a two-tile
 * picker lands the eye-catching label on its only upsell tile
 * instead of leaving it on the muted "MOST POPULAR" copy.
 */
export function tiersForCount(
  tilesCount: 0 | 2 | 3,
): ReadonlyArray<OfferTier> {
  if (tilesCount === 2) {
    return [BUY_1_TIER, { ...BUY_2_TIER, badge: "BEST VALUE" }];
  }
  if (tilesCount === 3) {
    return [BUY_1_TIER, BUY_2_TIER, BUY_3_TIER];
  }
  return [];
}

/** Parsed shape of the `custom.offers` metafield. */
export interface ParsedOffers {
  tilesCount: 0 | 2 | 3;
  /** Numeric Shopify product ids (digits-only strings) that fill
   *  slots 1..N of every tier. Index `k` = slot `k + 1`. Empty
   *  list when the metafield is plain "2" / "3" (anchor-only). */
  bundleCompanionIds: string[];
}

const EMPTY_OFFERS: ParsedOffers = {
  tilesCount: 0,
  bundleCompanionIds: [],
};

/**
 * Translate the raw `custom.offers` metafield value into a
 * structured picker config. `tilesCount: 0` means the picker
 * shouldn't render (caller falls back to the qty stepper).
 *
 * Tolerant of whitespace, brackets, and trailing commas. Anything
 * unrecognised in the count slot collapses to `0`. Anything
 * unparseable in the companion list silently degrades to "no
 * companion for that slot" — the tier still renders, just without
 * the bundle pairing — instead of dropping the entire picker.
 */
export function parseOffersMetafield(
  raw: string | null | undefined,
): ParsedOffers {
  if (!TIERED_OFFERS_ENABLED) return EMPTY_OFFERS;
  if (raw == null) return EMPTY_OFFERS;
  const trimmed = String(raw).trim();
  if (trimmed === "" || trimmed === "0") return EMPTY_OFFERS;

  const colonIdx = trimmed.indexOf(":");
  const countToken = (
    colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx)
  ).trim();
  const tilesCount: 0 | 2 | 3 =
    countToken === "2" ? 2 : countToken === "3" ? 3 : 0;
  if (tilesCount === 0) return EMPTY_OFFERS;

  if (colonIdx === -1) return { tilesCount, bundleCompanionIds: [] };

  /* Companion suffix — strip surrounding `[…]` brackets if present
   * then split on commas. Each piece must be digits-only; anything
   * else is dropped (preserves prefix tiles but disables that
   * slot's bundle). */
  let idsToken = trimmed.slice(colonIdx + 1).trim();
  if (idsToken.startsWith("[") && idsToken.endsWith("]")) {
    idsToken = idsToken.slice(1, -1);
  }
  const bundleCompanionIds = idsToken
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));

  return { tilesCount, bundleCompanionIds };
}

/** Numeric Shopify product id → Storefront gid. Used to wire
 *  bundle-companion ids parsed off the metafield to product
 *  lookups in the Storefront API. */
export function productIdToGid(numericId: string): string {
  return `gid://shopify/Product/${numericId}`;
}

/**
 * Compute the per-tile preview pricing from the active variant.
 * Returns all-cents integers so the call site can hand them
 * straight to `<Price>` without unit conversion.
 *
 * Rounding is to the nearest cent on the discounted side; the
 * worst-case display drift vs the eventual Shopify-side discount
 * is sub-cent and won't ever mislead a shopper because the cart
 * math stays server-authoritative.
 */
export function tierPricingCents(
  tier: OfferTier,
  variant: { priceCents: number; compareAtCents?: number },
): { discountedTotalCents: number; compareTotalCents: number } {
  const baseTotal = variant.priceCents * tier.quantity;
  const compareTotalCents =
    (variant.compareAtCents ?? variant.priceCents) * tier.quantity;
  const discountedTotalCents =
    tier.savingsPercent === 0
      ? baseTotal
      : Math.round(baseTotal * (1 - tier.savingsPercent / 100));
  return { discountedTotalCents, compareTotalCents };
}
