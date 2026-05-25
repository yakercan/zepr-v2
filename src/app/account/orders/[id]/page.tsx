import "server-only";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ReturnRequestButton } from "@/components/account/return-request-button";
import { BackLink } from "@/components/ui/back-link";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { getSession } from "@/lib/auth/session";
import { formatPrice } from "@/lib/format";
import { fetchOrderDetail } from "@/lib/shopify/customer-account-queries";
import type {
  CustomerAddress,
  OrderDetail,
  OrderLineItem,
} from "@/lib/shopify/customer-account-types";
import {
  buildOrderTimeline,
  type TimelineEvent,
  type TimelineEventStatus,
} from "@/lib/shopify/order-status";
import { PANEL_SURFACE_THIN_CLASSES } from "@/lib/styles";
import { getTrackingDelivery } from "@/lib/tracking/seventeen-track";
import { cn } from "@/lib/utils";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order #${id}` };
}

/**
 * Order detail.
 *
 * One Customer Account API read up front, then everything below
 * the header paints synchronously. The only piece that can stream
 * in late is the Timeline card's Delivered row, and only on
 * orders where Shopify doesn't already carry a DELIVERED event
 * for every shipped fulfilment — in that case the page wraps the
 * card in a Suspense boundary, paints a loading row inline, and
 * asks 17track for the rest in the background while the items /
 * totals / shipping address render immediately. Auth-gated like
 * the dashboard, with a `<BackLink>` at the top so the page reads
 * like one level deep in an app navigation stack even though
 * it's a real URL (which matters for transactional emails /
 * order-status links).
 *
 * Layout, top to bottom:
 *
 *   1. Back nav + page header (order name + processed date).
 *   2. Timeline — Placed / Paid / Shipped / (Delivered or Order
 *      cancelled). The Delivered slot is per-shipment: single-
 *      package orders render one "Delivered" row, multi-package
 *      orders render "Delivered (Package #1)", "Delivered
 *      (Package #2)", … so partial progress is legible. Plus two
 *      rows per return (Requested + Approved / Declined /
 *      Cancelled) and a closing "Refund issued" / "Partial refund
 *      issued" row when applicable. Pending steps render as muted
 *      placeholders, declined as a red ✕, and cancelled (order
 *      or return) as an amber ❕. The Delivered row(s) spin in
 *      place while the 17track fallback resolves so the rest of
 *      the card never has to wait on it.
 *   3. Items — line item list with image (qty as a corner badge),
 *      title, variant, line total; subtotal / shipping / tax /
 *      total breakdown in the card footer.
 *   4. Shipping address — omitted entirely for digital / pickup
 *      orders where no address was captured.
 */
