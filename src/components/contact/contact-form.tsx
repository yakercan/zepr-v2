"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useState,
  useTransition,
} from "react";

import { submitContactAction } from "@/app/contact/actions";
import {
  CharCount,
  FormField,
  formInputClasses,
} from "@/components/ui/form-field";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { MediaPicker } from "@/components/ui/media-picker";
import { Select } from "@/components/ui/select";
import { CONTACT_SUBJECTS, type ContactSubjectId } from "@/lib/contact/subjects";
import { PANEL_SURFACE_THIN_CLASSES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Contact form — the page-level analogue of `<MediaFormModal>`.
 *
 * Speaks the same dialect (FormField shells, the shared input
 * chrome, the media picker, the loading overlay) but laid out as
 * a section card instead of a modal panel, because contact is a
 * destination, not a contextual action (see the design discussion
 * in chat: the form lives at `/contact` because it's a canonical
 * URL, indexable, deep-linkable, etc.).
 *
 * State + submit flow:
 *
 *   - All fields controlled — `useState` per field so the parent
 *     server page can prefill `name` / `email` from the signed-in
 *     shopper's session (and the shopper can still override).
 *   - `useTransition` carries the pending flag while the action
 *     is in flight; `success` flips after a clean response and
 *     swaps the form for a confirmation card.
 *   - Loading overlay rides over the card via the parent's
 *     `relative` wrapper — covers the form + footer during the
 *     pending / success flash, same dialect `<MediaFormModal>`
 *     uses inside the panel.
 *
 * Why not reuse `<MediaFormModal>` directly: the modal scaffold
 * couples the form to a `<Modal>` shell, a sticky footer with
 * overflow-driven borders, an `onClose` → reset cadence, and a
 * `router.refresh()` post-success path. None of those make sense
 * for a destination page — the form just stays put and shows a
 * confirmation card inline. The shared primitives (`FormField`,
 * `Select`, `MediaPicker`, `LoadingOverlay`, the action shape) do
 * carry over verbatim, which is where the actual duplication
 * cost would have lived.
 *
 * Attachments are emailed, not stored: the contact server action
 * pipes any picked media straight to Resend as email attachments
 * (see `lib/email/resend.ts`). Throwaway evidence — screenshots,
 * damage photos — that support reads once and discards doesn't
 * earn space in our object store the way reviews / returns
 * (which need to survive past first read) do.
 */

export interface ContactFormProps {
  /** Pre-fill for the name field — pass the signed-in shopper's
   *  display name when available; empty string for guests. */
  initialName?: string;
  /** Pre-fill for the email field — pass the signed-in shopper's
   *  account email when available; empty string for guests. */
  initialEmail?: string;
}

const MAX_NAME = 100;
const MAX_MESSAGE = 5000;
const MAX_ORDER_NUMBER = 50;

export function ContactForm({
  initialName = "",
  initialEmail = "",
}: ContactFormProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [subjectId, setSubjectId] = useState<ContactSubjectId | "">("");
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = pending || success;

  /* Client-side gate so the submit button reads as "not ready"
   * before pinging the server. The action re-validates everything
   * authoritatively. */
  const submitDisabled =
    disabled ||
    name.trim().length === 0 ||
    email.trim().length === 0 ||
    subjectId === "" ||
    message.trim().length === 0;

  const reset = useCallback(() => {
    setSubjectId("");
    setOrderNumber("");
    setMessage("");
    setFiles([]);
    setError(null);
    setSuccess(false);
    /* Identity fields stay on reset so a signed-in shopper who
     * sent one message and wants to send another doesn't have to
     * re-type their own name + email. */
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) return;

    const formData = new FormData(event.currentTarget);
    /* Append picked media to the FormData directly — the
     * `<MediaPicker>` controls its own file state and doesn't
     * bind to a native `<input name="…">` so we plumb the array
     * manually. Same pattern `<MediaFormModal>` uses internally. */
    for (const file of files) {
      formData.append("media", file);
    }

    setError(null);
    startTransition(async () => {
      const result = await submitContactAction(formData);
      if (result.ok) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  };

  if (success) {
    return (
      <SuccessCard onReset={reset} />
    );
  }

  const overlayState = pending ? "loading" : null;
  const subjectOptions = CONTACT_SUBJECTS.map((s) => ({
    value: s.id,
    label: s.label,
  }));

  return (
    /* `relative` is the positioning context for the overlay.
     *  `overflow-hidden` clips the overlay to the card's rounded
     *  corners so the dim layer doesn't bleed past the radius. */
    <section
      className={cn(
        PANEL_SURFACE_THIN_CLASSES,
        "relative overflow-hidden p-6 md:p-8",
      )}
    >
      <header className="mb-6">
        <h2 className="text-xl font-semibold leading-tight md:text-2xl">
          Send us a message
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-ink-muted)]">
          We&rsquo;ll get back to you soon.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {/* Identity row — name + email side-by-side on md+ because
         *  the two fields are the same shape and stride; stacking
         *  them on a wide column would waste the horizontal real
         *  estate without aiding scannability. */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="Your name" required>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(event) =>
                setName(event.target.value.slice(0, MAX_NAME))
              }
              maxLength={MAX_NAME}
              autoComplete="name"
              disabled={disabled}
              required
              className={formInputClasses}
            />
          </FormField>

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
        </div>

        <FormField label="What's this about?" required>
          <Select
            options={subjectOptions}
            value={subjectId}
            onChange={(next) => setSubjectId(next as ContactSubjectId)}
            placeholder="Pick a subject"
            disabled={disabled}
            name="subject"
          />
        </FormField>

        {/* Order number is intentionally always-visible-but-optional
         *  rather than conditionally revealed by subject — the
         *  reveal logic adds complexity without earning much,
         *  and a shopper with an order question who picked
         *  "Other" still benefits from being able to attach the
         *  order id without going back to change the subject. */}
        <FormField label="Order number">
          <input
            type="text"
            name="orderNumber"
            value={orderNumber}
            onChange={(event) =>
              setOrderNumber(event.target.value.slice(0, MAX_ORDER_NUMBER))
            }
            maxLength={MAX_ORDER_NUMBER}
            placeholder="If your message is about a specific order"
            disabled={disabled}
            className={formInputClasses}
          />
        </FormField>

        <FormField label="Message" required>
          <textarea
            name="message"
            value={message}
            onChange={(event) =>
              setMessage(event.target.value.slice(0, MAX_MESSAGE))
            }
            rows={6}
            maxLength={MAX_MESSAGE}
            disabled={disabled}
            required
            placeholder="Tell us how we can help."
            className={cn(formInputClasses, "resize-none")}
          />
          <CharCount value={message.length} max={MAX_MESSAGE} />
        </FormField>

        <MediaPicker
          files={files}
          onChange={setFiles}
          onError={setError}
          disabled={disabled}
          label="Attachments"
        />

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
            Send message
          </button>
        </div>
      </form>

      <LoadingOverlay state={overlayState} loadingLabel="Sending…" />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Success card                                                         */
/* ------------------------------------------------------------------ */

/**
 * Replaces the form after a successful submit. Same surface
 * dialect (`PANEL_SURFACE_THIN_CLASSES`) so the page chrome
 * doesn't shift; the inner content swaps from "fill this out" to
 * "we got it, here's what's next."
 *
 * Two affordances:
 *
 *   - "Send another message" — soft reset (preserves identity
 *     fields, clears the subject / message / attachments) for the
 *     shopper who has a second question.
 *   - "Back to shop" — `<Link href="/">` so the canonical "I'm
 *     done here" route is one click away.
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
      {/* Brand-tinted check disc — same primitive the loading
       *  overlay uses for its success flash, lifted to a full-card
       *  centrepiece here so the confirmation reads as the page's
       *  new headline. */}
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
        Message sent
      </h2>
      <p className="max-w-sm text-sm text-[color:var(--color-ink-muted)]">
        Thanks — we&rsquo;ll get back to you as soon as possible at
        the email you provided. Our processing time is usually within 1–3 business days.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={onReset} className="link-muted">
          Send another message
        </button>
        <Link href="/" className="btn-primary">
          Back to shop
        </Link>
      </div>
    </section>
  );
}
