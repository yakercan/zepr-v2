import type { ReactNode } from "react";

/**
 * Shared primitives for labelled form fields inside submit modals
 * (reviews, returns, contact). Each call site renders its own
 * inputs — these just give them a consistent label shell, counter,
 * and input chrome so every modal-bound form feels the same.
 *
 * Convention: mandatory fields carry a red `*` after the label;
 * optional fields show nothing. No "(optional)" hint anywhere —
 * absence of the asterisk *is* the signal.
 */

export interface FormFieldProps {
  label: string;
  /** Mark the field mandatory — appends a red `*` to the label.
   *  Server-side validation is still the policy authority; this
   *  is purely the visual hint. */
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, required, children }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[color:var(--color-ink)]">
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
    </label>
  );
}

/** Small red `*` after a field label. Single source of truth so
 *  the colour + spacing stay consistent across every form. */
export function RequiredMark() {
  return (
    <span
      aria-hidden
      className="ml-0.5 text-[color:var(--color-danger)]"
    >
      *
    </span>
  );
}

/** Right-aligned `value / max` counter. Sits one hairline up so it
 *  reads as part of the input below, not as a separate row. */
export function CharCount({ value, max }: { value: number; max: number }) {
  return (
    <p className="-mt-0.5 text-right text-xs text-[color:var(--color-ink-muted)] tabular-nums">
      {value} / {max}
    </p>
  );
}

/** Shared input/textarea chrome — used by every submit modal so
 *  the focus ring + disabled state stay identical across forms. */
export const formInputClasses =
  "w-full rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-ink-muted)] transition-colors focus:border-[color:var(--color-ink)] disabled:opacity-60";
