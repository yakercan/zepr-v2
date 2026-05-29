/**
 * Visually-hidden, crawlable page heading (+ optional intro).
 *
 * Renders a real `<h1>` and `<p>` inside an `.sr-only` wrapper so
 * screen readers and search engines get a keyword-honest summary on
 * surfaces whose *visible* hero is a non-textual element — the home
 * banner carousel, the search results grid — and therefore lack an
 * on-screen `<h1>`. The copy must describe what's genuinely on the
 * page; this is an accessibility + SEO landmark, never a keyword
 * dump (Google penalises hidden text that doesn't match content).
 *
 * Pages that already render a visible `<h1>` (the PDP product title,
 * a category heading) must NOT also use this — two `<h1>`s muddies
 * the document outline.
 */
export function SeoText({
  heading,
  description,
}: {
  heading: string;
  description?: string;
}) {
  return (
    <div className="sr-only">
      <h1>{heading}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
