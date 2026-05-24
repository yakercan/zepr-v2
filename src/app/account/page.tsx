import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OrderRow } from "@/components/account/order-row";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewAllLink } from "@/components/ui/view-all-link";
import { getSession, type Customer } from "@/lib/auth/session";
import {
  type CustomerAddress,
  fetchDefaultAddress,
  fetchOrdersPage,
  type OrderSummary,
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
      <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
        {greeting}
      </h1>
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
  let orders: OrderSummary[] | null;
  let hasMore = false;
  try {
    const page = await fetchOrdersPage(5);
    orders = page.orders;
    hasMore = page.pageInfo.hasNextPage;
  } catch (err) {
    console.error("[account] orders fetch failed:", err);
    orders = null;
  }

  /* "View all →" only renders when there's more history beyond
   *  the 5-row preview. Shoppers with ≤ 5 orders see the same
   *  thing here as they would on the list page, so the link
   *  would point nowhere useful. */
  const showViewAll = orders !== null && hasMore;

  return (
    <SectionCard
      id="orders"
      title="Recent orders"
      action={
        showViewAll ? (
          <ViewAllLink href="/account/orders" label="View all" />
        ) : null
      }
    >
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

function OrdersCardSkeleton() {
  return (
    <SectionCard id="orders" title="Recent orders">
      <ul
        className="divide-y divide-[color:var(--color-border)]"
        aria-busy
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-4 py-4">
            {/* 48×48 thumbnail placeholder mirroring the real
             *  `OrderRow` layout — keeps the swap CLS-free when the
             *  fetch lands. `rounded-lg` matches the real
             *  thumbnail's border radius. */}
            <Skeleton className="h-12 w-12 shrink-0" rounded="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
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
