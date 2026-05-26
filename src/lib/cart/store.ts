"use client";

import {
  addToCartAction,
  clearCartAction,
  removeCartLineAction,
  updateCartLineAction,
  type CartActionResult,
} from "@/app/cart/actions";
import { resolveFirstVariantGidAction } from "@/app/products/actions";
import { openCart } from "@/lib/cart/drawer-store";
import { createStore } from "@/lib/external-store";
import { buildCartPermalink } from "@/lib/shopify/checkout";
import type { Cart } from "@/lib/shopify/cart";
import type { CartLine } from "@/types/cart";
import type { SearchProduct } from "@/types/product";

/**
 * Cart state, shared across every client component via
 * `useSyncExternalStore`. Mode-aware:
 *
 *   - **Guest** → persisted to `localStorage` (`zepr-v2:cart:v1`),
 *     with cross-tab `storage` sync and quota-failure tolerance.
 *     The lines IS the cart; checkout goes through a Shopify cart
 *     permalink built on demand. Mutations apply synchronously —
 *     no network, so "optimistic" and "authoritative" are the
 *     same step.
 *   - **Logged-in** → Shopify Storefront Cart API is the source of
 *     truth. Mutations dispatch to the corresponding server action
 *     and the response replaces the in-memory snapshot. No
 *     fire-and-forget optimism — Shopify is authoritative and
 *     applying a local guess only to roll it back if the action
 *     reports a userError (or returns the line unchanged because
 *     the id no longer exists) made the drawer flicker "deleted
 *     then back" on the failure paths. While the action is in
 *     flight, the drawer renders a soft `<LoadingOverlay>` over
 *     the line list + footer (counter via `useCartPending()`).
 *
 * The public API (`addCartLine` / `setCartLineQuantity` /
 * `removeCartLine` / `useCartLines` / `useCartCount` /
 * `useCartSubtotalCents`) is identical across modes — callers
 * dispatch through one entry point and the store routes by mode
 * internally. Only `useCartCheckoutUrl` is mode-aware on the
 * read side (guest builds a permalink; server returns
 * `cart.checkoutUrl`).
 *
 * Design rationale — same primitives as the favorites store:
 * `useSyncExternalStore` (no Context cascades), one ~30-line
 * `createStore` (no third-party state library), per-selector
 * subscriptions so a quantity edit doesn't re-render the header
 * badge unless the total actually changes.
 *
 * Hydration:
 *
 *   - Module load reads `localStorage` so guest sessions see their
 *     cart on first paint without waiting for an effect.
 *   - `hydrateCart()` (called from the `<CartHydrator>` client
 *     island in the layout) authoritatively flips mode and seeds
 *     the server-mode snapshot from the SSR-fetched cart. For
 *     guests it's a no-op against the lines (already hydrated)
 *     and just records the checkout domain.
 *   - `useSyncExternalStore`'s server snapshot is `EMPTY`, which
 *     matches the first client render — no hydration mismatch.
 *     The `<CartTrigger>` badge uses a separate `useHydrated()`
 *     gate (mirroring the favorites badge) so the SSR-correct
 *     count shows on first paint for logged-in users.
 */

const STORAGE_KEY = "zepr-v2:cart:v1";

const EMPTY: readonly CartLine[] = [];

/* ------------------------------------------------------------------ */
/* Mode + metadata store                                                */
/* ------------------------------------------------------------------ */

interface CartMeta {
  /** "guest" until the hydrator says otherwise. Mutations gate on
   *  this to decide whether to write `localStorage` or dispatch a
   *  server action. */
  mode: "guest" | "server";
  /** Shopify cart GID (server mode). Cached client-side so the
   *  checkout-url derivation doesn't have to re-read the cookie
   *  on every render. */
  cartId?: string;
  /** Shopify-hosted checkout URL for the current server cart.
   *  Replaced on every reconcile. */
  checkoutUrl?: string;
  /** Shopify checkout subdomain (`checkout.example.com`) — used
   *  by guest mode to build a `cart/<variant>:<qty>` permalink
   *  on demand. Passed in from the server layout because it lives
   *  in server-only env (`SHOPIFY_CHECKOUT_DOMAIN`). */
  checkoutDomain?: string;
}

