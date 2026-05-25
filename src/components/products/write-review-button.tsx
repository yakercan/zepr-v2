"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";

import { submitReviewAction } from "@/app/products/[handle]/reviews/actions";
import { PlayBadgeIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * "Write a review" CTA + the submit modal.
 *
 * Lives behind the disabled-stub button in `product-reviews.tsx`
 * (which has now been swapped for this client component). Stays
 * a single file because the button and the modal share state
 * (the modal's "open" flag) and split cleanly into one
 * concern — the rest of the review surface stays server-rendered.
 *
 * Submission strategy:
 *
 *   - Custom submit handler + `useTransition` rather than
 *     `useActionState` / form action binding. The media picker
 *     keeps its own `File[]` state (FileList is read-only, so
 *     letting the native input own it would mean re-binding a
 *     `DataTransfer` every change), and the form needs to surface
 *     pending + error state from the picker callbacks too. One
 *     submit handler that builds `FormData` from React state at
 *     the moment of submit is the simplest model — server action
 *     stays formData-shaped, client stays controlled.
 *
 *   - On success: close the modal, kick `router.refresh()` so the
 *     PDP picks up the new review row (the server action has
 *     already called `revalidateTag` on the matching cache tag),
 *     then reset the form after the close animation has run.
 *
 *   - On error: surface inline; keep the form filled so the
 *     shopper can adjust without retyping.
 */

const MAX_ATTACHMENTS = 5;
const MAX_BODY = 1500;
/* Per-file size caps mirror `submitReviewAction` exactly — the
 * server is the source of truth, but we surface the same limits
 * here so oversized picks get caught locally (no upload round-
 * trip, no 413). */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_PHOTO_MB = Math.round(MAX_PHOTO_BYTES / (1024 * 1024));
const MAX_VIDEO_MB = Math.round(MAX_VIDEO_BYTES / (1024 * 1024));
/* Headline-shape caps — match the conventions e-commerce review
 * systems converge on (Yotpo / Loox / Amazon all land in this
 * range). Long enough that no real shopper hits the limit
 * naturally, short enough that the public review card stays
 * scannable. Display name lands in the "real-name" range —
 * anything longer is almost always a handle or a free-form
 * comment that doesn't belong in the byline. */
const MAX_TITLE = 80;
const MAX_NICKNAME = 40;

/* Browser-level `accept` filter. Server-side validation in
 * `submitReviewAction` is the source of truth (strict MIME
 * allowlist + per-file size cap); this is just the hint that
 * makes the OS picker default to the right file types. */
const FILE_ACCEPT = "image/*,video/*";

export interface WriteReviewButtonProps {
  productId: string;
  productHandle: string;
  /** Pre-fill for the nickname input — the shopper's first name
   *  from the session, where present. Editable; defaults to
   *  "Anonymous" if nothing's saved on the account. */
  defaultNickname?: string;
}

export function WriteReviewButton({
  productId,
  productHandle,
  defaultNickname,
}: WriteReviewButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary self-start"
      >
        Write a review
      </button>
      <ReviewFormModal
        open={open}
        onClose={() => setOpen(false)}
        productId={productId}
        productHandle={productHandle}
        defaultNickname={defaultNickname}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */

function ReviewFormModal({
  open,
  onClose,
  productId,
  productHandle,
  defaultNickname,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productHandle: string;
  defaultNickname?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /* Default to a five-star pick. Shoppers writing a review
   * skew positive — the average sits north of 4.5 across
   * almost every category — so prefilling the maximum saves
   * the happy path one extra tap and keeps the action's
   * `rating >= 1` gate satisfied from the first render. */
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  /* Seed the nickname from the session-derived default. The
   * prop is stable for the lifetime of the PDP render (the auth
   * projection re-resolves on navigation, not mid-session), so
   * `useState` with an initial value is enough — no effect
   * needed to re-sync. The reset path below also goes back to
   * this same default. */
  const [nickname, setNickname] = useState(defaultNickname ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setError(null);
    setRating(5);
    setTitle("");
    setBody("");
    setNickname(defaultNickname ?? "");
    setFiles([]);
  }, [defaultNickname]);

  const handleClose = useCallback(() => {
    if (pending) return;
    onClose();
    /* Wait for the close animation (~150 ms) before wiping the
     * form so the shopper doesn't see the fields blank out
     * mid-fade. */
    setTimeout(resetForm, 200);
  }, [pending, onClose, resetForm]);

  const handleFilesPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length === 0) return;

    /* Two reasons we'd reject a pick: any file in the batch is over
     * its per-type size cap, or the batch would push us past
     * `MAX_ATTACHMENTS`. Either way we reject the whole pick rather
     * than partially staging it — easier mental model for the
     * shopper than guessing which files made it through. */
    const oversize = picked.some((file) => {
      const cap = file.type.startsWith("video/")
        ? MAX_VIDEO_BYTES
        : MAX_PHOTO_BYTES;
      return file.size > cap;
    });
    const overflow = files.length + picked.length > MAX_ATTACHMENTS;

    if (oversize || overflow) {
      const issues: string[] = [];
      if (oversize) {
        issues.push(
          `Photos must be under ${MAX_PHOTO_MB} MB, videos under ${MAX_VIDEO_MB} MB.`,
        );
      }
      if (overflow) {
        issues.push(`Only ${MAX_ATTACHMENTS} attachments allowed.`);
      }
      setError(issues.join(" "));
    } else {
      setFiles((prev) => [...prev, ...picked]);
    }

    /* Clear the native input so picking the *same* file again
     * after removal triggers another change event. */
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    /* Lightweight client-side guards — server re-validates. */
    if (rating < 1) {
      setError("Please pick a rating.");
      return;
    }
    if (body.trim().length === 0) {
      setError("Please write your review before posting.");
      return;
    }
    if (nickname.trim().length === 0) {
      setError("Please add a display name.");
      return;
    }

    const formData = new FormData();
    formData.set("rating", String(rating));
    formData.set("title", title);
    formData.set("body", body);
    formData.set("nickname", nickname);
    for (const file of files) {
      formData.append("media", file);
    }

    setError(null);
    startTransition(async () => {
      const result = await submitReviewAction(
        { productId, productHandle },
        formData,
      );
      if (result.ok) {
        onClose();
        /* `router.refresh()` re-runs the PDP server component
         * tree; the cache tag invalidation in the action means
         * the review fetch returns the new page (including the
         * just-posted row). */
        router.refresh();
        setTimeout(resetForm, 200);
      } else {
        setError(result.error);
      }
    });
  };

  const attachmentsFull = files.length >= MAX_ATTACHMENTS;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      layer="base"
      title="Write a review"
      ariaLabel="Write a review"
      className="max-w-xl"
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 p-5 md:p-6"
        noValidate
      >
        <StarPicker value={rating} onChange={setRating} disabled={pending} />

        <Field label="Title (optional)">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, MAX_TITLE))}
            maxLength={MAX_TITLE}
            disabled={pending}
            placeholder="Game changer!"
            className={INPUT_CLASSES}
          />
          <CharCount value={title.length} max={MAX_TITLE} />
        </Field>

        <Field label="Your review">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, MAX_BODY))}
            rows={4}
            disabled={pending}
            placeholder="What did you love? What could be better?"
            className={cn(INPUT_CLASSES, "resize-none")}
            required
          />
          <CharCount value={body.length} max={MAX_BODY} />
        </Field>

        <Field label="Display name">
          <input
            type="text"
            value={nickname}
            onChange={(event) =>
              setNickname(event.target.value.slice(0, MAX_NICKNAME))
            }
            maxLength={MAX_NICKNAME}
            disabled={pending}
            placeholder="How should we show your name?"
            className={INPUT_CLASSES}
            required
          />
          <CharCount value={nickname.length} max={MAX_NICKNAME} />
        </Field>

        <MediaPicker
          files={files}
          onChange={handleFilesPicked}
          onRemove={handleRemoveFile}
          full={attachmentsFull}
          disabled={pending}
          inputRef={fileInputRef}
        />

        {error && (
          <p
            role="alert"
            className="rounded-md bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger)]"
          >
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="text-sm font-semibold text-[color:var(--color-ink-secondary)] transition-colors hover:text-[color:var(--color-ink)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              pending ||
              rating < 1 ||
              body.trim().length === 0 ||
              nickname.trim().length === 0
            }
            className="inline-flex items-center justify-center rounded-full bg-[color:var(--color-brand)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-hover)] disabled:bg-[color:var(--color-border-strong)]"
          >
            {pending ? "Posting…" : "Post review"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Star picker                                                          */
/* ------------------------------------------------------------------ */

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      disabled={disabled}
      aria-label="Rating"
    >
      <legend className="text-sm font-medium text-[color:var(--color-ink)]">
        Rating
      </legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= value;
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
              aria-pressed={active}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand)]",
                disabled
                  ? "opacity-60"
                  : "hover:bg-[color:var(--color-hover)]",
              )}
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-colors",
                  active
                    ? "fill-[color:var(--color-brand)] text-[color:var(--color-brand)]"
                    : "fill-transparent text-[color:var(--color-border-strong)]",
                )}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Media picker                                                         */
