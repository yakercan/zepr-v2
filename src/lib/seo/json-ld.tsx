/**
 * A single schema.org node. Kept deliberately loose — a structured
 * `Record` rather than the exhaustive `schema-dts` union — so the
 * builders in `structured-data.ts` stay readable and we don't take
 * on a dependency just for compile-time shapes. The runtime contract
 * (a `@context` + `@type` plus arbitrary properties) is all Google
 * actually reads.
 */
export type JsonLdNode = {
  "@context"?: string;
  "@type": string;
  [key: string]: unknown;
};

/**
 * Renders one or more schema.org objects as a `<script
 * type="application/ld+json">` tag. Server-only by nature (it emits
 * static markup, no client JS) so it can sit anywhere in an RSC tree
 * — root layout, a page, or a section.
 *
 * The `<` → `\u003c` escape is the one piece of hardening that
 * matters: `JSON.stringify` output is otherwise inert, but a stray
 * `</script>` inside any string value (a product title, a
 * description) would prematurely close the tag and let arbitrary
 * markup through. Escaping the angle bracket neutralises that
 * without altering how the JSON parses.
 *
 * Pass a single object or an array; arrays render as a JSON-LD graph
 * list, which Google reads exactly like separate adjacent scripts.
 */
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
