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

export function CartIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6 6h15l-1.7 9.5a2 2 0 0 1-2 1.6h-9.2a2 2 0 0 1-2-1.6L3.5 3.6A1 1 0 0 0 2.5 3H1" />
      <circle cx="10" cy="20.5" r="1.4" />
      <circle cx="18" cy="20.5" r="1.4" />
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
