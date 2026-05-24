import Link from "next/link";
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
        className="-mx-3 flex items-center justify-between gap-4 rounded-md px-3 py-4 transition-colors hover:bg-[#fafafa]"
      >
        <div className="min-w-0">
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

function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
