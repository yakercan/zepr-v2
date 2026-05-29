"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { cn } from "@/lib/utils";
import { useIsCompact } from "@/components/device/device-provider";
import {
  LoadingOverlay,
  type LoadingOverlayState,
} from "@/components/ui/loading-overlay";
import {
  MediaPicker,
  type MediaPickerConfig,
} from "@/components/ui/media-picker";
import { Modal, type ModalLayer } from "@/components/ui/modal";
import { Sheet } from "@/components/ui/sheet";

/**
 * Shared submit-modal scaffold for reviews, returns, contact, and
 * anything else that needs:
 *
 *   - a titled `<Modal>` shell
 *   - a `<form>` with caller-provided fields
 *   - an optional photo + video attachment row
 *   - inline error display
 *   - a "loading → success" overlay flash before close
 *
 * The wrapper owns:
 *
 *   - media files state (when `media` is enabled)
 *   - error message
 *   - submit pending + success flags
 *   - close + reset orchestration
 *
 * The caller owns:
 *
 *   - all custom fields (their state, validation, `name` attrs)
 *   - the server action behind `onSubmit`
 *   - the `disableSubmit` gate for required-field completeness
 *   - any post-success side-effect (`onSuccess`, e.g. `router.refresh()`)
 *   - field reset (`onReset`, fired ~200 ms after close so the
 *     modal doesn't blank out mid-fade)
 *
 * FormData wiring:
 *
 *   - `new FormData(form)` picks up every `<input name="…">`
 *     inside `children`, controlled or otherwise. Use a hidden
 *     input for non-native pickers (e.g. star ratings).
 *   - Media files are appended under `media.fieldName ?? "media"`.
 */

export type MediaFormSubmitResult =
  | { ok: true }
  | { ok: false; error: string };

export type MediaFormSubmitHandler = (
  formData: FormData,
) => Promise<MediaFormSubmitResult>;

/** Render-prop state passed to children so fields can disable
 *  themselves while pending or during the success flash. */
export interface MediaFormChildState {
  pending: boolean;
  success: boolean;
  /** Convenience: `pending || success`. Pass straight to inputs. */
  disabled: boolean;
}

export interface MediaFormModalProps {
  open: boolean;
  onClose: () => void;

  /* Modal shell --------------------------------------------------- */
  title: string;
  ariaLabel?: string;
  layer?: ModalLayer;
  /** Tailwind size cap on the modal panel (e.g. `"max-w-xl"`). */
  className?: string;

  /* Form fields --------------------------------------------------- */
  /** Caller-controlled fields. Pass as a render-prop when fields
   *  need access to pending/success/disabled state. */
  children:
    | ReactNode
    | ((state: MediaFormChildState) => ReactNode);

  /* Actions ------------------------------------------------------- */
  submitLabel?: string;
  cancelLabel?: string;
  /** Caller-side validation gate. The submit button is also
   *  disabled while pending/success — those bits are tracked
   *  internally. */
  disableSubmit?: boolean;

  /* Submission ---------------------------------------------------- */
  onSubmit: MediaFormSubmitHandler;
  /** Fired after the success flash, just before close. Use for
   *  `router.refresh()`, navigation, etc. */
  onSuccess?: () => void;
  /** Fired ~200 ms after close (the close-animation cooldown).
   *  Caller wipes its own controlled field state here. */
  onReset?: () => void;

  /* Media --------------------------------------------------------- */
  /** Set to enable the photo + video picker. Pass `{}` for the
   *  defaults; override per-cap, label, or set `required: true`
   *  when a surface needs stricter limits or mandatory media. */
  media?: MediaPickerConfig & { fieldName?: string };

  /* Loading overlay copy ----------------------------------------- */
  loadingLabel?: string;
  successLabel?: string;
}

/* Submission flow timings — the success disc lingers long
 * enough to read as a real confirmation (not a flicker) before
 * the modal closes. Reset waits out the close animation
 * (~150 ms) so fields don't blank mid-fade. */