const DEFAULT_META: CartMeta = { mode: "guest" };

const metaStore = createStore<CartMeta>(DEFAULT_META, DEFAULT_META);

/* ------------------------------------------------------------------ */
/* Lines store + persistence                                            */
/* ------------------------------------------------------------------ */

function loadFromStorage(): readonly CartLine[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    /* Light shape filter — drops anything that lost a required
     * field in storage (e.g. older versions). Better to lose a
     * stale line than crash the drawer mapping over it. */
    return parsed.filter(isCartLine);
  } catch {
    return EMPTY;
  }
}

function isCartLine(v: unknown): v is CartLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.productId === "string" &&
    typeof l.handle === "string" &&
    typeof l.title === "string" &&
    typeof l.imageUrl === "string" &&
    typeof l.priceCents === "number" &&
    typeof l.currency === "string" &&
    typeof l.quantity === "number"
  );
}

function saveToStorage(lines: readonly CartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* Quota exceeded / private mode — ignore. In-memory state is
     * authoritative for the current tab. */
  }
}

function clearStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Ignore — see above. */
  }
}

const linesStore = createStore<readonly CartLine[]>(EMPTY, EMPTY);

/* ------------------------------------------------------------------ */
/* Pending mutations (server mode only)                                 */
/* ------------------------------------------------------------------ */

/* Counter of in-flight server actions. The drawer renders a
 * loading overlay whenever this is > 0, which doubles as a
 * mutation guard: the overlay sits above the line rows + footer
 * so a second click can't queue while the first is still
 * resolving. Guest-mode mutations are synchronous and never
 * touch this counter — the drawer stays interactive. */
const pendingStore = createStore<number>(0, 0);

function incrementPending(): void {
  pendingStore.set((n) => n + 1);
}
function decrementPending(): void {
  pendingStore.set((n) => (n > 0 ? n - 1 : 0));
}

/* Module-load guest hydration. Runs once when this file is first
 * imported into the client bundle, so by the time any component
 * renders the store carries the persisted snapshot. The hydrator
 * (running from a React effect) will overwrite this in server
 * mode, but until it does the guest path is fully usable. */
if (typeof window !== "undefined") {
  const persisted = loadFromStorage();
  if (persisted.length > 0) linesStore.set(persisted);

  /* Cross-tab `storage` sync — only active in guest mode. In
   * server mode Shopify is the source of truth, and a sibling tab
   * editing localStorage shouldn't drag the current tab's
   * snapshot away from what Shopify holds. */
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    if (metaStore.get().mode === "guest") {
      linesStore.set(loadFromStorage());
    }
  });
}

/* ------------------------------------------------------------------ */
/* Hydration                                                            */
/* ------------------------------------------------------------------ */

export interface HydrateCartInput {
  mode: "guest" | "server";
  /** Server-rendered cart snapshot (logged-in mode only). When
   *  `null` the customer is signed in but has no cart yet —
   *  flips the store into server mode with an empty snapshot. */
  initialCart?: Cart | null;
  /** `SHOPIFY_CHECKOUT_DOMAIN` (or the storefront domain
   *  fallback) — required for the guest checkout permalink. */
  checkoutDomain?: string;
}

/**
 * Authoritative hydration entry point. Called once by the
 * `<CartHydrator>` client island mounted in the layout — after
 * this, mutation routing is correct.
 *
 * Idempotent across remounts: re-calling with the same mode just
 * refreshes the metadata; re-calling with a different mode is the
 * post-login transition and replaces both stores cleanly.
 */
export function hydrateCart(input: HydrateCartInput): void {
  if (input.mode === "server") {
    linesStore.set(input.initialCart?.lines ?? EMPTY);
    /* Intentionally NOT clearing `localStorage` here: the
     * post-login landing reads it before consuming it through
     * `mergeGuestCartAction`. The handoff component
     * (`<CartLoginHandoff>`) calls `clearGuestStorage()`
     * after a successful merge — that's the single point that
     * owns the localStorage flush so we don't race the read. */
    metaStore.set({
      mode: "server",
      cartId: input.initialCart?.id,
      checkoutUrl: input.initialCart?.checkoutUrl,
      checkoutDomain: input.checkoutDomain,
    });
    return;
  }
  /* Guest mode — module-load already populated `linesStore` from
   * localStorage. Just record metadata. */
  metaStore.set({
    mode: "guest",
    checkoutDomain: input.checkoutDomain,
  });
}

