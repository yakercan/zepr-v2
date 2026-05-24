"use client";

import { type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";

/**
 * Reusable confirmation dialog.
 *
 * Thin presentational layer over `<Modal layer="confirm">` —
 * inherits stacking (sits above any base / preview modal that
 * might have launched it), escape-to-close, backdrop-click, and
 * body scroll lock from the shared primitive. The dialog itself
 * only knows about copy + the two buttons.
 *
 * Designed to be drop-in for any "Are you sure?" prompt that
 * used to call `window.confirm()`. The native dialog is
 * blocking, can't be styled, and looks foreign on every modern
 * surface — replacing it everywhere with this component is the
 * one-line upgrade.
 *
 * State model:
 *
 *   - The parent owns `open` and toggles it on confirm / cancel.
 *   - `onConfirm` fires before the parent closes the dialog —
 *     i.e. the dialog does NOT auto-close on confirm, so the
 *     parent can decide whether to keep it open while a server
 *     action is pending or close immediately. For the common
 *     "close immediately, let the row vanish on revalidate"
 *     pattern, the parent's confirm handler sets `open = false`
 *     itself.
 *   - `pending` disables both buttons and swaps the confirm
 *     label to `pendingLabel` (defaults to `"Working…"`). Lets
 *     the parent thread a `useTransition` / `useActionState`
 *     pending flag through without bookkeeping inside the dialog.
 *
 * Tone:
 *
 *   - `"default"` — primary brand pill for safe confirmations
 *     (e.g. "Sign me out", "Save changes anyway").
 *   - `"danger"`  — danger-red pill for irreversible actions
 *     (delete, discard). Matches the rest of the app's danger
 *     surface tokens (`--color-danger` / `-hover`).
 */
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Body copy. Plain string for the common case; pass a node
   *  when you need multiple paragraphs or inline emphasis. */
  description?: ReactNode;
  /** Confirm-button label. Defaults to `"Confirm"`. */
  confirmLabel?: string;
  /** Cancel-button label. Defaults to `"Cancel"`. */
  cancelLabel?: string;
  /** Replacement label shown on the confirm button while
   *  `pending` is true. Defaults to `"Working…"`. */
  pendingLabel?: string;
  /** Visual tone of the confirm button. `"danger"` paints it
   *  in the destructive-red token set so the affordance reads
   *  as irreversible. Defaults to `"default"`. */
  tone?: "default" | "danger";
  /** Disable both buttons and swap the confirm label to
   *  `pendingLabel`. Wire this to whatever pending flag the
   *  parent's action exposes. */
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pendingLabel = "Working…",
  tone = "default",
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      layer="confirm"
      ariaLabel={title}
      /* `hideClose` because confirm dialogs traditionally
       *  funnel the dismiss through the explicit Cancel button
       *  — a top-right ✕ duplicates the affordance and reads
       *  noisier on a small dialog. Escape + backdrop click
       *  still close it (the Modal primitive handles those). */
      hideClose
    >
      <div className="flex flex-col gap-4 p-5 md:p-6">
        <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
          {title}
        </h2>
        {description && (
          <div className="text-sm leading-relaxed text-[color:var(--color-ink-secondary)]">
            {description}
          </div>
        )}
        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-disabled={pending}
            className="text-sm font-semibold text-[color:var(--color-ink-secondary)] transition-colors hover:text-[color:var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-disabled={pending}
            /* Two visual tones share the same shell — pill
             *  shape + padding from `.btn-primary` style, just
             *  swapping the colour set. We don't reuse
             *  `.btn-primary` directly because the danger tone
             *  needs its own hover state (`--color-danger-hover`),
             *  and stacking utility overrides on top of the
             *  brand-coloured class would be more code than
             *  spelling it out. */
            className={
              tone === "danger"
                ? "inline-flex items-center justify-center rounded-full bg-[color:var(--color-danger)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-danger-hover)] disabled:cursor-not-allowed disabled:bg-[color:var(--color-border-strong)]"
                : "inline-flex items-center justify-center rounded-full bg-[color:var(--color-brand)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--color-brand-hover)] disabled:cursor-not-allowed disabled:bg-[color:var(--color-border-strong)]"
            }
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
