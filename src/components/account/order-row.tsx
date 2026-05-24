import Link from "next/link";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { formatPrice } from "@/lib/format";
import {
  extractGidId,
  type OrderSummary,
} from "@/lib/shopify/customer-account-types";

/**
 * Tappable order row — the single visual primitive every "list of
 * orders" surface composes.
 *
 *   - Used by the dashboard's `Recent orders` rail.
 *   - Used by the full `/account/orders` page.
 *
 * Renders its own `<li>` so callers just map orders into a `<ul>`
 * without thinking about list semantics, and the row owns its own
 * `<Link>` to the detail page. URL shape is `{numericId}` rather
 * than the full GID — short, email-shareable, and the detail page
 * passes it straight back to the `id:<n>` Shopify search filter.
 *
 * Visual contract:
 *
 *   - Thumbnail (first line-item image) on the left — same classic
 *     bordered-square shell as the cart drawer / order-detail
 *     line rows. A "+N" badge overhangs the top-right corner for
 *     orders with multiple distinct products, mirroring the qty
 *     badge posture used elsewhere so the visual reads as one
 *     family across the app.
 *   - Hover paints a quiet grey strip behind the row so the
 *     tappable surface reads as a single rectangle, not a tiny
 *     hit-target around the text.
 *   - `-mx-3 px-3` extends that strip slightly past the card's
 *     content edge without shifting the resting layout — the
 *     content position is unchanged when no hover.
 */
export interface OrderRowProps {
  order: OrderSummary;
}

export function OrderRow({ order }: OrderRowProps) {
  const numericId = extractGidId(order.id);
  const date = formatOrderDate(order.processedAt);
  /* MoneyV2 returns decimal strings (`"42.99"`) — `formatPrice`
   * expects integer cents, so normalise here at the row level. */
  const totalCents = Math.round(order.totalAmount * 100);

  return (
    <li>
      <Link
        href={`/account/orders/${numericId}`}
        className="-mx-3 flex items-center gap-4 rounded-md px-3 py-4 transition-colors hover:bg-[#fafafa]"
      >
        <OrderRowThumbnail
          src={order.previewImageUrl}
          alt={order.previewImageAlt ?? `Order ${order.name}`}
          additionalCount={order.additionalProductCount}
        />

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[color:var(--color-ink)]">
            {order.name}
          </p>
          <p className="text-sm text-[color:var(--color-ink-muted)]">
            {date}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-[color:var(--color-ink)]">
          {formatPrice(totalCents, order.currencyCode)}
        </p>
      </Link>
    </li>
  );
}

function OrderRowThumbnail({
  src,
  alt,
  additionalCount,
}: {
  src: string | null;
  alt: string;
  additionalCount: number;
}) {
  return (
    /* `relative` parent so the "+N" badge can absolute-position
     * against the image edge. Posture matches the qty badge on
     * the order-detail item thumbnail: a half-translate that
     * overhangs the top-right corner. */
    <div className="relative h-12 w-12 shrink-0">
      <div className="block aspect-square h-full w-full overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        {src ? (
          <ShimmerImage
            src={src}
            alt={alt}
            wrapperClassName="block h-full w-full"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full bg-[color:var(--color-search)]"
          />
        )}
      </div>
      {additionalCount > 0 && (
        /* Forced 20×20 (`h-5 w-5`, no min-width / horizontal
         * padding) so the "+N" badge stays a clean circle.
         * `+1` is two characters whereas the order-detail qty
         * badge it borrows its posture from is usually one — at
         * the qty badge's 11px font + `px-1` padding the "+1"
         * payload nudged the badge into a slight oval. Squaring
         * the box and dropping to 10px bold restores the circle
         * without making the digit hard to read. */
        <span
          aria-label={`Plus ${additionalCount} more product${
            additionalCount === 1 ? "" : "s"
          }`}
          className="absolute right-0 top-0 flex h-5 w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-[color:var(--color-ink)] text-[10px] font-bold leading-none text-white"
        >
          +{additionalCount}
        </span>
      )}
    </div>
  );
}

function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