/**
 * Read the guest cart out of `localStorage`. Returns whatever was
 * persisted at the time of call — used by the login handoff to
 * compose the `mergeGuestCartAction` payload before flushing.
 *
 * Always reads from storage (not the in-memory store) so the
 * handoff works correctly even if `<CartHydrator>` has already
 * flipped the store into server mode and the in-memory snapshot
 * has been replaced with the server-fetched cart.
 */
export function readGuestStorageLines(): readonly CartLine[] {
  return loadFromStorage();
}

/** Wipe the guest localStorage cart. Called by the login-handoff
 *  client wrapper after the server confirms the merge. */
export function clearGuestStorage(): void {
  clearStorage();
}

/**
 * Pre-logout cart preservation. Copies the current server-mode
 * snapshot into `localStorage` so the same cart re-appears on the
 * post-logout (guest) render. Synchronous — must run inside the
 * `onClick` of the logout link so the write completes before the
 * browser starts tearing down the JS context for the navigation.
 *
 * No-op in guest mode (store and localStorage are already in
 * sync, by definition) — keeps the call site safe to attach to a
 * logout link without first reading the current mode.
 *
 * Lines retain their Shopify cart-line GIDs as ids when restored.
 * That's harmless for rendering (the drawer keys off `id`) and
 * makes the snapshot transparently reversible if the same user
 * logs back in — the merge action ignores ids on the wire and
 * re-resolves variants from `merchandiseId` / `handle` anyway.
 */
export function snapshotServerCartToStorage(): void {
  if (metaStore.get().mode !== "server") return;
  saveToStorage(linesStore.get());
}

/**
 * Replace the server-mode snapshot with a freshly-fetched cart.
 *
 * Used by the login handoff after `mergeGuestCartAction` returns,
 * so the cart badge + drawer pick up the merged lines without
 * waiting for a navigation to revalidate `getCurrentCart()`.
 * Inherits the current `checkoutDomain` — the merge doesn't
 * change which Shopify host owns checkout, only which cart we
 * point at.
 */
export function setServerCart(cart: Cart): void {
  linesStore.set(cart.lines);
  metaStore.set((m) => ({
    ...m,
    mode: "server",
    cartId: cart.id,
    checkoutUrl: cart.checkoutUrl,
  }));
}

/* ------------------------------------------------------------------ */
/* Guest-mode pure helpers                                              */
/* ------------------------------------------------------------------ */

/** Apply an add-line to a guest snapshot. Dedupe by `id` so the
 *  same product+variant accumulates quantity into a single row. */
function applyAdd(
  prev: readonly CartLine[],
  line: Omit<CartLine, "quantity">,
  quantity: number,
): readonly CartLine[] {
  const idx = prev.findIndex((l) => l.id === line.id);
  if (idx >= 0) {
    const next = prev.slice();
    next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
    return next;
  }
  return [...prev, { ...line, quantity }];
}

function applySetQuantity(
  prev: readonly CartLine[],
  id: string,
  quantity: number,
): readonly CartLine[] {
  if (quantity <= 0) return prev.filter((l) => l.id !== id);
  return prev.map((l) => (l.id === id ? { ...l, quantity } : l));
}

function applyRemove(
  prev: readonly CartLine[],
  id: string,
): readonly CartLine[] {
  return prev.filter((l) => l.id !== id);
}

/* ------------------------------------------------------------------ */
/* Server-mode dispatch                                                 */
/* ------------------------------------------------------------------ */

/** Apply a server action's result to the local store. Server mode
 *  only — guest mutations are local and bypass this entirely.
 *
 *  No rollback path: server-mode mutations never apply an
 *  optimistic snapshot, so a failure just leaves the previous
 *  state in place. The loading overlay clears on settle either
 *  way and the user can retry. */
function applyServerResult(result: CartActionResult): void {
  if (result.ok) {
    linesStore.set(result.cart.lines);
    metaStore.set((m) => ({
      ...m,
      cartId: result.cart.id,
      checkoutUrl: result.cart.checkoutUrl,
    }));
    return;
  }
  if (process.env.NODE_ENV === "development") {
    console.warn("[cart] server action failed:", result.error);
  }
}

