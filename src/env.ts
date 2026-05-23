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
 * - The legacy `PUBLIC_*` prefix from the Hydrogen `.env` is preserved
 *   in the user's file — `runtimeEnv` below remaps it onto clean
 *   internal names. Adding the modern name to `.env` makes the legacy
 *   fallback a no-op; either works.
 *
 * Add new env keys here first, then read them through `env.FOO` — never
 * touch `process.env.FOO` directly.
 */
export const env = createEnv({
  server: {
    SHOPIFY_STOREFRONT_DOMAIN: z
      .string()
      .min(1, "SHOPIFY_STOREFRONT_DOMAIN (or PUBLIC_STORE_DOMAIN) is required"),
    SHOPIFY_STOREFRONT_PUBLIC_TOKEN: z.string().min(1).optional(),
    SHOPIFY_STOREFRONT_PRIVATE_TOKEN: z.string().min(1).optional(),
    SHOPIFY_STOREFRONT_API_VERSION: z.string().default("2025-04"),
    SHOPIFY_STOREFRONT_ID: z.string().optional(),
    SHOPIFY_SHOP_ID: z.string().optional(),

    SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID: z.string().optional(),
    SHOPIFY_CUSTOMER_ACCOUNT_URL: z.string().url().optional(),

    SHOPIFY_ADMIN_TOKEN: z.string().optional(),
    SHOPIFY_ADMIN_API_VERSION: z.string().default("2025-04"),
    SHOPIFY_WEBHOOK_SECRET: z.string().optional(),

    SHOPIFY_CHECKOUT_DOMAIN: z.string().optional(),

    SANITY_PROJECT_ID: z.string().optional(),
    SANITY_DATASET: z.string().default("production"),
    SANITY_API_VERSION: z.string().default("2024-01-01"),

    SALESPACE_SEARCH_API_KEY: z.string().optional(),
    SMART_SEARCH_API_KEY: z.string().optional(),

    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    HCAPTCHA_SECRET_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_SERVICE_SID: z.string().optional(),

    SEVENTEEN_TRACK_API_KEY: z.string().optional(),

    SESSION_SECRET: z.string().min(16).optional(),
  },
  client: {
    NEXT_PUBLIC_DEVICE_DETECTION_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  },
  // Map: clean name  ←  modern env  ?? legacy `.env` from Hydrogen days.
  // Keeping the legacy fallback means no migration required for the
  // user's existing `.env`.
  runtimeEnv: {
    SHOPIFY_STOREFRONT_DOMAIN:
      process.env.SHOPIFY_STOREFRONT_DOMAIN ?? process.env.PUBLIC_STORE_DOMAIN,
    SHOPIFY_STOREFRONT_PUBLIC_TOKEN:
      process.env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN ??
      process.env.PUBLIC_STOREFRONT_API_TOKEN,
    SHOPIFY_STOREFRONT_PRIVATE_TOKEN:
      process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN ??
      process.env.PRIVATE_STOREFRONT_API_TOKEN,
    SHOPIFY_STOREFRONT_API_VERSION: process.env.SHOPIFY_STOREFRONT_API_VERSION,
    SHOPIFY_STOREFRONT_ID:
      process.env.SHOPIFY_STOREFRONT_ID ?? process.env.PUBLIC_STOREFRONT_ID,
    SHOPIFY_SHOP_ID: process.env.SHOPIFY_SHOP_ID ?? process.env.SHOP_ID,

    SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID:
      process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID ??
      process.env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID,
    SHOPIFY_CUSTOMER_ACCOUNT_URL:
      process.env.SHOPIFY_CUSTOMER_ACCOUNT_URL ??
      process.env.PUBLIC_CUSTOMER_ACCOUNT_API_URL,

    SHOPIFY_ADMIN_TOKEN:
      process.env.SHOPIFY_ADMIN_TOKEN ?? process.env.PRIVATE_ADMIN_API_TOKEN,
    SHOPIFY_ADMIN_API_VERSION:
      process.env.SHOPIFY_ADMIN_API_VERSION ??
      process.env.PRIVATE_ADMIN_API_VERSION,
    SHOPIFY_WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET,

    SHOPIFY_CHECKOUT_DOMAIN:
      process.env.SHOPIFY_CHECKOUT_DOMAIN ?? process.env.PUBLIC_CHECKOUT_DOMAIN,

    SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID,
    SANITY_DATASET: process.env.SANITY_DATASET,
    SANITY_API_VERSION: process.env.SANITY_API_VERSION,

    SALESPACE_SEARCH_API_KEY: process.env.SALESPACE_SEARCH_API_KEY,
    SMART_SEARCH_API_KEY: process.env.SMART_SEARCH_API_KEY,

    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY:
      process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

    HCAPTCHA_SECRET_KEY: process.env.HCAPTCHA_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_SERVICE_SID: process.env.TWILIO_SERVICE_SID,

    SEVENTEEN_TRACK_API_KEY: process.env.SEVENTEEN_TRACK_API_KEY,

    SESSION_SECRET: process.env.SESSION_SECRET,

    NEXT_PUBLIC_DEVICE_DETECTION_ENABLED:
      process.env.NEXT_PUBLIC_DEVICE_DETECTION_ENABLED,
  },
  // Tiny correctness knobs.
  emptyStringAsUndefined: true,
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "true" ||
    process.env.npm_lifecycle_event === "lint",
});
