import Image from "next/image";
import { ZEPR_ICONS, type ZeprIconSrc } from "@/config/icons";
import { cn } from "@/lib/utils";

/**
 * Inline-SVG icons used by the header, cart, PDP. Kept as bare SVGs
 * (not Lucide / heroicons) so the bundle stays a few KB lighter and
 * stroke / fill behavior is fully under our control.
 *
 * All icons accept a `className` and inherit `currentColor`, so
 * recolouring is a one-class change at the call site
 * (`text-ink`, `text-brand`, etc.).
 *
 * Also exports `ZeprIcon` — a thin wrapper around `next/image` for
 * the CDN icons in `config/icons.ts` (fire, shipping, medal, etc.),
 * sharing the same call-site API so the header can mix inline and
 * CDN icons without thinking about it.
 */

type IconProps = {
  className?: string;
  "aria-label"?: string;
};

const DEFAULT_SIZE = "h-5 w-5";

function svgProps(className?: string) {
  return {
    className: cn(DEFAULT_SIZE, "shrink-0", className),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(cn("h-4 w-4", className))}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(cn("h-4 w-4", className))}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(cn("h-4 w-4", className))}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * Filled, soft-edged caret — pointing DOWN by default. Visual
 * weight is heavier than the standard stroke chevrons; reads
 * cleanly at small sizes (8-12 px) where a thin chevron would
 * disappear.
 *
 * Used by the breadcrumb (rotate `-rotate-90` for right) and the
 * product accordion (rotates 180° on `[open]` for the expand
 * indicator).
 *
 * Path copied straight from the legacy zepr `IconSmoothCaret` so
 * the storefront keeps a consistent caret personality across the
 * old site and the new one.
 */
export function SmoothCaretIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      fill="currentColor"
      aria-hidden
      className={cn("h-3 w-3 shrink-0", className)}
    >
      <path d="M846.6 329.7c19.9-17.2 49.9-15 67.1 4.9 15.4 17.9 15.2 44 0.5 61.6l-5.4 5.5-365.3 315.5c-15.9 13.7-38.5 15.2-55.8 4.6l-6.3-4.6-366.1-315.5c-19.9-17.1-22.1-47.2-5-67 15.4-17.9 41.3-21.5 60.8-9.6l6.2 4.6 335.1 288.7 334.2-288.7z" />
    </svg>
  );
}

/** Tick — used as the "selected" indicator in single-select filter
 *  dropdowns (sort options today, future sort/sort-direction lists). */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(cn("h-4 w-4", className))}>
      <path d="m5 12 5 5 9-11" />
    </svg>
  );
}

/** Play triangle — soft-cornered, filled positive shape. The
 *  storefront's universal "play" affordance, used by:
 *
 *    - product card's "this product has a video preview" indicator
 *    - banner slider's autoplay toggle (paired with `<PauseIcon>`)
 *    - any future hover/poster overlay
 *
 *  Drop into a `MEDIA_OVERLAY_BUBBLE_CLASSES` bubble whenever the
 *  surrounding chrome already provides the "disc" — the bubble's
 *  glass and the icon's triangle compose into the same shape the
 *  badge variant draws as one unit, without the second disc-on-disc
 *  stacking that `<PlayBadgeIcon>` is built to avoid. */
export function PlayIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-4 w-4 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M11.2 6.9a1.8 1.8 0 00-2.8 1.5v7.2a1.8 1.8 0 002.8 1.5l5.4-3.6a1.8 1.8 0 000-3l-5.4-3.6z" />
    </svg>
  );
}

/** Play badge — solid disc with the same soft-cornered triangle
 *  cut out using `evenodd` fill rule. The triangle area becomes
 *  transparent, so dropping this over a dark overlay paints the
 *  triangle in whatever the overlay tint is (the legacy
 *  storefront's "video thumbnail" affordance).
 *
 *  Use the disc/triangle pairing — not the bare `<PlayIcon>` —
 *  whenever the play indicator sits on a media tile (gallery
 *  thumbnail, future video card poster) and should read as a
 *  proper "tap to play" affordance with no external chrome around
 *  it. */
