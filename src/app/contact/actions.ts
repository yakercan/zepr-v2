"use server";

import { env } from "@/env";
import { getAuthState } from "@/lib/auth/session";
import { findContactSubject } from "@/lib/contact/subjects";
import { filesToAttachments, sendEmail } from "@/lib/email/resend";

/**
 * Server action — submit the contact form.
 *
 * Pipeline:
 *
 *   1. **Parse** every field off `FormData`.
 *   2. **Validate** shape + length caps + email format + subject id
 *      + media limits (count, MIME, size). Server is the policy
 *      authority — the client picker filters obvious mistakes but
 *      never gates the trust boundary.
 *   3. **Compose** the subject line (`[Tag] Subject from Name`) and
 *      a plain-text body that mirrors what support would write by
 *      hand: identity, order context if provided, message, then
 *      attachments-as-files (separate from body so support can
 *      preview them inline).
 *   4. **Send** through Resend. Attachments ride the email itself
 *      rather than going through our object store — contact-form
 *      media is throwaway evidence (screenshots, damage photos)
 *      that support reads once and discards. Reviews + return
 *      requests use Supabase because they need to survive past
 *      first read; contact does not.
 *   5. **Return** a discriminated `{ ok, error? }` result. Same
 *      shape the review / return actions return so the client
 *      can use a single error-display dialect.
 *
 * Auth posture: no session required. Anyone (guest or signed-in)
 * can contact support; the form just always asks for name + email
 * so support has a reply target. When the shopper IS signed in,
 * we append a short identity block to the body so support sees
 * the verified account context without having to ask.
 */

/* Per-attachment limits — mirror the review / return-request
 * actions so the shopper's mental model ("how big a file can I
 * attach?") stays stable across surfaces. Resend's hard ceiling
 * is 40MB per message total; our 5 × 10MB photo + 50MB video caps
 * can theoretically exceed that, but the message-level cap is
 * checked separately below. */
const MAX_ATTACHMENTS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
/* Resend's documented payload limit for the entire email (subject
 * + body + attachments, after base64 encoding). Their docs cite
 * 40MB; we apply 35MB to leave headroom for the base64 expansion
 * (~33% overhead on binary) without surprising the shopper at
 * the last step. */
const MAX_TOTAL_PAYLOAD_BYTES = 35 * 1024 * 1024;

const PHOTO_MIME_RE = /^image\/(jpeg|png|webp|gif|heic|heif)$/i;
const VIDEO_MIME_RE = /^video\/(mp4|webm|quicktime|ogg)$/i;

/* Text field caps — message has no minimum floor (any non-empty
 * input counts; the trim-then-non-empty check below is enough to
 * keep accidental blank submits out). The 5000-char ceiling is a
 * long-enough essay for the most detailed bug report or
 * order-issue narrative without inviting copy-paste of an entire
 * transcript. */
const MAX_NAME = 100;
const MAX_MESSAGE = 5000;
const MAX_ORDER_NUMBER = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactResult = { ok: true } | { ok: false; error: string };

