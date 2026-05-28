"use server";

import { env } from "@/env";
import { sendEmail } from "@/lib/email/resend";
import {
  PRIVACY_REQUEST_TYPES,
  findPrivacyRequestType,
} from "@/lib/privacy/request-types";

/**
 * Server action — submit a U.S. state-law privacy request.
 *
 * Pipeline:
 *
 *   1. **Parse** every field off `FormData`. The request-type
 *      multi-select arrives as repeated `requestType=<id>`
 *      entries (HTML form convention for grouped checkboxes),
 *      which `FormData.getAll(…)` collects into an array
 *      automatically.
 *   2. **Validate** shape + length caps + email format +
 *      request-type ids + "at least one type selected". Server
 *      is the policy authority — the client form pre-gates the
 *      submit button but the action re-validates everything.
 *   3. **Notify support** via Resend. Plain-text body with the
 *      identity block, the selected request types, the
 *      shopper's optional notes, and a processing-SLA reminder
 *      so the support agent doesn't have to look the timelines
 *      up.
 *   4. **Confirm to shopper** via the customer-facing notifier
 *      address. Mirrors the support-side language so the
 *      shopper sees the same SLA they'll be held to, and so
 *      any follow-up they send back lands in support's inbox
 *      via `replyTo`.
 *   5. **Return** the same `{ ok, error? }` shape the contact
 *      action returns. The form uses the same error-display
 *      dialect.
 *
 * Auth posture: no session required. The shopper might already
 * be signed in, but a privacy request is fundamentally about
 * an email address — anyone exercising a state-law privacy
 * right is allowed to do so without proving they're logged in.
 * Support verifies identity out-of-band before processing.
 *
 * Backend processing is intentionally out of scope here. This
 * action is the *intake*: it lands the request in support's
 * inbox with everything they need to action it manually
 * (verify identity, locate the customer record, perform the
 * deletion / export / correction). A future automated pipeline
 * can hang off the same intake without changing the form.
 */

/* Text field caps — same shape as the contact action. The
 * `additionalInfo` 2000-char ceiling is shorter than contact's
 * 5000 because privacy requests are typically a one-liner of
 * extra context, not a long narrative. */
const MAX_NAME = 100;
const MAX_ADDITIONAL_INFO = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PrivacyRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitPrivacyRequestAction(
  formData: FormData,
): Promise<PrivacyRequestResult> {
  /* Soft-fail when email isn't wired yet — typecheck + deploy
   * still pass, the form surfaces a polite "try again later"
   * instead of crashing. */
  if (!env.RESEND_API_KEY || !env.CONTACT_FROM_EMAIL || !env.CONTACT_TO_EMAIL) {
    return {
      ok: false,
      error:
        "Privacy requests are temporarily unavailable. Please email us directly.",
    };
  }

  /* 1. Parse. `getAll("requestType")` gathers every checked
   *    checkbox into an array — the browser sends one
   *    `requestType=<value>` entry per checked box because
   *    each checkbox declares the same name. */
  const email = String(formData.get("email") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const additionalInfo = String(formData.get("additionalInfo") ?? "").trim();
  const rawRequestTypes = formData
    .getAll("requestType")
    .map((entry) => (typeof entry === "string" ? entry : ""))
    .filter((entry) => entry.length > 0);

  /* 2. Validate. */
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (firstName.length > MAX_NAME || lastName.length > MAX_NAME) {
    return {
      ok: false,
      error: `Names must be ${MAX_NAME} characters or fewer.`,
    };
  }
  if (additionalInfo.length > MAX_ADDITIONAL_INFO) {
    return {
      ok: false,
      error: `Additional information must be ${MAX_ADDITIONAL_INFO} characters or fewer.`,
    };
  }

  /* Resolve every submitted id to its canonical entry — drops
   * unknown ids on the floor and de-dupes (a tampered request
   * sending `requestType=delete` three times shouldn't fan out
   * three "Delete" lines in the email). */
  const selected = Array.from(
    new Set(
      rawRequestTypes
        .map((id) => findPrivacyRequestType(id))
        .filter((type): type is (typeof PRIVACY_REQUEST_TYPES)[number] => Boolean(type)),
    ),
  );

  if (selected.length === 0) {
    return {
      ok: false,
      error: "Please select at least one request.",
    };
  }

  /* 3. Notify support. Plain text — same dialect as the
   *    contact action's notification email. */
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || "(name not provided)";

  const supportSubject = `[Privacy] Privacy request from ${displayName}`;
  const supportBodyParts: string[] = [
    `From: ${displayName} <${email}>`,
    "",
    "Requested actions:",
    ...selected.map((type) => `  - ${type.label}`),
  ];
  if (additionalInfo) {
    supportBodyParts.push("", "Additional information:", additionalInfo);
  }
  supportBodyParts.push(
    "",
    "Identity verification: please verify the requester's identity before processing the request.",
    "",
    "Processing timelines (U.S. state laws):",
    "  - Opt-out requests: within 15 business days.",
    "  - Other requests (access, deletion, correction): within 45 days; up to 90 days for complex cases (notify the requester if extension is needed).",
  );

  const supportResult = await sendEmail({
    to: env.CONTACT_TO_EMAIL,
    subject: supportSubject,
    text: supportBodyParts.join("\n"),
    /* Reply lands in the shopper's inbox so support can ask
     * verification questions without round-tripping through
     * us. */
    replyTo: `${displayName} <${email}>`,
  });

  if (!supportResult.ok) {
    return {
      ok: false,
      error:
        supportResult.reason === "not_configured"
          ? "Privacy requests are temporarily unavailable. Please email us directly."
          : "Couldn't send your request. Please try again in a moment.",
    };
  }

  /* 4. Confirmation to the shopper. Optional sender — soft-
   *    fails if `NOTIFICATIONS_FROM_EMAIL` isn't configured.
   *    The support notification has already landed, so the
   *    request's audit trail is intact even when the
   *    confirmation misfires. */
  if (env.NOTIFICATIONS_FROM_EMAIL) {
    const greetingName = firstName || "there";
    const confirmationParts: string[] = [
      `Hi ${greetingName},`,
      "",
      "Thanks for submitting your privacy request. We received your request to:",
      ...selected.map((type) => `  - ${type.label}`),
      "",
      "What happens next:",
      "  - Opt-out requests are processed within 15 business days as required by law.",
      "  - Other requests (access, deletion, correction) are processed within 45 days. If we need more time — up to 90 days for complex cases — we’ll let you know.",
      "",
      "If we need to verify your identity or gather additional information, we’ll contact you at this email address.",
      "",
      "Talk soon,",
      "Zepr Privacy Team",
    ];

    const confirmationResult = await sendEmail({
      from: env.NOTIFICATIONS_FROM_EMAIL,
      to: email,
      subject: "We’ve received your privacy request",
      text: confirmationParts.join("\n"),
      replyTo: env.CONTACT_TO_EMAIL,
    });

    if (!confirmationResult.ok) {
      console.error(
        "[privacy-request] confirmation email failed",
        confirmationResult.reason,
        confirmationResult.error,
      );
    }
  }

  return { ok: true };
}
