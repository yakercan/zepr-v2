"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { getProductDetailAction } from "@/app/products/actions";
import { VariantPicker } from "@/components/products/variant-picker";
import { Modal } from "@/components/ui/modal";
import { Price } from "@/components/ui/price";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { addCartLine } from "@/lib/cart/store";
import {
  cascadeSelect,
  defaultSelection,
  findVariant,
  type OptionSelection,
} from "@/lib/variants";
import type {
  ProductDetail,
  ProductVariant,
  SearchProduct,
} from "@/types/product";

type FetchStatus = "idle" | "loading" | "success" | "error";

/**
 * Product modal — quick variant picker that opens from a product
 * card's Add-to-Cart pill when (and only when) the product carries
 * real option groups (`hasVariants(product) === true`). Single-
 * configuration products skip the modal and add directly; that
 * branch lives in `<AddToCartButton>`. Card flow only — PDPs keep
 * their own inline `<BuyForm>`.
 *
 * Data shape:
 *
 *   - The card hands in a `SearchProduct` (Salespace search row)
 *     which carries option names + values but no variant ids and
 *     no per-variant pricing. We need those to call the Shopify
 *     Cart API with a real `merchandiseId`.
 *   - On open we lazy-fetch the full `ProductDetail` via a
 *     `getProductDetailAction` server action (cached through the
 *     same 1h `product:<handle>` fetch boundary the PDP uses).
 *   - Skeleton state until the detail lands so the modal feels
 *     responsive even on a cold cache.
 *
 * Pickers reuse `<VariantPicker>` end-to-end so the modal's option
 * UI matches the PDP byte-for-byte — chips for short value lists,
 * dropdowns for long ones, full cascade selection. Variant
 * resolution rides the same `findVariant` helper.
 *
 * Add flow:
 *
 *   1. Selection landed on a real variant + the variant is in
 *      stock → enable the CTA.
 *   2. CTA click → `addCartLine` with the resolved
 *      `merchandiseId`. The cart store routes by mode — guest
 *      writes localStorage, logged-in fires `addToCartAction`
 *      and reconciles against Shopify.
 *   3. `addCartLine` pops the drawer; we close the modal so the
 *      drawer's "added to cart" feedback is the user's next
 *      visible event.
 *
 * Stays mounted (even when closed) so the option state survives
 * a reopen without re-fetching. The `<Modal>` shell owns
 * animation, focus, body-scroll lock, Escape close, and
 * backdrop-click close — this component just owns content.
 */
