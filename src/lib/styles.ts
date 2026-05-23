/**
 * Reusable Tailwind class presets.
 *
 * For visual patterns that need to compose cleanly with other
 * Tailwind utilities at the call site, a TypeScript class-string
 * constant is the right vehicle — *not* a `@layer components` CSS
 * class. The CSS layer cascade pushes class-based rules below
 * utilities, so a sibling `border-transparent` (etc.) on the same
 * element silently wins over a `.surface-outline` defined in CSS,
 * which is exactly what made the feed-tab outline disappear.
 *
 * As a plain string concatenated into the `className` prop, every
 * rule here is a normal Tailwind utility — order in the string
 * decides precedence, and conflicts are resolvable inline. That's
 * the consistency win for "one source of truth across the app".
 *
 * Pure presentational tokens only — anything that needs JS state
 * or DOM behaviour belongs elsewhere.
 */

/**
 * "Selectable surface" outline — soft grey 2px border at rest,
 * snaps to ink on hover. Shared by:
 *
 *   - feed tabs (idle variant)
 *   - product cards
 *   - any future filter chip / interactive container
 *
 * Includes the `border-2` width so a single class is all a caller
 * needs to opt in. Border colour can still be overridden by adding
 * a `border-[…]` utility AFTER this constant in the className
 * string — useful for the feed tabs' active state, which paints an
 * ink-on-ink border that disappears into the background.
 */
export const SURFACE_OUTLINE_CLASSES =
  "border-2 border-[color:var(--color-border-strong)] transition-colors duration-150 hover:border-[color:var(--color-ink)]";
