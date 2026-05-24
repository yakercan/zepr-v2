"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * Photo strip for a single review row.
 *
 * Square thumbnails sized to the storefront's image rhythm
 * (`h-20 w-20`, `object-cover`) — every review with attached
 * media reads as a consistent row, regardless of original
 * aspect ratio. Clicking a thumb opens the shared `<Modal>`
 * primitive at the `preview` layer with the full-size image
 * fitted to the viewport (`max-h-[80vh]`, `object-contain` so
 * portrait + landscape photos both render without crop). Arrow
 * keys + the prev/next buttons walk through the rest of the
 * review's photos without closing the lightbox between clicks.
 *
 * Client island scoped to ONE review row. `<ProductReviews>`
 * stays a server component — only the rows that actually have
 * attached media pay the JS cost.
 *
 * Returns `null` for empty / undefined `images` so callers can
 * drop the component in without guarding.
 */

export interface ReviewMediaGridProps {
  images?: ReadonlyArray<string>;
  /** Used for `alt` text on the thumbnails + the lightbox image
   *  (e.g. the review title, or the product name as a fallback). */
  altPrefix: string;
}

export function ReviewMediaGrid({ images, altPrefix }: ReviewMediaGridProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  /* Keyboard navigation while the lightbox is open. Wired
   * directly on `window` (NOT inside the modal) because the
   * modal portal lives outside this component's subtree and
   * onKeyDown on a `<div>` only fires when that div has
   * focus — flaky for image carousels. */
  useEffect(() => {
    if (activeIndex === null || !images || images.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((i) => (i === null ? 0 : (i + 1) % images.length));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((i) =>
          i === null ? 0 : (i - 1 + images.length) % images.length,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, images]);

  const close = useCallback(() => setActiveIndex(null), []);

  if (!images || images.length === 0) return null;

  const open = activeIndex !== null;
  const activeUrl = open ? images[activeIndex] : null;
  const canStep = images.length > 1;

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {images.map((url, i) => (
          <li key={url}>
            <button
              type="button"
              onClick={() => setActiveIndex(i)}
              className={cn(
                "relative block h-20 w-20 overflow-hidden rounded-lg border border-[color:var(--color-border)]",
                "transition-colors hover:border-[color:var(--color-ink)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)] focus-visible:ring-offset-1",
              )}
              aria-label={`Open photo ${i + 1} of ${images.length}`}
            >
              <Image
                src={url}
                alt={`${altPrefix} — photo ${i + 1}`}
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={open}
        onClose={close}
        layer="preview"
        ariaLabel={`${altPrefix} — photo ${
          activeIndex !== null ? activeIndex + 1 : 1
        } of ${images.length}`}
        className="max-w-3xl bg-transparent border-0 shadow-none"
      >
        {activeUrl && (
          <div className="relative flex items-center justify-center">
            {/* Plain <img> for the full-size lightbox — Next/Image
             *  needs intrinsic dimensions or a sized parent to
             *  avoid layout shift, and user-uploaded photos
             *  arrive at unknown aspect ratios. The browser
             *  handles ratio naturally; we cap the box so neither
             *  axis overruns the viewport. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeUrl}
              alt={`${altPrefix} — photo ${(activeIndex ?? 0) + 1} of ${images.length}`}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
            />

            {canStep && (
              <>
                <ArrowButton
                  side="left"
                  onClick={() =>
                    setActiveIndex(
                      (i) =>
                        i === null
                          ? 0
                          : (i - 1 + images.length) % images.length,
                    )
                  }
                />
                <ArrowButton
                  side="right"
                  onClick={() =>
                    setActiveIndex((i) =>
                      i === null ? 0 : (i + 1) % images.length,
                    )
                  }
                />
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                  {(activeIndex ?? 0) + 1} / {images.length}
                </span>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function ArrowButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2",
        side === "left" ? "left-2" : "right-2",
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white",
        "transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className={cn("h-4 w-4 fill-none stroke-current", side === "right" && "rotate-180")}
      >
        <path d="M10 3L5 8l5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
