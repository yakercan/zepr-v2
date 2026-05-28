"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Edge-to-edge horizontally scrollable row on mobile, wrapping
 * flex row on desktop. The storefront's standard "pill strip"
 * primitive — used by feed tabs, search filters, and anywhere
 * else a row of compact chips needs to flex between the two
 * breakpoints.
 *
 * # Behaviour
 *
 *   - **Desktop** (`data-device="desktop"`): regular
 *     `flex flex-wrap items-center gap-2` row. The optional
 *     `trailing` slot lands on the right via `ml-auto` and drops
 *     to a new line cleanly when the pills wrap.
 *   - **Mobile** (`data-device="mobile"`): single-row scroller
 *     that *bleeds out of the page-container's gutter* so the
 *     scroll track touches the screen edges. First / last items
 *     still align with the content above and below via inner
 *     padding equal to the gutter. `scrollbar-hide` removes the
 *     visible track; `overscroll-behavior-x: contain` keeps the
 *     browser back-swipe gesture from hijacking horizontal pans.
 *
 * # Why the trailing slot is hidden on mobile
 *
 * A right-anchored "View all →" link gets lost the moment the
 * row scrolls — the user has to scroll past every pill just to
 * find it. The scroll itself is the discovery affordance on
 * mobile, so the slot collapses. The desktop branch keeps it as
 * the conventional bridge to the full result page.
 *
 * # Bleed math
 *
 * The page-container reserves `var(--page-gutter-px)` of inline
 * padding (24px). On mobile we set `-mx-[var(--page-gutter-px)]`
 * to escape it, then add a matching `px-[var(--page-gutter-px)]`
 * inside the scroll container so the first / last items sit
 * exactly where the rest of the page's content starts. Net
 * effect: the scroll track is full-bleed, the *content* aligns.
 *
 * # Smooth centering (`activeKey`)
 *
 * Set `activeKey` and tag the descendant that represents that
 * key with `data-scroll-row-key="<same value>"`. Whenever
 * `activeKey` changes, the matching element is centred in the
 * scroll viewport.
 *
 * The first run uses *instant* scroll — deep-linking
 * `/?tab=hot_deals` and refresh-restoring the active tab both
 * settle without a visible animation on load. Every change
 * after that animates smoothly. Desktop is automatically a
 * no-op: the row doesn't overflow, so we skip the call rather
 * than letting `scrollIntoView` bubble up and scroll the page.
 *
 * # API
 *
 * `<ScrollRow trailing={…} activeKey={…}>{children}</ScrollRow>`
 * — pass any standard `<div>` props (role, aria-label, ref)
 * through. Ref is accepted as a regular prop (React 19's
 * forwardRef-free pattern), which keeps consumers like
 * `<SearchFilters>`'s outside-click exclusion ref working
 * without ceremony.
 */
export interface ScrollRowProps extends HTMLAttributes<HTMLDivElement> {
  trailing?: ReactNode;
  ref?: Ref<HTMLDivElement>;
  /** Stable identifier for the currently active child. Pair
   *  with `data-scroll-row-key` on a descendant of the row. */
  activeKey?: string | number | null;
}

export function ScrollRow({
  children,
  trailing,
  className,
  ref,
  activeKey,
  ...rest
}: ScrollRowProps) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether we've already done the initial center. Mount
  // / first-paint should snap instantly (no startup animation);
  // every subsequent activeKey change animates.
  const animatedOnceRef = useRef(false);

  // Compose external ref (if any) with our internal scroll-target
  // ref. Supports both callback refs and object refs so consumers
  // can drop in whatever shape they have without adapter code.
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as { current: HTMLDivElement | null }).current = node;
      }
    },
    [ref],
  );

  useEffect(() => {
    if (activeKey == null) return;
    const root = innerRef.current;
    if (!root) return;

    const target = root.querySelector<HTMLElement>(
      `[data-scroll-row-key="${CSS.escape(String(activeKey))}"]`,
    );
    if (!target) return;

    // Desktop layout doesn't overflow → scrollIntoView would
    // bubble up and scroll the page. Bail out instead.
    if (root.scrollWidth <= root.clientWidth) return;

    target.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: animatedOnceRef.current ? "smooth" : "instant",
    });
    animatedOnceRef.current = true;
  }, [activeKey]);

  return (
    <div
      ref={setRef}
      {...rest}
      className={cn(
        /* Desktop default — same wrap behaviour the row had
         * before this primitive existed. */
        "flex flex-wrap items-center gap-2",
        /* Mobile override — full-bleed single-row scroller. */
        "touch:-mx-[var(--page-gutter-px)] touch:flex-nowrap",
        "touch:overflow-x-auto touch:overscroll-x-contain touch:scrollbar-hide",
        "touch:px-[var(--page-gutter-px)]",
        /* Belt-and-braces: force every direct child to refuse
         * shrinking on the mobile scroller. Pills already opt in
         * via `pillClasses`, but consumers like skeleton rows
         * (which compose `<Skeleton>` placeholders directly) and
         * any future caller that forgets `shrink-0` would
         * otherwise collapse under flex's default `shrink: 1` and
         * pancake their content. */
        "touch:[&>*]:shrink-0",
        className,
      )}
    >
      {children}
      {trailing && (
        /* `ml-auto` pushes the slot to the right on desktop and
         * naturally drops to a new flex line if the pills wrap.
         * Hidden entirely on mobile (see component doc). */
        <div className="ml-auto touch:hidden">{trailing}</div>
      )}
    </div>
  );
}
