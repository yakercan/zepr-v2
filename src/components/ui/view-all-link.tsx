import Link from "next/link";
import type { MouseEventHandler } from "react";

import { ArrowRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * "View all →" affordance — the standard right-aligned bridge
 * from a section header to "see more this way."
 *
 * One visual primitive shared by every surface that needs that
 * affordance:
 *
 *   - `<ProductSection>` header — opposite the section title.
 *   - `<MainFeedTabs>` — anchor on the right of the tab strip.
 *   - Account dashboard cards — "Edit", "Manage" entry points
 *     into sub-pages.
 *   - `<VariantPicker>` Size row — "View guide" trigger for the
 *     size chart modal.
 *
 * Polymorphic by trigger type:
 *
 *   - Pass `href` → renders a `next/link` for in-app navigation.
 *   - Pass `onClick` → renders a `<button>` for in-page actions
 *     (open a modal, toggle a drawer, etc.).
 *
 * Exactly one of the two is required; the discriminated union
 * keeps the API honest at the type level. Visual styling is
 * identical between the two branches so the affordance reads
 * the same whether it leads to a route or to an overlay — a
 * polish pass touches one file, and a new surface gets the
 * affordance with `<ViewAllLink … />` instead of re-deriving
 * the classes.
 *
 * Pure presentational — no interactive state of its own.
 */

const VIEW_ALL_CLASSES =
  "inline-flex shrink-0 items-center gap-1 text-sm font-semibold " +
  "text-[color:var(--color-ink)] transition-colors " +
  "hover:text-[color:var(--color-brand)]";

interface ViewAllLinkBaseProps {
  /** Override the default `"View all"` label — e.g. `"Manage"`,
   *  `"Edit"`, `"View guide"`. */
  label?: string;
  className?: string;
}

type ViewAllLinkHrefProps = ViewAllLinkBaseProps & {
  href: string;
  onClick?: never;
  type?: never;
};

type ViewAllLinkButtonProps = ViewAllLinkBaseProps & {
  href?: never;
  onClick: MouseEventHandler<HTMLButtonElement>;
  /** Defaults to `"button"` — pass `"submit"` only when the
   *  affordance genuinely participates in a form. */
  type?: "button" | "submit";
};

export type ViewAllLinkProps = ViewAllLinkHrefProps | ViewAllLinkButtonProps;

export function ViewAllLink({
  label = "View all",
  className,
  ...rest
}: ViewAllLinkProps) {
  const merged = cn(VIEW_ALL_CLASSES, className);

  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link href={rest.href} className={merged}>
        {label}
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button
      type={rest.type ?? "button"}
      onClick={rest.onClick}
      className={merged}
    >
      {label}
      <ArrowRightIcon className="h-4 w-4" />
    </button>
  );
}
