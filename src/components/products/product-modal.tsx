"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { getProductDetailAction } from "@/app/products/actions";
import { useIsCompact } from "@/components/device/device-provider";
import { BuyActions } from "@/components/products/buy-actions";
import { DeliveryBadge } from "@/components/products/delivery-badge";
import { ProductGallery } from "@/components/products/product-gallery";
import { VariantPicker } from "@/components/products/variant-picker";
import { Modal } from "@/components/ui/modal";
import { Price } from "@/components/ui/price";
import { Sheet } from "@/components/ui/sheet";
import {
  cascadeSelect,
  defaultSelection,
  findVariant,
  type OptionSelection,
} from "@/lib/variants";
import { cn } from "@/lib/utils";
import type {
  ProductDetail,
  ProductVariant,
  SearchProduct,
} from "@/types/product";

type FetchStatus = "idle" | "loading" | "success" | "error";

/**
 * Product modal — a mini-PDP that opens from a product card's
 * Add-to-Cart pill when the product carries real option groups
 * (`hasVariants(product) === true`). Single-configuration
 * products skip the modal and add directly; that branch lives in
 * `<AddToCartButton>`.
 *
 * Composition philosophy: this is the same buy column the PDP
 * renders, minus the page-only sections. Every visible piece
 * imports from the existing PDP toolkit so behaviour, motion,
 * styling, and analytics stay byte-for-byte consistent between
 * surfaces — the modal isn't a parallel UI, it's a smaller frame
 * around the same parts:
 *
 *   ┌─ Modal: "Quick add" ──────────────┐
 *   │ <ProductGallery>            scroll│
 *   │   thumbs + main + lightbox    ↕   │
 *   │ Title  (linked → PDP)             │
 *   │ <DeliveryBadge>                   │
 *   │ $price   $compare   -PCT          │
 *   │ <VariantPicker>                   │
 *   ├─ footer (sticky) ─────────────────┤
 *   │ <BuyActions>                      │
 *   │  [qty] [ Add to Cart  ]           │
 *   │        [ Buy Now      ]           │
 *   └───────────────────────────────────┘
 *
 * Single column, gallery first. The modal is "decide fast" —
 * there's no value in splitting attention between two side-by-
 * side columns when the whole frame is already a focused
 * dialog. Vertical scroll inside the body handles tall option
 * stacks; the buy CTAs ride a pinned footer so the Add / Buy
 * actions are always one click away regardless of scroll
 * position. Border on top of the footer renders only when the
 * body actually overflows — same dialect `<MediaFormModal>`
 * uses for the review / return-request forms — so a short
 * product (small gallery, no variants) doesn't pick up extra
 * chrome for no reason.
 *
 * Intentionally omitted compared to the PDP:
 *
 *   - **Tiered offers / bundle picker** — modal lives at "decide
 *     fast" speed; the upsell tile picker belongs on a page where
 *     the shopper has committed to evaluating offers.
 *   - **Description / Reviews / Disclaimer accordion** — reading
 *     the long form means the shopper wants the full PDP. The
 *     title link routes them there.
 *   - **You may also like rail** — same rationale; cross-sell
 *     surfaces are page-level merchandising, not buy-flow chrome.
 *   - **Shop Pay "Pay in 4" installment promise** — page-level
 *     trust copy; in a contained dialog the CTA stack already
 *     reads cleanly without it.
 *   - **Trust badges** (30-day guarantee / secure checkout / 24/7
 *     support) — same rationale as the installment promise.
 *
 * Data shape:
 *
 *   - The card hands in a `SearchProduct` (Salespace search row)
 *     which carries option names + values but no variant ids,
 *     no per-variant pricing, and no media gallery. We need all
 *     three to render the modal, so on first open we lazy-fetch
 *     the full `ProductDetail` via `getProductDetailAction`
 *     (cached through the same 1h `product:<handle>` fetch
 *     boundary the PDP uses).
 *   - Skeleton state until the detail lands so the modal feels
 *     responsive even on a cold cache.
 *
 * Add / Buy paths:
 *
 *   - `<BuyActions>` owns the qty stepper, Add-to-Cart, Buy Now,
 *     and the Shop Pay installment promise. It writes to the cart
 *     store directly via `addCartLine` / `buyNow`, so the modal
 *     itself doesn't need to know about those primitives.
 *   - On a successful Add to Cart we dismiss the modal via the
 *     `onAdded` callback — the cart drawer pops next as the
 *     shopper's confirmation, and stacking modal-over-drawer
 *     would just hide the drawer behind the overlay.
 *   - Buy Now navigates away (Shopify-hosted checkout), so we
 *     don't need to actively close — the modal unmounts with the
 *     page.
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
   * `react-hooks/set-state-in-effect`). */
  useEffect(() => {
    if (!open || status !== "idle") return;
    startTransition(async () => {
      setStatus("loading");
      const d = await getProductDetailAction(product.handle);
      if (d) {
        setDetail({ ...d, bundleCompanions: [] });
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
   * violation. */
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

  /* Pre-built `image-url → media index` map for variant-driven
   * gallery sync. Same shape `<ProductLayout>` uses on the PDP —
   * one O(n) walk on detail load, O(1) lookup per variant
   * change. When a variant has an attached image AND that image
   * exists in the media gallery, the gallery crossfades to that
   * index; otherwise it stays where it is. */
  const urlToMediaIndex = useMemo(() => {
    const map = new Map<string, number>();
    detail?.media.forEach((m, i) => map.set(m.preview.url, i));
    return map;
  }, [detail]);

  const syncedGalleryIndex = useMemo<number | undefined>(() => {
    const url = selectedVariant?.image?.url;
    if (!url) return undefined;
    return urlToMediaIndex.get(url);
  }, [selectedVariant, urlToMediaIndex]);

  const handleSelect = (optionName: string, value: string) => {
    if (!detail) return;
    setSelection((prev) =>
      cascadeSelect(detail.options, detail.variants, prev, optionName, value),
    );
  };

  /* Overflow tracking for the footer's top border.
   *
   * The footer (buy CTAs) is pinned at the bottom of the panel
   * via `shrink-0` while the body above takes `flex-1 min-h-0
   * overflow-y-auto`. When the body's content actually exceeds
   * its available height we draw a `border-t` on the footer so
   * the shopper has a visual cue that there's more above the
   * fold; on a short product (compact gallery, no options) we
   * skip the border so the CTAs read as the natural bottom of
   * the panel rather than chrome-stacked-on-chrome.
   *
   * Two observers, one callback: the body's clientHeight
   * changes when the panel's `max-h` engages or the viewport
   * resizes; the content's scrollHeight changes when children
   * mount / unmount (skeleton → detail, error → recovery,
   * variant picker rows shifting). Either firing re-evaluates
   * the predicate. `+1` fudge avoids a sub-pixel false positive
   * on hi-dpi displays where `scrollHeight` can round a fraction
   * above `clientHeight` without the content actually
   * overflowing.
   *
   * Deps: just `[open]`. The `ResizeObserver` already covers
   * every content swap inside the body — the modal's panel
   * unmounts on close (via `<Modal>`'s mount-toggle) so we
   * re-attach observers each time the modal opens, but
   * skeleton ↔ detail ↔ error transitions inside the same open
   * session are handled by the observer firing on the content
   * resize. */
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [bodyOverflows, setBodyOverflows] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content) return;

    const check = () => {
      setBodyOverflows(content.scrollHeight > body.clientHeight + 1);
    };
    check();

    const ro = new ResizeObserver(check);
    ro.observe(body);
    ro.observe(content);
    return () => ro.disconnect();
  }, [open]);

  /* Resolved-variant pricing wins over the product-level range
   * the moment we have one. When the picker lands on an invalid
   * combo `selectedVariant` is `undefined` — we fall back to the
   * range so the modal never shows "$undefined" mid-cascade. */
  const priceMinCents =
    selectedVariant?.priceCents ??
    detail?.priceMinCents ??
    product.price_min_cents;
  const priceMaxCents =
    selectedVariant?.priceCents ??
    detail?.priceMaxCents ??
    product.price_max_cents;
  const compareAtCents =
    selectedVariant?.compareAtCents ?? detail?.compareAtMinCents;
  const currency = detail?.currency ?? product.currency;
  const hasPriceRange = priceMaxCents > priceMinCents;
  const discountPct =
    compareAtCents && compareAtCents > priceMinCents
      ? Math.round(((compareAtCents - priceMinCents) / compareAtCents) * 100)
      : 0;
  const isDiscounted = discountPct > 0;

  const isCompact = useIsCompact();

  /* Body content — same JSX in both surfaces. Captured as a
   * variable so the Modal branch can wire its overflow-aware
   * border-top, and the Sheet branch can pass it straight into
   * its scrollable slot without thinking about it. */
  const bodyContent =
    status === "error" ? (
      <ErrorState onClose={onClose} />
    ) : !detail ? (
      <BodySkeleton product={product} />
    ) : (
      <>
        <ProductGallery
          media={detail.media}
          title={detail.title}
          syncedIndex={syncedGalleryIndex}
        />

        {/* Title links through to the full PDP — same hover
         *  dialect as the cart-row title so the affordance
         *  reads consistently ("title turns brand orange →
         *  product page"). The modal closes on navigate
         *  because the next surface owns the chrome. */}
        <Link
          href={`/products/${detail.handle}`}
          onClick={onClose}
          className="text-lg font-bold leading-snug text-[color:var(--color-ink)] transition-colors hover:text-[color:var(--color-brand)] md:text-xl"
        >
          {detail.title}
        </Link>

        <DeliveryBadge
          deliveryTime={detail.deliveryTime}
          priceCents={priceMinCents}
        />

        <div className="flex flex-wrap items-baseline gap-3">
          <Price
            cents={priceMinCents}
            currency={currency}
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
                currency={currency}
                discounted={isDiscounted}
                className="text-2xl"
              />
            </>
          )}
          {isDiscounted && compareAtCents && (
            <>
              <Price
                cents={compareAtCents}
                currency={currency}
                variant="compare"
                className="text-base"
              />
              <DiscountBadge percent={discountPct} />
            </>
          )}
        </div>

        <VariantPicker
          options={detail.options}
          variants={detail.variants}
          selection={selection}
          onSelect={handleSelect}
          sizeChart={detail.sizeChart}
        />
      </>
    );

  /* Footer content shared between Modal + Sheet. Error state
   * has its own dismiss button inside the body, so we render
   * the footer only on the loading and success paths. */
  const footerContent =
    status === "error" ? null : detail ? (
      <BuyActions
        product={detail}
        selectedVariant={selectedVariant}
        onAdded={onClose}
        showInstallmentBadge={false}
      />
    ) : (
      <FooterSkeleton />
    );

  if (isCompact) {
    /* Compact-viewport bottom-sheet branch. `<Sheet>` owns its own
     * scroll container + sticky footer slot — no overflow-
     * border logic needed because the chrome already keeps
     * the CTAs anchored to the safe-area floor regardless
     * of body length. */
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title="Quick add"
        className="px-5 py-4"
        footer={
          footerContent ? (
            <div className="px-5 py-4">{footerContent}</div>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5">{bodyContent}</div>
      </Sheet>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick add"
      /* Single-column dialog — modest cap (`max-w-lg` ≈ 32rem)
       *  that frames the gallery as the dominant element without
       *  blowing out the modal into page-takeover territory.
       *  Vertical overflow scrolls inside the shared modal body
       *  cap, so tall option stacks just scroll naturally. */
      className="max-w-lg"
    >
      {/* Panel-relative column. `flex-1 min-h-0` claims the
       *  remaining vertical space after the modal's title bar
       *  so the body inside can scroll against a finite parent
       *  rather than push the footer off-screen. Same shape
       *  `<MediaFormModal>` uses for its review / return-
       *  request forms. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Scroll container. Padding lives on the inner content
         *  wrapper, not here, so the scrollbar (when present)
         *  sits flush against the panel's right edge instead of
         *  inside the body padding. */}
        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div ref={contentRef} className="flex flex-col gap-5 p-5">
            {bodyContent}
          </div>
        </div>

        {/* Footer — pinned at the bottom of the panel via
         *  `shrink-0`. Border on top only when the body
         *  actually overflows, matching the `<MediaFormModal>`
         *  pattern (see `bodyOverflows` effect above). The
         *  error branch hides the footer entirely (its
         *  ErrorState owns its own dismiss button), so the
         *  buy CTAs aren't shown for a product we couldn't
         *  load. The skeleton branch swaps in a CTA-stack
         *  placeholder so the footer's height matches what's
         *  coming, no jump when `detail` lands. */}
        {footerContent && (
          <div
            className={cn(
              "shrink-0 px-5 py-4",
              bodyOverflows &&
                "border-t border-[color:var(--color-border)]",
            )}
          >
            {footerContent}
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Inline error fallback when `getProductDetailAction` returns
 * null (product unpublished mid-session, network failure, etc.).
 * Routes the shopper to the PDP they came from — same surface,
 * same handle, same fetch upstream, so a refresh-style retry
 * costs nothing on the cache side.
 */
function ErrorState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
      <div className="rounded-lg border border-dashed border-[color:var(--color-border)] px-6 py-8 text-sm text-[color:var(--color-ink-muted)]">
        Couldn&rsquo;t load this product&rsquo;s options. Open the product
        page to add it.
        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Body half of the skeleton — everything that lives inside the
 * scrollable region while `getProductDetailAction` is in flight.
 * Mirrors the modal's content stack (gallery → title → delivery
 * → price → option chip rows) so the panel doesn't reshape when
 * `detail` lands; just the shimmer bars swap for real content.
 *
 * `product.options` from the search row is enough to know the
 * shape of the option picker that's coming; we render one
 * skeleton row per option group so the chip layout doesn't shift
 * when the real picker arrives.
 */
function BodySkeleton({ product }: { product: SearchProduct }) {
  const optionNames = Object.keys(product.options ?? {});
  return (
    <>
      <div
        aria-hidden
        /* Match `<ProductGallery>`'s width cap (mx-auto w-full
         * max-w-[640px]) so the shimmer occupies the gallery's exact
         * footprint and the panel doesn't reshape when media lands. */
        className="mx-auto aspect-square w-full max-w-[640px] animate-pulse rounded-2xl bg-[color:var(--color-surface-muted)]"
      />
      <div className="h-6 w-3/4 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
      <div className="h-10 animate-pulse rounded-lg bg-[color:var(--color-surface-muted)]" />
      <div className="h-8 w-1/3 animate-pulse rounded bg-[color:var(--color-surface-muted)]" />
      {optionNames.length > 0 ? (
        optionNames.map((name) => <ChipRowSkeleton key={name} />)
      ) : (
        <ChipRowSkeleton />
      )}
    </>
  );
}

/**
 * Footer half of the skeleton — two CTA placeholders matching
 * `<BuyActions>`'s eventual height (qty + Add-to-Cart row, then
 * Buy Now below). Keeps the pinned footer's height stable
 * between the loading and loaded states so the body's scroll
 * geometry doesn't jump under the shopper.
 */
function FooterSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-12 w-full animate-pulse rounded-lg bg-[color:var(--color-surface-muted)]" />
      <div className="h-12 w-full animate-pulse rounded-lg bg-[color:var(--color-surface-muted)]" />
    </div>
  );
}

function ChipRowSkeleton() {
  return (
    <div className="flex flex-col gap-3">
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
  );
}

/**
 * Headline "X% off" pill — solid brand-orange, white label. Mirrors
 * the PDP's version pixel-for-pixel; module-private here because
 * lifting it to a shared file just to share three lines of JSX
 * doesn't earn the indirection.
 */
function DiscountBadge({ percent }: { percent: number }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center self-center rounded-full",
        "px-2.5 py-1 text-sm font-semibold tracking-wide text-white",
        "bg-[color:var(--color-brand)]",
      )}
    >
      {percent}% off
    </span>
  );
}
