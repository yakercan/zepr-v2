import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Single, typed source of truth for runtime configuration.
 *
 * - Variables are declared with a Zod schema so the app fails *at boot*
 *   (in dev) and *at build* (in CI) if anything is missing or malformed,
 *   instead of crashing at the first request that needs them.
 * - The `server` and `client` partitions are enforced by
 *   `@t3-oss/env-nextjs`: anything in `client` must be `NEXT_PUBLIC_…`,
 *   and the build refuses to import `server` keys from client code.
 *
 * Add new env keys here first, then read them through `env.FOO` — never
 * touch `process.env.FOO` directly.
 */
export const env = createEnv({
  server: {
    /* ----- App ----- */
    /** Canonical public base URL of this deployment, no trailing
     *  slash, HTTPS only. Used to construct OAuth `redirect_uri`s
     *  the Customer Account API sends shoppers back to, and any
     *  other absolute link that has to round-trip off-platform. */
    APP_URL: z
      .string()
      .url()
      .refine((u) => u.startsWith("https://"), {
        message: "APP_URL must use HTTPS (Shopify rejects http callbacks)",
      })
      .refine((u) => !u.endsWith("/"), {
        message: "APP_URL must not end with a trailing slash",
      }),
    /** AES-GCM master key for encrypting auth + PKCE cookies.
     *  Generate fresh with `openssl rand -base64 48`. The 32-char
     *  floor is a sanity check, not a security floor — the real
     *  cipher key is HKDF-derived from this value. */
    SESSION_SECRET: z.string().min(32),

    /* ----- Shopify Storefront API (catalog / cart, server-only) ----- */
    SHOPIFY_STOREFRONT_DOMAIN: z
      .string()
      .min(1, "SHOPIFY_STOREFRONT_DOMAIN is required"),
    SHOPIFY_STOREFRONT_PUBLIC_TOKEN: z.string().min(1).optional(),
    SHOPIFY_STOREFRONT_PRIVATE_TOKEN: z.string().min(1).optional(),
    SHOPIFY_STOREFRONT_API_VERSION: z.string().default("2026-04"),
    /** Numeric shop ID — visible in `https://shopify.com/{shopId}` on
     *  the Customer Account API settings page. Used as the OIDC
     *  discovery base for the Customer Account API. */
    SHOPIFY_SHOP_ID: z.string().min(1),

    /* ----- Shopify Customer Account API (OAuth/OIDC, server-only) ----- */
    /** Public client ID from the Headless channel. We use PKCE so
     *  there's no client secret to provision. */
    SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID: z.string().min(1),
    /** Customer Account API release. Bumped quarterly — see the
     *  Shopify API version status page before changing. The default
     *  here mirrors the Storefront / Admin versions in `.env` so
     *  every Shopify surface speaks the same schema generation. */
    SHOPIFY_CUSTOMER_ACCOUNT_API_VERSION: z.string().default("2026-04"),

    /* ----- Shopify Admin API (private, server-only) ----- */
    SHOPIFY_ADMIN_TOKEN: z.string().optional(),
    SHOPIFY_ADMIN_API_VERSION: z.string().default("2026-04"),
    SHOPIFY_WEBHOOK_SECRET: z.string().optional(),

    /* ----- Checkout ----- */
    SHOPIFY_CHECKOUT_DOMAIN: z.string().optional(),

    /* ----- Search ----- */
    SALESPACE_SEARCH_API_KEY: z.string().optional(),

    /* ----- Supabase (reviews / returns media) ----- */
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    /* ----- Forms / email / SMS ----- */
    HCAPTCHA_SECRET_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    /** "From" header on outbound transactional email — must live
     *  on a domain verified in the Resend dashboard. Conventionally
     *  `"Brand Name <support@example.com>"` so inbox previews show
     *  a friendly name rather than the bare address.
     *  Optional at boot so deploys without contact-form wiring
     *  don't fail validation; the contact action returns a graceful
     *  "temporarily unavailable" error when missing. */
    CONTACT_FROM_EMAIL: z.string().optional(),
    /** Destination inbox for the contact form. Set to whatever
     *  support address actually reads incoming messages — could be
     *  a shared inbox, a helpdesk ingest address, or a personal
     *  email during early-stage soft launch. Same optional posture
     *  as `CONTACT_FROM_EMAIL`. */
    CONTACT_TO_EMAIL: z.string().email().optional(),
    /** "From" header on outbound *customer-facing* transactional
     *  email — thank-you auto-reply after a contact submission,
     *  and the canonical sender for any future order-status /
     *  password-reset flows.
     *
     *  Kept separate from `CONTACT_FROM_EMAIL` on purpose:
     *
     *    - `contact@…` is the address support sees inbound from
     *      ("a customer submitted the contact form").
     *    - `notifications@…` is the address the customer sees
     *      inbound from us ("Zepr replied / confirmed").
     *
     *  Two roles, two from-lines, easier inbox-side filtering and
     *  reputation isolation. Optional — when unset, the contact
     *  action skips the thank-you reply gracefully (notification
     *  to support still goes through). */
    NOTIFICATIONS_FROM_EMAIL: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_SERVICE_SID: z.string().optional(),

    /* ----- Order tracking ----- */
    SEVENTEEN_TRACK_API_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_DEVICE_DETECTION_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  },
  runtimeEnv: {
    APP_URL: process.env.APP_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,

    SHOPIFY_STOREFRONT_DOMAIN: process.env.SHOPIFY_STOREFRONT_DOMAIN,
    SHOPIFY_STOREFRONT_PUBLIC_TOKEN: process.env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN,
    SHOPIFY_STOREFRONT_PRIVATE_TOKEN: process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN,
    SHOPIFY_STOREFRONT_API_VERSION: process.env.SHOPIFY_STOREFRONT_API_VERSION,
    SHOPIFY_SHOP_ID: process.env.SHOPIFY_SHOP_ID,

    SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID:
      process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID,
    SHOPIFY_CUSTOMER_ACCOUNT_API_VERSION:
      process.env.SHOPIFY_CUSTOMER_ACCOUNT_API_VERSION,

    SHOPIFY_ADMIN_TOKEN: process.env.SHOPIFY_ADMIN_TOKEN,
    SHOPIFY_ADMIN_API_VERSION: process.env.SHOPIFY_ADMIN_API_VERSION,
    SHOPIFY_WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET,

    SHOPIFY_CHECKOUT_DOMAIN: process.env.SHOPIFY_CHECKOUT_DOMAIN,

    SALESPACE_SEARCH_API_KEY: process.env.SALESPACE_SEARCH_API_KEY,

    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

    HCAPTCHA_SECRET_KEY: process.env.HCAPTCHA_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CONTACT_FROM_EMAIL: process.env.CONTACT_FROM_EMAIL,
    CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL,
    NOTIFICATIONS_FROM_EMAIL: process.env.NOTIFICATIONS_FROM_EMAIL,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_SERVICE_SID: process.env.TWILIO_SERVICE_SID,

    SEVENTEEN_TRACK_API_KEY: process.env.SEVENTEEN_TRACK_API_KEY,

    NEXT_PUBLIC_DEVICE_DETECTION_ENABLED:
      process.env.NEXT_PUBLIC_DEVICE_DETECTION_ENABLED,
  },
  // Tiny correctness knobs.
  emptyStringAsUndefined: true,
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "true" ||
    process.env.npm_lifecycle_event === "lint",
});
