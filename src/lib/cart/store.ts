"use client";

import {
  addToCartAction,
  clearCartAction,
  refreshCartAction,
  removeCartLineAction,
  updateCartLineAction,
  type CartActionResult,
} from "@/app/cart/actions";
import { resolveFirstVariantGidAction } from "@/app/products/actions";
import { trackAddToCart } from "@/lib/analytics/events";
import { attributionToCartAttributes } from "@/lib/attribution/format";
import {
  getCurrentAttribution,
  useAttribution,
} from "@/lib/attribution/store";
import { bundleSavingsCents, cartBundlePercent } from "@/lib/cart/bundle";
import { openCart } from "@/lib/cart/drawer-store";
import { createStore } from "@/lib/external-store";
import { buildCartPermalink, type CheckoutLine } from "@/lib/shopify/checkout";
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

  /* bfcache restore — companion to `<BfcacheRefresh>` in the
   * layout, which handles server-component staleness via
   * `router.refresh()`. That covers everything Next renders;
   * this listener covers what Next *doesn't* render: the
   * client-side cart store, which holds its own line snapshot
   * parallel to Shopify (for sub-ms drawer reads). On bfcache
   * restore the snapshot reflects the pre-checkout world, so
   * we re-sync against the authoritative Shopify cart (or
   * localStorage in guest mode). `persisted: false` is a normal
   * navigation and bypasses this — the SSR'd cart already
   * landed via `<CartHydrator>`. */
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      void revalidateCart();
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
 * Lightweight meta-only hydration. Sets `mode` + `checkoutDomain`
 * without touching the cart-line snapshot.
 *
 * Mounted earlier than `<CartHydrator>` (in `<ShopLayout>`, not
 * `<SiteHeader>`) so Buy Now and guest checkout permalinks have
 * a real domain to splice into their URLs from the first frame —
 * before the header's slow Shopify cart fetch resolves. Without
 * this, a shopper who lands on a PDP and clicks "Buy Now" while
 * the header is still streaming would get `https://undefined/cart/…`.
 *
 * Server-mode also clears `linesStore` here so the localStorage
 * residue from a prior guest session (or a logout snapshot)
 * doesn't flash into the drawer between paint and the server
 * cart landing. `<CartLoginHandoff>` reads `localStorage`
 * directly via `loadFromStorage()`, not the in-memory store, so
 * the clear here doesn't race the merge.
 */
export function hydrateCartMeta(input: {
  mode: "guest" | "server";
  checkoutDomain: string;
}): void {
  if (input.mode === "server") {
    linesStore.set(EMPTY);
  }
  metaStore.set((m) => ({
    ...m,
    mode: input.mode,
    checkoutDomain: input.checkoutDomain,
  }));
}

/**
 * Refresh the in-memory cart against its authoritative source.
 *
 *   - Guest mode → re-read `localStorage` (covers cross-tab
 *     edits that bypassed the `storage` event, and bfcache
 *     restores where the cross-tab listener was torn down).
 *   - Server mode → call `refreshCartAction()` to re-fetch the
 *     Shopify cart and reconcile. `null` from the action means
 *     the cart was completed at checkout (or expired); we reset
 *     to an empty snapshot so the next add starts fresh.
 *
 * Fire-and-forget — UI surfaces that care subscribe to
 * `linesStore`. Failures log a warning in dev and leave the
 * existing snapshot intact (network blip shouldn't blank the
 * drawer).
 */
