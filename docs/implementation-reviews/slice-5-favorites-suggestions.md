# Slice 5 Implementation Review: Favorites + Suggestions

## 1. What was achieved

Slice 5 fully met its goal. Projects now have shared favorites, a pure suggestion read function that
returns the union of those favorites and articles appearing in at least N of the last M completed
lists, and an opt-in path for creating a list pre-filled from that deduplicated suggestion set.

Because Slice 6 shipped first, the statistic is live rather than dormant. The manual browser run on
2026-07-26 passed all 8 Step 7 checks: in project Einkauf, Bananen and Milch were favorited; a
pre-filled list received those favorites while a plain list stayed empty; after two completed lists
contained Nudeln, the next pre-fill contained Nudeln plus both favorites exactly once; after one of
those completed lists was reopened, Nudeln dropped from the next pre-fill.

Automated verification also passed: `npm test` ran 159 tests in 18 files, and `npm run lint` plus
`npm run build` completed successfully. The build retained the two known, pre-existing warnings
about multiple lockfiles/Turbopack root inference and the deprecated `middleware` convention.

## 2. Steps taken

1. Added the project-shared `Favorite` model, its compound project/article uniqueness constraint,
   cascading relations, migration, and test-reset coverage.
2. Built the idempotent, project-scoped favorites core: add by upsert, remove by tolerant
   `deleteMany`, and alphabetically ordered listing.
3. Implemented `computeSuggestions` as a pure read that unions favorites with the N-of-M statistic,
   deduplicates by catalog article, and returns a stable alphabetical result.
4. Implemented `createPrefilledList`, which creates a normal list and adds every suggestion through
   the existing entry-operation path.
5. Added member-level favorites and suggestions REST routes and the optional `prefill` flag on list
   creation.
6. Added the German "Favoriten" section and the separate "Vorbefüllte Liste anlegen" form to the
   project page.
7. Re-ran the full verification, wrote this review, and updated the meta project plan.

The implementation follows the four locked decisions: the statistic is live and uses Slice 6's
stable completion timestamps; pre-fill passes only article names through `applyOperation`;
favorites are project-shared and keyed by `(projectId, catalogItemId)`; and the recent-list window
uses `completedAt DESC NULLS LAST`.

The only implementation deviation was in Task 4's sort-index assertion: it expects `[1, 2]`, not the
plan's `[0, 1]`, because `applyOperation` starts sort indexes at 1, matching the existing operations
contract. Earlier minor review notes remain non-blocking: the 404 message assertion gap and missing
focused tests for `NULLS LAST`, configurable M, and German locale sorting.

## 3. Core components built

- `prisma/schema.prisma` — `Favorite`, the project/article relations, and the compound uniqueness
  rule that makes add idempotency enforceable by the database.
- `src/lib/favorites/favorites.ts` — `FavoriteWithItem`, `FavoriteRef`, `addFavorite`,
  `removeFavorite`, and `listFavorites`.
- `src/lib/suggestions/suggestions.ts` — `SuggestedArticle`, the pure `computeSuggestions` read seam,
  and the `createPrefilledList` orchestrator.
- `src/app/api/projects/[projectId]/favorites/route.ts` and
  `favorites/[catalogItemId]/route.ts` — member-level list/add/remove endpoints.
- `src/app/api/projects/[projectId]/suggestions/route.ts` — member-level access to the computed
  suggestion set.
- `src/app/api/projects/[projectId]/lists/route.ts` — strict boolean `prefill` support while
  preserving the existing list-creation response contract.
- `src/app/projects/[projectId]/page.tsx` — the shared favorites UI and separate pre-filled-list
  form, both backed by membership-checked server actions.

## 4. Most important lines of code

### Count distinct lists, not duplicate entries

```ts
const seen = new Map<string, { listIds: Set<string>; catalogItem: CatalogItem }>();
// ...
entry.listIds.add(item.listId);
// ...
if (entry.listIds.size >= project.suggestionRuleN) add(entry.catalogItem);
```

The rule is about how many completed lists contain an article. A `Set` makes repeated occurrences
of the same article within one list count once, while occurrences across different lists count
separately toward N.

### Deduplicate the union by catalog identity

```ts
const byCatalog = new Map<string, SuggestedArticle>();
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
```

Both favorites and the statistic feed the same map keyed by `CatalogItem.id`. An article qualifying
through both sources is therefore emitted exactly once without relying on names or normalization.

### Keep the recent-completion window valid

```ts
orderBy: { completedAt: { sort: "desc", nulls: "last" } },
take: project.suggestionRuleM,
```

Postgres places NULL values first for a descending sort unless instructed otherwise. `NULLS LAST`
prevents malformed or imported completed rows without a timestamp from evicting genuine recent
completions. The ordering is stable because Slice 6 never re-stamps `completedAt` on repeated
completion and clears it when a list is reopened.

### Reuse the single entry mutation path

```ts
for (const article of suggestions) {
  await applyOperation(db, list, {
    op: "add_item",
    itemId: randomUUID(),
    name: article.name,
  });
}
```

Passing only the name deliberately reuses Slice 4's catalog lookup and category/unit inheritance.
Going through `applyOperation` also preserves the single mutation path and gives Slice 7 ordinary
timestamped entry changes to expose through its delta endpoint.

### Block cross-project favorite references

```ts
const catalogItem = await db.catalogItem.findFirst({ where: { id: catalogItemId, projectId } });
if (!catalogItem) throw new ApiError(404, "Artikel nicht gefunden");
```

The compound project scope is the security boundary. Checking only the catalog id would allow a
member to attach another project's article to their project's favorites by guessing its UUID.

## 5. Architecture contribution

Slice 5 assembles the MVP design's §5 "Vorschlags-Logik" layer and closes the loop opened by Slices
3, 4, and 6: entry operations feed the project catalog, completed lists feed the N-of-M statistic,
and that statistic feeds the next list's pre-fill. With Slice 7 already merged, this completes the
MVP's functional surface; every §9 build-order item except PWA polish now exists.

Pre-fill required no sync-specific implementation. Because every generated entry goes through
`applyOperation`, Slice 7's delta sees it as an ordinary change. The future PWA client can consume
the `/suggestions` and `/favorites` endpoints built here. Only Slice 8, PWA polish, remains.

The manual browser checks also exposed a pre-existing Next.js hydration overlay on project and list
pages caused by locale-sensitive date formatting. It did not block any Slice 5 flow and is unrelated
to the favorites feature itself.
