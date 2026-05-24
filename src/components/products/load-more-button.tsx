"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * "See more" button — pure presentation. The shared visual
 * primitive every "load more" surface composes:
 *
 *   - `<ViewMoreButton>` (URL-driven, refresh-safe) renders this
 *     button and wires `onClick` to a `router.replace` of
 *     `?page=`-incremented URL inside a transition.
 *   - `<RelatedProductsLoader>` (in-place reveal, no URL) renders
 *     this button and wires `onClick` to a server action that
 *     fetches the next batch and appends it to local state.
 *
 * Keeping the look in one component means a polish pass on the
 * spinner / sizing / brand-orange-while-pending behaviour touches
 * one file and every surface tracks. The owners of each variant
 * keep their state machines (URL transition vs. local state) and
 * just hand `onClick` + `isPending` to this primitive.
 *
 * Visual details — same as the legacy `<ViewMoreButton>` so
 * we don't break the muscle memory anyone has with the existing
 * UX:
 *
 *   - `.btn-primary` so the affordance reads as the page's
 *     primary CTA.
 *   - Spinner overlays the label position so the button doesn't
 *     change width while loading — no shift-on-click jitter.
 *   - `aria-busy` (not `disabled`) carries the semantic "loading,
 *     not unavailable" meaning for assistive tech, and the brand
 *     orange stays solid through the pending state to read as
 *     "busy" instead of "broken".
 */

export interface LoadMoreButtonProps {
  onClick: () => void;
  /** While `true`, the button shows a spinner in place of the
   *  label, blocks further clicks, and announces `aria-busy`. */
  isPending: boolean;
  /** Button label (visible at rest). Defaults to `"See more"`. */
  label?: string;
  /** Optional class for the outer centering wrapper. */
  className?: string;
}

export function LoadMoreButton({
  onClick,
  isPending,
  label = "See more",
  className,
}: LoadMoreButtonProps) {
  return (
    <div className={cn("flex justify-center", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-busy={isPending}
        className={cn(
          "btn-primary relative min-w-[160px]",
          /* Brand orange stays solid during the pending state so
           * the affordance reads as "busy", not "broken". The
           * `.btn-primary:disabled` global rule handles the
           * cursor — we only need to override the colour here. */
          "disabled:bg-[color:var(--color-brand)]",
        )}
      >
        {/* Label hides on pending so the spinner can claim the
            center without changing the button's intrinsic width. */}
        <span className={cn(isPending && "invisible")}>{label}</span>
        {isPending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner label="Loading more products" />
          </span>
        )}
      </button>
    </div>
  );
}