export function PlayBadgeIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-5 w-5 shrink-0", className)}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
      />
    </svg>
  );
}

/** Pause — twin vertical bars with soft-rounded ends. Paired with
 *  `<PlayIcon>` in the banner slider's autoplay toggle; the
 *  rounded ends echo the play triangle's soft corners so the two
 *  icons read as the same family when the toggle flips between
 *  them. `<rect rx>` is the cleanest expression of "rounded
 *  rectangle" — no path math required. */
export function PauseIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-4 w-4 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <rect x="6" y="5" width="4" height="14" rx="1.5" />
      <rect x="14" y="5" width="4" height="14" rx="1.5" />
    </svg>
  );
}

/** Long-shaft right arrow — used inside the search bar's submit
 *  button. Stroke-only so it tints with `currentColor` against the
 *  brand-colored background. */
export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(cn("h-4 w-4", className))}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export function CategoriesIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M19.5 13.572 12 21l-7.5-7.428a5 5 0 1 1 7.5-6.566 5 5 0 1 1 7.5 6.566Z" />
    </svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

/** Number of fruit dots the cart can visually display. Anything past
 *  this just keeps showing 4 — the badge text (rendered next to the
 *  icon) is the source of truth for the actual count. */
const CART_MAX_VISIBLE_FRUITS = 4;

/** Static 2x2 layout for the fruit dots inside the cart body. Order
 *  matters: the first slot fills first, so 1 item → bottom-right,
 *  2 → bottom-row, 3 → adds top-right, 4 → fills the grid. */
const CART_FRUIT_POSITIONS = [
  { cx: 63, cy: 52 },
  { cx: 37, cy: 52 },
  { cx: 63, cy: 24 },
  { cx: 37, cy: 24 },
] as const;

export interface CartIconProps extends IconProps {
  /** Cart line-item count. `0` renders a closed-top empty cart;
   *  ≥1 opens the top and drops `min(count, 4)` fruit dots inside. */
  itemCount?: number;
}

/**
 * Shopping cart with up to four orange "fruit" dots inside that scale
 * with the line-item count. Mirrors the symbol the original zepr
 * desktop header uses — the cart body, handle, and wheels render in
 * `currentColor` (so it tints with `text-ink` / hover state), and the
 * fruits use `var(--color-brand)` directly so they're always brand
 * orange regardless of the surrounding text color.
 *
 * Cart top closes (full rounded box) when empty so the icon reads as
 * an obvious "nothing here yet" state; opens (top edge removed) the
 * moment there's at least one item, exposing the fruits inside.
 */
export function CartIcon({ className, itemCount = 0 }: CartIconProps) {
  const safeCount = Math.max(0, Math.floor(itemCount));
  const visibleCount = Math.min(safeCount, CART_MAX_VISIBLE_FRUITS);
  const isEmpty = visibleCount === 0;

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("h-[26px] w-[26px] shrink-0", className)}
      aria-hidden
    >
      {/* Cart body: closed top when empty, open top when filled.
          `round` caps + joins so the open-top variant's free ends
          fan softly (instead of butt-cut squares) and the closed-
          top variant's corners read in the same family as the
          handle / wheels — no stray sharp joints. */}
      <path
        d={
          isEmpty
            ? "M20 25 Q20 20 25 20 L75 20 Q80 20 80 25 L80 65 Q80 70 75 70 L25 70 Q20 70 20 65 Z"
            : "M20 20 L20 65 Q20 70 25 70 L75 70 Q80 70 80 65 L80 20"
        }
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Handle — slight upward tilt off the cart's top-left corner. */}
      <line
        x1="20"
        y1="19"
        x2="5"
        y2="12"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      {/* Wheels */}
      <circle cx="35" cy="88" r="6.5" fill="currentColor" />
      <circle cx="65" cy="88" r="6.5" fill="currentColor" />
      {/* Fruit dots — brand orange, drawn last so they paint above
          the cart body. Count drives `slice`, never overflow. */}
      {CART_FRUIT_POSITIONS.slice(0, visibleCount).map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r="12" fill="var(--color-brand)" />
      ))}
    </svg>
  );
}

