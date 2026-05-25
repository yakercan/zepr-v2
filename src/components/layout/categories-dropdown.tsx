"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { CategoryLineIcon } from "@/components/layout/category-line-icon";
import { SubcategoryGrid } from "@/components/layout/subcategory-grid";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Categories trigger + dropdown for the header.
 *
 * Trigger chrome depends on the *route*:
 *
 *   - `/categories/<handle>` → `[LineIcon] {Name}` (truncated) so
 *     the header reflects where the user actually is.
 *   - Anything else → bare `Categories` text. The generic four-
 *     square glyph that used to sit here was dropped because it
 *     competed with the wordmark + Favorites label for the eye's
 *     first pass; the dropdown's chevron alone is enough trigger
 *     affordance.
 *
 * Intentionally static: the trigger swaps between the two states
 * on navigation without any width / opacity transition. The
 * earlier animated version added complexity (sticky handles, slot
 * animators, custom `<img>` fade-ins) without delivering a clean
 * slide — the navigation itself is the transition.
 *
 * Client component because we read `usePathname()` to derive the
 * active category. Owning `<SiteHeader>` is a server component
 * that fetches the taxonomy and passes the list down as plain
 * data.
 */
export function CategoriesDropdown({
  categories,
}: {
  categories: readonly TaxonomyCategory[];
}) {
  const pathname = usePathname();

  // Match `/categories/<handle>` (with optional trailing segments /
  // query). Stops at the next `/` so trailing slashes resolve to
  // the bare handle.
  const activeHandle = useMemo(() => {
    const m = pathname.match(/^\/categories\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }, [pathname]);

  const activeCategory = useMemo(
    () =>
      activeHandle
        ? categories.find((c) => c.handle === activeHandle)
        : undefined,
    [activeHandle, categories],
  );

  return (
    <Dropdown
      sideMode
      panelClassName="w-[48rem]"
      trigger={
        activeCategory ? (
          <>
            <CategoryLineIcon handle={activeCategory.handle} />
            <span className="max-w-[10rem] truncate text-[15px] font-semibold">
              {activeCategory.name}
            </span>
          </>
        ) : (
          <span className="text-[15px] font-semibold">Categories</span>
        )
      }
    >
      {categories.map((cat) => (
        <DropdownItem
          key={cat.handle}
          itemKey={cat.handle}
          href={`/categories/${cat.handle}`}
          sidePanel={<SubcategoryGrid category={cat} />}
        >
          {cat.name}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
