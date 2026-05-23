import { NextResponse } from "next/server";
import { getSearchSuggestions } from "@/lib/salespace/suggest";

/**
 * `GET /api/search/suggest?q=<query>`
 *
 * Thin server proxy in front of `getSearchSuggestions`. The client
 * modal calls this on debounced keystrokes so the Salespace API
 * key stays server-side and the modal only ever opens one round
 * trip per keystroke (the lib fans out to Salespace's two
 * endpoints internally).
 *
 * The response is cached at the browser for 60s (matching the lib's
 * Next-fetch revalidate). For two reasons:
 *
 *   • Re-focusing the search bar with the same query is instant —
 *     no spinner, no network.
 *   • Typing the same letters across separate sessions during the
 *     cache window also hits the browser cache, smoothing the
 *     perceived latency for any repeat shopper.
 *
 * `stale-while-revalidate` lets the browser serve the cached body
 * immediately and fetch a fresh copy in the background, so even
 * after the 60s window the UI never blocks on the network.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";

  const result = await getSearchSuggestions(q);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control":
        "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
