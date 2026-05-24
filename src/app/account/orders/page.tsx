import "server-only";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrdersLoader } from "@/app/account/orders/orders-loader";
import { OrderRow } from "@/components/account/order-row";
import { BackLink } from "@/components/ui/back-link";
import { getSession } from "@/lib/auth/session";
import { fetchOrdersPage } from "@/lib/shopify/customer-account-queries";

export const metadata: Metadata = {
  title: "Orders",
};

const INITIAL_PAGE_SIZE = 20;

/**
 * Full orders list — paginated history of every order on the
 * signed-in shopper's account.
 *
 * Auth-gated; renders the first 20 rows server-side (so the
 * initial paint is plain HTML, fast and indexable), then a thin
 * client island (`<OrdersLoader>`) takes over for "Show more"
 * — appending the next 20 in-place via a server action. No URL
 * pagination: nobody deep-links the middle of their order
 * history, so a URL-driven approach would only cost an RSC
 * round-trip per click for zero shareable-URL benefit.
 *
 * Failure modes:
 *
 *   - Not authenticated → redirect to login with a `return_to`
 *     that brings the shopper back here after sign-in.
 *   - Customer Account API error on the initial fetch → render
 *     the empty-state line; the dev terminal still gets the
 *     structured error via `customerAccountFetch`'s logging.
 */
export default async function OrdersListPage() {
  const session = await getSession();
  if (!session) {
    redirect(
      `/account/login?return_to=${encodeURIComponent("/account/orders")}`,
    );
  }

  let initial: Awaited<ReturnType<typeof fetchOrdersPage>> | null = null;
  try {
    initial = await fetchOrdersPage(INITIAL_PAGE_SIZE);
  } catch (err) {
    console.error("[account] orders list fetch failed:", err);
  }

  return (
    <main className="page-container pt-6 pb-12 md:pt-8 md:pb-16">
      <BackLink href="/account" label="My Account" />

      <header className="mt-4 md:mt-6">
        <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
          Orders
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-muted)]">
          Every order on your account, newest first.
        </p>
      </header>

      <section className="mt-8 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 md:mt-10 md:p-8">
        {initial === null ? (
          <p className="text-sm text-[color:var(--color-ink-muted)]">
            We couldn&apos;t load your orders right now. Please try again
            shortly.
          </p>
        ) : initial.orders.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-muted)]">
            You haven&apos;t placed any orders yet.
          </p>
        ) : (
          /* The loader owns the `<ul>` and the "Show more" button.
           *  Initial rows are server-rendered and passed in as
           *  children, so they ship as static HTML and never
           *  re-render after a load-more click. */
          <OrdersLoader initialPageInfo={initial.pageInfo}>
            {initial.orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </OrdersLoader>
        )}
      </section>
    </main>
  );
}