/**
 * Cart with a `+` inside the basket — the "add to cart" variant of
 * {@link CartIcon}. Same cart-body geometry as the "filled" state
 * of the header icon (open top, handle, wheels) so the two glyphs
 * read as the same brand object; the contents differ to signal
 * what the surface does:
 *
 *   - `<CartIcon>`     — basket holding fruits (showing count)
 *   - `<CartAddIcon>`  — basket primed to accept a new item
 *
 * Used by the product card's quick-add pill. Every stroke paints
 * in `currentColor`, so the whole glyph follows whatever color the
 * parent button is set to — ink at rest, brand on hover via the
 * `.icon-bubble` utility.
 */
export function CartAddIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("h-[26px] w-[26px] shrink-0", className)}
      aria-hidden
    >
      {/* Cart body — open top, identical to the filled CartIcon
          variant so the two glyphs share a family resemblance.
          `round` caps soften the free ends at the open top. */}
      <path
        d="M20 20 L20 65 Q20 70 25 70 L75 70 Q80 70 80 65 L80 20"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Handle — slight upward tilt off the cart's top-left corner. */}
      <line
        x1="20"
        y1="19"
        x2="5"
        y2="12"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      {/* Wheels */}
      <circle cx="35" cy="88" r="6.5" fill="currentColor" />
      <circle cx="65" cy="88" r="6.5" fill="currentColor" />
      {/* Plus inside the basket — sized to read clearly at the
          product-card scale (h-5/w-5) without crowding the basket
          walls. Sits in the upper third of the basket so it reads
          as "incoming item" rather than centred clutter.
          `currentColor` (rather than a fixed brand orange) so the
          whole glyph — cart outline AND inner plus — tracks the
          parent button's text colour, letting `.icon-bubble` flip
          everything from ink to brand on hover in one stroke. */}
      <line
        x1="50"
        y1="25"
        x2="50"
        y2="55"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <line
        x1="35"
        y1="40"
        x2="65"
        y2="40"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** Three-line "hamburger" — the mobile header's nav trigger. Two
 *  half-length bars stack above a full bar for the slightly more
 *  contemporary "elephant" silhouette; keeps it visually distinct
 *  from a generic kebab or settings glyph. */
