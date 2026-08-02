import type { PrismaClient } from "@prisma/client";
import { compareArticleNames } from "./sort";

/**
 * Catalog MANAGEMENT (Slice 10) — the explicit path.
 *
 * Why this is a second module next to catalog.ts: that file owns the *implicit*
 * catalog, where typing an entry name resolves to an article and a name nobody
 * has used before quietly becomes a row (get-or-create), and where an entry edit
 * flows category/unit back into the defaults. Here the user is looking straight
 * at the catalog, so the rules invert: a duplicate name is an ERROR rather than a
 * hit, an emptied field is an explicit "clear this default" rather than "don't
 * touch it", and deleting is a real operation with a guard. Two files keep those
 * two contracts from bleeding into each other.
 *
 * Every function takes an injected PrismaClient (the project-wide test seam) and
 * throws German ApiErrors; permission (membership) is the caller's job, exactly
 * like every other core in this codebase.
 */

/**
 * One article as the Katalog screen renders it.
 *
 * The two derived fields are the reason this read model exists at all: the screen
 * cannot decide whether to offer "Löschen" without knowing how many lists use the
 * article, and it cannot warn about the favourite side effect without isFavorite.
 * Computing both here means the client component gets a flat, render-ready array
 * and never has to ask a follow-up question.
 */
export interface CatalogArticle {
  id: string;
  name: string;
  defaultCategory: string | null;
  defaultUnit: string | null;
  /** Distinct lists (active AND completed) that contain this article. */
  usedInListCount: number;
  /** True when the project has favourited this article. */
  isFavorite: boolean;
}

/**
 * The whole catalog of a project, alphabetically, with usage and favourite flags.
 *
 * Deliberately UNCAPPED, unlike searchCatalog's `take`: this is a management
 * screen, and an article silently cut off the end of the list would be one nobody
 * could ever rename or delete. A household project's catalog is a few hundred
 * rows (the brief expects 50–300), so the whole set is cheap to read and cheap to
 * hand to the client for live filtering.
 *
 * Because there is no `take`, sorting in JS with the shared comparator is safe
 * here — the caveat in sort.ts applies only to a truncated query.
 */
export async function listCatalog(db: PrismaClient, projectId: string): Promise<CatalogArticle[]> {
  const items = await db.catalogItem.findMany({
    where: { projectId }, // project-scoped: the catalog is per-project memory
    include: {
      // Only the listId is needed — the distinct count is computed below. Prisma
      // cannot express COUNT(DISTINCT list_id) per row, and pulling the ids is
      // cheaper than one extra query per article.
      listItems: { select: { listId: true } },
      // 0 or 1 row per project by the @@unique — presence is the whole answer.
      favorites: { select: { id: true } },
    },
  });

  return items
    .map((item) => ({
      id: item.id,
      name: item.name,
      defaultCategory: item.defaultCategory,
      defaultUnit: item.defaultUnit,
      // A Set is the distinct: the same article twice on one list is one list.
      usedInListCount: new Set(item.listItems.map((listItem) => listItem.listId)).size,
      isFavorite: item.favorites.length > 0,
    }))
    // Sort AFTER the projection so the comparator works on plain names — the
    // contract compareArticleNames declares (same order of operations as listFavorites).
    .sort((a, b) => compareArticleNames(a.name, b.name));
}
