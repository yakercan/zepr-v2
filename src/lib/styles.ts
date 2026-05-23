/**
 * Reusable Tailwind class presets.
 *
 * For visual patterns that need to compose cleanly with other
 * Tailwind utilities at the call site, a TypeScript class-string
 * constant is the right vehicle — *not* a `@layer components` CSS
 * class. The CSS layer cascade pushes class-based rules below
 * utilities, so a sibling `border-transparent` (etc.) on the same
 * element silently wins over a `.surface-outline` defined in CSS,
 * which is exactly what made the feed-tab outline disappear.
 *
 * As a plain string concatenated into the `className` prop, every
 * rule here is a normal Tailwind utility — order in the string
 * decides precedence, and conflicts are resolvable inline. That's
 * the consistency win for "one source of truth across the app".
 *
 * Pure presentational tokens only — anything that needs JS state
 * or DOM behaviour belongs elsewhere.
 */

import { cn } from "@/lib/utils";

/**
 * "Selectable surface" outline — soft grey 2px border at rest,
 * snaps to ink on hover. Shared by:
 *
 *   - feed tabs (idle variant)
 *   - product cards
 *   - any future filter chip / interactive container
 *
 * Includes the `border-2` width so a single class is all a caller
 * needs to opt in. Border colour can still be overridden by adding
 * a `border-[…]` utility AFTER this constant in the className
 * string — useful for the feed tabs' active state, which paints an
 * ink-on-ink border that disappears into the background.
 */
export const SURFACE_OUTLINE_CLASSES =
  "border-2 border-[color:var(--color-border-strong)] transition-colors duration-150 hover:border-[color:var(--color-ink)]";

/**
 * Static "card" surface — rounded, soft grey 2px border, white
 * fill. Same visual shape as a product card, but without the
 * hover-to-ink behaviour, so it reads as a quiet info panel rather
 * than an interactive control.
 *
 * Used by both PDP columns (gallery + accordion on the left, buy
 * form on the right) so the two surfaces frame the page as a pair.
 * Padding is left to the caller — surfaces with tight inner
 * components (gallery, accordion) want `p-5 md:p-6`, denser
 * surfaces may want something tighter.
 *
 * Distinct constant from `SURFACE_OUTLINE_CLASSES` on purpose: this
 * one has no hover transition, so it won't fight an outer
 * `group-hover` if a future caller wraps it in one.
 */
export const PANEL_SURFACE_CLASSES =
  "rounded-2xl border-2 border-[color:var(--color-border-strong)] bg-white";

/**
 * Square media stage — the container that owns the `group/media`
 * named hover scope, the absolute-positioning context for stacked
 * layers, the overflow clip for the hover zoom, and the placeholder
 * tint behind any not-yet-loaded image.
 *
 * Reused by every surface that paints a product media tile:
 *
 *   - product card (sharp corners; lives inside an outer rounded
 *     card frame, no need to round here).
 *   - PDP gallery main viewer (overridden with `rounded-2xl` — the
 *     stage IS the visible frame on that surface).
 *
 * The `group/media` *named* group is the contract callers rely on:
 * any child with `group-hover/media:…` only reacts to the cursor
 * being over this tile, not over a sibling badge, the info row, or
 * the surrounding page chrome.
 */
export const MEDIA_STAGE_CLASSES =
  "group/media relative aspect-square overflow-hidden bg-[color:var(--color-search)]";

/**
 * Hover-zoom for a media element inside a `<MEDIA_STAGE_CLASSES />`
 * tile — fills the parent and scales to 103% on hover with a 300ms
 * ease-out transform transition.
 *
 * Default duration is the product card's, since the card is by far
 * the busiest media surface in the app. Surfaces that want a
 * different cadence (e.g. the PDP gallery, which uses a snappier
 * 200ms) override by appending `duration-N` to the className — the
 * `tailwind-merge` inside `cn(…)` collapses the conflict to the
 * latter value.
 *
 * The exact same class string is reused 1:1 on the card's primary
 * image and on every media layer inside the gallery, so a shopper
 * who learns the affordance on a card sees the identical *shape*
 * of motion on the product page (only the duration shifts).
 */
export const MEDIA_HOVER_ZOOM_CLASSES =
  "h-full w-full object-cover transition-transform duration-300 ease-out group-hover/media:scale-[1.03]";

/**
 * Opacity crossfade timing for stacked media layers — 300ms
 * ease-out, matching `MEDIA_HOVER_ZOOM_CLASSES` so a hover that
 * triggers both a zoom and a swap reads as one motion rather than
 * two. Override duration at the call site (see
 * `MEDIA_HOVER_ZOOM_CLASSES` for the same opt-out pattern).
 *
 * Pair with `absolute inset-0` (to stack the layer) and an opacity
 * driver at the call site — either CSS-only
 * (`opacity-0 group-hover/media:opacity-100`, used by the product
 * card's hover overlay) or state-driven (`opacity-0` ↔
 * `opacity-100`, used by the PDP gallery's active / outgoing
 * layers).
 *
 * Lives on a different element than `MEDIA_HOVER_ZOOM_CLASSES` —
 * each element transitions one property, so the two timings don't
 * conflict in `transition-property`.
 */
