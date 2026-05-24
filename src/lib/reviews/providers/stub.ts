import "server-only";

import type { ProductReviewSummary } from "@/lib/reviews/types";

/**
 * Stub review provider — returns `null` for every product so the
 * PDP renders as if no review system is wired (the section
 * auto-hides for guests, shows "Be the first" + write-review CTA
 * for signed-in shoppers).
 *
 * Future providers — `salespace.ts`, `judgeme.ts`, `yotpo.ts`,
 * etc. — sit next to this file and implement the same async
 * `(productId: string) => Promise<ProductReviewSummary | null>`
 * signature. The dispatcher in `lib/reviews/index.ts` picks one,
 * so swapping systems is a single import + export change.
 *
 * Why a stub instead of just letting the dispatcher return null:
 *
 *   - Keeps the provider surface explicit (one module per
 *     system, easy to grep for "how do we talk to X").
 *   - The `_productId` unused-parameter is intentional — it
 *     pins down the interface so a real provider can't quietly
 *     skip the argument and end up returning aggregate data.
 */
export async function fetchProductReviewsStub(
  _productId: string,
): Promise<ProductReviewSummary | null> {
  return null;
}