const SUCCESS_FLASH_MS = 600;
const RESET_DELAY_MS = 200;

export function MediaFormModal({
  open,
  onClose,
  title,
  ariaLabel,
  layer = "base",
  className,
  children,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  disableSubmit = false,
  onSubmit,
  onSuccess,
  onReset,
  media,
  loadingLabel,
  successLabel,
}: MediaFormModalProps) {
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  /* Whether the body region is actually overflowing the panel
   * right now. Drives the footer's top border — present only
   * when there *is* content above the fold so the bar doesn't
   * read as extra chrome on a short form. */
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [bodyOverflows, setBodyOverflows] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content) return;

    /* +1 fudge factor avoids a sub-pixel false-positive when
     * scrollHeight rounds up versus clientHeight on hi-dpi
     * screens. */
    const check = () => {
      setBodyOverflows(content.scrollHeight > body.clientHeight + 1);
    };
    check();

    /* Observe both the scroll container (sizes when the panel's
     * `max-h` kicks in or the viewport changes) *and* the inner
     * content wrapper (sizes when children add/remove rows, the
     * media picker grows, an error pill appears, etc.). One
     * observer for both keeps the wiring trivial. */
    const ro = new ResizeObserver(check);
    ro.observe(body);
    ro.observe(content);
    return () => ro.disconnect();
  }, [open]);

  const disabled = pending || success;
  const overlayState: LoadingOverlayState | null = success
    ? "success"
    : pending
      ? "loading"
      : null;

  const resetInternal = useCallback(() => {
    setError(null);
    setSuccess(false);
    setFiles([]);
    onReset?.();
  }, [onReset]);

  const handleClose = useCallback(() => {
    if (disabled) return;
    onClose();
    /* Wait for the modal close animation (~150 ms) before wiping
     * the form so the shopper doesn't see fields blank out mid-
     * fade. */
    setTimeout(resetInternal, RESET_DELAY_MS);
  }, [disabled, onClose, resetInternal]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;

    const formData = new FormData(event.currentTarget);
    if (media) {
      /* The native `<input type="file">` inside `<MediaPicker>`
       *  isn't `name`-bound (the picker is controlled by parent
       *  state), so we just delete any stale entry and append
       *  fresh from our `files` array. */
      const fieldName = media.fieldName ?? "media";
      formData.delete(fieldName);
      for (const file of files) {
        formData.append(fieldName, file);
      }
    }

    setError(null);
    startTransition(async () => {
      const result = await onSubmit(formData);
      if (result.ok) {
        /* Flash the success state before closing so the shopper
         *  gets a clear confirmation. `router.refresh()` and any
         *  other post-success side effect run in `onSuccess` AFTER
         *  the flash so the action's RSC payload (potentially
         *  reshaping the parent tree and unmounting this modal)
         *  doesn't arrive until the shopper has already seen the
         *  confirmation. */
        setSuccess(true);
        setTimeout(() => {
          onSuccess?.();
          onClose();
          setTimeout(resetInternal, RESET_DELAY_MS);
        }, SUCCESS_FLASH_MS);
      } else {
        setError(result.error);
      }
    });
  };

  const childContent =
    typeof children === "function"
      ? children({ pending, success, disabled })
      : children;

  const isCompact = useIsCompact();
  /* Stable id so the submit button in the sheet's footer slot
   * (rendered outside the form element) can still be linked to
   * the form via `form="…"`. `useId()` keeps it unique even
   * when multiple media-form modals mount in the same tree. */
  const formId = useId();

  /* Form body — shared verbatim across desktop and mobile.
   * The desktop modal wraps it in its own overflow-aware scroll
   * container (and tracks `bodyOverflows` for the footer's top
   * border); the mobile sheet skips that bookkeeping since the
   * sheet primitive owns its own scroll behaviour. */
  const formBody = (
    <>
      {childContent}

      {media && (
        <MediaPicker
          files={files}
          onChange={setFiles}
          onError={setError}
          disabled={disabled}
          maxAttachments={media.maxAttachments}
          maxPhotoBytes={media.maxPhotoBytes}
          maxVideoBytes={media.maxVideoBytes}
          label={media.label}
          required={media.required}
        />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger)]"
        >
          {error}
        </p>
      )}
    </>
  );

  const submitDisabled =
    disabled ||
    disableSubmit ||
    (media?.required === true && files.length === 0);

  const actionRow = (
    <>
      <button
        type="button"
        onClick={handleClose}
        disabled={disabled}
        className="link-muted"
      >
        {cancelLabel}
      </button>
      <button
        type="submit"
        form={formId}
        /* Media-required is enforced internally: when the
         *  picker is mandatory and empty, the submit button
         *  stays disabled. Keeps the call site from having
         *  to re-derive the same condition off file state
         *  it doesn't own. */
        disabled={submitDisabled}
        className="inline-flex items-center justify-center rounded-full bg-[color:var(--color-brand)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-hover)] disabled:bg-[color:var(--color-border-strong)]"
      >
        {submitLabel}
      </button>
    </>
  );

  if (isCompact) {
    /* Compact-viewport bottom sheet. The action row rides the sheet's
     * footer slot (safe-area-inset padded), the form body
     * scrolls inside the body slot, and the LoadingOverlay
     * sits inside the body's relative wrapper to cover the
     * fields during pending / success flash. The buttons stay
     * reachable through the overlay (disabled state already
     * blocks interaction), giving the shopper a way to
     * dismiss without dragging if they need it. */
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
        title={title}
        className="px-5 py-5"
        footer={
          <div className="flex items-center justify-end gap-3 px-5 py-3">
            {actionRow}
          </div>
        }
      >
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="relative flex flex-col gap-5"
          noValidate
        >
          {formBody}
          <LoadingOverlay
            state={overlayState}
            loadingLabel={loadingLabel}
            successLabel={successLabel}
          />
        </form>
      </Sheet>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      layer={layer}
      title={title}
      ariaLabel={ariaLabel ?? title}
      className={className}
    >
      <form
        id={formId}
        onSubmit={handleSubmit}
        /* The form is the panel's internal layout column —
         *  header (from `<Modal>`) above, scrollable body in
         *  the middle, pinned action footer below. `flex-1
         *  min-h-0` lets the form fill the remaining panel
         *  height after the title bar; the body inside owns
         *  the actual scroll. The `<LoadingOverlay>` is a
         *  *sibling* of the form (still inside the panel)
         *  so it covers everything — title, body, footer —
         *  during the pending / success flash. */
        className="flex min-h-0 flex-1 flex-col"
        noValidate
      >
        {/* Body — only this region scrolls. Padding + gap live on
         *  the inner content wrapper, not the scroll container,
         *  so the scrollbar (when present) sits flush against the
         *  panel's right edge instead of inside the form padding.
         *  The content wrapper also gives the overflow `ResizeObserver`
         *  a stable element to track for content-size changes. */}
        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div
            ref={contentRef}
            className="flex flex-col gap-5 p-5 md:p-6"
          >
            {formBody}
          </div>
        </div>

        {/* Footer — pinned at the bottom of the panel. Border
         *  only renders when the body actually overflows so a
         *  short form (e.g. a single-field review) doesn't pick
         *  up an extra chrome line for no reason. When the
         *  border is on, it mirrors the header's `border-b` so
         *  the scrollable body reads as visually framed between
         *  the two bars. */}
        <div
          className={cn(
            "flex shrink-0 items-center justify-end gap-3 px-5 py-4",
            bodyOverflows &&
              "border-t border-[color:var(--color-border)]",
          )}
        >
          {actionRow}
        </div>
      </form>

      <LoadingOverlay
        state={overlayState}
        loadingLabel={loadingLabel}
        successLabel={successLabel}
      />
    </Modal>
  );
}
