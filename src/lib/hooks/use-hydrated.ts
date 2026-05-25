"use client";

import { useSyncExternalStore } from "react";

/**
 * `true` once React has finished hydrating on the client.
 *
 * `useSyncExternalStore` calls `getServerSnapshot` during SSR
 * *and* the first client render (so the HTML matches byte-for-
 * byte), then switches to `getSnapshot` on the commit right
 * after hydration. That gives us a hydration-safe boolean
 * without a `useState` + `useEffect(setHydrated(true))` pair.
 *
 * Subscribe is a no-op — hydration only flips once per
 * component lifetime, so there's nothing to listen to.
 */
const NEVER_SUBSCRIBE = () => () => {};
const TRUE = () => true;
const FALSE = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(NEVER_SUBSCRIBE, TRUE, FALSE);
}
