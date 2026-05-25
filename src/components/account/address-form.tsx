"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AddressActionState } from "@/app/account/addresses/actions";
import { RequiredMark } from "@/components/ui/form-field";
import type { CustomerAddressInput } from "@/lib/shopify/customer-account-types";
import { PANEL_SURFACE_THIN_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Shared address create / edit form.
 *
 * One client island handles both the `/account/addresses/new`
 * and `/account/addresses/[id]/edit` routes. The parent decides
 * the operation by passing the matching server action (already
 * `.bind(null, addressId)` for the edit path), the heading
 * copy, the submit-button label, and any pre-filled values.
 *
 * Visual:
 *
 *   - Same card chrome as every other account section.
 *   - Two-column grid on `md+` for first / last name pairings;
 *     stacks on mobile.
 *   - The "Make this my default address" checkbox lives at the
 *     bottom of the form so a shopper editing their only
 *     address (which is already the default) never has to
 *     re-tick it.
 *   - Submit + Cancel sit side by side at the bottom — primary
 *     pill saves, ghost link returns to `/account/addresses`.
 *   - Errors from Shopify (`PHONE_NUMBER_NOT_VALID`, etc.) and
 *     transport errors both render inline above the submit row
 *     using the standard danger token, so there's one place to
 *     read what went wrong without ambiguity.
 *
 * Form contract:
 *
 *   - All fields are uncontrolled; the server action reads
 *     directly from `FormData`. The only React state on this
 *     island is the `useActionState` envelope.
 *   - `defaultAddress` is a checkbox; unchecked drops the key
 *     entirely (native form behaviour), which the server
 *     action reads as `false`.
 *   - Country / region are *codes* (`US` / `CA`), per the
 *     Customer Account API's `CustomerAddressInput` schema —
 *     names would silently fail validation. Inputs are 2-char
 *     uppercase to nudge the right shape; the inline label
 *     explains the convention.
 */
export interface AddressFormProps {
  /** Server action to invoke on submit. For the create flow,
   *  pass `createAddressAction` directly; for edit, pass
   *  `updateAddressAction.bind(null, addressId)`. */
  action: (
    prev: AddressActionState,
    formData: FormData,
  ) => Promise<AddressActionState>;
  /** Visible page heading rendered inside the card. */
  heading: string;
  /** Submit-button label, e.g. `"Add address"` or `"Save
   *  changes"`. The pending state ("Saving…") is shared. */
  submitLabel: string;
  /** Pre-filled values for the edit flow; undefined for create. */
  initialValues?: Partial<CustomerAddressInput>;
  /** Whether the address being edited is currently the default
   *  — drives the `defaultAddress` checkbox's initial value.
   *  Ignored on create (defaults to `false`). */
  initialIsDefault?: boolean;
}

const INITIAL_STATE: AddressActionState = { status: "idle" };

export function AddressForm({
  action,
  heading,
  submitLabel,
  initialValues,
  initialIsDefault,
}: AddressFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_STATE);

  return (
    <section className={cn(PANEL_SURFACE_THIN_CLASSES, "p-6 md:p-8")}>
      <header className="mb-6">
        <h2 className="text-xl font-semibold leading-tight md:text-2xl">
          {heading}
        </h2>
      </header>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <FieldGrid>
          <Field
            name="firstName"
            label="First name"
            defaultValue={initialValues?.firstName}
            autoComplete="given-name"
            required
          />
          <Field
            name="lastName"
            label="Last name"
            defaultValue={initialValues?.lastName}
            autoComplete="family-name"
            required
          />
        </FieldGrid>

        <Field
          name="address1"
          label="Address line 1"
          defaultValue={initialValues?.address1}
          autoComplete="address-line1"
          required
        />

        <Field
          name="address2"
          label="Address line 2"
          hint="Apartment, suite, unit"
          defaultValue={initialValues?.address2}
          autoComplete="address-line2"
        />

        <FieldGrid>
          <Field
            name="city"
            label="City"
            defaultValue={initialValues?.city}
            autoComplete="address-level2"
            required
          />
          <Field
            name="zip"
            label="ZIP / Postal code"
            defaultValue={initialValues?.zip}
            autoComplete="postal-code"
            required
          />
        </FieldGrid>

        <FieldGrid>
          <Field
            name="zoneCode"
            label="State / region code"
            hint="Two-letter code, e.g. CA"
            defaultValue={initialValues?.zoneCode}
            autoComplete="address-level1"
            maxLength={3}
            uppercase
            required
          />
          <Field
            name="territoryCode"
            label="Country code"
            hint="Two-letter ISO code, e.g. US"
            defaultValue={initialValues?.territoryCode}
            autoComplete="country"
            maxLength={2}
            uppercase
            required
          />
        </FieldGrid>

        <Field
          name="phoneNumber"
          label="Phone number"
          hint="Include country code, e.g. +14155551212"
          defaultValue={initialValues?.phoneNumber}
          autoComplete="tel"
          inputMode="tel"
        />

        <label className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--color-ink)]">
          <input
            type="checkbox"
            name="defaultAddress"
            defaultChecked={initialIsDefault}
            className="h-4 w-4 rounded border-[color:var(--color-border-strong)] accent-[color:var(--color-brand)]"
          />
          Make this my default address
        </label>

        {state.status === "error" && (
          <p
            role="alert"
            className="rounded-lg border border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger)]"
          >
            {state.error}
          </p>
        )}

        <div className="mt-2 flex items-center justify-end gap-3">
          <Link
            href="/account/addresses"
            className="link-muted"
          >
            Cancel
          </Link>
          <SubmitButton submitLabel={submitLabel} />
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Submit button — `useFormStatus` lives in a child component         */
/* because the hook only sees the parent <form> from inside a child.   */
/* ------------------------------------------------------------------ */

function SubmitButton({ submitLabel }: { submitLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-primary"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Saving…" : submitLabel}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Field primitives                                                    */
/* ------------------------------------------------------------------ */

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">{children}</div>
  );
}

interface FieldProps {
  name: string;
  label: string;
  /** Subdued helper text under the label — used to clarify
   *  "optional" or hint at expected formats (ISO codes, etc.). */
  hint?: string;
  defaultValue?: string | null;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  maxLength?: number;
  /** Force-uppercase the input via CSS so the 2-letter code
   *  inputs feel like a single visual style regardless of the
   *  shopper's caps-lock state. Visual only — the value
   *  submitted to the server keeps whatever the user typed,
   *  but Shopify accepts both cases for country / region
   *  codes so it round-trips cleanly. */
  uppercase?: boolean;
  required?: boolean;
}

function Field({
  name,
  label,
  hint,
  defaultValue,
  autoComplete,
  inputMode,
  maxLength,
  uppercase,
  required,
}: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-[color:var(--color-ink)]">
          {label}
          {required && <RequiredMark />}
        </span>
        {hint && (
          <span className="text-xs text-[color:var(--color-ink-muted)]">
            {hint}
          </span>
        )}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ""}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        className={cn(
          "h-11 w-full rounded-lg px-3 text-sm",
          "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
          "border-2 border-[color:var(--color-border-strong)]",
          "transition-colors duration-150",
          "focus:border-[color:var(--color-ink)] focus:outline-none",
          "placeholder:text-[color:var(--color-ink-muted)]",
          uppercase && "uppercase",
        )}
      />
    </label>
  );
}