export const MEDIA_LAYER_FADE_CLASSES =
  "transition-opacity duration-300 ease-out";

/**
 * Translucent circular bubble overlay used for icon buttons that
 * sit on top of media tiles — banner slider controls, product
 * card video indicator, favorite (heart) toggle, future
 * share / save buttons.
 *
 * Soft dark glass: `bg-black/35` with a small `backdrop-blur-sm`
 * so the bubble reads cleanly over any media (light, dark, busy)
 * without burning out the underlying pixel. `hover:bg-black/55`
 * gives a subtle pressed-in feel without a separate hover ring.
 *
 * Plain `transition` (all GPU-cheap properties) instead of
 * `transition-colors` so callers that *also* want an opacity
 * fade-in/out — e.g. the favorite button revealing on card hover —
 * can layer `opacity-0 group-hover:opacity-100` without having to
 * fight a `transition-property: color` baseline.
 *
 * Default size `h-9 w-9` matches the banner slider's controls
 * (the original site of the pattern). Override with a different
 * `h-N w-N` after the constant if a tighter context wants smaller
 * (e.g. compact product cards inside a search dropdown).
 */
export const MEDIA_OVERLAY_BUBBLE_CLASSES =
  "flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55";

/**
 * Pill button styling — reversed colours, rounded-full.
 *
 *   - **active** → ink fill, white text.
 *   - **idle**   → white fill, ink text, soft grey outline that
 *                  snaps to ink on hover (shares
 *                  `SURFACE_OUTLINE_CLASSES`).
 *
 * Shared by the homepage main-feed tabs and the search-page
 * filter pills. The two surfaces should look identical: pills
 * are the storefront's primary "pick one (or some)" affordance,
 * and a wandering shopper should recognise the same shape on
 * every page. Change the look here once, every pill tracks.
 *
 * `border-2 border-transparent` lives on the base — keeps the
 * footprint stable across active ↔ idle. The active variant
 * paints an ink border that disappears into its own background;
 * the idle variant gets `SURFACE_OUTLINE_CLASSES`, which also
 * carries `border-2`. Tailwind-merge dedupes either way.
 */
const PILL_BASE_CLASSES = cn(
  "shrink-0 rounded-full border-2 border-transparent px-5 py-2.5",
  "text-sm font-semibold leading-none",
  "transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-[color:var(--color-ink)] focus-visible:ring-offset-2",
  "focus-visible:ring-offset-[color:var(--color-page)]",
);

const PILL_ACTIVE_CLASSES = cn(
  "bg-[color:var(--color-ink)] text-white",
  "border-[color:var(--color-ink)]",
);

const PILL_IDLE_CLASSES = cn(
  "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
  SURFACE_OUTLINE_CLASSES,
);

/**
 * "Outline" active variant — same white fill + ink text as idle,
 * but the soft grey border snaps to ink and stops responding to
 * hover (no more grey ↔ ink flip). Reads as a confirmed
 * selection without the visual weight of the fully-inverted
 * "fill" variant.
 *
 * Used by every pill surface in the app:
 *
 *   - homepage main-feed tabs (Feed, Best Sellers, Hot Deals, …)
 *   - filter-bar pills (Sort by, Category, Price, Size)
 *   - selection chips inside large filter panels
 *
 * The `fill` variant is kept around for the rare CTA pill where
 * a fully-inked selection makes sense, but the storefront's
 * default selectable look is `outline`.
 */
const PILL_OUTLINE_ACTIVE_CLASSES = cn(
  "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
  "border-2 border-[color:var(--color-ink)]",
);

export type PillVariant = "fill" | "outline";

/**
 * Build the className string for a pill in the given state.
 * Default variant is `fill` — the high-contrast main-feed-tab
 * look. Pass `outline` for the softer "selected but not
 * shouting" look used by every search-page filter surface.
 *
 * Call sites still layer extra utilities through
 * `cn(pillClasses(active, …), <extra>)` when they need to
 * override spacing or size for a specific surface.
 */
export function pillClasses(
  active: boolean,
  variant: PillVariant = "fill",
): string {
  const activeClasses =
    variant === "outline" ? PILL_OUTLINE_ACTIVE_CLASSES : PILL_ACTIVE_CLASSES;
  return cn(PILL_BASE_CLASSES, active ? activeClasses : PILL_IDLE_CLASSES);
}
