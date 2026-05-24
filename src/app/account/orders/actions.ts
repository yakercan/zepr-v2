"use server";

import {
  fetchOrdersPage,
  type OrdersPage,
} from "@/lib/shopify/customer-account-queries";

/**
 * Server action — fetch the next page of the signed-in shopper's
 * orders. Auth runs implicitly inside `customerAccountFetch` (it
 * reads the session cookie via `getSession`), so the action takes
 * only the resume cursor.
 *
 * Page size lives in this file so the loader UX and the action
 * stay in lock-step — bumping it later is a single edit.
 */

const PAGE_SIZE = 20;

/**
 * Append-style pagination — the loader hands us back the
 * `endCursor` from the previous call and we return the next
 * batch + a fresh `pageInfo`. Returns the same `OrdersPage` shape
 * the initial server render produced, so the client doesn't have
 * to special-case "first batch" vs. "subsequent batch".
 */
export async function loadMoreOrders(after: string): Promise<OrdersPage> {
  return fetchOrdersPage(PAGE_SIZE, after);
}
