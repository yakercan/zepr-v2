/**
 * Default route-level loading UI. Streams in while a server component
 * tree above is waiting on data. Kept intentionally minimal — page-
 * specific loaders (PDP skeleton, collection grid skeleton) live next
 * to their own routes.
 */
export default function Loading() {
  return (
    <div
      className="page-container flex min-h-[40vh] items-center justify-center py-16"
      role="status"
      aria-label="Loading"
    >
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[color:var(--color-border-strong)] border-t-[color:var(--color-brand)]" />
    </div>
  );
}
