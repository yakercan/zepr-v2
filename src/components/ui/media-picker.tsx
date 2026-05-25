"use client";

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlayBadgeIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Photo + video picker for submit modals.
 *
 * Controlled: caller owns `files`, picker just emits a new array
 * via `onChange`. Inline validation runs at pick time as a UX
 * courtesy — per-type byte cap and a per-batch count cap. The
 * server is always the policy authority; this is just the local
 * filter that avoids round-tripping obviously-invalid picks.
 *
 * Rejection model: a whole batch is rejected on any violation.
 * Easier mental model than partial accepts, and the shopper just
 * adjusts and re-picks.
 *
 * Defaults (matching `submitReviewAction`):
 *   - 5 attachments max
 *   - photos ≤ 10 MB
 *   - videos ≤ 50 MB
 *
 * Override via props when a different surface has different
 * policy (e.g. returns might want 3 photos, no videos).
 */

export interface MediaPickerConfig {
  /** Per-batch attachment cap. Default 5. */
  maxAttachments?: number;
  /** Per-photo byte cap. Default 10 MB. */
  maxPhotoBytes?: number;
  /** Per-video byte cap. Default 50 MB. */
  maxVideoBytes?: number;
  /** Label above the thumbnail row. Default
   *  "Photos & videos (optional)". */
  label?: string;
}

export interface MediaPickerProps extends MediaPickerConfig {
  files: File[];
  onChange: (files: File[]) => void;
  /** Fired with a human-readable error string when a batch is
   *  rejected, so the parent (typically `<MediaFormModal>`) can
   *  surface it in its shared error slot. */
  onError?: (message: string) => void;
  disabled?: boolean;
}

const DEFAULT_MAX_ATTACHMENTS = 5;
const DEFAULT_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const DEFAULT_LABEL = "Photos & videos (optional)";
const FILE_ACCEPT = "image/*,video/*";

export function MediaPicker({
  files,
  onChange,
  onError,
  disabled,
  maxAttachments = DEFAULT_MAX_ATTACHMENTS,
  maxPhotoBytes = DEFAULT_MAX_PHOTO_BYTES,
  maxVideoBytes = DEFAULT_MAX_VIDEO_BYTES,
  label = DEFAULT_LABEL,
}: MediaPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = files.length >= maxAttachments;

  const maxPhotoMb = Math.round(maxPhotoBytes / (1024 * 1024));
  const maxVideoMb = Math.round(maxVideoBytes / (1024 * 1024));

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length === 0) return;

    const oversize = picked.some((file) => {
      const cap = file.type.startsWith("video/")
        ? maxVideoBytes
        : maxPhotoBytes;
      return file.size > cap;
    });
    const overflow = files.length + picked.length > maxAttachments;

    if (oversize || overflow) {
      const issues: string[] = [];
      if (oversize) {
        issues.push(
          `Photos must be under ${maxPhotoMb} MB, videos under ${maxVideoMb} MB.`,
        );
      }
      if (overflow) {
        issues.push(`Only ${maxAttachments} attachments allowed.`);
      }
      onError?.(issues.join(" "));
    } else {
      onChange([...files, ...picked]);
    }

    /* Clear the native input so picking the *same* file again
     * after removal triggers another change event. */
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleRemove = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[color:var(--color-ink)]">
        {label}
      </p>

      {files.length > 0 && (
        /* `my-1` carves an extra hairline above + below the
         *  thumbnail row — above so the protruding remove
         *  badges don't crowd the label, below so they don't
         *  crowd the "Add photo or video" button that follows. */
        <ul className="my-1 flex flex-wrap gap-2">
          {files.map((file, idx) => (
            <li key={`${file.name}-${idx}`} className="relative h-16 w-16">
              <div className="relative h-full w-full overflow-hidden rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)]">
                <MediaThumb file={file} />
              </div>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                /* Pinned tight to the top-right corner — only a
                 *  small straddle (~3 px) so it reads as a badge
                 *  without floating awkwardly far off the tile. */
                className="absolute -right-1 -top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-ink)] text-white transition-colors hover:bg-black disabled:opacity-60"
              >
                <RemoveIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        className={cn(
          "inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--color-ink)] transition-colors hover:border-[color:var(--color-ink)]",
          (disabled || full) &&
            "cursor-default opacity-50 hover:border-[color:var(--color-border-strong)]",
        )}
      >
        <PlusIcon className="h-4 w-4" />
        {full ? "Limit reached" : "Add photo or video"}
        <input
          ref={inputRef}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          onChange={handlePick}
          disabled={disabled || full}
          className="sr-only"
        />
      </label>
      <p className="text-xs text-[color:var(--color-ink-muted)]">
        Photos up to {maxPhotoMb} MB · videos up to {maxVideoMb} MB ·{" "}
        {maxAttachments} attachments max.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thumbnails                                                           */
/* ------------------------------------------------------------------ */

function MediaThumb({ file }: { file: File }) {
  if (file.type.startsWith("video/")) {
    return <VideoThumb file={file} />;
  }
  return <ImageThumb file={file} />;
}

function ImageThumb({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" />
  );
}

/**
 * Local-video thumbnail.
 *
 * Extracts a frame to a `<canvas>`, encodes it as JPEG, and shows
 * the result as a plain `<img>` — sidesteps every blob-URL paint
 * quirk we'd hit by trying to display the `<video>` element
 * directly. The off-DOM `<video>` is torn down as soon as the
 * frame is captured.
 *
 * Seek lands at min(0.5 s, 10 % of duration) so very short clips
 * still skip the often-black opening frame.
 */
function VideoThumb({ file }: { file: File }) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resultUrl: string | null = null;
    let released = false;
    const sourceUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";

    const release = () => {
      if (released) return;
      released = true;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(sourceUrl);
    };

    video.addEventListener(
      "loadedmetadata",
      () => {
        if (cancelled) return;
        video.currentTime = Math.min(0.5, (video.duration || 1) * 0.1);
      },
      { once: true },
    );

    video.addEventListener(
      "seeked",
      () => {
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return release();
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            release();
            if (cancelled || !blob) return;
            resultUrl = URL.createObjectURL(blob);
            setPosterUrl(resultUrl);
          },
          "image/jpeg",
          0.85,
        );
      },
      { once: true },
    );

    video.src = sourceUrl;

    return () => {
      cancelled = true;
      release();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [file]);

  return (
    <>
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt=""
          className="block h-full w-full object-cover"
        />
      ) : (
        <Skeleton
          rounded="none"
          className="pointer-events-none absolute inset-0"
        />
      )}
      {posterUrl && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 text-white"
        >
          <PlayBadgeIcon className="h-6 w-6" />
        </span>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Icons (local — too small + specific to live in `icons.tsx`)         */
/* ------------------------------------------------------------------ */

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function RemoveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  );
}
