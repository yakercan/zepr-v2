import type {
  OrderDetail,
  OrderReturnEvent,
} from "@/lib/shopify/customer-account-types";

/**
 * Order status derivation — pure, client-safe.
 *
 * Old zepr derived timeline state by stitching Shopify's
 * `financialStatus` + `fulfillments[].status` + per-fulfilment
 * `deliveredAt` together inside the rendering layer (with a
 * sprinkle of 17track on top). v2 extracts that logic into a
 * single helper so:
 *
 *   - The page component stays focused on layout.
 *   - Future surfaces (order-list status pill, email digest,
 *     /order-tracking page) can read the same `TimelineEvent[]`
 *     shape without re-deriving anything.
 *   - There's one obvious file to look at when Shopify shifts
 *     a status-enum name and the timeline goes stale.
 *
 * Delivery timestamps come from Shopify itself —
 * `Fulfillment.events`' DELIVERED event carries a `happenedAt`,
 * which `fetchOrderDetail` reads straight into
 * `OrderFulfillmentEvent.deliveredAt`. For the rare case Shopify
 * hasn't logged a DELIVERED event yet, the order-detail page
 * falls back to 17track and folds its answer into the same
 * `deliveredAt` field before calling into this builder. Either
 * way, the helper just reads `deliveredAt` and doesn't care where
 * the value came from.
 */

/** Five visual states a timeline row can be in:
 *
 *  - `complete`   → green check, ink text (happened, positive)
 *  - `pending`    → empty bordered circle, muted text (not yet)
 *  - `loading`    → spinning quarter-arc, muted text (outcome
 *                   still being resolved — the row will flip to
 *                   `complete` or `pending` once the async
 *                   lookup behind it finishes; only used for the
 *                   Delivered row during the 17track call)
 *  - `declined`   → red filled circle with white ✕, ink text
 *                   (happened, an explicit rejection — return
 *                   declined by the merchant)
 *  - `cancelled`  → amber filled circle with white ❕, ink text
 *                   (happened, a neutral termination — order
 *                   cancelled by the merchant or return withdrawn
 *                   by the customer; neither is a "failure" in
 *                   the way `declined` is)
 */
export type TimelineEventStatus =
  | "complete"
  | "pending"
  | "loading"
  | "declined"
  | "cancelled";

export interface TimelineEvent {
  /** Stable identifier, useful as a React key. Fixed values for
   *  the four order-level milestones; per-return events carry
   *  the return id so multiple returns coexist without colliding. */
  key: string;
  /** Human label shown next to the indicator. */
  label: string;
  /** ISO timestamp of when this milestone happened, or `null`
   *  while the event is still pending. */
  date: string | null;
  status: TimelineEventStatus;
}

/* Shopify enums change shape across API versions and live
 * alongside legacy "displayStatus" string variants. Normalise
 * to UPPER_SNAKE once at the top so each milestone check below
 * can be a plain set lookup. */
function normalize(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[-\s]/g, "_");
}

