import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
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
};

export const viewport: Viewport = {
  themeColor: site.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        </DeviceProvider>
      </body>
    </html>
  );
}
