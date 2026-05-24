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
 * Tracking-API enrichment (17track) lives in
 * `src/lib/tracking/seventeen-track.ts`. The order detail page
 * folds 17track's delivery timestamp into each fulfilment's
 * `deliveredAt` *before* calling into this builder, so the helper
 * never has to know that 17track exists — it just reads a
 * `deliveredAt` field like any other Shopify field.
 */

/** Four visual states a timeline row can be in:
 *
 *  - `complete`  → green check, ink text (happened, positive)
 *  - `pending`   → empty bordered circle, muted text (not yet)
 *  - `declined`  → red filled circle with white ✕, ink text
 *                  (happened, an explicit rejection — return
 *                  declined by the merchant)
 *  - `canceled`  → amber filled circle with white ❕, ink text
 *                  (happened, a neutral termination — order
 *                  canceled by the merchant or return withdrawn
 *                  by the customer; neither is a "failure" in
 *                  the way `declined` is)
 */
export type TimelineEventStatus =
  | "complete"
  | "pending"
  | "declined"
  | "canceled";

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
 *                      fulfilment in a shipped-ish state.
 *   4. Delivered  *or*  Order canceled — exactly one of the two
 *                      shows. Cancellation replaces delivery in
 *                      the same slot since the two are mutually
 *                      exclusive end-states from a fulfilment
 *                      perspective. Delivered uses 17track-fed
 *                      `deliveredAt` (green ✓); canceled uses
 *                      Shopify's `cancelledAt` (amber ❕).
 *
 * Then, conditionally appended:
 *
 *   5. Return rows  — two per return (Requested + Approved /
 *                      Declined / Canceled), only when the order
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
export function buildOrderTimeline(order: OrderDetail): TimelineEvent[] {
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
   * "shipped" reads as "when did the first package leave?". */
  const shippedAt = earliest(
    order.fulfillments
      .filter((f) => SHIPPED_STATES.has(normalize(f.status)))
      .map((f) => f.createdAt),
  );
  events.push({
    key: "shipped",
    label: "Shipped",
    date: shippedAt,
    status: shippedAt ? "complete" : "pending",
  });

  if (order.cancelledAt) {
    /* Cancellation swaps the "Delivered" slot. The shipped row
     * above is left as-is — orders *can* be canceled after they
     * ship (rare but real), and showing a real shipped-at date
     * with a canceled outcome is more honest than back-flipping
     * shipped to pending. Uses the `canceled` (amber ❕) visual
     * rather than `declined` (red ✕) because the merchant
     * canceling an order is a neutral close, not a rejection. */
    events.push({
      key: "canceled",
      label: "Order canceled",
      date: order.cancelledAt,
      status: "canceled",
    });
  } else {
    /* Multi-package orders are only "delivered" when every
     * shipped package has landed. Treat the milestone as complete
     * when at least one fulfilment has a `deliveredAt` AND no
     * shipped fulfilment is still missing one — otherwise it
     * sits pending. */
    const deliveredDates = order.fulfillments
      .map((f) => f.deliveredAt)
      .filter((d): d is string => Boolean(d));
    const shippedCount = order.fulfillments.filter((f) =>
      SHIPPED_STATES.has(normalize(f.status)),
    ).length;
    const allDelivered =
      shippedCount > 0 && deliveredDates.length >= shippedCount;
    const deliveredAt = allDelivered ? latest(deliveredDates) : null;
    events.push({
      key: "delivered",
      label: "Delivered",
      date: deliveredAt,
      status: deliveredAt ? "complete" : "pending",
    });
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
 * Per-return rows. Each return emits two milestones:
 *
 *   1. "Return requested" — always complete, dated by `createdAt`.
 *   2. The decision row, shaped by `status`:
 *
 *        REQUESTED            → "Return approved" pending (empty)
 *        OPEN / CLOSED        → "Return approved" complete (green ✓)
 *        DECLINED             → "Return declined" declined (red ✕)
 *        CANCELED             → "Return canceled" canceled (amber ❕)
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

  let decision: TimelineEvent;
  switch (ret.status) {
    case "REQUESTED":
      decision = {
        key: `return:${ret.id}:decision`,
        label: "Return approved",
        date: null,
        status: "pending",
      };
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
       * the merchant rejecting the request (that's `DECLINED`). */
      decision = {
        key: `return:${ret.id}:decision`,
        label: "Return canceled",
        date: ret.updatedAt ?? ret.createdAt,
        status: "canceled",
      };
      break;
  }

  return [requested, decision];
}

/* Earliest / latest of a list of ISO timestamps. Lexicographic
 * sort works for ISO 8601 — `2026-01-…` < `2026-02-…` etc. — so
 * we skip the Date round-trip. */
function earliest(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return [...dates].sort()[0];
}

function latest(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return [...dates].sort()[dates.length - 1];
}
