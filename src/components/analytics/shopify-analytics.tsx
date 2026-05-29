"use client";

import { useShopifyCookies } from "@shopify/hydrogen-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAnalyticsConsent } from "@/lib/analytics/consent";
import { trackPageView } from "@/lib/analytics/events";
import { hydrateShopifyAnalyticsConfig } from "@/lib/analytics/providers/shopify";

/**
 * Shopify analytics client island.
 *
 * Mounted once in `<ShopLayout>`. Owns three concerns:
 *
 *   1. **Config hydration.** Threads the server-only
 *      `SHOPIFY_SHOP_ID` into the client analytics provider on
 *      first paint. The provider stashes it in a module-level
 *      `config` so every `track*` call afterwards picks it up
 *      without further plumbing.
 *
 *   2. **Visitor + session cookies.** `useShopifyCookies` from
 *      `@shopify/hydrogen-react` writes the two cookies Shopify's
 *      pipeline needs to attribute events to the shopper:
 *
 *        - `_shopify_y` — long-lived visitor id (1 year)
 *        - `_shopify_s` — session id (30 min sliding)
 *
 *      Without these, events POST cleanly but appear as
 *      "unknown visitor" in Admin Analytics. Cookies are scoped
 *      to the apex domain so the same `_shopify_y` flows through
 *      to `checkout.zepr.com` when the shopper checks out.
 *      Hook reacts to consent changes — flipping consent off
 *      clears the cookies on its own.
 *
 *   3. **Page-view emission.** Fires `trackPageView()` once on
 *      mount and again whenever the URL changes (path *or*
 *      search params — Shopify's Trekkie reads the whole URL
 *      from `getClientBrowserParameters()` so a query-only
 *      change is a legitimate new page-view for funnel
 *      purposes). The resource-specific trackers (`<ProductView
 *      Tracker>`, etc.) layer dedicated events on top — this
 *      one keeps generic session continuity intact.
 *
 *      `lastUrlRef` guards against duplicate fires when React
 *      re-renders for unrelated reasons (theme toggles, store
 *      subscriptions, Strict Mode double-invocation).
 *
 * SSR boundary: this whole file is `"use client"` because
 * `useShopifyCookies` and `getClientBrowserParameters()` both
 * read `document` / `window`. The layout renders this server-side
 * but it ships as JS — no analytics event ever fires server-side.
 */
export function ShopifyAnalytics({
  shopId,
  storefrontId,
  cookieDomain,
  checkoutDomain,
  currency = "USD",
  acceptedLanguage = "en",
}: {
  shopId: string;
  /** Headless storefront ID (Sales channels → Headless). Threaded
   *  into every event as `storefrontId` so Shopify resolves the
   *  `hydrogenSubchannelId` and attributes the session to this
   *  storefront in Live View. Omitting it ships subchannel `"0"`,
   *  which Live View ignores. */
  storefrontId: string;
  /** Apex domain (e.g. `"zepr.com"`) the visitor/session cookies
   *  are scoped to. Required for Admin Analytics to attribute
   *  events to a session — without it the cookies default to
   *  host-only scope and don't bridge to `checkout.<apex>`,
   *  breaking conversion attribution. */
  cookieDomain?: string;
  /** Checkout host (e.g. `"checkout.zepr.com"`). Passed through
   *  to `useShopifyCookies` so it can validate the cookie domain
   *  can actually be read by the checkout origin. */
  checkoutDomain?: string;
  currency?: string;
  acceptedLanguage?: string;
}) {
  /* Hydrate provider config before any other hook can fire an
   * event. Lazy-init via ref so this runs exactly once per
   * mount even under Strict Mode's double-invocation. */
  const initRef = useRef<true | null>(null);
  if (initRef.current === null) {
    initRef.current = true;
    hydrateShopifyAnalyticsConfig({
      shopId,
      storefrontId,
      currency,
      acceptedLanguage,
    });
  }

  const hasUserConsent = useAnalyticsConsent();
  useShopifyCookies({
    hasUserConsent,
    /* Apex-scoped cookies so the same `_shopify_y` /
     * `_shopify_s` pair is sent on requests to both the
     * storefront (`www.zepr.com`) and the Shopify-hosted
     * checkout (`checkout.zepr.com`). Without
     * apex scoping, the cookies are host-only on the
     * storefront origin and Admin Analytics can't link
     * pre-checkout sessions to conversions. */
    domain: cookieDomain,
    checkoutDomain,
  });

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    /* Compose the canonical "URL" key the Shopify pipeline
     * cares about. `usePathname()` already excludes hash, and
     * Shopify treats search-param-only changes as new page
     * views (used for filtered category pages). */
    const search = searchParams?.toString() ?? "";
    const url = search ? `${pathname}?${search}` : pathname;
    if (lastUrlRef.current === url) return;
    lastUrlRef.current = url;

    trackPageView();
  }, [pathname, searchParams]);

  return null;
}
