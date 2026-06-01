import type { Metadata, Viewport } from "next";
import { ShopLayout } from "@/components/layout/shop-layout";
import { site } from "@/config/site";
import { JsonLd } from "@/lib/seo/json-ld";
import { organizationSchema } from "@/lib/seo/structured-data";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${site.name} | ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  metadataBase: new URL(`https://${site.domain}`),
  /* Icons share the same source mark as the in-header Logo so the
   * tab icon and the storefront brand can't drift apart. SVG is the
   * primary favicon — scalable and crisp in every modern browser —
   * with the square PNG as a raster fallback for the few surfaces
   * that don't take SVG, and as the `apple-touch-icon` (iOS home
   * screens require a raster, never SVG). Pointing at the public
   * files keeps a single source of truth — no `app/icon.*`
   * duplicates to keep in sync. */
  icons: {
    icon: [
      { url: "/zepr-logo.svg", type: "image/svg+xml" },
      { url: "/zepr-logo.png", type: "image/png", sizes: "any" },
    ],
    apple: "/zepr-logo.png",
  },
  /* Social-card defaults. Per-page `generateMetadata` overrides
   * `title`/`description`/`url`/`images` (PDPs ship the product
   * photo); everything here is the fallback for pages that don't.
   * No canonical is set at the root — that's per-page so we never
   * accidentally point every URL at one. */
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name} | ${site.tagline}`,
    description: site.description,
    url: `https://${site.domain}`,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} | ${site.tagline}`,
    description: site.description,
  },
};

export const viewport: Viewport = {
  themeColor: site.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /* When the on-screen keyboard opens, resize the layout viewport
   * (not just the visual one) so bottom-anchored fixed UI — chiefly
   * our Vaul sheets — rises to sit above the keyboard instead of
   * being buried behind it. Android Chrome honours this; iOS Safari
   * ignores it but already pins fixed elements to the visual
   * viewport, so both platforms end up keyboard-aware without any
   * per-drawer JS repositioning. */
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* No per-request device read here: layout follows the viewport via
     CSS, and the touch/hover interaction model is resolved on the
     client (see `components/device/device-provider.tsx`). That keeps
     the root layout free of dynamic request data. */
  return (
    <html lang="en" className="h-full">
      {/* suppressHydrationWarning: browser extensions (Grammarly,
          Dashlane, etc.) inject attributes onto <body> before React
          hydrates — not an app bug, but it trips React's check. */}
      <body className="min-h-full" suppressHydrationWarning>
        {/* Brand identity for the Knowledge Graph — emitted once
            here so every route carries it. Page-specific schema
            (Product, BreadcrumbList, …) is rendered per route. */}
        <JsonLd data={organizationSchema()} />
        <ShopLayout>{children}</ShopLayout>
      </body>
    </html>
  );
}
