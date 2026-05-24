"use client";

import { type ReactNode, useState, useTransition } from "react";
import { loadMoreOrders } from "@/app/account/orders/actions";
import { OrderRow } from "@/components/account/order-row";
import { LoadMoreButton } from "@/components/products/load-more-button";
import type {
  OrdersPageInfo,
  OrderSummary,
} from "@/lib/shopify/customer-account-types";

/**
 * Client island that owns the orders-list "See more" state.
 *
 * Mirrors the pattern `<RelatedProductsLoader>` uses on the PDP:
 * the initial batch is server-rendered and passed in as
 * `children`, so it ships as static HTML and never re-renders.
 * Only the appended rows + the button cost JS — which is exactly
 * the slice that needs interactivity.
 *
 * Layout contract:
 *
 *   - The `<ul>` lives here (not at the page level) so server-
 *     rendered initial rows and client-appended rows share the
 *     same list element — one continuous list for screen readers
 *     and for the `divide-y` separator between rows.
 *   - The "Show more" button sits *outside* the `<ul>` as a
 *     sibling, so it doesn't pick up the inter-row divider line
 *     and doesn't pretend to be a list item.
 *
 * Why a server action (not URL pagination): nobody bookmarks
 * "page 4 of my orders". URL pagination would add a full RSC
 * round-trip + skeleton flash per click for zero shareable-URL
 * benefit; client-state pagination pays one Customer Account API
 * round-trip per click and only sends the new batch over the wire.
 */
export interface OrdersLoaderProps {
  /** Server-rendered initial `<OrderRow>`s. Always rendered
   *  as-is, never re-rendered after a "Show more" click. */
  children: ReactNode;
  initialPageInfo: OrdersPageInfo;
}

export function OrdersLoader({
  children,
  initialPageInfo,
}: OrdersLoaderProps) {
  const [appended, setAppended] = useState<OrderSummary[]>([]);
  const [pageInfo, setPageInfo] = useState<OrdersPageInfo>(initialPageInfo);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    /* `endCursor` should be present whenever `hasNextPage` is
     * true, but guard both anyway so a mis-fire from an
     * assistive tool can't trigger an empty request. */
    if (!pageInfo.endCursor) return;

    startTransition(async () => {
      const next = await loadMoreOrders(pageInfo.endCursor!);
      setAppended((prev) => [...prev, ...next.orders]);
      setPageInfo(next.pageInfo);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y divide-[color:var(--color-border)]">
        {children}
        {appended.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>

      {pageInfo.hasNextPage && pageInfo.endCursor && (
        <LoadMoreButton
          onClick={handleClick}
          isPending={isPending}
          label="Show more"
        />
      )}
    </div>
  );
}