export async function revalidateCart(): Promise<void> {
  const meta = metaStore.get();
  if (meta.mode === "guest") {
    linesStore.set(loadFromStorage());
    return;
  }
  try {
    const cart = await refreshCartAction();
    if (cart) {
      linesStore.set(cart.lines);
      metaStore.set((m) => ({
        ...m,
        cartId: cart.id,
        checkoutUrl: cart.checkoutUrl,
      }));
    } else {
      /* No cart on Shopify side — most likely the shopper just
       * completed checkout. Empty the snapshot so the badge
       * drops to 0 and the drawer reads "your cart is empty"
       * instead of showing the pre-checkout lines that no
       * longer exist server-side. */
      linesStore.set(EMPTY);
      metaStore.set((m) => ({
        ...m,
        cartId: undefined,
        checkoutUrl: undefined,
      }));
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[cart] revalidate failed:", err);
    }
  }
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
  if (!options.silent) {
    openCart();
    /* Fire on user intent, not server confirmation. The server
     * action might still be in-flight (server mode) or the
     * variant id might still be resolving in the background
     * (guest card-button adds), but the shopper has committed
     * to adding the line — that's the moment Admin Analytics
     * cares about for funnel math. A subsequent server failure
     * is rare and the optimistic event is the right model for
     * "intent to purchase". */
    trackAddToCart({
      cartId: meta.cartId ?? null,
      totalValue: ((line.priceCents * quantity) / 100).toFixed(2),
      currency: line.currency,
      products: [
        {
          productId: line.productId,
          /* `merchandiseId` may be empty for guest card-button
           *  adds when the variant resolve hasn't landed yet —
           *  the Shopify pipeline tolerates an empty variant id
           *  and still attributes the event to the product. */
          variantId: line.merchandiseId ?? "",
          name: line.title,
          price: (line.priceCents / 100).toFixed(2),
          quantity,
          currency: line.currency,
        },
      ],
    });
  }

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

/**
 * Buy Now — send the shopper directly to Shopify's hosted
 * checkout with the given lines, bypassing the local cart.
 *
 * Used by:
 *
 *   - PDP "Buy Now - Fast Checkout" CTA (`<BuyActions>`).
 *   - Product modal Buy Now button — same single-variant flow
 *     but launched from a card click rather than the PDP.
 *   - Any future "express checkout" entry point that wants to
 *     skip the cart drawer.
 *
 * Mode-agnostic by design: server-mode users get the same
 * `cart/<variant>:<qty>` permalink as guests, with the current
 * attribution attached as `attributes[_utm_*]` query params.
 * Buy Now is intentionally NOT a "add to my cart then go" flow —
 * the shopper picks one product and goes; their existing cart
 * stays as-is for later.
 *
 * Returns nothing — synchronously navigates via
 * `window.location.href` on success. A `null` permalink (no
 * checkout domain configured, every line failed to parse) is a
 * silent no-op; the caller's button should have been disabled
 * before we got here.
 */
export function buyNow(lines: ReadonlyArray<CheckoutLine>): void {
  if (typeof window === "undefined") return;
  const meta = metaStore.get();
  if (!meta.checkoutDomain || lines.length === 0) return;

  const attribution = getCurrentAttribution();
  const url = buildCartPermalink(meta.checkoutDomain, lines, {
    attributes: attributionToCartAttributes(attribution),
  });
  if (!url) return;
  window.location.href = url;
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

/** Subtotal in cents (sum of price × quantity) at the *line* sale
 *  price — before any bundle discount. This is the regular sale
 *  total; `useCartBundleSavingsCents` is subtracted from it for the
 *  amount the shopper actually pays. Doesn't account for shipping or
 *  taxes — those layer on at checkout. */
export function useCartSubtotalCents(): number {
  return linesStore.useSelector(
    (lines) => lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0),
    0,
  );
}

/** Cart-wide "Bundle & Save" percentage for the current cart, driven
 *  by total unit count (2 → 15%, 3+ → 20%). Drives the per-line
 *  discounted-total preview in `<CartLineRow>` and the footer's
 *  "Bundle savings" math. `0` for a single-item cart. */
export function useCartBundlePercent(): number {
  return linesStore.useSelector(
    (lines) =>
      cartBundlePercent(lines.reduce((sum, l) => sum + l.quantity, 0)),
    0,
  );
}

/** Total bundle discount across the cart, in cents. Applies the
 *  cart-wide percentage (from total unit count) to every line and
 *  sums — so the footer figure equals the sum of the discounted line
 *  totals shown above it. `0` below the 2-unit threshold. The
 *  matching Shopify quantity-break discount applies the real
 *  reduction at checkout; this is the in-cart preview of it. */
export function useCartBundleSavingsCents(): number {
  return linesStore.useSelector((lines) => {
    const percent = cartBundlePercent(
      lines.reduce((sum, l) => sum + l.quantity, 0),
    );
    if (percent <= 0) return 0;
    return lines.reduce(
      (sum, l) => sum + bundleSavingsCents(l.priceCents, l.quantity, percent),
      0,
    );
  }, 0);
}

/** Total compare-at ("was" price) markdown savings across the cart,
 *  in cents — the difference between each discounted line's
 *  compare-at and its sale price. Independent of bundle savings;
 *  the footer sums the two for the headline "You're saving" figure. */
export function useCartCompareAtSavingsCents(): number {
  return linesStore.useSelector(
    (lines) =>
      lines.reduce(
        (sum, l) =>
          sum +
          (l.compareAtCents !== undefined && l.compareAtCents > l.priceCents
            ? (l.compareAtCents - l.priceCents) * l.quantity
            : 0),
        0,
      ),
    0,
  );
}

/**
 * Checkout URL for the current cart, mode-aware:
 *
 *   - **Server** → the Shopify-issued `cart.checkoutUrl`. Routes
 *     to hosted checkout with buyer identity pre-filled.
 *     Attribution rides as cart attributes (stamped via
 *     `cartAttributesUpdate` at add-time), so no URL params are
 *     needed.
 *   - **Guest** → a `cart/<variant>:<qty>,…` permalink built on
 *     demand from the current lines + checkout domain, with the
 *     current UTM attribution appended as `attributes[_utm_*]`
 *     query params. Shopify reads them off the URL and stamps
 *     them onto the resulting cart — same destination as the
 *     server path, different transport.
 *
 * Returns `null` when neither path can produce a usable URL
 * (empty cart for guests, no checkout domain configured, lines
 * without variant GIDs). Callers render a disabled CTA or hide
 * the button in that case.
 */
export function useCartCheckoutUrl(): string | null {
  /* Subscribe to all three stores — checkoutUrl can change as
   * the server cart reconciles, the guest permalink depends on
   * the lines, and the attribution payload changes when a fresh
   * UTM lands mid-session. */
  const meta = metaStore.use();
  const lines = linesStore.use();
  const attribution = useAttribution();
  if (meta.mode === "server") return meta.checkoutUrl ?? null;
  if (!meta.checkoutDomain || lines.length === 0) return null;
  const permalink = buildCartPermalink(
    meta.checkoutDomain,
    lines.flatMap((l) =>
      l.merchandiseId
        ? [{ variantGid: l.merchandiseId, quantity: l.quantity }]
        : [],
    ),
    { attributes: attributionToCartAttributes(attribution) },
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
