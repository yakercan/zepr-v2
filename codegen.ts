import type { CodegenConfig } from "@graphql-codegen/cli";
import { config as loadDotenv } from "dotenv";

// Codegen runs outside the Next runtime, so `process.env` doesn't have
// `.env` loaded yet. Pull it in explicitly so the schema URL and token
// resolve the same way the app does.
loadDotenv();

const domain =
  process.env.SHOPIFY_STOREFRONT_DOMAIN ?? process.env.PUBLIC_STORE_DOMAIN;
const version =
  process.env.SHOPIFY_STOREFRONT_API_VERSION ?? "2025-04";
const token =
  process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN ??
  process.env.PRIVATE_STOREFRONT_API_TOKEN ??
  process.env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN ??
  process.env.PUBLIC_STOREFRONT_API_TOKEN;

if (!domain || !token) {
  throw new Error(
    "Codegen requires SHOPIFY_STOREFRONT_DOMAIN and a Storefront token in .env. " +
      "Got domain=" +
      String(domain) +
      ", token=" +
      (token ? "<set>" : "<missing>"),
  );
}

// Private tokens use a different header — auto-detect which header to send.
const isPrivate =
  Boolean(process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN) ||
  Boolean(process.env.PRIVATE_STOREFRONT_API_TOKEN);
const headers: Record<string, string> = isPrivate
  ? { "Shopify-Storefront-Private-Token": token }
  : { "X-Shopify-Storefront-Access-Token": token };

const config: CodegenConfig = {
  overwrite: true,
  schema: {
    [`https://${domain}/api/${version}/graphql.json`]: { headers },
  },
  // Once we start writing queries, point this at `src/**/*.{ts,tsx}` so
  // codegen can scan inline `graphql(...)` strings. For now there are
  // no documents yet, but the schema introspection alone gives us the
  // typed `graphql` function and the full Storefront type definitions.
  documents: ["src/**/*.{ts,tsx}", "!src/lib/shopify/generated/**/*"],
  generates: {
    "src/lib/shopify/generated/": {
      preset: "client",
      presetConfig: {
        // Stricter scalar mapping than the defaults so we get string
        // literals where Shopify uses them (handles, IDs, money amounts).
        gqlTagName: "graphql",
      },
      config: {
        useTypeImports: true,
        skipTypename: false,
        scalars: {
          DateTime: "string",
          Decimal: "string",
          HTML: "string",
          URL: "string",
        },
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
