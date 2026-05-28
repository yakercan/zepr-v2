"use client";

import { useEffect } from "react";
import { useDeviceMode } from "@/components/device/device-provider";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/**
 * Development-only floating indicator + toggle for the device gate.
 *
 * Two jobs:
 *
 *  1. **Picks up the `?device=mobile|desktop` query-string override
 *     on mount.** Writes the result through the provider's `setMode`
 *     so it persists to the `device_mode` cookie, then strips the
 *     param from the URL via `history.replaceState` so subsequent
 *     navigation doesn't keep re-applying it. The override is the
 *     fastest way to test the mobile branch on a laptop without
 *     spoofing a UA or opening DevTools' device mode.
 *
 *  2. **Renders a small corner pill** showing the current mode
 *     ("mobile" / "desktop") and source ("cookie" / "ua" /
 *     "forced-desktop"). Clicking the pill toggles the mode at
 *     runtime — same path as the cookie override, just driven by
 *     the click instead of the URL.
 *
 * Mount is gated on `process.env.NODE_ENV === "development"` at the
 * call site (see `app/layout.tsx`). That literal gets inlined to
 * `false` at build time in production, so the component and its
 * import get tree-shaken out of the prod bundle entirely — zero
 * runtime cost in shipped code.
 *
 * Returns `null` until mount completes (the click handler and the
 * query-param read both need `window`), keeping SSR + the first
 * client paint identical so React's hydration check stays clean.
 */
export function DeviceDevTools() {
  const { mode, source, setMode } = useDeviceMode();
  const hydrated = useHydrated();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("device");
    if (override !== "mobile" && override !== "desktop") return;

    setMode(override);

    params.delete("device");
    const search = params.toString();
    const newUrl = `${window.location.pathname}${
      search ? `?${search}` : ""
    }${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }, [setMode]);

  if (!hydrated) return null;

  const next = mode === "mobile" ? "desktop" : "mobile";

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      title={`Click to switch to ${next} mode`}
      className="fixed bottom-3 right-3 z-[9999] inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black"
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          mode === "mobile" ? "bg-emerald-400" : "bg-sky-400"
        }`}
      />
      <span>{mode}</span>
      <span aria-hidden className="text-white/50">·</span>
      <span className="font-normal normal-case tracking-normal text-white/70">
        {source}
      </span>
    </button>
  );
}
