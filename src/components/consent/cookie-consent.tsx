"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import { setAnalyticsConsent } from "@/lib/analytics/consent";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  type ConsentChoice,
} from "@/lib/consent/cookie";
import { cn } from "@/lib/utils";

/**
 * Cookie-consent banner — a non-modal bottom drawer (Vaul) that
 * collects opt-in analytics consent in the markets that legally
 * require it (UK · Singapore, gated by the market's
 * `requiresCookieConsent` flag — the *same* geo resolution the
 * currency logic uses, no second geo path).
 *
 * Behaviour:
 *
 *   - **Stored choice (any market)** → mirror it into the analytics
 *     consent store and stay hidden. The choice persists for a year
 *     in the `zepr_cookie_consent` cookie.
 *   - **Required market, no choice** → hold analytics OFF and show
 *     the banner until the shopper picks. This is what makes the
 *     consent real: `buildEnvelope` (analytics) and
 *     `useShopifyCookies` both withhold on a `false` consent.
 *   - **Non-required market** → never shows; analytics stays on by
 *     default (US/CA/NZ/AU), exactly as before.
 *
 * Reuses our Vaul bottom-drawer dialect — the same chrome `<Sheet>`
 * gives every storefront drawer: a `black/40` backdrop, a
 * `rounded-t-2xl` surface, hairline border, and soft top shadow. We
 * don't render `<Sheet>` itself (it's compact-viewport-only and
 * always drag/backdrop-dismissible); we drive the same Vaul drawer
 * directly so the banner shows at every width and stays
 * non-dismissible. The backdrop is the point: it sits above the
 * mobile sticky add-to-cart bar instead of stacking awkwardly
 * against it, so the two bottom-pinned surfaces never contradict.
 *
 * `modal` (backdrop blocks + locks scroll) + `dismissible={false}`
 * (no drag / Escape / backdrop-tap close) means the shopper makes an
 * explicit Accept / Decline choice rather than an ambiguous
 * swipe-away.
 *
 * Mounted once in `<ShopLayout>`, ordered *before* `<ShopifyAnalytics>`
 * so its consent-off effect runs before the first page-view fires in
 * a required market.
 */

/**
 * Preview override — flip to `true` to force the banner to render on
 * ANY market (including the US) so the styling can be reviewed
 * without a VPN or the `zepr_country` cookie. MUST stay `false` in
 * production: when false, the real geo gate (UK + Singapore) governs
 * visibility.
 */
const FORCE_SHOW_FOR_PREVIEW = false;

export function CookieConsent({
  requiresConsent,
  priorChoice,
}: {
  /** Whether the visitor's market requires opt-in consent (UK / SG).
   *  Resolved server-side from the same market lookup the currency
   *  logic uses. */
  requiresConsent: boolean;
  /** The shopper's persisted choice, or `null` if undecided. */
  priorChoice: ConsentChoice | null;
}) {
  const [open, setOpen] = useState(false);
  const settled = useRef(false);

  useEffect(() => {
    /* Run the decision once per mount. Guard so a re-render (route
     * change, store update) can't reopen a banner the shopper just
     * dismissed with a choice. */
    if (settled.current) return;
    settled.current = true;

    if (priorChoice) {
      setAnalyticsConsent(priorChoice === "granted");
      return;
    }

    if (requiresConsent || FORCE_SHOW_FOR_PREVIEW) {
      setAnalyticsConsent(false);
      setOpen(true);
    }
  }, [requiresConsent, priorChoice]);

  const decide = (choice: ConsentChoice) => {
    setAnalyticsConsent(choice === "granted");
    /* Client-written, JS-readable consent flag (not HTTP-only): the
     * choice sticks immediately with no server round-trip, and the
     * layout reads it on the next load to keep the banner hidden. */
    document.cookie = `${CONSENT_COOKIE}=${choice}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax`;
    setOpen(false);
  };

  return (
    <Drawer.Root
      open={open}
      onOpenChange={setOpen}
      direction="bottom"
      dismissible={false}
    >
      <Drawer.Portal>
        {/* Backdrop — same tint as the shared `<Backdrop>` / `<Sheet>`
         *  overlay, one tier below the panel. No `onClick` close: the
         *  banner is non-dismissible, so a backdrop tap is inert and
         *  the shopper must pick Accept / Decline. */}
        <Drawer.Overlay
          className="fixed inset-0 bg-black/40"
          style={{ zIndex: "calc(var(--z-cookie-banner) - 1)" }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{ zIndex: "var(--z-cookie-banner)" }}
          className={cn(
            "fixed inset-x-0 bottom-0 flex flex-col outline-none",
            "rounded-t-2xl border border-b-0 border-[color:var(--color-border)] bg-[color:var(--color-surface)]",
            "shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.18)]",
            "pb-[env(safe-area-inset-bottom,0px)]",
          )}
        >
          <Drawer.Title className="sr-only">Cookie preferences</Drawer.Title>
          <Drawer.Description className="sr-only">
            We use cookies to improve your experience and measure site traffic.
          </Drawer.Description>

          <div
            className={cn(
              "mx-auto flex w-full max-w-[var(--page-max-px)] flex-col gap-3 py-4",
              "px-[var(--page-gutter-px)]",
              "sm:flex-row sm:items-center sm:justify-between sm:gap-6",
            )}
          >
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-secondary)]">
              We use cookies to improve your experience and measure site
              traffic. See our{" "}
              <Link
                href="/policies/cookie-policy"
                className="font-medium text-[color:var(--color-ink)] underline underline-offset-2"
              >
                Cookie Policy
              </Link>
              .
            </p>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => decide("denied")}
                className="btn-secondary flex-1 sm:flex-initial"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => decide("granted")}
                className="btn-primary flex-1 sm:flex-initial"
              >
                Accept
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