/** Wrap a server-action call with the pending counter so the
 *  drawer's loading overlay reflects in-flight state, and apply
 *  the result on settle. `try/finally` guarantees the counter
 *  decrements even on a thrown action — without it a rejected
 *  promise (network blip, action serialisation error) would
 *  strand the overlay on the screen. */
async function dispatchServerAction(
  run: () => Promise<CartActionResult>,
): Promise<void> {
  incrementPending();
  try {
    const result = await run();
    applyServerResult(result);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[cart] server action threw:", err);
    }
  } finally {
    decrementPending();
  }
}

/* ------------------------------------------------------------------ */
/* Mutations (public API)                                               */
/* ------------------------------------------------------------------ */

/**
 * Add a product to the cart. Pops the cart drawer as the
 * canonical "added to cart" feedback signal regardless of mode.
 * Pass `silent: true` for background adds (cart restore, server
 * sync) that shouldn't trigger UI.
 *
 * Routing:
 *   - Guest → dedupes by `id`, writes the new snapshot to
 *     `localStorage` synchronously.
 *   - Server → dispatches `addToCartAction`, the drawer renders
 *     a loading overlay over the line list + footer until the
 *     action settles, then the response replaces the snapshot.
 */
export function addCartLine(
  line: Omit<CartLine, "quantity">,
  quantity = 1,
  options: { silent?: boolean } = {},
): void {
  if (quantity <= 0) return;

  const meta = metaStore.get();
  if (!options.silent) openCart();

  if (meta.mode === "guest") {
    const next = applyAdd(linesStore.get(), line, quantity);
    linesStore.set(next);
    saveToStorage(next);
    return;
  }

  void dispatchServerAction(() =>
    addToCartAction({
      merchandiseId: line.merchandiseId,
      handle: line.handle,
      quantity,
    }),
  );
}

/**
 * Add a `SearchProduct` (from search / feed / category surfaces)
 * to the cart at its base configuration. Single-variant products
 * only — multi-variant cards open the variant modal first and
 * call `addCartLine` directly with a resolved variant.
 *
 * Per-mode behavior (delegated to `addCartLine`):
 *
 *   - **Guest** — line lands in the store synchronously so the
 *     drawer pops with the product visible. We then resolve the
 *     product's first variant GID in the background and patch
 *     `merchandiseId` in (the guest checkout permalink needs it).
 *   - **Server** — the drawer pops, the loading overlay scrim
 *     covers it, and `addToCartAction` resolves the variant +
 *     adds the line server-side. The reconciled cart replaces
 *     the snapshot when the action settles, so no client-side
 *     variant resolve is needed.
 */
export function addProductToCart(
  product: SearchProduct,
  quantity = 1,
  options: { silent?: boolean } = {},
): void {
  addCartLine(
    {
      id: product.id,
      productId: product.id,
      handle: product.handle,
      title: product.title,
      imageUrl: product.image_url,
      priceCents: product.price_min_cents,
      compareAtCents: product.compare_at_min_cents,
      currency: product.currency,
    },
    quantity,
    options,
  );

  /* Guest mode only — server-mode's `addToCartAction` already
   * resolves the variant server-side and reconciles the cart
   * (with real merchandiseIds) into the store on success. */
  if (metaStore.get().mode === "guest") {
    void resolveAndPatchMerchandiseId(product.id, product.handle);
  }
}

async function resolveAndPatchMerchandiseId(
  productId: string,
  handle: string,
): Promise<void> {
  const gid = await resolveFirstVariantGidAction(handle);
  if (!gid) return;

  /* Patch only the matching guest-mode line(s) that don't already
   * carry a merchandiseId. If the store flipped to server mode
   * mid-resolve (post-login race), we skip the write — the
   * server cart is now authoritative. */
  if (metaStore.get().mode !== "guest") return;
  const prev = linesStore.get();
  let changed = false;
  const next = prev.map((l) => {
    if (l.productId === productId && !l.merchandiseId) {
      changed = true;
      return { ...l, merchandiseId: gid };
    }
    return l;
  });
  if (!changed) return;
  linesStore.set(next);
  saveToStorage(next);
}

