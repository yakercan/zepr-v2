import "server-only";

import { Resend } from "resend";

import { env } from "@/env";

/**
 * Server-side Resend client + helpers.
 *
 * One source of truth for outbound transactional email so the
 * contact form, future order-status notifications, password
 * resets, etc. all speak the same configuration (single API key,
 * single "from" line, one place to swap providers).
 *
 * Why module-level singleton: the Resend SDK holds an HTTP keep-
 * alive pool internally; re-instantiating per request would defeat
 * the pool and pay the TLS handshake on every email. Lazy-created
 * on first use so a deploy without `RESEND_API_KEY` boots fine
 * (build-time / dev environments that never trigger an email
 * never spin up the client).
 *
 * Why hand-roll a tiny wrapper instead of exporting `resend`
 * directly:
 *
 *   - Normalises the "missing config" path. The contact form (and
 *     any future caller) gets a strongly-typed `EmailResult`
 *     instead of having to catch a generic Resend exception or
 *     guard `env.RESEND_API_KEY` themselves.
 *   - Centralises the `File → Resend attachment` conversion.
 *     Files come off `FormData` as `File` objects; Resend wants
 *     `{ filename, content: Buffer }`. One place to do that
 *     conversion correctly (including the `arrayBuffer()` → `Buffer`
 *     dance) means a future surface that wants email attachments
 *     calls one function and gets it right.
 */

export type EmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_configured" | "send_failed"; error?: string };

/**
 * Resend attachment shape that mirrors what `resend.emails.send`
 * accepts — `content` as a `Buffer` (we go through `File` → bytes
 * → Buffer in the helper) plus a filename for the email client's
 * UI. `contentType` is optional; Resend infers from the filename
 * extension when omitted, which is fine for the common cases.
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailInput {
  /** Override the configured `CONTACT_FROM_EMAIL` for this one
   *  send. Almost never needed — left in so password-reset /
   *  order-status flows can use their own "from" line later
   *  without forking the helper. */
  from?: string;
  to: string | string[];
  subject: string;
  /** Plain-text body. Pass either this, `html`, or both — Resend
   *  prefers `html` when both are present but falls back cleanly
   *  on inbox previews / clients that strip HTML. */
  text?: string;
  html?: string;
  /** Inbox "Reply" lands here instead of the `from` address.
   *  Critical for the contact form — support hits reply, message
   *  goes back to the shopper, not to the no-reply sender. */
  replyTo?: string;
  attachments?: EmailAttachment[];
}

let cached: Resend | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!cached) cached = new Resend(env.RESEND_API_KEY);
  return cached;
}

/**
 * Send a transactional email. Returns a discriminated result so
 * callers can branch cleanly on failure without try/catch.
 *
 * "Not configured" is treated as a soft failure (returns `reason:
 * "not_configured"`) rather than an exception so a build without
 * the Resend env vars still typechecks + runs — the surface
 * calling this just falls back to a "contact temporarily
 * unavailable" message instead of crashing.
 */
export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  const resend = getResend();
  if (!resend) return { ok: false, reason: "not_configured" };

  const from = input.from ?? env.CONTACT_FROM_EMAIL;
  if (!from) return { ok: false, reason: "not_configured" };

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      ...(input.text ? { text: input.text } : {}),
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments }
        : {}),
    } as Parameters<typeof resend.emails.send>[0]);

    if (error || !data?.id) {
      return {
        ok: false,
        reason: "send_failed",
        error: error?.message ?? "Email provider returned no message id.",
      };
    }
    return { ok: true, id: data.id };
  } catch (cause) {
    /* Resend's SDK throws for network errors and a few invalid-
     * argument shapes. Normalise to the same discriminated result
     * so the caller doesn't have to also wrap in try/catch. */
    const message =
      cause instanceof Error ? cause.message : "Unknown email error.";
    return { ok: false, reason: "send_failed", error: message };
  }
}

/**
 * Convert an array of browser-side `File` objects (as they come
 * off a `FormData.getAll(...)`) into the `Buffer`-backed
 * attachments Resend expects.
 *
 * Runs every file's `arrayBuffer()` in parallel — `Promise.all` is
 * deliberate since the disk / network read for each file is
 * independent. Order is preserved so the recipient inbox shows
 * attachments in the same order the shopper picked them.
 */
export async function filesToAttachments(
  files: ReadonlyArray<File>,
): Promise<EmailAttachment[]> {
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name || "attachment",
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || undefined,
    })),
  );
}
