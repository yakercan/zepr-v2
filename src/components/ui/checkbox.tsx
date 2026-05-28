"use client";

import type { ReactNode } from "react";

/**
 * Labelled checkbox primitive.
 *
 * Native `<input type="checkbox">` tinted with `accent-color` so
 * the browser draws the box, the check, and the focus ring for
 * free — no custom SVG, no off-screen hidden input, no a11y
 * gymnastics. The only thing we contribute is the layout (box
 * left, label + optional description stacked right) and the
 * brand tint when checked.
 *
 * Designed for vertical stacks of selectable options. A row of
 * single-choice options should use a radio group (or `<Select>`)
 * instead — checkboxes here are exclusively for "pick zero or
 * more" multi-selects.
 *
 * Pattern:
 *
 *     <Checkbox
 *       label="Delete my personal information"
 *       description="…"
 *       checked={state.delete}
 *       onChange={(next) => setState({ ...state, delete: next })}
 *     />
 */
export interface CheckboxProps {
  /** Bold primary line — the option's name. */
  label: string;
  /** Optional secondary line in muted text. Plain string or a
   *  ReactNode (so callers can drop inline links / `<strong>`
   *  into the description if they need to). */
  description?: ReactNode;
  /** Native form field name. Same value can be reused across
   *  multiple checkboxes — the browser will collect them all
   *  into a `FormData.getAll(name)` array, mirroring how the
   *  HTML spec handles multi-select checkboxes. */
  name?: string;
  /** Native form field value, sent on the form when this
   *  checkbox is checked. Required when `name` is set. */
  value?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Checkbox({
  label,
  description,
  name,
  value,
  checked,
  onChange,
  disabled,
}: CheckboxProps) {
  return (
    <label
      className={
        "flex cursor-pointer items-start gap-3 py-2 transition-opacity" +
        (disabled ? " cursor-not-allowed opacity-60" : "")
      }
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        /* `accent-color` tints the native check fill + focus ring
         * to the brand. `mt-0.5` nudges the box to align with the
         * label's cap height instead of its baseline — small
         * visual win, no functional impact. */
        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--color-brand)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-[color:var(--color-ink)]">
          {label}
        </span>
        {description && (
          <span className="text-sm text-[color:var(--color-ink-muted)]">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