export function MenuIcon({ className }: IconProps) {
  /* Lines at y=6, y=12, y=18 (6-unit gap). The mobile header
   * renders this glyph at `h-7 w-7` (28px), where a 6-unit SVG
   * gap reads as ≈7px between line centres on screen — close
   * to the conventional "hamburger" rhythm without looking
   * cramped. Wider spreads (8-unit) felt loose at 28px; this is
   * the sweet spot. */
  return (
    <svg {...svgProps(className)}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

/** "Open in new tab" arrow — used by the tiered-offers companion
 *  card so a shopper can inspect a bundled product without losing
 *  their current cart configuration. */
export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      <path d="M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

/** Info "i" inside a circle — paired with a tooltip on the trust
 *  badges. Outline-only so the hover state can swap the colour
 *  via `currentColor`. */
export function InfoIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M11 12h1v4h1" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(cn("h-4 w-4", className))}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(cn("h-4 w-4", className))}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(cn("h-4 w-4", className))}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

/** Shop Pay wordmark — fixed-aspect brand SVG. Paints in its
 *  native purple (#5A31F4) regardless of `currentColor`; brand
 *  marks shouldn't recolour with the surface around them, the
 *  same way a Visa or PayPal logo wouldn't. Sized by the caller
 *  via `className` (`h-3.5 w-[59px]` matches the height of the
 *  surrounding "Pay in 4 interest-free" caption). */
export function ShopPayLogo({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 99 25"
      aria-label="Shop Pay"
      role="img"
      className={cn("inline-block shrink-0", className)}
    >
      <path
        fill="#5A31F4"
        d="M70.842 7.915h2.25c1.561 0 2.328.642 2.328 1.715 0 1.074-.739 1.715-2.259 1.715h-2.32v-3.43ZM80.525 16.142c-.879 0-1.227-.474-1.227-.948 0-.642.725-.935 2.147-1.102l1.115-.125c-.07 1.227-.892 2.175-2.035 2.175Z"
      />
      <path
        fill="#5A31F4"
        fillRule="evenodd"
        d="M65.645.5a3.64 3.64 0 0 0-3.64 3.64V20.7a3.64 3.64 0 0 0 3.64 3.64h29.668a3.64 3.64 0 0 0 3.64-3.64V4.14A3.64 3.64 0 0 0 95.314.5H65.645Zm5.197 16.674v-4.197h2.64c2.412 0 3.695-1.353 3.695-3.402 0-2.05-1.283-3.277-3.695-3.277h-4.341v10.876h1.7Zm9.334.223c1.297 0 2.147-.572 2.538-1.548.112 1.088.767 1.645 2.189 1.269l.014-1.157c-.572.055-.683-.154-.683-.753v-2.845c0-1.673-1.102-2.663-3.138-2.663-2.008 0-3.165 1.004-3.165 2.705h1.562c0-.809.572-1.297 1.576-1.297 1.06 0 1.547.46 1.534 1.255v.363l-1.8.195c-2.021.223-3.137.99-3.137 2.329 0 1.101.781 2.147 2.51 2.147Zm9.906.32c-.711 1.73-1.855 2.245-3.64 2.245h-.766V18.54h.822c.977 0 1.45-.307 1.966-1.185L85.3 9.923h1.757l2.259 5.424 2.008-5.424h1.715l-2.956 7.795Z"
        clipRule="evenodd"
      />
      <path
        fill="#5A31F4"
        d="M6.992 11.055c-2.359-.509-3.41-.708-3.41-1.612 0-.85.711-1.274 2.134-1.274 1.25 0 2.165.544 2.839 1.61.05.081.155.11.241.066l2.655-1.335a.186.186 0 0 0 .076-.259c-1.102-1.9-3.137-2.94-5.818-2.94C2.188 5.311 0 7.037 0 9.781c0 2.915 2.664 3.651 5.027 4.16 2.362.51 3.417.709 3.417 1.613s-.769 1.33-2.303 1.33c-1.416 0-2.467-.644-3.102-1.896a.186.186 0 0 0-.251-.082L.14 16.21a.188.188 0 0 0-.083.253c1.051 2.102 3.207 3.285 6.087 3.285 3.668 0 5.885-1.698 5.885-4.527 0-2.83-2.677-3.651-5.037-4.16v-.007ZM21.218 5.311c-1.505 0-2.835.531-3.791 1.477-.06.057-.159.015-.159-.067V.687A.185.185 0 0 0 17.081.5h-3.322a.185.185 0 0 0-.187.187v18.73c0 .104.083.186.187.186h3.322a.185.185 0 0 0 .187-.186V11.2c0-1.587 1.223-2.804 2.87-2.804 1.649 0 2.843 1.191 2.843 2.804v8.216c0 .104.082.186.187.186h3.322a.185.185 0 0 0 .187-.186V11.2c0-3.452-2.274-5.89-5.459-5.89ZM33.415 4.774c-1.803 0-3.493.55-4.706 1.343a.186.186 0 0 0-.06.25l1.464 2.488c.054.089.168.12.257.066a5.853 5.853 0 0 1 3.052-.834c2.899 0 5.03 2.036 5.03 4.726 0 2.292-1.706 3.99-3.868 3.99-1.762 0-2.985-1.022-2.985-2.463 0-.825.352-1.502 1.27-1.98a.183.183 0 0 0 .073-.258l-1.381-2.327a.187.187 0 0 0-.226-.079c-1.85.683-3.15 2.327-3.15 4.533 0 3.338 2.67 5.83 6.396 5.83 4.35 0 7.478-3 7.478-7.303 0-4.612-3.64-7.982-8.644-7.982ZM51.776 5.283c-1.68 0-3.182.62-4.277 1.707a.093.093 0 0 1-.16-.066v-1.31a.185.185 0 0 0-.187-.186h-3.235a.185.185 0 0 0-.188.187v18.702c0 .104.083.186.188.186h3.32a.185.185 0 0 0 .188-.186v-6.133c0-.082.099-.123.16-.07 1.091 1.012 2.536 1.603 4.19 1.603 3.897 0 6.936-3.139 6.936-7.217 0-4.078-3.042-7.217-6.935-7.217Zm-.63 11.266c-2.215 0-3.895-1.754-3.895-4.074S48.928 8.4 51.147 8.4c2.22 0 3.893 1.726 3.893 4.075 0 2.348-1.651 4.074-3.896 4.074h.003Z"
      />
    </svg>
  );
}

/** Best Sellers star — solid fill since it reads as a brand mark
 *  rather than a generic icon. Matches the path the original zepr
 *  desktop header uses. */
export function BestSellersIcon({ className }: IconProps) {
  return (
    <svg
      className={cn(DEFAULT_SIZE, "shrink-0", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 1L15.09 7.26L22 8.27L17 13.14L18.18 20.02L12 16.77L5.82 20.02L7 13.14L2 8.27L8.91 7.26L12 1Z" />
    </svg>
  );
}

/** Hot Deals flame — inline so it paints with the rest of the header
 *  instead of late-loading off the CDN. Solid fill, `currentColor` so
 *  the standard nav-link hover (text-brand) tints it orange for free. */
export function FireIcon({ className }: IconProps) {
  return (
    <svg
      className={cn(DEFAULT_SIZE, "shrink-0", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* CDN icon wrapper                                                    */
/* ------------------------------------------------------------------ */

interface ZeprIconProps {
  src: ZeprIconSrc;
  alt?: string;
  size?: number;
  className?: string;
  /** Skip Next's image optimizer — the CDN already serves WebP/PNG
   *  at sensible sizes and the icons are tiny. Lets us bypass the
   *  `remotePatterns` check + edge function for a faster first paint. */
  unoptimized?: boolean;
}

/**
 * Brand glyph icons (Instagram, Facebook, TikTok).
 *
 * Filled, not stroked, because brand logos are designed to be solid
 * shapes — the `fill="currentColor"` channel lets us tint them via
 * `text-…` classes the same way our UI icons inherit the stroke
 * color. They deliberately don't go through `svgProps(...)` because
 * that helper sets `fill="none"` for stroke-based icons.
 *
 * Paths are simplified single-path glyphs sized to a 24×24 viewBox
 * so they line up with the rest of the icon set at the default
 * `h-5 w-5`.
 */
function brandSvgProps(className?: string) {
  return {
    className: cn(DEFAULT_SIZE, "shrink-0", className),
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
  };
}

export function InstagramIcon({ className }: IconProps) {
  /* Meta's official Instagram brand glyph (1000×1000 native
   * viewBox). Inlined from `Instagram_Glyph_Black.svg` so it
   * tints with `currentColor` like the rest of our icon set
   * — the source asset is unfilled (no `fill="…"` on the
   * path), which inherits the SVG element's `fill`, which
   * `brandSvgProps()` sets to `currentColor`.
   *
   * The path carries its own `transform="translate(-2.5 -2.5)"`
   * — the original asset's authoring quirk that nudges the
   * camera silhouette to sit flush against the top-left of
   * its viewBox. Kept verbatim so the glyph renders identical
   * to the asset Meta ships.
   *
   * Default `fill-rule: nonzero` is sufficient here — unlike
   * the simple-icons variant we used before, this path's
   * subpaths wind in opposite directions, so the camera's
   * frame, lens ring, and flash dot read as proper cut-outs
   * without an explicit `fillRule="evenodd"`.
   *
   * ViewBox is expanded to `-30 -30 1060 1060` rather than the
   * source asset's `0 0 1000 1000` so the path lands inside a
   * 30-unit margin on every side. Meta authored the glyph tight
   * to the edges of a 1000-unit box and at our display size
   * (h-5/w-5 = 20px) browser sub-pixel rounding was clipping
   * the bottom row of pixels. The margin gives the renderer
   * room to anti-alias both edges without losing the glyph's
   * centring — viewBox is still square and origin (500, 500)
   * still lines up with the icon's geometric centre. Net
   * effect: the camera reads ~6% smaller in the hover circle,
   * which also gives it a touch more visual breathing room
   * next to the chunkier Facebook / TikTok solids. */
  return (
    <svg {...brandSvgProps(className)} viewBox="-30 -30 1060 1060">
      <path
        transform="translate(-2.5 -2.5)"
        d="M295.42,6c-53.2,2.51-89.53,11-121.29,23.48-32.87,12.81-60.73,30-88.45,57.82S40.89,143,28.17,175.92c-12.31,31.83-20.65,68.19-23,121.42S2.3,367.68,2.56,503.46,3.42,656.26,6,709.6c2.54,53.19,11,89.51,23.48,121.28,12.83,32.87,30,60.72,57.83,88.45S143,964.09,176,976.83c31.8,12.29,68.17,20.67,121.39,23s70.35,2.87,206.09,2.61,152.83-.86,206.16-3.39S799.1,988,830.88,975.58c32.87-12.86,60.74-30,88.45-57.84S964.1,862,976.81,829.06c12.32-31.8,20.69-68.17,23-121.35,2.33-53.37,2.88-70.41,2.62-206.17s-.87-152.78-3.4-206.1-11-89.53-23.47-121.32c-12.85-32.87-30-60.7-57.82-88.45S862,40.87,829.07,28.19c-31.82-12.31-68.17-20.7-121.39-23S637.33,2.3,501.54,2.56,348.75,3.4,295.42,6m5.84,903.88c-48.75-2.12-75.22-10.22-92.86-17-23.36-9-40-19.88-57.58-37.29s-28.38-34.11-37.5-57.42c-6.85-17.64-15.1-44.08-17.38-92.83-2.48-52.69-3-68.51-3.29-202s.22-149.29,2.53-202c2.08-48.71,10.23-75.21,17-92.84,9-23.39,19.84-40,37.29-57.57s34.1-28.39,57.43-37.51c17.62-6.88,44.06-15.06,92.79-17.38,52.73-2.5,68.53-3,202-3.29s149.31.21,202.06,2.53c48.71,2.12,75.22,10.19,92.83,17,23.37,9,40,19.81,57.57,37.29s28.4,34.07,37.52,57.45c6.89,17.57,15.07,44,17.37,92.76,2.51,52.73,3.08,68.54,3.32,202s-.23,149.31-2.54,202c-2.13,48.75-10.21,75.23-17,92.89-9,23.35-19.85,40-37.31,57.56s-34.09,28.38-57.43,37.5c-17.6,6.87-44.07,15.07-92.76,17.39-52.73,2.48-68.53,3-202.05,3.29s-149.27-.25-202-2.53m407.6-674.61a60,60,0,1,0,59.88-60.1,60,60,0,0,0-59.88,60.1M245.77,503c.28,141.8,115.44,256.49,257.21,256.22S759.52,643.8,759.25,502,643.79,245.48,502,245.76,245.5,361.22,245.77,503m90.06-.18a166.67,166.67,0,1,1,167,166.34,166.65,166.65,0,0,1-167-166.34"
      />
    </svg>
  );
}

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg {...brandSvgProps(className)}>
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
    </svg>
  );
}

export function TikTokIcon({ className }: IconProps) {
  return (
    <svg {...brandSvgProps(className)}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.85a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.28z" />
    </svg>
  );
}

export function ZeprIcon({
  src,
  alt = "",
  size = 20,
  className,
  unoptimized = true,
}: ZeprIconProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      unoptimized={unoptimized}
    />
  );
}

export { ZEPR_ICONS };
