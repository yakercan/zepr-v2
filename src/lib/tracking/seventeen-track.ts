import "server-only";

import { env } from "@/env";

/**
 * 17track integration — *fallback* source of delivery timestamps.
 *
 * Shopify itself is the primary source: `Fulfillment.events` on
 * the Customer Account API carries a `DELIVERED` event with a
 * `happenedAt` for every package Shopify's carrier-side webhooks
 * have caught up with, and `fetchOrderDetail` reads that straight
 * into `OrderFulfillmentEvent.deliveredAt`. The order-detail page
 * only reaches 17track for fulfilments Shopify hasn't logged a
 * DELIVERED event against yet — usually a freshly-shipped order
 * whose carrier update hasn't propagated through Shopify's
 * fulfilment webhook. Most orders never call this module at all.
 *
 * Surface area is intentionally narrow: one read helper, one
 * type, no caching layer of our own. Callers fold the result
 * into their `OrderFulfillmentEvent` shape and the rest of the
 * app keeps reading the same `deliveredAt` field whether the
 * value originated in Shopify or here.
 *
 * Two-step protocol (`/register` then `/gettrackinfo`) — 17track
 * returns nothing for a tracking number it doesn't know about,
 * so the first time we see a number we register it (which kicks
 * off 17track's carrier polling). Subsequent calls hit "already
 * registered" cheaply and go straight to the query. We skip
 * old zepr's 2-second wait between the two so already-registered
 * numbers don't pay for it; the (acceptable) tradeoff is that
 * the very first view of a brand-new order may show Delivered
 * as pending until a later page load picks up the polled data.
 *
 * Failure mode is "silent null": any HTTP error, parse error,
 * carrier-detection rejection, or missing-field path returns
 * `null` and the timeline degrades gracefully to a pending
 * Delivered row — which is the right outcome anyway, since
 * Shopify will catch up with the delivery event soon enough.
 */

const REGISTER_URL = "https://api.17track.net/track/v2.4/register";
const GETTRACKINFO_URL = "https://api.17track.net/track/v2.4/gettrackinfo";

export interface TrackingDelivery {
  /** ISO timestamp of when the carrier reported the package
   *  delivered. `null` while the package is still in transit. */
  deliveredAt: string | null;
}

/**
 * Look up delivery status for a single tracking number.
 * Returns `null` on any failure path — the caller treats absence
 * of data identically whether the API rejected the request, the
 * tracking number isn't registered, or the carrier hasn't
 * reported a "delivered" event yet.
 */
export async function getTrackingDelivery(
  trackingNumber: string,
): Promise<TrackingDelivery | null> {
  const apiKey = env.SEVENTEEN_TRACK_API_KEY;
  if (!apiKey) return null;

  /* Register before query. 17track is idempotent here — second
   * registration of the same number returns a "rejected:already
   * registered" entry, which is benign. We await it because
   * skipping it entirely is what was causing "Delivered" to
   * never appear for numbers 17track had never seen. */
  await registerTrackingNumber(trackingNumber, apiKey);

  try {
    const res = await fetch(GETTRACKINFO_URL, {
      method: "POST",
      headers: {
        "17token": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "zepr-v2/1.0",
      },
      body: JSON.stringify([{ number: trackingNumber }]),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[17track] gettrackinfo HTTP ${res.status}`);
      return null;
    }
    const json: unknown = await res.json();
    return parseDelivery(json);
  } catch (err) {
    console.error("[17track] gettrackinfo failed:", err);
    return null;
  }
}

async function registerTrackingNumber(
  trackingNumber: string,
  apiKey: string,
): Promise<void> {
  try {
    const res = await fetch(REGISTER_URL, {
      method: "POST",
      headers: {
        "17token": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "zepr-v2/1.0",
      },
      body: JSON.stringify([{ number: trackingNumber }]),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[17track] register HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("[17track] register failed:", err);
  }
}

/* ------------------------------------------------------------------ */
/* Response parsing                                                    */
/* ------------------------------------------------------------------ */

/**
 * 17track responses are deeply nested and historically loose
 * about which fields are present. We treat the whole thing as
 * `unknown` and narrow with optional chaining at every step —
 * any missing branch returns `null` rather than throwing.
 *
 * Path we care about:
 *
 *   data.accepted[0].track_info.latest_status.status === "Delivered"
 *   data.accepted[0].track_info.milestone[?key_stage === "Delivered"].time_iso
 *
 * The milestone array carries per-stage timestamps; the latest
 * event's `time_iso` is the fallback when the milestone isn't
 * structured the way 17track's docs promise.
 */
function parseDelivery(raw: unknown): TrackingDelivery | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = (raw as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;

  const accepted = (data as { accepted?: unknown }).accepted;
  if (!Array.isArray(accepted) || accepted.length === 0) return null;

  const trackInfo = (accepted[0] as { track_info?: unknown }).track_info;
  if (typeof trackInfo !== "object" || trackInfo === null) return null;

  const status = (
    (trackInfo as { latest_status?: { status?: unknown } }).latest_status
      ?.status ?? ""
  )
    .toString()
    .toLowerCase();
  if (status !== "delivered") return { deliveredAt: null };

  /* Prefer the milestone's `time_iso` because it's the exact
   * carrier-reported moment of delivery; fall back to the
   * latest event's `time_iso` when the milestone array is
   * missing or shaped differently. */
  const milestone = (trackInfo as { milestone?: unknown }).milestone;
  if (Array.isArray(milestone)) {
    const delivered = milestone.find(
      (m): m is { key_stage?: unknown; time_iso?: unknown } =>
        typeof m === "object" &&
        m !== null &&
        (m as { key_stage?: unknown }).key_stage === "Delivered",
    );
    if (
      delivered &&
      typeof (delivered as { time_iso?: unknown }).time_iso === "string"
    ) {
      return { deliveredAt: (delivered as { time_iso: string }).time_iso };
    }
  }

  const latestEventTime = (
    trackInfo as { latest_event?: { time_iso?: unknown } }
  ).latest_event?.time_iso;
  if (typeof latestEventTime === "string") {
    return { deliveredAt: latestEventTime };
  }

  /* 17track says "delivered" but offers no timestamp — surface
   * the flip anyway, with a null date so the timeline row shows
   * "Delivered" without a confusing "—" beside it. */
  return { deliveredAt: null };
}
