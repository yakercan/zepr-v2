import type { Metadata } from "next";

import { ContactForm } from "@/components/contact/contact-form";
import { getSession } from "@/lib/auth/session";

/**
 * `/contact` — the canonical "get in touch" destination.
 *
 * Dedicated page (not a modal) because contact is a destination,
 * not a contextual action: it needs a deep-linkable URL (footer
 * links, email signatures, customer-service replies), SEO
 * surface, and room for support-context copy alongside the form
 * itself. The form is built on the same primitives as the review
 * + return-request modal flows (`<FormField>`, `<Select>`,
 * `<MediaPicker>`, `<LoadingOverlay>`) so the dialect stays
 * consistent across every submit surface in the storefront.
 *
 * Layout — single column, form fills the page container width.
 * Same shape as `/account/profile/edit` and the addresses-edit
 * pages so every "page that is one form" feels the same. No
 * sidebar: every action the sidebar surfaced (mailto, response
 * time, attachment hints) is either redundant with the form
 * itself (attachments live in-form) or noise the shopper doesn't
 * need at compose time.
 *
 * Session integration: when the shopper is signed in we pre-fill
 * `name` + `email` from their account so they don't re-type their
 * own identity. The form is still freely editable — guests can
 * contact us under any name/email, and signed-in shoppers can
 * override (e.g. providing a different reply address than their
 * account email).
 */
export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Get in touch with the Zepr team — order help, product questions, partnerships, and anything in between.",
};

export default async function ContactPage() {
  /* Direct session read instead of `getAuthState()` so we can
   * pull `firstName` + `lastName` for the name prefill — the UI
   * projection collapses those into a single `customerName` and
   * we want both parts available for accurate `defaultValue`s. */
  const session = await getSession();
  const initialName = session
    ? [session.customer.firstName, session.customer.lastName]
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";
  const initialEmail = session?.customer.email ?? "";

  return (
    <main className="page-container pt-6 pb-12 md:pt-10 md:pb-16">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold leading-tight text-[color:var(--color-ink)] md:text-3xl">
          Contact us
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--color-ink-muted)] md:text-base">
          Questions about an order, a product, or anything else — drop us a
          note and we&rsquo;ll get back to you shortly.
        </p>
      </header>

      <ContactForm initialName={initialName} initialEmail={initialEmail} />
    </main>
  );
}
