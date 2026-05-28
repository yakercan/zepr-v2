"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useState,
  useTransition,
} from "react";

import { submitPrivacyRequestAction } from "@/app/policies/opt-out/actions";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CharCount,
  FormField,
  formInputClasses,
} from "@/components/ui/form-field";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import {
  PRIVACY_REQUEST_TYPES,
  type PrivacyRequestTypeId,
} from "@/lib/privacy/request-types";
import { PANEL_SURFACE_THIN_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Privacy-request form.
 *
 * Same dialect as `<ContactForm>` — shared primitives
 * (`FormField`, `formInputClasses`, `LoadingOverlay`,
 * `PANEL_SURFACE_THIN_CLASSES`) and the same controlled-field +
 * `useTransition` submit pattern. Differences are the
 * multi-select request-type checkboxes (powered by the new
 * `<Checkbox>` primitive) and the absence of attachments /
 * subject category, both of which don't apply to a privacy
 * intake.
 *
 * State posture:
 *
 *   - Selected request types live in a `Set<PrivacyRequestTypeId>`
 *     so toggling is a one-line add / delete with no array
 *     book-keeping. The set is rebuilt as a fresh `Set` on
 *     every toggle to keep React's referential-equality bailout
 *     working.
 *   - Submit is gated by `submitDisabled`, which flips active
 *     once email is non-empty AND at least one request type is
 *     picked. Matches the `<ContactForm>`'s "mandatory fields
 *     filled" gating dialect.
 *
 * Names: identity fields are optional. Many state-law privacy
 * statutes require us to be able to verify the requester, but
 * the verification step happens out-of-band (we email the
 * requester back with whatever they need to provide). The
 * form's job is to capture the intent + an email to reply to,
 * nothing more.
 */

const MAX_NAME = 100;
const MAX_ADDITIONAL_INFO = 2000;

export function PrivacyRequestForm() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [selected, setSelected] = useState<Set<PrivacyRequestTypeId>>(
    () => new Set(),
  );

  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = pending || success;

  /* Active when at least one type is picked + an email is on
   * file. The server validates both authoritatively. */
  const submitDisabled =
    disabled || email.trim().length === 0 || selected.size === 0;

  const toggle = useCallback((id: PrivacyRequestTypeId, next: boolean) => {
    setSelected((current) => {
      const updated = new Set(current);
      if (next) updated.add(id);
      else updated.delete(id);
      return updated;
    });
  }, []);

  const reset = useCallback(() => {
    setAdditionalInfo("");
    setSelected(new Set());
    setError(null);
    setSuccess(false);
    /* Identity fields stay so a shopper sending a follow-up
     * request doesn't have to re-enter their email. */
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) return;

    /* Build FormData manually instead of using the form's
     * native serialisation — the `<Checkbox>` primitive is a
     * controlled React component, not a native bound input, so
     * its state lives in `selected` and we plumb it onto the
     * FormData here. Same pattern `<ContactForm>` uses for its
     * media attachments. */
    const formData = new FormData();
    formData.set("email", email);
    formData.set("firstName", firstName);
    formData.set("lastName", lastName);
    formData.set("additionalInfo", additionalInfo);
    for (const id of selected) {
      formData.append("requestType", id);
    }

    setError(null);
    startTransition(async () => {
      const result = await submitPrivacyRequestAction(formData);
      if (result.ok) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  };

  if (success) {
    return <SuccessCard onReset={reset} />;
  }

  const overlayState = pending ? "loading" : null;

  return (
    <section
      className={cn(
        PANEL_SURFACE_THIN_CLASSES,
        "relative overflow-hidden p-6 md:p-8",
      )}
    >
      <header className="mb-6">
        <h2 className="text-xl font-semibold leading-tight md:text-2xl">
          Submit a privacy request
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-ink-muted)]">
          Tell us what you’d like us to do — we’ll get back to you with next
          steps.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <FormField label="Email" required>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            disabled={disabled}
            required
            className={formInputClasses}
          />
        </FormField>

        {/* Identity row — first + last name optional and stacked
         *  side-by-side on md+ to match the contact form's
         *  identity treatment. We collect them when given so
         *  support has a reference for identity verification,
         *  but the privacy right itself isn't conditioned on
         *  providing them. */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="First name">
            <input
              type="text"
              name="firstName"
              value={firstName}
              onChange={(event) =>
                setFirstName(event.target.value.slice(0, MAX_NAME))
              }
              maxLength={MAX_NAME}
              autoComplete="given-name"
              disabled={disabled}
              className={formInputClasses}
            />
          </FormField>

          <FormField label="Last name">
            <input
              type="text"
              name="lastName"
              value={lastName}
              onChange={(event) =>
                setLastName(event.target.value.slice(0, MAX_NAME))
              }
              maxLength={MAX_NAME}
              autoComplete="family-name"
              disabled={disabled}
              className={formInputClasses}
            />
          </FormField>
        </div>

        {/* Request types — multi-select. Treated as a labelled
         *  group rather than a single `<FormField>` because each
         *  checkbox carries its own label + description; a
         *  shared field label sits above the stack as a group
         *  header instead. */}
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium text-[color:var(--color-ink)]">
            What would you like us to do?
            <span
              aria-hidden
              className="ml-0.5 text-[color:var(--color-danger)]"
            >
              *
            </span>
          </legend>
          <div className="flex flex-col">
            {PRIVACY_REQUEST_TYPES.map((type) => (
              <Checkbox
                key={type.id}
                label={type.label}
                description={type.description}
                checked={selected.has(type.id)}
                onChange={(next) => toggle(type.id, next)}
                disabled={disabled}
              />
            ))}
          </div>
        </fieldset>

        <FormField label="Additional information">
          <textarea
            name="additionalInfo"
            value={additionalInfo}
            onChange={(event) =>
              setAdditionalInfo(
                event.target.value.slice(0, MAX_ADDITIONAL_INFO),
              )
            }
            rows={4}
            maxLength={MAX_ADDITIONAL_INFO}
            disabled={disabled}
            placeholder="Any extra context that would help us process your request."
            className={cn(formInputClasses, "resize-none")}
          />
          <CharCount value={additionalInfo.length} max={MAX_ADDITIONAL_INFO} />
        </FormField>

        {/* Identity-verification reminder. Plain muted text, no
         *  colored card — keeps the form visually quiet and on
         *  the surface dialect of every other submit form. */}
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          To protect your privacy, we may need to verify your identity before
          processing certain requests. If verification is needed, we’ll
          contact you at the email address above.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger)]"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={submitDisabled}
            className="btn-primary"
          >
            Submit request
          </button>
        </div>
      </form>

      <LoadingOverlay state={overlayState} loadingLabel="Submitting…" />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Success card                                                         */
/* ------------------------------------------------------------------ */

/**
 * Replaces the form after a successful submit. Same dialect as
 * `<ContactForm>`'s success card so every "form sent" surface
 * speaks the same language.
 */
function SuccessCard({ onReset }: { onReset: () => void }) {
  return (
    <section
      className={cn(
        PANEL_SURFACE_THIN_CLASSES,
        "flex flex-col items-center gap-3 p-8 text-center md:p-10",
      )}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--color-brand-light)] text-[color:var(--color-brand)]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <h2 className="text-xl font-semibold leading-tight md:text-2xl">
        Request received
      </h2>
      <p className="max-w-md text-sm text-[color:var(--color-ink-muted)]">
        Thanks — we’ve received your privacy request and sent a confirmation to
        your email. Opt-out requests are processed within 15 business days;
        other requests within 45 days (up to 90 for complex cases).
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={onReset} className="link-muted">
          Submit another request
        </button>
        <Link href="/" className="btn-primary">
          Back to shop
        </Link>
      </div>
    </section>
  );
}
