import { env } from "@/env";
import {
  type DeviceContext,
  type DeviceMode,
} from "@/lib/device-mode";

/**
 * Server-side device resolver. Runs in the root layout on every
 * request — well before the first byte hits the wire — so the HTML
 * `<html data-device>` attribute and any device-aware SSR markup are
 * accurate from frame 0.
 *
 * Resolution precedence (highest to lowest):
 *   1. `forced-desktop` — global kill-switch via env flag, used during
 *      local dev or pre-launch when we don't want mobile branching to
 *      run at all.
 *   2. `cookie` — the user's persisted preference, written by the
 *      client-side refiner after the first visit corrected the SSR
 *      guess (or by an in-app device toggle if/when we ship one).
 *   3. `ua` — heuristic User-Agent sniff. Wrong sometimes (desktop UA
 *      on a tablet, narrow desktop window), but a good enough first
 *      guess that the client can refine and persist via cookie.
 */
export function resolveDeviceMode(
  userAgent: string | null,
  cookieValue: string | undefined,
): DeviceContext {
  if (!isDetectionEnabled()) {
    return { mode: "desktop", source: "forced-desktop" };
  }

  if (cookieValue === "mobile" || cookieValue === "desktop") {
    return { mode: cookieValue, source: "cookie" };
  }

  return { mode: parseUserAgent(userAgent ?? ""), source: "ua" };
}

/** Conservative UA sniff — only flags clear phone / tablet signals.
 *  Anything else (including all desktop UAs and the iPadOS-pretending-
 *  to-be-Mac UA, which is indistinguishable from real macOS Safari)
 *  falls through to `desktop`. The client refiner catches those via
 *  `matchMedia('(hover: none) and (pointer: coarse)')` on first paint.
 *
 *  Token roster:
 *    - `iPhone | iPod` — Apple phones.
 *    - `Android` (any) — Android phones *and* tablets (Android tablet
 *      UAs often omit the `Mobile` token, so we accept the base
 *      platform string on its own).
 *    - `Tablet` — explicit tablet marker from Firefox Mobile / Kindle
 *      Fire / generic Android builders.
 *    - `Silk` — Amazon Fire tablets.
 *    - `Mobile.+Firefox` — Firefox phone build.
 *    - `Opera M(obi|ini)` — Opera mobile / mini.
 *    - `webOS` — legacy Palm / LG TVs in a phone-shaped layout. */
function parseUserAgent(ua: string): DeviceMode {
  const isMobile =
    /Android|iPhone|iPod|iPad|Tablet|Silk|Mobile.+Firefox|Opera M(obi|ini)|webOS/i.test(
      ua,
    );
  return isMobile ? "mobile" : "desktop";
}

/** Env-gated kill-switch. Set `NEXT_PUBLIC_DEVICE_DETECTION_ENABLED=false`
 *  (or leave unset) to force every request into desktop mode without
 *  touching the resolver call sites. */
export function isDetectionEnabled(): boolean {
  return env.NEXT_PUBLIC_DEVICE_DETECTION_ENABLED;
}