export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { id } = await params;

  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent(`/account/orders/${id}`)}`,
    );
  }

  let order: OrderDetail | null;
  try {
    order = await fetchOrderDetail(id);
  } catch (err) {
    /* GraphQL / network failure — log on the server for ops
     * visibility, fall through to the 404 path so the shopper
     * never lands on a blank screen. */
    console.error("[account] order detail fetch failed:", err);
    notFound();
  }
  if (!order) notFound();

  /* 17track only runs as a fallback for fulfilments Shopify
   * hasn't already logged a DELIVERED event against. Three gates:
   *
   *   1. Order is not cancelled (Delivered doesn't apply).
   *   2. At least one fulfilment is missing `deliveredAt` from
   *      Shopify (otherwise the timeline already has everything
   *      it needs and 17track would be redundant).
   *   3. That missing fulfilment has a tracking number for
   *      17track to look up.
   *
   * Outside that narrow case we render synchronously — no
   * Suspense boundary, no spinner, no extra round-trip. */
  const needsDeliveryLookup =
    !order.cancelledAt &&
    order.fulfillments.some((f) => f.trackingNumber && !f.deliveredAt);

  return (
    <main className="page-container pt-6 pb-12 md:pt-8 md:pb-16">
      <BackLink href="/account/orders" label="Orders" />

      <PageHeader order={order} />

      <div className="mt-8 flex flex-col gap-6 md:gap-8">
        {needsDeliveryLookup ? (
          <Suspense
            fallback={
              <TimelineCard
                events={buildOrderTimeline(order, { deliveryLoading: true })}
              />
            }
          >
            <TimelineWithDeliveryLookup order={order} />
          </Suspense>
        ) : (
          <TimelineCard events={buildOrderTimeline(order)} />
        )}

        <ItemsCard order={order} />
        {order.shippingAddress && (
          <ShippingAddressCard address={order.shippingAddress} />
        )}
      </div>
    </main>
  );
}

/**
 * Async island wrapped by the page's Suspense boundary.
 *
 * Folds 17track's delivery status onto each fulfilment in
 * parallel — so an order with N packages waits on
 * max(per-lookup latency), not the sum — and re-renders the
 * Timeline card with the resolved data. The matching fallback in
 * the parent renders the same card with `deliveryLoading: true`,
 * which paints the Delivered row as a rotating arc until this
 * resolves and React swaps it for the real row.
 */
async function TimelineWithDeliveryLookup({ order }: { order: OrderDetail }) {
  /* Only ask 17track about fulfilments that (a) have a tracking
   * number, and (b) Shopify hasn't already given us a `deliveredAt`
   * for. Anything Shopify has already marked delivered passes
   * through untouched. */
  const fulfillments = await Promise.all(
    order.fulfillments.map(async (f) => {
      if (!f.trackingNumber || f.deliveredAt) return f;
      const status = await getTrackingDelivery(f.trackingNumber);
      return { ...f, deliveredAt: status?.deliveredAt ?? null };
    }),
  );
  const enriched = { ...order, fulfillments };
  return <TimelineCard events={buildOrderTimeline(enriched)} />;
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

function PageHeader({ order }: { order: OrderDetail }) {
  /* "Return request" lives on the same row as the order title,
   * vertically centred against the `<h1>` only — the date drops
   * below as a sibling so the button doesn't end up centred
   * against the entire (h1 + date) column, which read as "above
   * the title" before. Only renders when Shopify says the order
   * has at least one line item still eligible for return. */
  const canReturn = order.returnableLineItems.length > 0;

  return (
    <header className="mt-4 md:mt-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
          Order {order.name}
        </h1>
        {canReturn && (
          <ReturnRequestButton
            orderId={order.id}
            items={order.returnableLineItems}
          />
        )}
      </div>
      <p className="mt-1 text-sm text-[color:var(--color-ink-muted)]">
        Placed {formatOrderDate(order.processedAt)}
      </p>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Section card shell                                                  */
/* ------------------------------------------------------------------ */

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(PANEL_SURFACE_THIN_CLASSES, "p-6 md:p-8", className)}
    >
      <header className="mb-6">
        <h2 className="text-xl font-semibold leading-tight md:text-2xl">
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

function TimelineCard({ events }: { events: TimelineEvent[] }) {
  return (
    <SectionCard title="Timeline">
      <ol className="flex flex-col gap-4">
        {events.map((event) => (
          <TimelineRow key={event.key} event={event} />
        ))}
      </ol>
    </SectionCard>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  /* "Resolved" = "this milestone has a definite outcome".
   * Complete (green), declined (red), and cancelled (amber) all
   * render with strong ink so the date next to them reads as a
   * real timestamp. Pending and loading rows get the muted
   * treatment — pending because nothing's happened yet, loading
   * because we don't yet know which way it'll resolve. */
  const isResolved =
    event.status !== "pending" && event.status !== "loading";

  return (
    <li className="flex items-center gap-3">
      <TimelineDot status={event.status} />
      <div className="flex flex-1 items-center justify-between gap-3">
        <span
          className={cn(
            "text-sm font-medium",
            isResolved
              ? "text-[color:var(--color-ink)]"
              : "text-[color:var(--color-ink-muted)]",
          )}
        >
          {event.label}
        </span>
        <span className="text-sm text-[color:var(--color-ink-muted)]">
          {event.date ? formatOrderDate(event.date) : "Pending"}
        </span>
      </div>
    </li>
  );
}

function TimelineDot({ status }: { status: TimelineEventStatus }) {
  if (status === "complete") {
    return (
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-success)] text-white"
      >
        <CheckIcon />
      </span>
    );
  }
  if (status === "declined") {
    return (
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-danger)] text-white"
      >
        <XIcon />
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-warning)] text-white"
      >
        <ExclamationIcon />
      </span>
    );
  }
  if (status === "loading") {
    /* Same outer shape as the `pending` dot below; the
     * difference is one of the four border quarters is darkened
     * to ink, and the whole circle spins. Reads as "we know
     * something is going to happen here, we just don't know
     * the outcome yet". */
    return (
      <span
        aria-hidden
        role="status"
        aria-label="Checking delivery status"
        className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[color:var(--color-border-strong)] border-t-[color:var(--color-ink)] bg-[color:var(--color-surface)]"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="h-6 w-6 shrink-0 rounded-full border-2 border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)]"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

function ItemsCard({ order }: { order: OrderDetail }) {
  return (
    <SectionCard title="Items">
      {order.lineItems.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          No items recorded on this order.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-border)]">
          {order.lineItems.map((item, i) => (
            <LineItemRow key={i} item={item} />
          ))}
        </ul>
      )}

      <TotalsBreakdown order={order} />
    </SectionCard>
  );
}

function LineItemRow({ item }: { item: OrderLineItem }) {
  const lineTotalCents =
    item.totalAmount !== null ? Math.round(item.totalAmount * 100) : null;

  return (
    <li className="flex items-start gap-4 py-4">
      <ItemThumbnail
        src={item.imageUrl}
        alt={item.imageAlt ?? item.title}
        quantity={item.quantity}
      />

      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-[color:var(--color-ink)]">
            {item.title}
          </p>
          {item.variantTitle && item.variantTitle !== "Default Title" && (
            <p className="mt-0.5 text-sm text-[color:var(--color-ink-muted)]">
              {item.variantTitle}
            </p>
          )}
        </div>

        {lineTotalCents !== null && item.currencyCode && (
          <p className="shrink-0 text-sm font-semibold text-[color:var(--color-ink)]">
            {formatPrice(lineTotalCents, item.currencyCode)}
          </p>
        )}
      </div>
    </li>
  );
}

function ItemThumbnail({
  src,
  alt,
  quantity,
}: {
  src: string | null;
  alt: string;
  quantity: number;
}) {
  return (
    /* `relative` parent so the qty badge can absolute-position
     * against the image edge. The badge is positioned with a
     * half-translate to overhang the corner — same posture old
     * zepr used so the visual reads identical. */
    <div className="relative h-20 w-20 shrink-0">
      {/* Classic thumbnail shell — same as the cart drawer's
       *  line rows (`cart-line-row.tsx`): white surface, border,
       *  rounded corners, square. Keeping one shape means every
       *  "product image in a list" surface across the app reads
       *  as the same component family. */}
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
            className="h-full w-full bg-[color:var(--color-surface-muted)]"
          />
        )}
      </div>
      {/* Forced 20×20 (`h-5 w-5`, no min-width / horizontal
       *  padding) plus 10px-bold matches the "+N" badge over on
       *  the order-row thumbnail — both badges are now the same
       *  clean circle. At the previous 11px-semibold + `px-1`
       *  setting the digit looked slightly off-axis inside the
       *  circle because the padding stretched the box past 20px
       *  for single digits and pushed two-digit content even
       *  further. Squaring the container removes both effects. */}
      <span
        aria-label={`Quantity ${quantity}`}
        className="absolute right-0 top-0 flex h-5 w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-[color:var(--color-ink)] text-[10px] font-bold leading-none text-white"
      >
        {quantity}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Totals breakdown                                                    */
/* ------------------------------------------------------------------ */

function TotalsBreakdown({ order }: { order: OrderDetail }) {
  return (
    <dl className="mt-6 flex flex-col gap-2 border-t border-[color:var(--color-border)] pt-4">
      {order.subtotalAmount !== null && (
        <TotalsRow
          label="Subtotal"
          amount={order.subtotalAmount}
          currency={order.currencyCode}
        />
      )}
      {order.totalShippingAmount !== null && (
        <TotalsRow
          label="Shipping"
          amount={order.totalShippingAmount}
          currency={order.currencyCode}
          /* $0.00 shipping reads as "FREE" — short, all-caps,
           *  reads as a positive callout in the same scan line
           *  as the dollar amounts above and below it. */
          freeText={order.totalShippingAmount === 0 ? "FREE" : null}
        />
      )}
      {order.totalTaxAmount !== null && (
        <TotalsRow
          label="Tax"
          amount={order.totalTaxAmount}
          currency={order.currencyCode}
        />
      )}
      <div className="mt-2 flex items-center justify-between border-t border-[color:var(--color-border)] pt-3 text-base font-semibold text-[color:var(--color-ink)]">
        <dt>Total</dt>
        <dd>
          {formatPrice(
            Math.round(order.totalAmount * 100),
            order.currencyCode,
          )}
        </dd>
      </div>
    </dl>
  );
}

function TotalsRow({
  label,
  amount,
  currency,
  freeText,
}: {
  label: string;
  amount: number;
  currency: string;
  freeText?: string | null;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <dt className="text-[color:var(--color-ink-muted)]">{label}</dt>
      <dd className="text-[color:var(--color-ink)]">
        {freeText ?? formatPrice(Math.round(amount * 100), currency)}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shipping address                                                    */
/* ------------------------------------------------------------------ */

function ShippingAddressCard({ address }: { address: CustomerAddress }) {
  const recipientName = [address.firstName, address.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  const lines = [
    recipientName || null,
    address.address1,
    address.address2,
    [address.city, address.province, address.zip]
      .filter(Boolean)
      .join(", ") || null,
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim().length > 0));

  return (
    <SectionCard title="Shipping address">
      <address className="not-italic text-sm leading-relaxed text-[color:var(--color-ink)]">
        {lines.map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
      </address>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ExclamationIcon() {
  /* `!` rendered as two stroked paths instead of a glyph so the
   * vertical-bar weight and dot size line up with the check / ✕
   * icons (which are also stroked, not filled). Keeps the three
   * dots visually a family. */
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5"
    >
      <path d="M12 5v9" />
      <path d="M12 18.5v.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
