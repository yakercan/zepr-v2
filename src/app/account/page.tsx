import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format";
import { getSession, type Customer } from "@/lib/auth/session";
import {
  type CustomerAddress,
  fetchDefaultAddress,
  fetchRecentOrders,
  type RecentOrder,
} from "@/lib/shopify/customer-account-queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My Account",
};

/**
 * Account dashboard.
 *
 * Single-page hub that the header dropdown's `Dashboard / Profile /
 * Orders / My Addresses` links all point at — `#details`,
 * `#orders`, `#addresses` deep-link to the matching cards via
 * `scroll-mt-24` so the anchor lands below the sticky header.
 *
 * Rendering model:
 *
 *   - The page is auth-gated. Anonymous shoppers get redirected to
 *     `/account/login?return_to=/account` and never see this code.
 *   - Profile renders synchronously from `session.customer` — the
 *     name + email already came back in the OIDC `id_token`, no
 *     extra round-trip needed.
 *   - Orders + default-address each get their own `<Suspense>`
 *     boundary so the shell + profile flush first, then the two
 *     Customer Account API reads stream in as they resolve. Each
 *     section has a same-shape skeleton, so the swap is CLS-free.
 *   - Each section's data fetch is independent and lives behind
 *     `Promise.allSettled` semantics inside its async component —
 *     if Shopify hiccups on one query, the other still paints.
 */
export default async function AccountPage() {
  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent("/account")}`,
    );
  }

  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <DashboardHeader customer={session.customer} />

      <div className="mt-8 flex flex-col gap-6 md:mt-10 md:gap-8">
        <ProfileCard customer={session.customer} />

        <Suspense fallback={<OrdersCardSkeleton />}>
          <OrdersCard />
        </Suspense>

        <Suspense fallback={<AddressCardSkeleton />}>
          <AddressCard />
        </Suspense>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function DashboardHeader({ customer }: { customer: Customer }) {
  const firstName = customer.firstName?.trim();
  const greeting = firstName ? `Welcome back, ${firstName}` : "My Account";

  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
          {greeting}
        </h1>
        {customer.email && (
          <p className="mt-1 truncate text-sm text-[color:var(--color-ink-muted)]">
            {customer.email}
          </p>
        )}
      </div>
      <Link
        href="/account/logout"
        className="text-sm font-semibold text-[color:var(--color-ink-secondary)] transition-colors hover:text-[color:var(--color-danger)]"
      >
        Sign out
      </Link>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Section primitives                                                  */
/* ------------------------------------------------------------------ */

/**
 * One canonical card shell so every section on the page shares
 * the same padding / border / radius — the dashboard reads as one
 * surface even though each card streams in independently.
 */
function SectionCard({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        /* `scroll-mt-24` puts the anchor target ~96px below the
         *  viewport top so deep-links from the header dropdown
         *  land below the sticky header, not behind it. */
        "scroll-mt-24 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 md:p-8",
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-[color:var(--color-ink-muted)]">{children}</p>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

function ProfileCard({ customer }: { customer: Customer }) {
  const fullName = [customer.firstName, customer.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <SectionCard id="details" title="Profile">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="font-medium text-[color:var(--color-ink-muted)]">
          Name
        </dt>
        <dd className="text-[color:var(--color-ink)]">
          {fullName || (
            <span className="text-[color:var(--color-ink-muted)]">
              Not set
            </span>
          )}
        </dd>

        <dt className="font-medium text-[color:var(--color-ink-muted)]">
          Email
        </dt>
        <dd className="flex flex-wrap items-center gap-2 text-[color:var(--color-ink)]">
          <span className="break-all">{customer.email}</span>
          {customer.emailVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-success)]">
              <CheckIcon />
              Verified
            </span>
          )}
        </dd>
      </dl>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

async function OrdersCard() {
  let orders: RecentOrder[] | null;
  try {
    orders = await fetchRecentOrders(5);
  } catch (err) {
    console.error("[account] orders fetch failed:", err);
    orders = null;
  }

  return (
    <SectionCard id="orders" title="Recent orders">
      {orders === null ? (
        <EmptyState>
          We couldn&apos;t load your orders right now. Please try again
          shortly.
        </EmptyState>
      ) : orders.length === 0 ? (
        <EmptyState>No orders yet — your order history will appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-[color:var(--color-border)]">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function OrderRow({ order }: { order: RecentOrder }) {
  const date = formatOrderDate(order.processedAt);
  /* Order totals come back as decimal strings (e.g. `"42.99"`) from
   * Shopify's MoneyV2; `formatPrice` expects integer cents, so
   * normalise once here and call the shared formatter. */
  const totalCents = Math.round(order.totalAmount * 100);

  return (
    <li className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="font-semibold text-[color:var(--color-ink)]">
          {order.name}
        </p>
        <p className="text-sm text-[color:var(--color-ink-muted)]">{date}</p>
      </div>
      <p className="shrink-0 text-sm font-semibold text-[color:var(--color-ink)]">
        {formatPrice(totalCents, order.currencyCode)}
      </p>
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

function OrdersCardSkeleton() {
  return (
    <SectionCard id="orders" title="Recent orders">
      <ul
        className="divide-y divide-[color:var(--color-border)]"
        aria-busy
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 py-4"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-16" />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Default address                                                     */
/* ------------------------------------------------------------------ */

async function AddressCard() {
  let address: CustomerAddress | null;
  try {
    address = await fetchDefaultAddress();
  } catch (err) {
    console.error("[account] address fetch failed:", err);
    address = null;
  }

  return (
    <SectionCard id="addresses" title="Default address">
      {address ? (
        <FormattedAddress address={address} />
      ) : (
        <EmptyState>No default address saved yet.</EmptyState>
      )}
    </SectionCard>
  );
}

function FormattedAddress({ address }: { address: CustomerAddress }) {
  const recipientName = [address.firstName, address.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  /* Build the line stack in render order so the JSX stays a flat
   * list — easier to scan than nested optional fragments and
   * easier to extend if we add phone or other fields later. */
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
    <address className="not-italic text-sm leading-relaxed text-[color:var(--color-ink)]">
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

function AddressCardSkeleton() {
  return (
    <SectionCard id="addresses" title="Default address">
      <div className="flex flex-col gap-2" aria-busy>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
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
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3 w-3"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