/* ------------------------------------------------------------------ */

function MediaPicker({
  files,
  onChange,
  onRemove,
  full,
  disabled,
  inputRef,
}: {
  files: File[];
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (idx: number) => void;
  full: boolean;
  disabled?: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[color:var(--color-ink)]">
        Photos &amp; videos (optional)
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
                onClick={() => onRemove(idx)}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                /* Pinned tight to the top-right corner — only a
                 *  small straddle (~3 px) so it reads as a badge
                 *  without floating awkwardly far off the tile.
                 *  Higher z so it stays clickable above the
                 *  play overlay on video tiles. */
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
          onChange={onChange}
          disabled={disabled || full}
          className="sr-only"
        />
      </label>
      <p className="text-xs text-[color:var(--color-ink-muted)]">
        Photos up to {MAX_PHOTO_MB} MB · videos up to {MAX_VIDEO_MB} MB ·{" "}
        {MAX_ATTACHMENTS} attachments max.
      </p>
    </div>
  );
}

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
/* Generic field wrapper                                                */
/* ------------------------------------------------------------------ */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[color:var(--color-ink)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Right-aligned character counter — same one-line affordance
 * under every text field that has a cap, so the shopper sees
 * the limit they're working against without us having to spell
 * it out in label copy. Single source of styling so the row
 * sits identically below title, body, and display-name inputs.
 */
function CharCount({ value, max }: { value: number; max: number }) {
  return (
    <p className="-mt-0.5 text-right text-xs text-[color:var(--color-ink-muted)] tabular-nums">
      {value} / {max}
    </p>
  );
}

const INPUT_CLASSES =
  "w-full rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-ink-muted)] transition-colors focus:border-[color:var(--color-ink)] disabled:opacity-60";

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function Star({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path d="M8 1.5l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 11.99l-4.12 2.17.79-4.58L1.34 6.33l4.6-.67L8 1.5z" />
    </svg>
  );
}

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
