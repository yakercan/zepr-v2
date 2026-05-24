import "server-only";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrderRow } from "@/components/account/order-row";
import { BackLink } from "@/components/ui/back-link";
import { getSession } from "@/lib/auth/session";
import {
  fetchOrdersPage,
  type OrderSummary,
} from "@/lib/shopify/customer-account-queries";

export const metadata: Metadata = {
  title: "Orders",
};

/* Single batch — no Show-more affordance. Shoppers with very
 * deep histories can still see every order via the hosted
 * Shopify order-status pages linked from each detail view. If
 * we ever see real-world accounts exceed this, the cap is the
 * one number to bump. */
const ORDERS_LIMIT = 50;

/**
 * Full orders list — every order on the signed-in shopper's
 * account, newest first.
 *
 * Auth-gated; renders the entire batch server-side in one pass
 * so the initial paint is plain HTML and there's no streaming /
 * load-more chrome to manage.
 */
export default async function OrdersListPage() {
  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent("/account/orders")}`,
    );
  }

  let orders: OrderSummary[] | null;
  try {
    const page = await fetchOrdersPage(ORDERS_LIMIT);
    orders = page.orders;
  } catch (err) {
    console.error("[account] orders list fetch failed:", err);
    orders = null;
  }

  return (
    <main className="page-container pt-6 pb-12 md:pt-8 md:pb-16">
      <BackLink href="/account" label="My Account" />

      <header className="mt-4 md:mt-6">
        <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
          Orders
        </h1>
      </header>

      <section className="mt-8 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 md:mt-10 md:p-8">
        {orders === null ? (
          <p className="text-sm text-[color:var(--color-ink-muted)]">
            We couldn&apos;t load your orders right now. Please try again
            shortly.
          </p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-muted)]">
            You haven&apos;t placed any orders yet.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--color-border)]">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
