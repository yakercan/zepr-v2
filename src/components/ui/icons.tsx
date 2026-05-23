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

/** Play / Pause — used by the banner slider's autoplay toggle AND
 *  by the product card's "this product has a video preview"
 *  indicator (in a dark overlay bubble). Solid-fill variant so the
 *  triangle reads cleanly at the small (≈14px) sizes both surfaces
 *  use. */
export function PlayIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-4 w-4 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-4 w-4 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
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
