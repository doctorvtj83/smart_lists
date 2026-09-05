"use client";

import { useEffect, useState } from "react";
import type { CatalogSuggestion } from "@/lib/catalog/search";

/**
 * How long the field stays quiet before a request goes out.
 *
 * 120ms is below the ~150ms at which a delay becomes perceptible, and above a
 * fast typist's inter-key interval — so a burst of keystrokes collapses into one
 * request while the dropdown still feels immediate.
 */
export const CATALOG_SEARCH_DEBOUNCE_MS = 120;

/**
 * Fetches a page of catalog articles for a typed query.
 *
 * Why this replaced the `articles` prop: the list and Favoriten screens used to
 * server-render the project's entire catalog into the page (up to
 * CATALOG_DATALIST_LIMIT = 1000 rows) so buildAutocomplete could filter it in
 * the browser. That made every list render carry a payload proportional to the
 * catalog, and it silently capped which articles were suggestable at all.
 *
 * What did NOT move: buildAutocomplete still runs, unchanged, over whatever this
 * returns. The server answers "which articles could match", the pure function
 * answers "which three does the dropdown show, and is there a „neu anlegen" row"
 * — including all of Slice 15's raw-vs-parsed query logic. Nothing about that
 * behaviour is re-implemented on the server.
 *
 * Pattern: debounce + AbortController + last-write-wins. The abort is the part
 * that matters for correctness — without it, a slow response to "mil" can land
 * after a fast one to "milch" and repopulate the dropdown with stale options.
 */
export function useCatalogSearch(projectId: string, query: string): CatalogSuggestion[] {
  // Seeded empty and deliberately NOT cleared when the query changes: emptying
  // the list on every keystroke makes the dropdown flicker between pages.
  const [articles, setArticles] = useState<CatalogSuggestion[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    // buildAutocomplete shows nothing for an empty query, so a request would be
    // work whose result is discarded by definition.
    if (!trimmed) {
      // Schedule the reset outside the effect body because React's effect lint
      // rule forbids synchronous state writes that can cascade into a render.
      // Cleanup still cancels the reset if another query arrives immediately.
      const resetTimer = setTimeout(() => setArticles([]), 0);
      return () => clearTimeout(resetTimer);
    }

    // One controller per scheduled request. The cleanup below aborts it, which
    // covers both "the user typed again" and "the component unmounted".
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // encodeURIComponent, not template interpolation: an article name may hold
      // a space, an umlaut or an "&", all of which would otherwise corrupt the
      // query string.
      const url = `/api/projects/${projectId}/catalog?q=${encodeURIComponent(trimmed)}`;
      fetch(url, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : []))
        .then((page: CatalogSuggestion[]) => setArticles(page))
        .catch(() => {
          // An abort is the normal path (the user kept typing) and a network
          // failure is not worth an error state in a suggestion dropdown: the
          // field still works, it just offers nothing. Keep the last page.
        });
    }, CATALOG_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, query]);

  return articles;
}
