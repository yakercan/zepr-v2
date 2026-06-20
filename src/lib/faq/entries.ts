/**
 * FAQ content — the typed, version-controlled replacement for
 * what old Zepr pulled from Sanity (`faqs` modules attached to
 * pages, with Portable Text answers).
 *
 * Why a TS module instead of metafields or markdown files:
 *
 *   - **Stable copy.** Support FAQs change maybe twice a year —
 *     a deploy on edit is fine, and the diff is the audit trail.
 *   - **No runtime fetch.** Static data renders instantly with
 *     the page shell; no Storefront / Supabase round-trip to
 *     budget, no cache layer to maintain.
 *   - **Same pattern as `CONTACT_SUBJECTS`.** Keeps the codebase
 *     coherent: typed, frozen arrays for catalog-shaped content
 *     that the team curates rather than the CMS publishes.
 *
 * Answer copy uses a markdown-lite dialect parsed by
 * `<FaqList>`:
 *
 *   - `\n` (single newline)             → paragraph break.
 *   - `[label](href)`                   → inline link. Internal
 *                                         hrefs (`/…`) render as
 *                                         `<Link>`; mailto + http
 *                                         render as `<a>`.
 *
 * No other markup is supported on purpose — adding bold / italic
 * / lists pulls in a parser and the support copy doesn't need it.
 * If a future answer truly does, lift the renderer to handle the
 * one extra primitive rather than swapping in a markdown library.
 */

export interface FaqItem {
  /** Stable id, used as the React key + the anchor hash on the
   *  page so deep links like `/faq#delivery-time` keep working
   *  forever even if the question text gets reworded. */
  id: string;
  question: string;
  answer: string;
}

export interface FaqSection {
  /** Stable id — used as both the section's anchor hash on the
   *  page and the section's React key. */
  id: string;
  title: string;
  items: ReadonlyArray<FaqItem>;
}

/**
 * Placeholder in answer copy, swapped at render for the visitor
 * market's formatted free-shipping threshold (e.g. `$35` / `£35` /
 * `S$50` / `$50`). Keeps the catalog static + currency-agnostic while letting
 * the one money-bearing answer track the active market — see
 * `resolveFaqSections`. */
export const SHIPPING_THRESHOLD_TOKEN = "{shippingThreshold}";

/**
 * Canonical FAQ catalog. Order is the order shoppers see it on
 * `/faq`. Sections are grouped by "what part of the journey is
 * the shopper asking about" — Orders / Delivery / Returns is the
 * usual lifecycle, matching the order the questions naturally
 * arise.
 */
export const FAQ_SECTIONS: ReadonlyArray<FaqSection> = [
  {
    id: "orders",
    title: "Orders",
    items: [
      {
        id: "minimum-order",
        question: "Do you have a minimum order?",
        answer:
          "Nope — there’s no minimum order requirement. Whether it’s one item or ten, order what you need, when you need it.",
      },
      {
        id: "order-cancelled",
        question: "Why has my order been cancelled?",
        answer:
          "On occasion, our items can sell out very quickly and the stock you ordered may become unavailable. This is rare, but if an item in your order sells out, our team will contact you as soon as possible to confirm the cancellation and help you find a replacement if desired.",
      },
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    items: [
      {
        id: "shipping-cost",
        question: "How much will shipping be?",
        answer: `Shipping is completely free for orders over ${SHIPPING_THRESHOLD_TOKEN}. Shipping costs for orders below ${SHIPPING_THRESHOLD_TOKEN} are calculated at checkout.`,
      },
      {
        id: "delivery-regions",
        question: "Where do you deliver to?",
        answer:
          "We currently deliver to the United States, United Kingdom, Canada, Singapore, New Zealand, and Australia. For availability in other countries, subscribe to our newsletter — we’ll let you know as soon as we expand.",
      },
      {
        id: "delivery-time",
        question: "When can I expect my delivery?",
        answer:
          "For domestic shipments, delivery typically takes up to 7 days.\nFor international shipments, please allow up to 14 days.",
      },
      {
        id: "track-order",
        question: "How do I track my order?",
        answer:
          "You can track your order anytime from your [orders page](/account/orders). If you need assistance, use our [contact form](/contact) or email us at [hello@zepr.com](mailto:hello@zepr.com) — we’re here to help.",
      },
    ],
  },
  {
    id: "returns",
    title: "Returns",
    items: [
      {
        id: "cancel-order",
        question: "I changed my mind. Can I cancel my order?",
        answer:
          "We’ll do our best to help, but once an order is fulfilled, cancellation may not be possible. If you’d like to cancel your order, please reach out as soon as possible via our [contact form](/contact) or email us at [hello@zepr.com](mailto:hello@zepr.com).",
      },
      {
        id: "return-or-exchange",
        question:
          "My item isn’t quite right. Can I return or exchange it for a different size or style?",
        answer:
          "We accept returns and exchanges for eligible items based on our fit and quality standards. Simply submit a return request from your [orders page](/account/orders), use our [contact form](/contact), or email us at [hello@zepr.com](mailto:hello@zepr.com) and we’ll be happy to assist you.",
      },
      {
        id: "faulty-item",
        question: "Can I return my item if it arrives faulty?",
        answer:
          "Absolutely. If your item arrives faulty, we’ll make it right. Please submit a return request from your [orders page](/account/orders), use our [contact form](/contact), or email us at [hello@zepr.com](mailto:hello@zepr.com) and our team will assist you.",
      },
    ],
  },
];

/**
 * Resolve the static catalog for a specific visitor by substituting
 * dynamic tokens into answer copy. Today that's only the market's
 * free-shipping threshold (`SHIPPING_THRESHOLD_TOKEN`); answers
 * without a token pass through untouched (same object reused), so the
 * map stays cheap. Called server-side in `<FaqList>` where the market
 * is resolved.
 */
export function resolveFaqSections(
  shippingThreshold: string,
): ReadonlyArray<FaqSection> {
  return FAQ_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.answer.includes(SHIPPING_THRESHOLD_TOKEN)
        ? {
            ...item,
            answer: item.answer.replaceAll(
              SHIPPING_THRESHOLD_TOKEN,
              shippingThreshold,
            ),
          }
        : item,
    ),
  }));
}
