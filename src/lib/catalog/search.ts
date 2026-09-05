import type { PrismaClient } from "@prisma/client";
import { normalizeName } from "./normalize";
import { compareArticleNames } from "./sort";

// Upper bound on how many suggestions one search returns. Autocomplete only needs a short list;
// capping keeps the payload small and the <datalist> usable on a phone. Exported so a transport
// (the REST endpoint, Task 4) references the same default.
export const CATALOG_SEARCH_LIMIT = 20;

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
// (browse); a non-blank query returns SUBSTRING matches on the normalized name. Matching on
// `normalizedName` (already lowercased) with a normalized query is why "MIL" finds "Milch"
// regardless of the user's casing — no Prisma `mode: "insensitive"` needed.
//
// Slice 8 changed two things here, both because this function became the dropdown's only source of
// suggestions (the screens no longer ship the whole catalog to the browser):
//
//   1. `contains` instead of `startsWith`. buildAutocomplete filtered its in-memory array with
//      `includes`, so "milch" has always offered "Buttermilch". Keeping a prefix match on the server
//      would have deleted that behaviour without a single failing test. The lost index usage does not
//      matter at household-catalog scale (a few hundred rows per project).
//   2. The cut moved out of SQL and into JS, AFTER the German sort. sort.ts warned about exactly
//      this: with `take` in the query, the database picks the surviving rows under ITS collation, so
//      "Äpfel" could be dropped before the German comparator ever sees it. Sorting the matched set
//      and slicing here makes the cut mean what the user sees. The matched set is bounded by the
//      WHERE clause, and a blank query reads the whole catalog — the same volume the removed
//      CATALOG_DATALIST_LIMIT browse already read, except it is now cut to `limit` before it leaves.
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
      // Add the substring filter ONLY when there is a query; a blank query browses everything.
      ...(normalized ? { normalizedName: { contains: normalized } } : {}),
    },
    // No orderBy and no take: both happen below, in JS, under the German rules.
  });

  // Map to the lean suggestion shape (drop internal columns before they cross a boundary), then
  // order and cut. compareArticleNames is THE article-ordering rule for the whole app.
  return items
    .map((item) => ({
      id: item.id,
      name: item.name,
      defaultCategory: item.defaultCategory,
      defaultUnit: item.defaultUnit,
    }))
    .sort((a, b) => compareArticleNames(a.name, b.name))
    .slice(0, limit);
}
