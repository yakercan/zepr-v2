"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny module-level reactive store.
 *
 * Wraps React 19's `useSyncExternalStore` so any client component can
 * subscribe to a piece of shared state without paying for a Context
 * provider, a re-render cascade, or a third-party state library.
 *
 * Two read patterns:
 *
 *   - **`use()`** — subscribes to the whole state object. Best when
 *     the consumer needs the full snapshot (e.g. the cart drawer
 *     mapping over lines).
 *   - **`useSelector(fn, serverFallback)`** — subscribes to a derived
 *     primitive (count, subtotal, open boolean). Only re-renders when
 *     the selected value changes by `Object.is`, so a header badge
 *     that reads `count` doesn't redraw on every line edit, only when
 *     the actual number changes. Selectors that return *new* arrays
 *     or objects each call will cause infinite renders — keep
 *     selectors primitive (or return the existing reference).
 *
 * SSR notes:
 *
 *   - `serverSnapshot` is what every server render and the *first*
 *     client render see, so it must be a stable value (no
 *     `localStorage` reads on the server). The store hydrates after
 *     mount, then React re-renders with the real client snapshot.
 *     `useSyncExternalStore` is hydration-mismatch-safe by design —
 *     no console warnings, no `suppressHydrationWarning` tricks.
 *   - Writes from anywhere (event handlers, module-load hydration,
 *     `storage` events for cross-tab sync) just call `set()`; the
 *     listener fan-out is synchronous so React picks up the change
 *     on the next commit.
 *
 * Not exported as a class because the `use*` hook helpers want to
 * close over the same listener set as `set` / `subscribe`. The plain
 * object factory keeps that scoping tight without a `this` binding.
 */
export interface Store<T> {
  /** Imperative snapshot read — fine inside event handlers. */
  get(): T;
  /** Imperative write. Accepts a value or `(prev) => next`; bails
   *  out via `Object.is` when the result is identical. */
  set(next: T | ((prev: T) => T)): void;
  /** Low-level subscribe. The returned function unsubscribes. */
  subscribe(listener: () => void): () => void;
  /** Hook — re-renders the calling component on every store change. */
  use(): T;
  /** Hook — re-renders only when `select(state)` changes by
   *  `Object.is`. Pass a `serverSnapshot` that matches what the
   *  server would return for the same selector. */
  useSelector<S>(select: (state: T) => S, serverSnapshot: S): S;
}

export function createStore<T>(
  initial: T,
  serverInitial: T = initial,
): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function set(next: T | ((prev: T) => T)): void {
    const resolved =
      typeof next === "function"
        ? (next as (prev: T) => T)(state)
        : next;
    if (Object.is(resolved, state)) return;
    state = resolved;
    listeners.forEach((l) => l());
  }

  function use(): T {
    return useSyncExternalStore(
      subscribe,
      () => state,
      () => serverInitial,
    );
  }

  function useSelector<S>(
    select: (state: T) => S,
    serverSnapshot: S,
  ): S {
    return useSyncExternalStore(
      subscribe,
      () => select(state),
      () => serverSnapshot,
    );
  }

  return {
    get: () => state,
    set,
    subscribe,
    use,
    useSelector,
  };
}
