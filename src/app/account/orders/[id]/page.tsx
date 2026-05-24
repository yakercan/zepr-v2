import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { ShimmerImage } from "@/components/ui/shimmer-image";
import { getSession } from "@/lib/auth/session";
import { formatPrice } from "@/lib/format";
import {
  type CustomerAddress,
  fetchOrderDetail,
  type OrderDetail,
  type OrderLineItem,
} from "@/lib/shopify/customer-account-queries";
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
 * Single Customer Account API round-trip, no streaming holes —
 * the whole page is one query and there's nothing useful to
 * paint before it lands. Auth-gated like the dashboard, with a
 * `<BackLink>` at the top so the page reads like one level deep
 * in an app navigation stack even though it's a real URL (which
 * matters for transactional emails / order-status links).
 *
 * Layout, top to bottom:
 *
 *   1. Back nav + page header (order name + processed date)
 *   2. Items — line item list with thumbnail / title / variant /
 *      qty / line total, and the order total in a footer row.
 *   3. Shipping address — omitted entirely for digital / pickup
 *      orders where no address was captured.
 *   4. Track CTA — links out to Shopify's hosted order status
 *      page, which already renders the fulfilment / tracking
 *      timeline. Cheaper than re-implementing tracking UI here.
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

  return (
    <main className="page-container pt-6 pb-12 md:pt-8 md:pb-16">
      <BackLink href="/account" label="My Account" />

      <PageHeader order={order} />

      <div className="mt-8 flex flex-col gap-6 md:gap-8">
        <ItemsCard order={order} />
        {order.shippingAddress && (
          <ShippingAddressCard address={order.shippingAddress} />
        )}
        {order.statusPageUrl && (
          <TrackingCTA href={order.statusPageUrl} />
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

function PageHeader({ order }: { order: OrderDetail }) {
  return (
    <header className="mt-4 md:mt-6">
      <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
        Order {order.name}
      </h1>
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
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 md:p-8",
        className,
      )}
    >
      <header className="mb-6 flex items-end justify-between gap-3">
        <h2 className="text-xl font-semibold leading-tight md:text-2xl">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

function ItemsCard({ order }: { order: OrderDetail }) {
  const totalCents = Math.round(order.totalAmount * 100);

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

      <div className="mt-6 flex items-center justify-between border-t border-[color:var(--color-border)] pt-4">
        <span className="text-sm font-medium text-[color:var(--color-ink-muted)]">
          Total
        </span>
        <span className="text-base font-semibold text-[color:var(--color-ink)]">
          {formatPrice(totalCents, order.currencyCode)}
        </span>
      </div>
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
          <p className="mt-0.5 text-sm text-[color:var(--color-ink-muted)]">
            Qty {item.quantity}
          </p>
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
}: {
  src: string | null;
  alt: string;
}) {
  if (!src) {
    return (
      <div
        aria-hidden
        className="h-16 w-16 shrink-0 rounded-md bg-[color:var(--color-search)]"
      />
    );
  }
  return (
    <ShimmerImage
      src={src}
      alt={alt}
      className="h-16 w-16 rounded-md object-cover"
      wrapperClassName="block h-16 w-16 shrink-0"
    />
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
    address.company,
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
/* Track CTA                                                           */
/* ------------------------------------------------------------------ */

function TrackingCTA({ href }: { href: string }) {
  return (
    <div className="flex justify-start">
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary"
      >
        Track your order
      </Link>
    </div>
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