const PAID_STATES = new Set([
  "PAID",
  "PARTIALLY_PAID",
  "AUTHORIZED",
  /* A refunded order was paid at some point — the timeline
   * shows that historical step alongside the refund row below. */
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
const SHIPPED_STATES = new Set([
  "SUCCESS",
  "FULFILLED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);
const REFUNDED_STATES = new Set(["REFUNDED", "PARTIALLY_REFUNDED"]);

export interface BuildOrderTimelineOptions {
  /** When `true`, the Delivered row renders in the `loading`
   *  state (rotating arc) instead of `complete` / `pending`. Set
   *  by the page when it's about to await 17track for the real
   *  answer; the Suspense child re-renders with the default
   *  (`false`) once the lookup resolves. */
  deliveryLoading?: boolean;
}

/**
 * Build the order timeline from an `OrderDetail`.
 *
 * Milestones (always in this order; pending steps render as
 * muted placeholders so the timeline height doesn't jump as
 * events accumulate):
 *
 *   1. Placed       — `processedAt` (always complete: an order
 *                      can't exist without having been placed).
 *   2. Paid         — when `financialStatus` is one of the
 *                      paid-ish states. No standalone "paid at"
 *                      timestamp from Shopify, so we re-use
 *                      `processedAt` — paid-at-checkout is the
 *                      default and orders that paid later are a
 *                      rounding error worth not modelling for v1.
 *   3. Shipped      — the earliest `createdAt` across any
 *                      fulfilment in a shipped-ish state. Omitted
 *                      entirely when the order was cancelled
 *                      before anything ever shipped — showing a
 *                      pending Shipped row in that case would
 *                      promise progress that's never coming.
 *   4. Delivered  *or*  Order cancelled — Delivered is one row
 *                      *per shipped fulfilment*, so an order
 *                      shipped in N boxes shows N rows ordered
 *                      by ship time. Single-package orders read
 *                      as a single "Delivered" row (no suffix);
 *                      multi-package orders read as
 *                      "Delivered (Package #1)", "Delivered
 *                      (Package #2)", … so partial progress is
 *                      legible at a glance — one row complete
 *                      with its real delivery date, another row
 *                      still pending or loading. Cancellation
 *                      replaces the whole slot since Delivered
 *                      and Cancelled are mutually exclusive
 *                      end-states. Cancelled uses Shopify's
 *                      `cancelledAt` (amber ❕).
 *
 * Then, conditionally appended:
 *
 *   5. Return rows  — two per return (Requested + Approved /
 *                      Declined / Cancelled), only when the order
 *                      has any returns at all.
 *   6. Refund row   — single row at the very bottom, only when
 *                      Shopify reports a refund. "Refund issued"
 *                      for `REFUNDED`, "Partial refund issued"
 *                      for `PARTIALLY_REFUNDED` — we trust
 *                      Shopify's own full/partial classification
 *                      instead of re-deriving it from money
 *                      arithmetic (Shopify already adjusts
 *                      `totalPrice` after returns, so a naive
 *                      `totalRefunded >= totalAmount` check
 *                      would mis-classify return-driven refunds).
 */
export function buildOrderTimeline(
  order: OrderDetail,
  options: BuildOrderTimelineOptions = {},
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    key: "placed",
    label: "Placed",
    date: order.processedAt,
    status: "complete",
  });

  const paid = PAID_STATES.has(normalize(order.financialStatus));
  events.push({
    key: "paid",
    label: "Paid",
    date: paid ? order.processedAt : null,
    status: paid ? "complete" : "pending",
  });

  /* Earliest createdAt across the shipped-ish fulfilments —
   * "shipped" reads as "when did the first package leave?".
   * Skip the row entirely if the order was cancelled and never
   * actually shipped; a permanently-pending Shipped row in
   * that case would imply something is still on the way. */
  const shippedAt = earliest(
    order.fulfillments
      .filter((f) => SHIPPED_STATES.has(normalize(f.status)))
      .map((f) => f.createdAt),
  );
  const skipShippedRow = order.cancelledAt && !shippedAt;
  if (!skipShippedRow) {
    events.push({
      key: "shipped",
      label: "Shipped",
      date: shippedAt,
      status: shippedAt ? "complete" : "pending",
    });
  }

  if (order.cancelledAt) {
    /* Cancellation swaps the "Delivered" slot. When the order
     * *was* shipped before being cancelled the Shipped row above
     * stays — back-flipping a real shipped-at to pending would
     * lie about what happened. Uses the `cancelled` (amber ❕)
     * visual rather than `declined` (red ✕) because the merchant
     * cancelling an order is a neutral close, not a rejection. */
    events.push({
      key: "cancelled",
      label: "Order cancelled",
      date: order.cancelledAt,
      status: "cancelled",
    });
  } else {
    /* One Delivered row per shipped fulfilment, ordered by
     * `createdAt` so Package #1 is the box that shipped first.
     * Per-row status is derived in isolation:
     *
     *   - `deliveredAt` set → complete (green ✓ + real date).
     *     Sourced from Shopify's DELIVERED event when available,
     *     filled in by 17track on the fallback path otherwise.
     *   - `deliveryLoading` is on AND the row has a tracking
     *     number → loading (rotating arc). This is the narrow
     *     case where the page is mid-17track call and we
     *     genuinely don't know yet whether this specific package
     *     has landed.
     *   - Otherwise → pending (empty circle).
     *
     * Note that Shopify-confirmed deliveries still render as
     * "complete" inside the Suspense fallback — `deliveredAt` is
     * already set on those, so the per-row check short-circuits
     * before the loading branch even fires. The spinner only
     * shows on the rows we're actually waiting on. */
    const shippedFulfillments = order.fulfillments
      .filter((f) => SHIPPED_STATES.has(normalize(f.status)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const shippedCount = shippedFulfillments.length;

    if (shippedCount === 0) {
      events.push({
        key: "delivered",
        label: "Delivered",
        date: null,
        status: "pending",
      });
    } else {
      shippedFulfillments.forEach((f, i) => {
        const label =
          shippedCount === 1
            ? "Delivered"
            : `Delivered (Package #${i + 1})`;

        let status: TimelineEventStatus;
        if (f.deliveredAt) {
          status = "complete";
        } else if (options.deliveryLoading && f.trackingNumber) {
          status = "loading";
        } else {
          status = "pending";
        }

        events.push({
          key: `delivered:${i}`,
          label,
          date: f.deliveredAt,
          status,
        });
      });
    }
  }

  /* Returns slot in after the fulfilment outcome. Each return
   * contributes its own pair of rows so multiple returns on one
   * order stay legible — sorted by request time so the order
   * matches the shopper's mental "what did I do most recently"
   * frame. */
  const sortedReturns = [...order.returns].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  for (const ret of sortedReturns) {
    events.push(...returnEvents(ret));
  }

  /* Refunds always close the timeline. Shopify's `financialStatus`
   * is the cleanest signal — `REFUNDED` and `PARTIALLY_REFUNDED`
   * are explicit enum values it sets itself, so we don't have to
   * compare refunded totals against an order amount that's already
   * been adjusted by returns. */
  const fs = normalize(order.financialStatus);
  if (order.totalRefundedAmount > 0 && REFUNDED_STATES.has(fs)) {
    events.push({
      key: "refund",
      label:
        fs === "PARTIALLY_REFUNDED"
          ? "Partial refund issued"
          : "Refund issued",
      date: order.lastRefundAt,
      status: "complete",
    });
  }

  return events;
}

/**
 * Per-return rows.
 *
 *   1. "Return requested" — always present, dated by `createdAt`,
 *      complete (green ✓). Every return passes through this state
 *      so the row is unconditional.
 *   2. A decision row — appended *only* once the merchant has
 *      actually decided. While the return is still `REQUESTED` we
 *      omit the row entirely instead of rendering a muted
 *      "Return approved · Pending" placeholder, because that
 *      placeholder reads as "approval is the expected outcome" —
 *      it isn't, and seeing it for a freshly-submitted request
 *      sets the wrong expectation. The decision row only shows
 *      its hand once Shopify has flipped the status:
 *
 *        OPEN / CLOSED  → "Return approved"  complete (green ✓)
 *        DECLINED       → "Return declined"  declined (red ✕)
 *        CANCELED       → "Return cancelled" cancelled (amber ❕)
 *
 * The `key` field encodes the return id so React doesn't reconcile
 * across distinct returns when there's more than one.
 */
function returnEvents(ret: OrderReturnEvent): TimelineEvent[] {
  const requested: TimelineEvent = {
    key: `return:${ret.id}:requested`,
    label: "Return requested",
    date: ret.createdAt,
    status: "complete",
  };

  let decision: TimelineEvent | null;
  switch (ret.status) {
    case "REQUESTED":
      /* Pending merchant decision — no decision row yet. The
       * "Return requested" row above is enough on its own to
       * communicate "we've received this, nothing to do yet". */
      decision = null;
      break;
    case "OPEN":
    case "CLOSED":
      decision = {
        key: `return:${ret.id}:decision`,
        label: "Return approved",
        date: ret.updatedAt ?? ret.createdAt,
        status: "complete",
      };
      break;
    case "DECLINED":
      decision = {
        key: `return:${ret.id}:decision`,
        label: "Return declined",
        date: ret.updatedAt ?? ret.createdAt,
        status: "declined",
      };
      break;
    case "CANCELED":
      /* User-withdrawn returns share the amber ❕ treatment with
       * order cancellations — they're neutral terminations, not
       * the merchant rejecting the request (that's `DECLINED`).
       * (Note: Shopify's enum value is `CANCELED` with one `l`;
       * our UI label uses the `cancelled` spelling for consistency
       * with `cancelledAt` and the order-cancelled row above.) */
      decision = {
        key: `return:${ret.id}:decision`,
        label: "Return cancelled",
        date: ret.updatedAt ?? ret.createdAt,
        status: "cancelled",
      };
      break;
  }

  return decision ? [requested, decision] : [requested];
}

/* Earliest of a list of ISO timestamps. Lexicographic sort works
 * for ISO 8601 — `2026-01-…` < `2026-02-…` etc. — so we skip the
 * Date round-trip. */
function earliest(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return [...dates].sort()[0];
}
