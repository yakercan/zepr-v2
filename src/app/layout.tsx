import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { DeviceDevTools } from "@/components/device/device-dev-tools";
import { DeviceProvider } from "@/components/device/device-provider";
import { ShopLayout } from "@/components/layout/shop-layout";
import { site } from "@/config/site";
import { resolveDeviceMode } from "@/lib/device-detection";
import { DEVICE_COOKIE } from "@/lib/device-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${site.name} | ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  metadataBase: new URL(`https://${site.domain}`),
  /* Favicon shares the same asset as the in-header Logo so the
   * tab icon and the storefront mark can't drift apart. Pointing
   * `metadata.icons` at the public file keeps a single source of
   * truth — no `app/icon.svg` duplicate to keep in sync. */
  icons: {
    icon: "/zepr-logo.svg",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const device = resolveDeviceMode(
    headerStore.get("user-agent"),
    cookieStore.get(DEVICE_COOKIE)?.value,
  );

  return (
    <html
      lang="en"
      data-device={device.mode}
      className="h-full"
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning: browser extensions (Grammarly,
          Dashlane, etc.) inject attributes onto <body> before React
          hydrates — not an app bug, but it trips React's check. */}
      <body className="min-h-full" suppressHydrationWarning>
        <DeviceProvider initial={device}>
          <ShopLayout>{children}</ShopLayout>
          {/* Dev-only device-mode indicator + ?device=… query
              override consumer. Tree-shaken out of production via
              the literal `process.env.NODE_ENV === "development"`
              check below — zero runtime cost in shipped code. */}
          {process.env.NODE_ENV === "development" && <DeviceDevTools />}
        </DeviceProvider>
      </body>
    </html>
  );
}
