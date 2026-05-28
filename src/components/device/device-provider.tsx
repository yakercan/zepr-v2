"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_DAYS,
  MOBILE_MAX_WIDTH_PX,
  TOUCH_PRIMARY_MEDIA_QUERY,
  type DeviceContext as DeviceContextValue,
  type DeviceMode,
} from "@/lib/device-mode";

/**
 * React context exposing the resolved `DeviceMode` to the tree.
 * Mounted once near the root, seeded with the SSR-resolved value from
 * the root layout so first paint is guaranteed accurate.
 *
 * Two side-effects live inside:
 *
 *  - `DeviceHtmlSync` keeps `<html data-device>` in sync after any
 *    client-side refinement. Tailwind variants and the desktop
 *    min-width clamp live on that attribute (see `globals.css`), so
 *    we have to write it back to the DOM whenever React state changes.
 *
 *  - `DeviceModeRefiner` checks `matchMedia` on mount (and on resize)
 *    and corrects the cookie when the live viewport disagrees with
 *    what we shipped. The SSR UA guess is necessarily fuzzy — a
 *    desktop UA on a narrow window, an iPad pretending to be a
 *    desktop, etc. — and the refiner is what guarantees the *second*
 *    visit ships the right mode from the start.
 *
 * Strict hydration discipline: the initial context value is exactly
 * what came out of the loader. Refinement only ever changes state from
 * `useEffect`, never during render, so React sees identical
 * server/client trees on the first pass.
 */

interface DeviceContextShape extends DeviceContextValue {
  /** Imperatively set the mode at runtime. Persists to the cookie so
   *  the choice survives a reload. The refiner uses this internally;
   *  an in-app device-toggle UI can call it directly. */
  setMode: (mode: DeviceMode) => void;
}

export const DeviceContext = createContext<DeviceContextShape | null>(null);

interface DeviceProviderProps {
  initial: DeviceContextValue;
  children: ReactNode;
}

export function DeviceProvider({ initial, children }: DeviceProviderProps) {
  const [state, setState] = useState<DeviceContextValue>(initial);

  const value = useMemo<DeviceContextShape>(
    () => ({
      mode: state.mode,
      source: state.source,
      setMode: (mode) => {
        writeDeviceCookie(mode);
        setState({ mode, source: "cookie" });
      },
    }),
    [state],
  );

  return (
    <DeviceContext.Provider value={value}>
      <DeviceHtmlSync mode={state.mode} />
      <DeviceModeRefiner state={state} setState={setState} />
      {children}
    </DeviceContext.Provider>
  );
}

/** Keep `<html data-device>` aligned with React state after the SSR
 *  value has been refined on the client. Pure side-effect — renders
 *  nothing. */
function DeviceHtmlSync({ mode }: { mode: DeviceMode }) {
  useEffect(() => {
    document.documentElement.dataset.device = mode;
  }, [mode]);
  return null;
}

interface RefinerProps {
  state: DeviceContextValue;
  setState: (next: DeviceContextValue) => void;
}

/** Side-effect only. On mount, asks the browser what the live
 *  viewport actually is and corrects the cookie if the SSR UA guess
 *  was wrong. Also keeps listening for viewport changes (DevTools
 *  resize, orientation flip) so the mode stays aligned.
 *
 *  `forced-desktop` is skipped — detection is off by definition, so
 *  refining would be wrong. */
function DeviceModeRefiner({ state, setState }: RefinerProps) {
  const modeRef = useRef(state.mode);

  // Keep the ref tracking the latest mode without reading it during
  // render — React 19's `react-hooks/refs` rule forbids that.
  useEffect(() => {
    modeRef.current = state.mode;
  }, [state.mode]);

  useEffect(() => {
    if (state.source === "forced-desktop") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    /* Two signals, evaluated in priority order:
     *
     *   1. `touchMq` — true when the device's *primary* input is a
     *      finger (no hover, coarse pointer). Phones and tablets
     *      all match, including iPads that ship a Mac UA, while
     *      touch-screen laptops with a mouse stay on the desktop
     *      branch (they report `hover: hover`).
     *   2. `widthMq` — fallback narrow-window check for tiny
     *      desktop windows / dev-tools resize / shrunk Chrome.
     *
     * Touch wins: a wide-viewport iPad in landscape (1366px) is
     * still a touch device and should pick up the bottom-sheet UX,
     * not the desktop dropdowns. */
    const touchMq = window.matchMedia(TOUCH_PRIMARY_MEDIA_QUERY);
    const widthMq = window.matchMedia(
      `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`,
    );

    const applyMode = (source: DeviceContextValue["source"]) => {
      const liveMode: DeviceMode =
        touchMq.matches || widthMq.matches ? "mobile" : "desktop";
      if (liveMode === modeRef.current) return;
      writeDeviceCookie(liveMode);
      setState({ mode: liveMode, source });
    };

    /* Always run on mount when the source was a UA guess — we want
     * to correct iPad-as-Mac on the very first paint without
     * waiting for a viewport change event. */
    if (state.source === "ua") {
      applyMode("cookie");
    }

    const onChange = () => applyMode("cookie");
    touchMq.addEventListener("change", onChange);
    widthMq.addEventListener("change", onChange);
    return () => {
      touchMq.removeEventListener("change", onChange);
      widthMq.removeEventListener("change", onChange);
    };
  }, [state.source, setState]);

  return null;
}

/** Write the device cookie from the client. Non-HttpOnly by definition
 *  (the browser is the one writing it), `SameSite=Lax`, and `Secure`
 *  whenever the page is on HTTPS so the cookie never leaks over
 *  plaintext. */
function writeDeviceCookie(mode: DeviceMode): void {
  if (typeof document === "undefined") return;
  const maxAgeSec = DEVICE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${DEVICE_COOKIE}=${mode}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

export function useDeviceMode() {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error("useDeviceMode() must be used within <DeviceProvider>");
  }
  return ctx;
}

export function useIsMobile(): boolean {
  return useDeviceMode().mode === "mobile";
}

export function useIsDesktop(): boolean {
  return useDeviceMode().mode === "desktop";
}
