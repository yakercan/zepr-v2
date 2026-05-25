"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useState,
  useTransition,
} from "react";
import {
  LoadingOverlay,
  type LoadingOverlayState,
} from "@/components/ui/loading-overlay";
import {
  MediaPicker,
  type MediaPickerConfig,
} from "@/components/ui/media-picker";
import { Modal, type ModalLayer } from "@/components/ui/modal";

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
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 p-5 md:p-6"
        noValidate
      >
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

        <div className="mt-1 flex items-center justify-end gap-3">
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
            /* Media-required is enforced internally: when the
             *  picker is mandatory and empty, the submit button
             *  stays disabled. Keeps the call site from having
             *  to re-derive the same condition off file state
             *  it doesn't own. */
            disabled={
              disabled ||
              disableSubmit ||
              (media?.required === true && files.length === 0)
            }
            className="inline-flex items-center justify-center rounded-full bg-[color:var(--color-brand)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-hover)] disabled:bg-[color:var(--color-border-strong)]"
          >
            {submitLabel}
          </button>
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
