import "server-only";

import { env } from "@/env";
import type { TaxonomyResponse } from "@/types/taxonomy";

/**
 * Fetches the Salespace category taxonomy. Server-only — the API key
 * never leaves the server. Cached at the edge for an hour via Next's
 * fetch cache so a cold visitor doesn't pay the upstream latency.
 *
 * Returns `null` on any failure (missing key, network error, non-200
 * response). Callers are expected to fall back to a static category
 * list so the header always renders something useful.
 */

const SALESPACE_API_BASE = "https://api.salespace.com";
const DEFAULT_REVALIDATE_SEC = 60 * 60; // 1 hour

export async function getTaxonomy(
  options: { revalidate?: number } = {},
): Promise<TaxonomyResponse | null> {
  const apiKey = env.SALESPACE_SEARCH_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${SALESPACE_API_BASE}/taxonomy`, {
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SEC,
        tags: ["taxonomy"],
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as TaxonomyResponse;
  } catch {
    return null;
  }
}
