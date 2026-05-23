# Zepr v2

Clean-room rebuild of the Zepr storefront on the modern Next.js stack.
Designed for sub-second first-paint on the PDP, an enterprise-grade
config / type-safety story, and the lightest possible client bundle.

## Stack

- **Next.js 16** (App Router, Turbopack dev, **Cache Components / PPR**)
- **React 19** (server components, concurrent rendering, async metadata)
- **Tailwind CSS 4** (`@theme` tokens, custom variants, no config file)
- **TypeScript** (strict)
- **Zod + `@t3-oss/env-nextjs`** for typed, validated env
- **GraphQL Code Generator** for typed Shopify Storefront queries

## Architecture goals

- **First-visitor TTFB measured in tens of ms** — every catalog page is
  prerendered via Next 16's `'use cache'` directive (the stable PPR
  successor). Cached HTML streams while dynamic holes (cart count,
  buy-box state) hydrate inside Suspense boundaries.
- **SSR-resolved device mode** — `<html data-device>` is set on the
  server from cookie + UA before first paint. No flash, no viewport
  hacks. Desktop is `min-width: 1280px` clamped; mobile stays fluid
  down to 320px. See
  [`src/lib/device-detection.ts`](src/lib/device-detection.ts).
- **Server-only secrets** — the Storefront / Admin tokens never reach
  the JS bundle. Imports are guarded by `"server-only"`, and the env
  schema fails the build if a misconfiguration would expose anything.
- **Reusable primitives** — components like `Modal`, `Skeleton`,
  `Button`, `ProductCard` are designed once and shared everywhere.
  The patterns come from `salespace/` (device-aware, prop-thin,
  composition-first); we'll port them in as we need them.

## Getting started

```bash
cp .env.example .env
# fill in SHOPIFY_STOREFRONT_PRIVATE_TOKEN (and the other sections you need)

npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command                 | What it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Next dev server with Turbopack                       |
| `npm run build`         | Production build (validates env, prerenders pages)   |
| `npm run start`         | Serve the production build                           |
| `npm run lint`          | ESLint (`next/core-web-vitals` + TS)                 |
| `npm run typecheck`     | `tsc --noEmit`                                       |
| `npm run analyze`       | `ANALYZE=true next build` — opens bundle visualizer  |
| `npm run codegen`       | Regenerate Shopify Storefront types from the schema  |
| `npm run codegen:watch` | Codegen in watch mode while iterating on queries     |

## Project layout

```
src/
├── app/                    # App Router routes + globals.css
│   ├── layout.tsx          # Root layout — SSR device gate lives here
│   ├── page.tsx            # Home (placeholder for now)
│   ├── loading.tsx         # Default route-level loader
│   ├── not-found.tsx       # 404
│   └── globals.css         # Tailwind theme + device-aware variants
├── components/
│   ├── device/             # DeviceProvider, hooks
│   └── layout/             # ShopLayout shell (header/footer slot in later)
├── config/
│   └── site.ts             # Brand identity / metadata
├── lib/
│   ├── device-detection.ts # Server-side device resolver
│   ├── device-mode.ts      # Types + cookie/breakpoint constants
│   ├── utils.ts            # cn, formatMoney, discountPercent
│   └── shopify/
│       ├── client.ts       # Storefront API fetch wrapper (server-only)
│       └── generated/      # `npm run codegen` output (gitignored)
└── env.ts                  # Typed + validated runtime config
```

## How the cache model works

We deliberately do **not** enable Cache Components / `'use cache'`. It
would force the device-cookie read out of the root layout into a
Suspense boundary, which then can't sit above `<html data-device>` —
so the SSR device gate would flash. Same trade-off applied to v4.

Instead the speed comes from two well-trodden Next.js primitives:

1. **Cached `fetch` inside `shopifyFetch`** — every Storefront call goes
   through one wrapper with `next.revalidate` (defaults to 1 hour) and
   `next.tags`. Repeated requests inside the revalidate window are
   served from Next's data cache without touching Shopify.
2. **`generateStaticParams` on PDP / collection routes** — the top N
   product handles are baked into the build. First-time visitors land
   on a statically-served HTML file; lesser-trafficked pages fall back
   to ISR (per-page `revalidate`) and become static after one render.

What the user gets on the PDP, then: a static-served HTML response in
~30 ms TTFB on cached entries, with the cart count and variant-aware
buy button hydrating client-side from the cart context. No
cache-warming jobs, no webhook fan-out, no Suspense gymnastics.

## Env

`src/env.ts` is the only place that reads `process.env`. The Zod schema
splits server-only keys from `NEXT_PUBLIC_*` keys; misconfiguration
fails the build, not the first request. Legacy Hydrogen names
(`PUBLIC_STORE_DOMAIN`, `PRIVATE_STOREFRONT_API_TOKEN`, …) are accepted
as fallbacks so the existing `.env` from the previous app keeps working.

## Device gate

The whole app renders against a resolved `DeviceMode` —
`"mobile"` or `"desktop"` — set on `<html data-device>` in the root
layout from (in order):

1. Env kill-switch (`NEXT_PUBLIC_DEVICE_DETECTION_ENABLED=false`
   forces desktop).
2. The `device_mode` cookie if previously set.
3. A conservative User-Agent sniff.

The client refiner reads `matchMedia` on mount, corrects the cookie if
the SSR guess disagreed with the live viewport, and keeps listening
for resize/orientation events. All Tailwind viewport variants are
overridden to also fire when `data-device="desktop"` so a narrow
desktop window scrolls horizontally instead of reflowing.

## Security headers

`next.config.ts` sets baseline headers on every response:
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: strict-origin-when-cross-origin`, a tight
`Permissions-Policy`, and HSTS with preload. A real CSP will land
once the third-party origin list (analytics, embeds, iframes) is
finalised — done early it would be permissive; done last it's tight.
