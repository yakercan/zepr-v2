import Link from "next/link";
import { AddToCartButton } from "@/components/products/add-to-cart-button";
import { ProductBadge, RatingBadge } from "@/components/products/badge";
import { FavoriteButton } from "@/components/products/favorite-button";
import { ProductCardMedia } from "@/components/products/product-card-media";
import { Price } from "@/components/ui/price";
import {
  FREE_SHIPPING_BADGE,
  pickProductBadge,
  qualifiesForFreeShipping,
} from "@/lib/badges";
import { SURFACE_OUTLINE_CLASSES } from "@/lib/styles";
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
 *   ┌─ rounded-2xl card · white surface · 2px border ──────┐
 *   │ aspect-square media tile · full-bleed (top + sides)  │
 *   │   ProductCardMedia owns the hover-scoped interactions│
 *   │   ── group-hover/media: image scale 1.03 (parallax)  │
 *   │   ── group-hover/media: swap to image_2 OR play video│
 *   │                                  [FREE SHIPPING]     │
 *   │   ── sold-out scrim when not available               │
 *   ├──────────────────────────────────────────────────────┤
 *   │  [★ 4.7] [BADGE] Product title that wraps onto the   │
 *   │  second line if it's long (2-line clamp)             │
 *   │  price    (tinted with badge accent · strikethrough) │
 *   └──────────────────────────────────────────────────────┘
 *
 * Why the media tile is its own client component: every hover-
 * driven media effect (image swap, video play/pause, scale) is
 * scoped to the media area via Tailwind's `group/media` named
 * group. Hovering the info row (title / price / Add-to-Cart) no
 * longer fires media effects — they only trigger when the cursor
 * is actually over the tile.
 *
 * Badge rules:
 *   • At most ONE product badge (priority-picked from API `badges`)
 *     plus the rating, both inline at the head of the title as
 *     outlined pills.
 *   • Free Shipping shows on the image as a solid green callout —
 *     it's a delivery promise, not a product attribute, so it lives
 *     on the media to read like a sticker rather than a tag.
 *   • The product badge's accent colour tints the current price
 *     `<span>` so the headline tag visually owns the price. Free
 *     Shipping doesn't drive the price tint (different domain).
 *
 * Border behaviour mirrors the main-feed tabs: soft gray at rest,
 * snaps to full ink on hover. The whole card hovers as one unit,
 * which lets the title / rating / price block participate in the
 * affordance even though the visible animation is on the image.
 */
export interface ProductCardProps {
  product: SearchProduct;
  /** Eager-load the image. Pass `true` for the first row of cards
   *  (above-the-fold) and leave `false` for the rest so the browser
   *  lazy-loads naturally. */
  eager?: boolean;
  /** Server-fetched: is this product in the current shopper's
   *  favorites set? Defaults to `false` (guest + unfavorited). The
   *  grid call site looks up `favoritedIds.has(product.id)` once
   *  for the whole page and forwards the boolean per card so each
   *  `<ProductCard>` is still a server component shipping no JS
   *  for the lookup itself. */
  favorited?: boolean;
  /** Drives the heart's guest vs logged-in branch — opens the
   *  sign-in modal for guests, persists via server action for
   *  signed-in shoppers. Passed once from the page (which already
   *  reads session for other reasons) and forwarded through the
   *  grid. */
  isLoggedIn?: boolean;
}

