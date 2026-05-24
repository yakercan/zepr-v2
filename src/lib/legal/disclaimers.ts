import "server-only";

/**
 * Legal disclaimer copy + resolver — used by the PDP "Disclaimer"
 * accordion section.
 *
 * The Shopify `custom.legal_disclaimer` metafield acts as BOTH a
 * feature flag and a category selector — never as raw prose:
 *
 *   1. Empty / unset metafield → no Disclaimer section on the PDP.
 *   2. Non-empty metafield → the section mounts.
 *   3. The metafield's leading text is matched (case-insensitive,
 *      whitespace-trimmed, `startsWith`) against `VARIANT_TABLE`;
 *      first hit picks that variant's body.
 *   4. Anything else → the cosmetics / wellness default.
 *
 * Raw metafield prose is deliberately NEVER rendered. Every body
 * shown to a shopper is one of the lawyer-approved constants in
 * this file — merchants only seed the metafield with the variant
 * sentinel (or any placeholder text for the default), so legal
 * iterates the copy by editing code, not by spelunking Shopify.
 *
 * `server-only` because the constants total ~3 KB of static text:
 * the resolved HTML reaches the page through the server-rendered
 * RSC tree, and the client bundle never imports the constants.
 * If a future surface needs a client-side disclaimer (cart drawer
 * warning, etc.), refactor the constants out of this file rather
 * than dropping the directive.
 */

/**
 * Default cosmetics / wellness disclaimer — applied to every
 * product whose metafield is set but doesn't match any variant
 * sentinel. The vast majority of the catalogue lands here.
 */
export const LEGAL_DISCLAIMER_HTML = `
<p>Products listed and sold on Zepr.com are provided for external cosmetic use only and are not intended to diagnose, treat, cure, or prevent any disease or medical condition. The information provided on Zepr.com, including product descriptions, images, usage instructions, and related content, is for general informational purposes only and is not intended as a substitute for professional medical advice, diagnosis, or treatment.</p>

<p>While Zepr.com endeavors to ensure that product information is accurate and current, manufacturers may alter their product formulations, ingredients, packaging, and labeling at any time without notice. As such, actual product packaging and materials may contain more or different information than what appears on our website. We strongly recommend that customers always read labels, warnings, and directions before using any product.</p>

<p>Statements regarding cosmetic or wellness products on this site have not been evaluated by the U.S. Food and Drug Administration (FDA). No information provided by Zepr.com should be construed as making any medical claims or endorsements.</p>

<p>Zepr.com does not manufacture, test, or modify any of the products sold through the platform. Responsibility for product quality, safety, labeling, compliance, and performance lies solely with the respective manufacturers and sellers. Zepr.com assumes no liability for any inaccuracies, product misstatements, side effects, allergic reactions, or adverse outcomes resulting from the use of any product sold on the platform.</p>

<p>By purchasing or using any product listed on Zepr.com, you acknowledge and agree that you are doing so at your own discretion and risk. If you have any medical concerns or conditions, please consult a licensed healthcare professional prior to using any product.</p>

<p>For additional information about a specific product, please contact the product's manufacturer directly.</p>
`;

/**
 * Radar-detector variant — jurisdictional "laws vary" warning,
 * selected when the metafield's leading text matches the radar
 * sentinel below.
 */
export const RADAR_DISCLAIMER_HTML = `
<p>Radar detector laws vary by state and jurisdiction within the United States. Radar detectors are illegal for use in all vehicles in Virginia and Washington, D.C., and prohibited in commercial vehicles nationwide under federal law (49 CFR § 392.71). Some states may also restrict their use on military bases or certain highways.</p>

<p>By purchasing or using this product, you agree that it is your sole responsibility to ensure compliance with all applicable federal, state, and local laws. Zepr.com and its affiliates make no representations or warranties regarding the legality of possession or use of radar detectors in your area and assume no liability for any fines, penalties, or damages resulting from misuse or unlawful operation.</p>

<p>For up-to-date legal information, please consult your local law enforcement agency or state transportation authority before using this product.</p>
`;

/**
 * Sentinel → body lookup. The metafield's leading text is matched
 * case-insensitively against each entry; first hit wins.
 *
 * Adding a variant: pick a sentinel that can't prefix-match an
 * existing one (today's sentinels are full sentences, so
 * collisions are practically impossible) and append it here. No
 * other code needs to change.
 */
const VARIANT_TABLE: ReadonlyArray<{
  sentinel: string;
  html: string;
}> = [
  {
    sentinel:
      "Radar detector laws vary by state and jurisdiction within the United States.",
    html: RADAR_DISCLAIMER_HTML,
  },
];

/**
 * Resolve a Shopify `custom.legal_disclaimer` metafield value to
 * the HTML body to render on the PDP.
 *
 * Returns:
 *
 *   - `null` when the metafield is empty / unset → the PDP hides
 *     the Disclaimer accordion section entirely.
 *   - A variant body when the value starts with that variant's
 *     sentinel (case-insensitive, whitespace-trimmed).
 *   - `LEGAL_DISCLAIMER_HTML` otherwise — i.e. any non-empty value
 *     that doesn't match a known variant falls back to the
 *     cosmetics / wellness default.
 */
export function resolveLegalDisclaimerHtml(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  for (const variant of VARIANT_TABLE) {
    if (lowered.startsWith(variant.sentinel.toLowerCase())) {
      return variant.html;
    }
  }
  return LEGAL_DISCLAIMER_HTML;
}