export function removeCartLine(id: string): void {
  const meta = metaStore.get();

  if (meta.mode === "guest") {
    const prev = linesStore.get();
    const next = applyRemove(prev, id);
    if (next === prev) return;
    linesStore.set(next);
    saveToStorage(next);
    return;
  }

  void dispatchServerAction(() => removeCartLineAction({ lineId: id }));
}

/**
 * Set the exact quantity for a line. `0` (or below) removes the
 * line — matches the "press − past 1 deletes the row" UX in the
 * drawer.
 */
export function setCartLineQuantity(id: string, quantity: number): void {
  if (quantity <= 0) {
    removeCartLine(id);
    return;
  }
  const meta = metaStore.get();

  if (meta.mode === "guest") {
    const prev = linesStore.get();
    const next = applySetQuantity(prev, id, quantity);
    if (next === prev) return;
    linesStore.set(next);
    saveToStorage(next);
    return;
  }

  void dispatchServerAction(() =>
    updateCartLineAction({ lineId: id, quantity }),
  );
}

export function clearCart(): void {
  const meta = metaStore.get();

  if (meta.mode === "guest") {
    if (linesStore.get().length === 0) return;
    linesStore.set(EMPTY);
    saveToStorage(EMPTY);
    return;
  }

  void dispatchServerAction(() => clearCartAction());
}

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

/** Full lines snapshot — re-renders on every mutation. */
export function useCartLines(): readonly CartLine[] {
  return linesStore.use();
}

/** Total item count across all lines. Primitive selector — caller
 *  only re-renders when the number actually changes. */
export function useCartCount(): number {
  return linesStore.useSelector(
    (lines) => lines.reduce((sum, l) => sum + l.quantity, 0),
    0,
  );
}

/** Subtotal in cents (sum of price × quantity). Doesn't account
 *  for shipping, taxes, or coupons — those layer on at checkout. */
export function useCartSubtotalCents(): number {
  return linesStore.useSelector(
    (lines) => lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0),
    0,
  );
}

/**
 * Checkout URL for the current cart, mode-aware:
 *
 *   - **Server** → the Shopify-issued `cart.checkoutUrl`. Routes
 *     to hosted checkout with buyer identity pre-filled.
 *   - **Guest** → a `cart/<variant>:<qty>,…` permalink built on
 *     demand from the current lines + checkout domain. Same
 *     pattern the PDP "Buy Now" CTA uses.
 *
 * Returns `null` when neither path can produce a usable URL
 * (empty cart for guests, no checkout domain configured, lines
 * without variant GIDs). Callers render a disabled CTA or hide
 * the button in that case.
 */
export function useCartCheckoutUrl(): string | null {
  /* Subscribe to both stores — checkoutUrl can change as the
   * server cart reconciles, and the guest permalink depends on
   * the lines. The selector returns a primitive so the caller
   * only re-renders on real URL changes. */
  const meta = metaStore.use();
  const lines = linesStore.use();
  if (meta.mode === "server") return meta.checkoutUrl ?? null;
  if (!meta.checkoutDomain || lines.length === 0) return null;
  const permalink = buildCartPermalink(
    meta.checkoutDomain,
    lines.flatMap((l) =>
      l.merchandiseId
        ? [{ variantGid: l.merchandiseId, quantity: l.quantity }]
        : [],
    ),
  );
  return permalink;
}

/** Current mode — useful for UI gating (e.g. variant-modal Add
 *  CTA disables until the store is hydrated). */
export function useCartMode(): "guest" | "server" {
  return metaStore.useSelector((m) => m.mode, "guest");
}

/**
 * `true` while at least one server-mode cart mutation is in
 * flight. The cart drawer drops a `<LoadingOverlay>` over its
 * body region whenever this flips on, both as visual feedback
 * and as a mutation guard (the overlay blocks pointer events on
 * the line rows and footer, so a second click can't queue while
 * the first round-trip is still resolving).
 *
 * Always `false` in guest mode — guest mutations are
 * synchronous, never increment the counter, and the drawer
 * stays fully interactive.
 */
export function useCartPending(): boolean {
  return pendingStore.useSelector((n) => n > 0, false);
}
