"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Form-styled single-select dropdown.
 *
 * Same popover dialect as `<VariantDropdown>` (hover-strong row
 * highlight, bubble token for the selected option) so the
 * storefront's "pick one of these" language reads identically
 * across PDP variants, modal forms, and anywhere else a select
 * lives. The trigger differs — it borrows the form-input chrome
 * (`formInputClasses` shape) so the control slots into a
 * `<FormField>` row the same way a textarea or text input does.
 *
 * Pure controlled component. Opens a portal-less popover anchored
 * to the button (the modal panel isn't an overflow-clip surface,
 * so anchored absolute is fine and skips the SSR / z-index dance
 * of a portal). Outside-click + Escape close via document
 * listeners scoped to the open state — idle selects hold zero
 * listeners.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: ReadonlyArray<SelectOption>;
  /** Currently picked value. `""` (empty string) renders the
   *  placeholder; matches the `<select required>` empty-default
   *  convention. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** When provided, mirrors the value into a hidden input so the
   *  control round-trips through FormData like a native select.
   *  Skip when the caller serialises selections themselves (e.g.
   *  the return-request modal's JSON `lines` payload). */
  name?: string;
  className?: string;
  /** Matches the native `aria-invalid` contract — drives no
   *  visual change on its own; callers layer error chrome on
   *  the `<FormField>` shell where they live. */
  "aria-invalid"?: boolean;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled = false,
  name,
  className,
  "aria-invalid": ariaInvalid,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const labelText = selected?.label ?? placeholder;
  const isPlaceholder = !selected;

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      {/* Hidden mirror for FormData round-trips. Skipped when
       *  `name` is omitted — modal forms that JSON-serialise
       *  their state don't need it. */}
      {name && <input type="hidden" name={name} value={value} />}

      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        /* Trigger chrome mirrors `formInputClasses` (label-row
         *  inputs) so it stacks flush with siblings in a
         *  `<FormField>` column. `text-left` because button
         *  defaults to centred. */
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg",
          "border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)]",
          "px-3 py-2 text-left text-sm outline-none transition-colors",
          "focus:border-[color:var(--color-ink)]",
          "disabled:opacity-60 disabled:cursor-default",
          isPlaceholder
            ? "text-[color:var(--color-ink-muted)]"
            : "text-[color:var(--color-ink)]",
        )}
      >
        <span className="truncate">{labelText}</span>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 shrink-0 text-[color:var(--color-ink-muted)] transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 top-full z-30 mt-1.5 w-full",
            /* Cap height so a long option list scrolls inside
             *  the panel instead of pushing past the modal
             *  viewport. */
            "max-h-[220px] overflow-y-auto overflow-x-hidden",
            "rounded-xl border border-[color:var(--color-border)]",
            "bg-white py-1 shadow-lg shadow-black/10",
            "overscroll-contain",
          )}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-4 py-2 text-left text-sm",
                  isSelected
                    ? "bg-[color:var(--color-bubble)] font-semibold text-[color:var(--color-ink)]"
                    : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-hover-strong)]",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
