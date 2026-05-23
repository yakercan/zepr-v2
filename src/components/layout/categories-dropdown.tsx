"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { CategoryLineIcon } from "@/components/layout/category-line-icon";
import { SubcategoryGrid } from "@/components/layout/subcategory-grid";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { CategoriesIcon } from "@/components/ui/icons";
import type { TaxonomyCategory } from "@/types/taxonomy";

/**
 * Categories trigger + dropdown for the header.
 *
 * Trigger chrome depends on the *route*, not on hover state:
 *
 *   - `/category/<handle>` → `[LineIcon] {Name}` (truncated) so
 *     the header reflects where the user actually is.
 *   - Anything else → generic `[CategoriesIcon] Categories`.
 *
 * Client component because we read `usePathname()` and pre-build
 * a per-handle lookup for the trigger. Owning `<SiteHeader>` is a
 * server component that fetches the taxonomy and passes the list
 * down as plain data.
 */
export function CategoriesDropdown({
  categories,
}: {
  categories: readonly TaxonomyCategory[];
}) {
  const pathname = usePathname();

  // Match `/category/<handle>` (with optional trailing segments /
  // query — keeps the trigger active on hypothetical future child
  // routes too). Stops at the next `/` so `?` and trailing slashes
  // resolve to the bare handle.
  const activeHandle = useMemo(() => {
    const m = pathname.match(/^\/category\/([^/?#]+)/);
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
      // 48rem total → left column (locked at 16rem inside the
      // Dropdown) + 32rem of right-column space for the list +
      // its built-in row padding.
      panelClassName="w-[48rem]"
      sidePanelClassName="p-3"
      trigger={
        activeCategory ? (
          <>
            <CategoryLineIcon handle={activeCategory.handle} />
            <span className="max-w-[10rem] truncate text-[15px] font-semibold">
              {activeCategory.name}
            </span>
          </>
        ) : (
          <>
            <CategoriesIcon className="text-[color:var(--color-ink)]" />
            <span className="text-[15px] font-semibold">Categories</span>
          </>
        )
      }
    >
      {categories.map((cat) => (
        <DropdownItem
          key={cat.handle}
          itemKey={cat.handle}
          href={`/category/${cat.handle}`}
          sidePanel={<SubcategoryGrid category={cat} />}
        >
          {cat.name}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
