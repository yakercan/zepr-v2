import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * "View all →" link — the standard right-aligned bridge from a
 * section header to its full-list destination.
 *
 * One visual primitive shared by every surface that needs a
 * "there's more this way" affordance next to a heading:
 *
 *   - `<ProductSection>` header — opposite the section title.
 *   - `<MainFeedTabs>` — anchor on the right of the tab strip.
 *
 * Keeping the look in one component means the chevron, weight,
 * hover behaviour, and gap stay byte-identical across the app —
 * a polish pass touches one file, and a new surface gets the
 * affordance with `<ViewAllLink href="…" />` instead of
 * re-deriving the classes.
 *
 * Pure presentational: no interactive state of its own, no client
 * code, just a `next/link` with an arrow glyph. Composes inside
 * server or client components without ceremony.
 */

export interface ViewAllLinkProps {
  href: string;
  /** Override the default `"View all"` label — e.g. `"View all
   *  best sellers"` when the surface wants the destination spelled
   *  out, or `"See all results"` on a search-style surface. */
  label?: string;
  className?: string;
}

export function ViewAllLink({
  href,
  label = "View all",
  className,
}: ViewAllLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-sm font-semibold",
        "text-[color:var(--color-ink)] transition-colors",
        "hover:text-[color:var(--color-brand)]",
        className,
      )}
    >
      {label}
      <ArrowRightIcon className="h-4 w-4" />
    </Link>
  );
}
