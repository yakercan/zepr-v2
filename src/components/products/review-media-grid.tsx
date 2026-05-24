"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  MediaLightbox,
  type LightboxMediaItem,
} from "@/components/products/media-lightbox";
import { PlayBadgeIcon } from "@/components/ui/icons";
import type { ReviewMedia } from "@/lib/reviews/media";
import { cn } from "@/lib/utils";

/**
 * Photo / video strip for a single review row.
 *
 * Visual language matches `<ProductGallery>`'s thumbnail rail —
 * same 64×64 footprint, same 2px hairline border + hover-to-ink,
 * same focus ring. Video attachments get the gallery's exact
 * play-badge overlay (`bg-black/30` scrim + `<PlayBadgeIcon>`).
 * Two surfaces, one visual vocabulary.
 *
 * Click any thumb → opens the shared `<MediaLightbox>` (an
 * external primitive at `media-lightbox.tsx`) at that index.
 * The lightbox handles arrow navigation, Escape close, body-
 * scroll lock, and the click-outside-to-close model for both
 * images and videos.
 *
 * Client island scoped to ONE review row — `<ProductReviews>`
 * stays a server component and only the rows that actually have
 * attached media pay the JS cost.
 *
 * Returns `null` for empty / undefined `media` so the call site
 * stays a one-line render.
 */

export interface ReviewMediaGridProps {
  media?: ReadonlyArray<ReviewMedia>;
  /** Used as the `alt` prefix on each thumb + lightbox item
   *  (typically the review title, or `"Review by …"`). */
  altPrefix: string;
}

export function ReviewMediaGrid({ media, altPrefix }: ReviewMediaGridProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  /* Pre-build the lightbox payload once per render. Stable
   * across re-renders unless the media list itself changes,
   * which means the lightbox's `initialIndex` prop sync sees
   * a single steady-state array rather than a new identity
   * every tick. */
  const lightboxItems = useMemo<LightboxMediaItem[]>(
    () => (media ?? []).map((m, i) => toLightboxItem(m, altPrefix, i, media!.length)),
    [media, altPrefix],
  );

  if (!media || media.length === 0) return null;

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {media.map((item, i) => (
          <li key={item.url}>
            <ThumbButton
              item={item}
              index={i}
              total={media.length}
              altPrefix={altPrefix}
              onClick={() => setActiveIndex(i)}
            />
          </li>
        ))}
      </ul>

      <MediaLightbox
        media={lightboxItems}
        open={activeIndex !== null}
        initialIndex={activeIndex ?? 0}
        onClose={() => setActiveIndex(null)}
      />
    </>
  );
}

/* ---------- internal ---------- */

function ThumbButton({
  item,
  index,
  total,
  altPrefix,
  onClick,
}: {
  item: ReviewMedia;
  index: number;
  total: number;
  altPrefix: string;
  onClick: () => void;
}) {
  const label = `${altPrefix} — ${item.kind === "video" ? "video" : "photo"} ${index + 1} of ${total}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${item.kind === "video" ? "video" : "photo"} ${index + 1} of ${total}`}
      className={cn(
        // Exact `<ProductGallery>` thumb chrome — 64px square,
        // 2px hairline border, hover-to-ink, focus ring offset
        // off the surface. Keeps both surfaces visually identical.
        "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg",
        "border-2 border-[color:var(--color-border-strong)] transition-colors duration-150",
        "hover:border-[color:var(--color-ink)]",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-[color:var(--color-ink)] focus-visible:ring-offset-2",
      )}
    >
      {item.kind === "image" ? (
        <Image
          src={item.url}
          alt={label}
          fill
          sizes="64px"
          className="object-cover"
        />
      ) : (
        // Native video element with `preload="metadata"` so the
        // browser shows the first frame as the thumbnail without
        // downloading the full file. `muted` + `playsInline` keep
        // mobile browsers from auto-promoting it to fullscreen.
        <video
          src={item.url}
          preload="metadata"
          muted
          playsInline
          aria-label={label}
          className="h-full w-full object-cover"
        />
      )}

      {item.kind === "video" && (
        // Identical to `<ProductGallery>`'s video badge: dark
        // scrim + filled white play disc.
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-black/30 text-white"
        >
          <PlayBadgeIcon className="h-8 w-8" />
        </span>
      )}
    </button>
  );
}

function toLightboxItem(
  m: ReviewMedia,
  altPrefix: string,
  index: number,
  total: number,
): LightboxMediaItem {
  const alt = `${altPrefix} — ${m.kind === "video" ? "video" : "photo"} ${index + 1} of ${total}`;
  if (m.kind === "image") {
    return { kind: "image", url: m.url, alt };
  }
  return {
    kind: "video",
    sources: [{ url: m.url, mimeType: m.mimeType ?? "video/mp4" }],
    alt,
  };
}
