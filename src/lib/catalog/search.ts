import type { PrismaClient } from "@prisma/client";
import { normalizeName } from "./normalize";

// Upper bound on how many suggestions one search returns. Autocomplete only needs a short list;
// capping keeps the payload small and the <datalist> usable on a phone. Exported so a transport
// (the REST endpoint, Task 4) references the same default.
export const CATALOG_SEARCH_LIMIT = 20;

// Separate, much larger cap for the server-rendered <datalist> browse (the list detail page).
// WHY a second constant instead of reusing CATALOG_SEARCH_LIMIT: a native <datalist> filters
// ENTIRELY client-side over the <option>s we pre-render — it never re-queries as the user types. So
// the datalist must be seeded with the WHOLE catalog; with only 20 options, any article past the
// first 20 (alphabetically) would be silently unsuggestable. This ceiling stays generous because a
// household catalog is at most a few hundred articles and each <option> is a few bytes. When Slice 8
// replaces the datalist with a fetch-on-keystroke dropdown (querying ?q= at CATALOG_SEARCH_LIMIT),
// this constant becomes unused and can be removed.
export const CATALOG_DATALIST_LIMIT = 1000;

// The lean shape autocomplete needs: the display name to insert plus the defaults, so the caller can
// prefill or (in our UI) rely on inheritance for category/unit. Deliberately omits
// projectId/normalizedName/createdAt — same "don't over-expose" precedent as Slice 2's MemberUser.
export interface CatalogSuggestion {
  id: string;
  name: string;
  defaultCategory: string | null;
  defaultUnit: string | null;
}

// Autocomplete read over a project's catalog (MVP design §4.4, §5). PURE READ — no writes — so it is
// safe to call on every keystroke. A blank query returns the first `limit` articles alphabetically
// (browse); a non-blank query returns prefix matches on the normalized name. Matching on
// `normalizedName` (already lowercased) with a normalized query is why "MIL" finds "Milch"
// regardless of the user's casing — no Prisma `mode: "insensitive"` needed.
export async function searchCatalog(
  db: PrismaClient,
  projectId: string,
  query: string,
  limit: number = CATALOG_SEARCH_LIMIT,
): Promise<CatalogSuggestion[]> {
  const normalized = normalizeName(query); // "" when the query is blank/whitespace-only

  const items = await db.catalogItem.findMany({
    where: {
      projectId, // project-scoped: the catalog is per-project memory (never cross-project)
      // Add the prefix filter ONLY when there is a query; a blank query browses everything (capped).
      ...(normalized ? { normalizedName: { startsWith: normalized } } : {}),
    },
    orderBy: { name: "asc" }, // stable, human-friendly ordering for the dropdown
    take: limit, // hard cap — see CATALOG_SEARCH_LIMIT
  });

  // Map to the lean suggestion shape (drop internal columns before they cross a boundary).
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    defaultCategory: item.defaultCategory,
    defaultUnit: item.defaultUnit,
  }));
}
