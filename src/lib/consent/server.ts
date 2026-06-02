import "server-only";

import { cookies } from "next/headers";

import {
  CONSENT_COOKIE,
  parseConsentChoice,
  type ConsentChoice,
} from "@/lib/consent/cookie";

/**
 * Server-side read of the shopper's persisted cookie-consent choice.
 *
 * Used by the layout to decide whether the banner still needs to
 * show: a present choice (granted / denied) means the shopper has
 * already decided and the banner stays hidden everywhere. `null`
 * means no decision yet — the banner shows in required regions.
 *
 * Defensive like `getServerMarket`: `cookies()` throws outside a
 * request scope (build / revalidate), so we swallow and treat that
 * as "no decision".
 */
export async function getConsentChoice(): Promise<ConsentChoice | null> {
  try {
    const store = await cookies();
    return parseConsentChoice(store.get(CONSENT_COOKIE)?.value);
  } catch {
    return null;
  }
}