export async function submitContactAction(
  formData: FormData,
): Promise<ContactResult> {
  /* Soft-fail when the server hasn't been wired with email
   * credentials yet — the action stays runnable (typecheck +
   * deploy don't break) but the form surfaces a clear "try again
   * later" message rather than a generic 500. */
  if (!env.RESEND_API_KEY || !env.CONTACT_FROM_EMAIL || !env.CONTACT_TO_EMAIL) {
    return {
      ok: false,
      error:
        "Contact form is temporarily unavailable. Please email us directly.",
    };
  }

  /* 1. Parse */
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subjectId = String(formData.get("subject") ?? "").trim();
  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const files = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  /* 2. Validate */
  if (name.length === 0 || name.length > MAX_NAME) {
    return { ok: false, error: "Please enter your name." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  const subject = findContactSubject(subjectId);
  if (!subject) {
    return { ok: false, error: "Please pick a subject." };
  }
  if (orderNumber.length > MAX_ORDER_NUMBER) {
    return {
      ok: false,
      error: `Order number must be ${MAX_ORDER_NUMBER} characters or fewer.`,
    };
  }
  if (message.length === 0) {
    return { ok: false, error: "Please include a message." };
  }
  if (message.length > MAX_MESSAGE) {
    return {
      ok: false,
      error: `Message must be ${MAX_MESSAGE} characters or fewer.`,
    };
  }

  if (files.length > MAX_ATTACHMENTS) {
    return {
      ok: false,
      error: `You can attach up to ${MAX_ATTACHMENTS} photos or videos.`,
    };
  }
  let totalBytes = 0;
  for (const file of files) {
    const isPhoto = PHOTO_MIME_RE.test(file.type);
    const isVideo = VIDEO_MIME_RE.test(file.type);
    if (!isPhoto && !isVideo) {
      return {
        ok: false,
        error: `Unsupported file type: ${file.name || "attachment"}.`,
      };
    }
    if (isPhoto && file.size > MAX_PHOTO_BYTES) {
      return {
        ok: false,
        error: `Photos must be under ${MAX_PHOTO_BYTES / (1024 * 1024)} MB. (${file.name})`,
      };
    }
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      return {
        ok: false,
        error: `Videos must be under ${MAX_VIDEO_BYTES / (1024 * 1024)} MB. (${file.name})`,
      };
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: `Total attachment size must be under ${Math.round(
        MAX_TOTAL_PAYLOAD_BYTES / (1024 * 1024),
      )} MB. Pick a smaller selection and try again.`,
    };
  }

  /* 3. Compose. The "From: " block at the top of the body is for
   *    support's quick scan even when the inbox client doesn't
   *    surface `reply-to` prominently. The session block only
   *    appears when the shopper is signed in — it's a context
   *    cue ("yes, this email comes from a verified account, the
   *    one you'd find in Shopify under this customer record")
   *    rather than authorization. */
  const auth = await getAuthState();
  const composedSubject = `[${subject.tag}] ${name} — ${subject.label}`;

  const bodyParts: string[] = [
    `From: ${name} <${email}>`,
    `Subject: ${subject.label}`,
  ];
  if (orderNumber) bodyParts.push(`Order number: ${orderNumber}`);
  if (auth.isLoggedIn && auth.customerEmail) {
    bodyParts.push(
      `Signed-in account: ${auth.customerName ?? "(no name)"} <${auth.customerEmail}>`,
    );
  }
  bodyParts.push("");
  bodyParts.push(message);
  if (files.length > 0) {
    bodyParts.push("");
    bodyParts.push(
      `Attached: ${files.map((f) => f.name || "(unnamed)").join(", ")}`,
    );
  }
  const text = bodyParts.join("\n");

  /* 4. Send. Attachments converted in parallel so the action's
   *    critical path is bounded by the slowest single file's
   *    arrayBuffer read, not the cumulative read time. */
  const attachments = await filesToAttachments(files);
  const result = await sendEmail({
    to: env.CONTACT_TO_EMAIL,
    subject: composedSubject,
    text,
    /* `replyTo` is the magic that makes support's workflow feel
     * native — hitting reply in their inbox goes straight back to
     * the shopper, not to our `from` sender (which might be a
     * no-reply alias on the verified domain). */
    replyTo: `${name} <${email}>`,
    attachments,
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "not_configured"
          ? "Contact form is temporarily unavailable. Please email us directly."
          : "Couldn't send your message. Please try again in a moment.",
    };
  }

  /* 5. Thank-you auto-reply.
   *
   * Sent from `NOTIFICATIONS_FROM_EMAIL` (the canonical "from us
   * to the customer" sender) with `replyTo` set to support so the
   * shopper hitting reply lands their follow-up in the right
   * inbox — not in the no-reply notifications alias. Mirrors the
   * legacy storefront's setup so support's existing routing /
   * filters keep working.
   *
   * Soft-fails: a failed thank-you doesn't roll back the success
   * the shopper already saw. The notification to support has
   * already landed; the thank-you is a polish layer. If it
   * misfires (env not set, Resend hiccup), log it and move on.
   * The shopper's "Message sent" confirmation in the UI is the
   * authoritative receipt. */
  if (env.NOTIFICATIONS_FROM_EMAIL) {
    const firstName = name.split(/\s+/)[0] ?? name;
    const thankYouText = [
      `Hi ${firstName},`,
      "",
      "Thanks for reaching out — we got your message and will get back to you as soon as possible. Our processing time is usually within 1–3 business days. Replying to this email will thread your follow-up straight into the same conversation, so feel free to add anything that would help us help you faster.",
      "",
      "Your message:",
      message
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
      "",
      "Talk to you soon,",
      "Zepr Support",
    ].join("\n");

    const thankYouResult = await sendEmail({
      from: env.NOTIFICATIONS_FROM_EMAIL,
      to: email,
      subject: `Thanks for reaching out — we got your message`,
      text: thankYouText,
      replyTo: env.CONTACT_TO_EMAIL,
    });

    if (!thankYouResult.ok) {
      console.error(
        "[contact] thank-you auto-reply failed",
        thankYouResult.reason,
        thankYouResult.error,
      );
    }
  }

  return { ok: true };
}