export function ProductModal({
  product,
  open,
  onClose,
}: {
  product: SearchProduct;
  open: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [, startTransition] = useTransition();

  /* Lazy-fetch on first open. The fetch boundary inside
   * `getProductByHandle` caches at the Storefront layer, so
   * re-opens after the modal's been seen once will read straight
   * from cache (no perceived latency). The `detail` cache here is
   * per-mount; navigating away and coming back will re-fetch but
   * still hit the upstream cache.
   *
   * Effect performs side-effects only — the status flip to
   * "loading" rides through `startTransition`, which lets React
   * defer the loading state behind the fetch without us calling
   * `setStatus` directly in the effect body (that would trip
   * `react-hooks/set-state-in-effect`). The transition is
   * dispatched, React schedules the update, the fetch runs, and
   * the success / error state lands inside the transition's
   * continuation. */
  useEffect(() => {
    if (!open || status !== "idle") return;
    startTransition(async () => {
      setStatus("loading");
      const d = await getProductDetailAction(product.handle);
      if (d) {
        setDetail(d);
        setStatus("success");
      } else {
        setStatus("error");
      }
    });
  }, [open, product.handle, status]);

  /* Seed selection once detail lands. Canonical React pattern for
   * "compute initial state from props that arrive later" — store
   * the previous value in state, compare during render, and call
   * `setState` if it changed. React discards the in-flight render
   * output and replays with the updated state in a single commit,
   * so there's no extra paint and no `set-state-in-effect`
   * violation. See https://react.dev/reference/react/useState
   * #storing-information-from-previous-renders. */
  const [seededFor, setSeededFor] = useState<ProductDetail | null>(null);
  const [selection, setSelection] = useState<OptionSelection>({});
  if (detail && detail !== seededFor) {
    setSeededFor(detail);
    setSelection(defaultSelection(detail.variants));
  }

  const selectedVariant = useMemo<ProductVariant | undefined>(() => {
    if (!detail) return undefined;
    if (detail.options.length === 0) return detail.variants[0];
    return findVariant(detail.variants, selection);
  }, [detail, selection]);

  const sellable = !!selectedVariant?.availableForSale;

  const handleSelect = (optionName: string, value: string) => {
    if (!detail) return;
    setSelection((prev) =>
      cascadeSelect(detail.options, detail.variants, prev, optionName, value),
    );
  };

  const handleAdd = () => {
    if (!detail || !selectedVariant) return;
    addCartLine(buildCartLineFromVariant(detail, selectedVariant));
    onClose();
  };

  /* Pricing — prefer the resolved variant's price (we have it the
   * moment the picker lands on a valid combo); fall back to the
   * product-level range so the modal never shows "$undefined"
   * during a mid-cascade invalid pick. */
  const priceMinCents = selectedVariant?.priceCents ?? detail?.priceMinCents ?? product.price_min_cents;
  const priceMaxCents = selectedVariant?.priceCents ?? detail?.priceMaxCents ?? product.price_max_cents;
  const compareAtCents =
    selectedVariant?.compareAtCents ?? detail?.compareAtMinCents;
  const currency = detail?.currency ?? product.currency;
  const hasRange = priceMaxCents > priceMinCents;
  const hasCompareAt =
    compareAtCents !== undefined && compareAtCents > priceMinCents;

  /* Hero image — variant-specific photo when Shopify admin set one
   * (e.g. the blue colourway), product hero otherwise, finally
   * the Salespace card image as the last-resort fallback. */
  const heroImage =
    selectedVariant?.image?.url ??
    detail?.featuredImage?.url ??
    product.image_url;

  const ctaLabel = !detail
    ? "Loading…"
    : !selectedVariant
      ? "Select options"
      : sellable
        ? "Add to Cart"
        : "Sold out";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick add"
      className="max-w-md"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex gap-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[color:var(--color-border)]">
            <ShimmerImage
              src={heroImage}
              alt={detail?.title ?? product.title}
              wrapperClassName="block h-full w-full"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <h3 className="line-clamp-2 text-sm font-semibold text-[color:var(--color-ink)]">
              {detail?.title ?? product.title}
            </h3>
            <div className="mt-1 flex items-baseline gap-1.5">
              <Price cents={priceMinCents} currency={currency} />
              {hasRange && (
                <span className="text-xs text-[color:var(--color-ink-muted)]">
                  – <Price cents={priceMaxCents} currency={currency} />
                </span>
              )}
              {hasCompareAt && compareAtCents !== undefined && (
                <Price
                  cents={compareAtCents}
                  currency={currency}
                  variant="compare"
                />
              )}
            </div>
          </div>
        </div>

        {status === "error" ? (
          <div className="rounded-lg border border-dashed border-[color:var(--color-border)] px-4 py-6 text-center text-sm text-[color:var(--color-ink-muted)]">
            Couldn&rsquo;t load this product&rsquo;s options. Open the
            product page to add it.
          </div>
        ) : !detail ? (
          <VariantPickerSkeleton product={product} />
        ) : (
          <VariantPicker
            options={detail.options}
            variants={detail.variants}
            selection={selection}
            onSelect={handleSelect}
          />
        )}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!detail || !sellable}
            className="btn-primary"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Compose the cart-line payload for a card-modal add. Mirrors
 * `buildAnchorCartLine` from `<BuyActions>`: same id convention,
 * same `Title: Default Title` placeholder strip on the variant
 * title, same image fallback ladder. Kept in this file rather
 * than exported from `buy-actions.tsx` because the modal works
 * off `ProductDetail` shape and the existing helper is colocated
 * with the PDP CTAs that already consume it.
 */
function buildCartLineFromVariant(
  product: ProductDetail,
  variant: ProductVariant,
) {
  const variantTitle =
    variant.selectedOptions.length > 0
      ? variant.selectedOptions
          .filter(
            (o) => !(o.name === "Title" && o.value === "Default Title"),
          )
          .map((o) => `${o.name}: ${o.value}`)
          .join(" / ") || undefined
      : undefined;

  const imageUrl =
    variant.image?.url ??
    product.featuredImage?.url ??
    product.media[0]?.preview.url ??
    "";

  return {
    id: `${product.id}:${variant.id}`,
    productId: product.id,
    merchandiseId: variant.id,
    handle: product.handle,
    title: product.title,
    imageUrl,
    priceCents: variant.priceCents,
    compareAtCents: variant.compareAtCents,
    currency: product.currency,
    variantTitle,
  };
}

/**
 * Picker skeleton — one shimmer row per option group the
 * Salespace search index already told us exists, sized to roughly
 * match the chip rows that'll land once `getProductDetailAction`
 * resolves. Keeping the row count + label height stable means the
 * modal doesn't jump when the real picker swaps in. The
 * `animate-pulse` is the same dialect as the rest of the
 * storefront's loading states.
 */
function VariantPickerSkeleton({ product }: { product: SearchProduct }) {
  const optionNames = Object.keys(product.options ?? {});
  if (optionNames.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      {optionNames.map((name) => (
        <div key={name} className="flex flex-col gap-3">
          <div className="h-4 w-20 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-9 w-14 animate-pulse rounded-full bg-[color:var(--color-surface-muted)]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
