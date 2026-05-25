import type { ReactNode } from "react";

/**
 * Shared primitives for labelled form fields inside submit modals
 * (reviews, returns, contact). Each call site renders its own
 * inputs — these just give them a consistent label shell, counter,
 * and input chrome so every modal-bound form feels the same.
 */

export interface FormFieldProps {
  label: string;
  children: ReactNode;
}

/** Label-on-top wrapper. Children are the input + any inline
 *  affordances (e.g. `<CharCount>`). The `<label>` element binds
 *  the click target to the first focusable descendant for free. */
export function FormField({ label, children }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[color:var(--color-ink)]">
        {label}
      </span>
      {children}
    </label>
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