export function ProductCard({
  product,
  eager = false,
  favorited = false,
  isLoggedIn = false,
}: ProductCardProps) {
  const hasDiscount =
    product.compare_at_min_cents !== undefined &&
    product.compare_at_min_cents > product.price_min_cents;
  const isSoldOut = !product.available;

  // Up to one product badge (priority-picked from the API tags),
  // plus a separate free-shipping badge — the latter doesn't count
  // toward the one-badge product limit because it answers a
  // different question ("will this ship for free?" vs "what's
  // special about this product?").
  const productBadge = pickProductBadge(product.badges);
  const showFreeShipping = qualifiesForFreeShipping(product.price_min_cents);

  return (
    <Link
      href={`/products/${product.handle}`}
      prefetch={false}
      className={cn(
        // Card outline pulls the shared `SURFACE_OUTLINE_CLASSES`
        // preset (see `lib/styles.ts`) so the whole page — feed
        // tabs, product cards, and any future filter chip — speaks
        // one visual language for "selectable surface": soft grey
        // rest, ink on hover. Editing the preset updates every
        // surface at once.
        //
        // `overflow-hidden` on the card lets the image bleed flush
        // to the top + side edges (its corners are clipped by the
        // card's `rounded-2xl`); only the info block below carries
        // padding, so the media reads as the dominant surface.
        "group flex flex-col overflow-hidden rounded-2xl",
        "bg-[color:var(--color-surface)]",
        SURFACE_OUTLINE_CLASSES,
      )}
    >
      <ProductCardMedia product={product} eager={eager}>
        {/* Favorite toggle — top-right of the tile. Reads
            card-level `group-hover` (not `group/media`) so the
            heart reveals on hover anywhere on the card, including
            the info row. Once favorited it sticks at full opacity
            so the user can scan a grid and spot saved items at a
            glance. */}
        <FavoriteButton
          productId={product.id}
          initiallyFavorited={favorited}
          isLoggedIn={isLoggedIn}
        />

        {/* Free Shipping — full-width solid green banner pinned to
            the bottom edge of the media. Lives on the image (not
            the meta row) because it answers a delivery question,
            not a "what's special?" question. Spanning edge-to-edge
            (with squared corners since they're flush against the
            card's clipping `overflow-hidden`) makes it read like
            a sticker, not a tag. Hidden on sold-out tiles since
            the promise is moot there. */}
        {showFreeShipping && !isSoldOut && (
          <ProductBadge
            badge={FREE_SHIPPING_BADGE}
            variant="solid"
            className="absolute inset-x-0 bottom-0 justify-center rounded-none"
          />
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
      </ProductCardMedia>

      {/* `flex-1` lets the info section grow to fill whatever
          height the grid stretches the card to, so `mt-auto` on
          the price row reliably pins it to the bottom edge —
          every card in a row prints its price on the same
          baseline regardless of how long the title is or whether
          a promo badge takes up space. */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* Badges flow *inline* at the head of the title so the text
            continues right after them and wraps naturally beneath.
            Order: rating leads (every product has one, so it anchors
            the row) → promo badge (only standouts get one) → title.
            Free Shipping is intentionally not here — it lives on the
            media as a callout sticker.
          
            # Two-line clamp without `-webkit-box` (the bug-free path)
          
            We deliberately do NOT use `line-clamp-2` here. `line-clamp`
            forces `display:-webkit-box`, and WebKit mishandles pills
            inside it: as `inline-flex` they get the line *clipped* on
            mobile (the "cutoff"), and as plain `inline` they lose
            `white-space:nowrap` and *break apart* (star on one line,
            rating on the next). Both are the same root cause — pills
            don't belong in a `-webkit-box`.
          
            Instead we clamp with a plain block + `overflow-hidden`
            capped at `max-h-[2lh]` (two line-heights — the `lh` unit
            tracks `leading-relaxed` automatically, so the cap stays
            exactly two lines if the leading ever changes). Ordinary
            block flow handles `inline-flex` children correctly, so the
            pills stay atomic (no break) and uncliped (no `-webkit-box`)
            while the title still hard-stops at two lines. `align-middle`
            keeps each pill centred on the text line. The only thing we
            give up vs `line-clamp` is the trailing ellipsis — overflow
            clips cleanly at the line boundary instead. */}
        {/* `leading-relaxed` instead of `snug` so the line carrying
            the badge pills (taller than plain text) doesn't crowd the
            wrapped title below. Applied unconditionally so cards with
            and without badges share the same title rhythm. */}
        <h3 className="max-h-[2lh] overflow-hidden text-sm font-medium leading-relaxed text-[color:var(--color-ink)]">
          {product.rating && (
            <RatingBadge
              value={product.rating.value}
              className="mr-1.5 align-middle"
            />
          )}
          {productBadge && (
            <ProductBadge
              badge={productBadge}
              className="mr-1.5 align-middle"
            />
          )}
          {product.title}
        </h3>

        {/* Price row — `mt-auto` pushes it to the bottom of the
            grown info column. The current price inherits the
            headline badge's accent (so a Hot Deal card prints its
            price in pink, a Best Seller in brand orange, default
            ink otherwise). The compare-at sits next to it in the
            muted compare variant — same `<Price>` component, just
            a different `variant`.
            Add-to-Cart pill sits on the right of the same row, so
            price + action share one visual block at the card's
            bottom edge. `justify-between` pins the prices left and
            the pill right regardless of how long the price string
            renders. */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex items-baseline gap-2">
            <Price
              cents={product.price_min_cents}
              currency={product.currency}
              accent={productBadge?.theme.accent}
            />
            {hasDiscount && product.compare_at_min_cents !== undefined && (
              <Price
                cents={product.compare_at_min_cents}
                currency={product.currency}
                variant="compare"
              />
            )}
          </div>
          {/* `-mr-0.5 -mb-1` tucks the pill closer to the card's
              bottom-right corner without affecting the row's flex
              metrics. The bubble reads as the larger object in the
              row vs. the price text-block, so leaving it centered
              on the row's padding box made the card read with extra
              white space; pulling it 2px right + 4px down rebalances
              the composition without disturbing siblings.
            
              Sibling note: `<AddToCartButton>` *also* renders a
              portaled `<ProductModal>` wrapped in a
              `display: contents` span. That span deliberately
              generates no boxes — without it, the flex row's
              `justify-between` would treat the empty modal-wrapper
              as a third item at the end and push *this* button into
              the middle of the row. See add-to-cart-button.tsx for
              the full reasoning. */}
          <AddToCartButton
            product={product}
            className="-mr-0.5 -mb-1"
          />
        </div>
      </div>
    </Link>
  );
}
