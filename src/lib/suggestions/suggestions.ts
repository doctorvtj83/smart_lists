import type { CatalogItem, PrismaClient } from "@prisma/client";

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
  const recent = await db.list.findMany({
    where: { projectId, status: "completed" },
    // nulls: "last" is deliberate — Postgres sorts NULLs FIRST on DESC, so a completed row with no
    // completedAt (never produced by completeList, but possible via a seed/import) would otherwise
    // occupy the top of the window and evict a real recent list.
    orderBy: { completedAt: { sort: "desc", nulls: "last" } },
    take: project.suggestionRuleM, // the window size M
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

  // Stable, human-friendly output: alphabetical by article name (localeCompare with "de" so umlauts
  // sort sensibly for the German UI).
  return [...byCatalog.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}
