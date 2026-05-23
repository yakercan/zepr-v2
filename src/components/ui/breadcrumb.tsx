import Link from "next/link";
import { SmoothCaretIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Generic breadcrumb trail.
 *
 * Visual language ported from the legacy zepr storefront — small
 * (13 px) muted links, a filled smooth caret between segments,
 * and the final crumb rendered as ink-dark, semi-bold,
 * non-linked text (it's "you are here", not a navigation
 * target).
 *
 * Behaviour:
 *
 *   - Any item with an `href` renders as a `<Link>` and hovers
 *     from `ink-muted` → `ink`.
 *   - Items without `href` render as plain `<span>`s.
 *   - The last item is *always* treated as the "you are here"
 *     crumb regardless of whether an `href` was passed.
 *   - Trail never wraps to a new row — the last crumb takes the
 *     remaining width with `flex-1` + `truncate`, so very long
 *     product titles ellipsize cleanly inside the row. Earlier
 *     crumbs (Home, Category, Subcategory) stay at their natural
 *     width via `shrink-0`.
 */

export interface BreadcrumbItem {
  label: string;
  /** Omitted for the "you are here" item. The last item is
   *  treated as non-linked regardless of this field. */
  href?: string;
}

export interface BreadcrumbProps {
  items: ReadonlyArray<BreadcrumbItem>;
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center text-[13px] leading-tight",
        "text-[color:var(--color-ink-muted)]",
        className,
      )}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <div
            key={`${item.label}-${i}`}
            className={cn(
              "inline-flex items-center",
              // Earlier crumbs stay at natural width; the last
              // crumb takes whatever's left and truncates inside
              // it. `min-w-0` is the magic that lets a flex child
              // shrink below its content's intrinsic width and
              // actually engage the ellipsis.
              isLast ? "min-w-0 flex-1" : "shrink-0",
            )}
          >
            {i > 0 && (
              <SmoothCaretIcon
                className="mx-2 h-2.5 w-2.5 -rotate-90 text-[color:var(--color-ink-muted)]"
              />
            )}
            {isLast || !item.href ? (
              <span
                aria-current={isLast ? "page" : undefined}
                className={cn(
                  "py-1",
                  isLast &&
                    "min-w-0 truncate font-semibold text-[color:var(--color-ink)]",
                )}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="py-1 transition-colors hover:text-[color:var(--color-ink)]"
              >
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
