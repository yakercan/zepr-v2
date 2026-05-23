/**
 * Shared device-mode primitives used by both the SSR resolver and the
 * client-side provider. Keeping these in their own module (free of
 * server-only / client-only imports) means anything in the tree can
 * import the types and constants without dragging a `next/headers`
 * dependency through the bundle.
 */

export type DeviceMode = "mobile" | "desktop";

export type DeviceSource = "cookie" | "ua" | "forced-desktop";

export interface DeviceContext {
  mode: DeviceMode;
  source: DeviceSource;
}

/** Cookie key persisted from the client whenever the device mode
 *  changes (UA refinement, manual toggle, viewport correction). The
 *  server reads this on every request so the second visit is always
 *  correct from the first paint. */
export const DEVICE_COOKIE = "device_mode";

/** Cookie lifetime — a year is long enough that real users effectively
 *  never re-flash, while still expiring eventually so a stale phone-on-
 *  laptop cookie gets cleaned up. */
export const DEVICE_COOKIE_MAX_AGE_DAYS = 365;

/** Viewport width (in CSS pixels) below which we consider the device
 *  to be a phone. Matches Tailwind's `md` breakpoint. */
export const MOBILE_MAX_WIDTH_PX = 768;

/** Minimum width clamp applied to `<html>` when device mode is
 *  `desktop`. Below this the OS shows a horizontal scrollbar instead
 *  of components collapsing — every desktop layout in the app can
 *  safely assume it has at least this much room. */
export const DESKTOP_MIN_WIDTH_PX = 1280;
