import type { CatalogItem, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { List } from "@prisma/client";
import { createList, type CreateListInput } from "@/lib/lists/lists";
import { applyOperation } from "@/lib/lists/operations";
import { compareArticleNames } from "@/lib/catalog/sort";

// The lean shape a suggestion carries: the article identity (catalogItemId), the display name, and
// the catalog defaults. That is exactly what the UI needs to render the suggestion AND what pre-fill
// needs (name to add; defaults are what add_item will inherit). Deliberately omits normalizedName/
// createdAt — same "don't over-expose" precedent as Slice 2's MemberUser and Slice 4's
// CatalogSuggestion.
export interface SuggestedArticle {
  catalogItemId: string;
  name: string;
  defaultCategory: string | null;
  defaultUnit: string | null;
}

// The suggestion read function (MVP design §4.3, §5 "Vorschlags-Logik", §7 testable seam). PURE READ
// — no writes — over the project's favorites and its completed lists. Result = favorites ∪ (articles
// in >= N of the last M completed lists), deduplicated per article. No learning/weighting (that is
// Phase 2); the rule is a plain statistic with per-project N/M.
export async function computeSuggestions(
  db: PrismaClient,
  projectId: string,
): Promise<SuggestedArticle[]> {
  // Load the project for its N/M statistic parameters (schema defaults 2/4). If it was deleted
  // concurrently there is nothing to suggest.
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return [];

  // Accumulate the set keyed by catalog item id so favorites ∪ statistic dedupes to ONE entry per
  // article (MVP design §4.3 "Vereinigung beider Mengen, dedupliziert pro Artikel").
  const byCatalog = new Map<string, SuggestedArticle>();
  // Record a catalog item once (first writer wins — the mapped shape is identical either source).
  const add = (item: CatalogItem) => {
    if (!byCatalog.has(item.id)) {
      byCatalog.set(item.id, {
        catalogItemId: item.id,
        name: item.name,
        defaultCategory: item.defaultCategory,
        defaultUnit: item.defaultUnit,
      });
    }
  };

  // --- Favorites: every project favorite is ALWAYS suggested. ---
  const favorites = await db.favorite.findMany({
    where: { projectId },
    include: { catalogItem: true },
  });
  for (const favorite of favorites) add(favorite.catalogItem);

  // --- Statistic: articles in >= N of the LAST M completed lists. ---
  // "Last M" = the M most recently completed lists. Slice 6's completeList stamps completedAt (and
  // never re-stamps it on a repeat call), so this window is stable; reopenList clears completedAt and
  // flips status back to active, which drops that list out of the window on the next read.
  // Clamp M to >= 0 before it reaches Prisma. A NEGATIVE `take` does not mean "none" in Prisma — it
  // means "the LAST n rows of the ordering", which would silently invert the window and make the
  // statistic read the OLDEST completed lists. Nothing sets N/M today (no endpoint, no UI; the schema
  // defaults are 2/4), so this is defense for whenever per-project tuning is exposed.
  // N is deliberately NOT clamped: N <= 0 is a coherent configuration meaning "every article in the
  // window qualifies", whereas there is no coherent reading of a negative window size.
  const windowSize = Math.max(0, project.suggestionRuleM);

  const recent = await db.list.findMany({
    where: { projectId, status: "completed" },
    // nulls: "last" is deliberate — Postgres sorts NULLs FIRST on DESC, so a completed row with no
    // completedAt (never produced by completeList, but possible via a seed/import) would otherwise
    // occupy the top of the window and evict a real recent list.
    orderBy: { completedAt: { sort: "desc", nulls: "last" } },
    take: windowSize, // the window size M, clamped to a non-negative count
    select: { id: true },
  });
  const recentIds = recent.map((list) => list.id);

  // All entries of those lists with their catalog item. `in: []` (no completed lists) returns [].
  const items = await db.listItem.findMany({
    where: { listId: { in: recentIds } },
    include: { catalogItem: true },
  });

  // Count in how many DISTINCT lists each article appears — a Set of listIds per catalog item, so an
  // article listed twice in the same list still counts as one list (not two).
  const seen = new Map<string, { listIds: Set<string>; catalogItem: CatalogItem }>();
  for (const item of items) {
    const entry = seen.get(item.catalogItemId) ?? {
      listIds: new Set<string>(),
      catalogItem: item.catalogItem,
    };
    entry.listIds.add(item.listId);
    seen.set(item.catalogItemId, entry);
  }
  for (const entry of seen.values()) {
    // >= N distinct completed lists qualifies the article for the statistic (MVP design §4.3).
    if (entry.listIds.size >= project.suggestionRuleN) add(entry.catalogItem);
  }

  // Stable, human-friendly output: alphabetical by article name under the shared rule
  // (compareArticleNames — German locale, so umlauts sort sensibly for the German UI). Sharing the
  // comparator with listFavorites is what guarantees the Favoriten section and a pre-filled list
  // present the same articles in the same order.
  return [...byCatalog.values()].sort((a, b) => compareArticleNames(a.name, b.name));
}

/**
 * Creates a list and seeds it with exactly the given articles, in the given order.
 *
 * Why this exists next to createPrefilledList: Slice 11's „Neue Liste" sheet lets
 * the user de-select individual suggestions before creating, so the surviving
 * selection — not "whatever computeSuggestions returns right now" — is the truth.
 * Recomputing on the server would silently re-add the articles the user just
 * dropped.
 *
 * Only the NAME is passed to add_item: it resolves the name to the project's
 * catalog row and INHERITS its category/unit defaults, so the inheritance logic
 * is never duplicated and can never go stale. Sequential (not Promise.all)
 * because each add_item derives the next sortIndex from the current maximum, so
 * the writes must not race each other.
 */
export async function createListWithArticles(
  db: PrismaClient,
  input: CreateListInput & { articleNames: string[] },
): Promise<List> {
  // createList enforces the name rules and the optional client-supplied UUID, so
  // an invalid request fails BEFORE anything is written.
  const list = await createList(db, input);

  try {
    for (const name of input.articleNames) {
      await applyOperation(db, list, {
        op: "add_item",
        itemId: randomUUID(), // stable entry identity, generated caller-side by convention
        name,
      });
    }
  } catch (error) {
    // Pattern: COMPENSATING ACTION. A half-filled list is an artifact the user
    // never asked for — it would appear under "AKTIVE LISTEN" with an arbitrary
    // subset and no sign that anything went wrong. Delete it, then rethrow the
    // ORIGINAL error so the caller still sees the real cause.
    //
    // WHY NOT db.$transaction: applyOperation/createList/getOrCreateCatalogItem
    // all declare their first parameter as PrismaClient, while an interactive
    // transaction hands back Omit<PrismaClient, ITXClientDenyList> — not
    // assignable. Widening those signatures is a far larger change than this
    // failure mode justifies.
    //
    // .catch(): the cleanup is best-effort. If the delete ALSO fails the caller
    // must still see the original cause, not a secondary rollback error.
    await db.list.delete({ where: { id: list.id } }).catch(() => undefined);
    throw error;
  }

  return list;
}

// Creates a new list and pre-fills it from the project's suggestion set (MVP design §4.3, step 3).
// Slice 11 made this a thin wrapper: computing the set is this function's job, writing the list is
// createListWithArticles'. Both callers (REST `prefill: true` and the older UI path) therefore
// inherit the same ordering, the same single mutation path and the same compensating delete.
export async function createPrefilledList(
  db: PrismaClient,
  input: CreateListInput,
): Promise<List> {
  const suggestions = await computeSuggestions(db, input.projectId);
  return createListWithArticles(db, {
    ...input,
    articleNames: suggestions.map((article) => article.name),
  });
}
