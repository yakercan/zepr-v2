"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ProfileActionState } from "@/app/account/profile/edit/actions";
import { PANEL_SURFACE_THIN_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Profile edit form — first name + last name only.
 *
 * Email is rendered as a read-only row above the inputs so the
 * shopper sees their account identity without thinking the
 * field is missing. Shopify's Customer Account API doesn't
 * expose email mutation today (it's the OIDC-managed account
 * identifier), so explaining that constraint visually beats
 * silently omitting it.
 *
 * Visual contract matches `<AddressForm>` — same card chrome,
 * same input dialect, same submit / cancel footer — so the two
 * account sub-pages read as one design pattern. Diff is just
 * the field set (smaller here) and the read-only email row.
 *
 * Form contract:
 *
 *   - All fields uncontrolled; the server action reads off
 *     `FormData`. The only React state on this island is the
 *     `useActionState` envelope.
 *   - The server action redirects to `/account` on success, so
 *     a "saved!" toast isn't needed — the dashboard's fresh
 *     paint *is* the confirmation.
 */
export interface ProfileFormProps {
  action: (
    prev: ProfileActionState,
    formData: FormData,
  ) => Promise<ProfileActionState>;
  initialValues: {
    firstName: string;
    lastName: string;
  };
  /** Read-only email row content. Rendered above the editable
   *  inputs with a small "Account email" label so the shopper
   *  understands why it isn't editable. */
  email: string;
}

const INITIAL_STATE: ProfileActionState = { status: "idle" };

export function ProfileForm({
  action,
  initialValues,
  email,
}: ProfileFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_STATE);

  return (
    <section className={cn(PANEL_SURFACE_THIN_CLASSES, "p-6 md:p-8")}>
      <header className="mb-6">
        <h2 className="text-xl font-semibold leading-tight md:text-2xl">
          Edit profile
        </h2>
      </header>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        {/* Read-only email row, styled to look like a Field but
            without an input — keeps the visual column flow even
            though the value can't be changed. */}
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[color:var(--color-ink)]">
            Account email
          </span>
          <span className="flex h-11 w-full items-center break-all rounded-lg border-2 border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-muted)] px-3 text-sm text-[color:var(--color-ink-secondary)]">
            {email}
          </span>
        </div>

        <FieldGrid>
          <Field
            name="firstName"
            label="First name"
            defaultValue={initialValues.firstName}
            autoComplete="given-name"
            required
          />
          <Field
            name="lastName"
            label="Last name"
            defaultValue={initialValues.lastName}
            autoComplete="family-name"
            required
          />
        </FieldGrid>

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
            href="/account"
            className="link-muted"
          >
            Cancel
          </Link>
          <SubmitButton />
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Submit button — `useFormStatus` lives in a child component         */
/* because the hook only sees the parent <form> from inside a child.   */
/* ------------------------------------------------------------------ */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-primary"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Field primitives — duplicated locally from the address form for    */
/* now. Two call sites isn't enough surface area to justify a shared  */
/* `<Field>` module; if a third form needs the same dialect, lift     */
/* them into `components/ui/field.tsx` and back-port both forms.       */
/* ------------------------------------------------------------------ */

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">{children}</div>
  );
}

interface FieldProps {
  name: string;
  label: string;
  defaultValue?: string;
  autoComplete?: string;
  required?: boolean;
}

function Field({
  name,
  label,
  defaultValue,
  autoComplete,
  required,
}: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[color:var(--color-ink)]">
        {label}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        required={required}
        className={cn(
          "h-11 w-full rounded-lg px-3 text-sm",
          "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
          "border-2 border-[color:var(--color-border-strong)]",
          "transition-colors duration-150",
          "focus:border-[color:var(--color-ink)] focus:outline-none",
          "placeholder:text-[color:var(--color-ink-muted)]",
        )}
      />
    </label>
  );
}
