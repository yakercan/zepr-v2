import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * App-style back affordance.
 *
 * A quiet `← Label` link rendered at the top of a sub-page so the
 * shopper always knows where they are in the navigation stack —
 * the same posture iOS / Android use for "this is one level deep,
 * tap to pop". Unlike the browser's history back, this link has a
 * stable destination (`href`) so a deep-link from an email or a
 * shared URL still lands the shopper in a useful place.
 *
 * Visual contract:
 *
 *   - Resting state is ink-secondary — present but not loud,
 *     because navigation chrome shouldn't compete with the page
 *     title beneath it.
 *   - Hover slides to ink (the strongest reading colour) instead
 *     of brand, because back-nav is structural, not an action;
 *     calling it out in brand-orange overpromises.
 *   - Compact size and tight gap match how Mail / Settings on iOS
 *     render their back chevrons — recognisable without needing a
 *     label of explanation.
 */
export interface BackLinkProps {
  /** Destination href — always provide one explicitly rather than
   *  using `router.back()`, so deep-links from emails or shares
   *  don't return the user to whatever was on their stack before. */
  href: string;
  /** Short label naming the destination, e.g. `"My Account"`. */
  label: string;
  className?: string;
}

export function BackLink({ href, label, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium",
        "text-[color:var(--color-ink-secondary)]",
        "transition-colors hover:text-[color:var(--color-ink)]",
        className,
      )}
    >
      <ChevronLeftIcon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}
