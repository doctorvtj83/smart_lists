# Slice 5 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all seven findings from the Slice 5 code review — the untested defensive lines in `computeSuggestions`, the two disagreeing "alphabetical" orderings, the over-exposed favorites REST payload, the unguarded `M` window size, the half-filled list left behind when pre-fill fails, an undocumented spec/model divergence, and one uncommitted tracking file.

**Architecture:** No new entities, no schema change, no new dependencies. Five contained code changes on top of the shipped Slice 5 code: (1) characterization tests that pin behavior which is already correct but unverified; (2) `listFavorites` returns a lean `FavoriteArticle` projection instead of the raw Prisma row, matching the "don't over-expose" precedent the codebase already applies in `CatalogSuggestion` and `SuggestedArticle`; (3) a single shared `compareArticleNames` comparator so every article list in the app orders identically; (4) a clamp so a non-positive `suggestionRuleM` cannot invert the Prisma `take` window; (5) a compensating delete so a failed pre-fill never leaves an orphan list. Then a docs pass recording the resolutions.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Prisma 6 against Neon Postgres, Auth.js (NextAuth v5), Vitest 4. No new dependencies.

## Global Constraints

Copied verbatim from CLAUDE.md and the meta project plan. Every task inherits these.

- **Implementation docs, code identifiers, and code comments: English.** In-app user-facing strings stay **German** (the product is German).
- **Meticulous inline comments** on every function (what + **why**) and every non-obvious line; name the pattern when one is used; **never remove or thin existing comments when editing a file.**
- **Existing canonical specs/PRDs** (`docs/superpowers/specs/`) are historical source-of-truth and stay in German — **do not edit them.** Divergences get recorded in the implementation review and the meta plan instead.
- **Stable, client-generatable UUIDs** for all entities (offline-prep convention).
- **Entry-level, idempotent operations** (`add_item`, `update_item`, `check_item`, `remove_item`) are the ONLY mutation path for list entries — pre-fill MUST keep creating entries through `applyOperation`, never with ad-hoc `listItem.create` or `createMany` writes.
- **Every API operation re-checks membership + role** via the Slice 2/3 guards. Favorites and suggestions are **member-level** (permission matrix, MVP design §6).
- **DB access through an injectable `PrismaClient`** (first parameter of every core function).
- **Test-first (TDD)**, small vertical slices, frequent commits. Task 1 is the one deliberate exception — see its header.
- **Test convention (Slices 1–7):** core functions are unit-tested against the Neon test branch (`new PrismaClient()` + `resetDb(db)` in `beforeEach`); route handlers, pages and client components are thin adapters with **no unit tests** — verified by `npm run build` + `npm run lint` + a manual browser pass. Follow this split; do not invent route/page tests.
- **Baseline before this plan:** `npm test` = **18 files, 159 tests**, all green; `npm run lint` and `npm run build` clean (build keeps the two known pre-existing warnings: multiple-lockfile/Turbopack-root inference and the deprecated `middleware` convention).
- **Branch:** work continues on `slice-5-favorites-suggestions` (7 commits ahead of `main`, not yet merged). These fixes belong to Slice 5 and ship with it — do **not** open a new branch.

---

## Design decisions locked for this plan

1. **Task 1's tests must PASS the moment they are written.** They are *characterization* tests for behavior that is already implemented correctly but never verified: the `nulls: "last"` window ordering (Slice 5 locked decision #4), the configurable `M`, and the German locale sort. The normal red-green rhythm does not apply. **If any of them fails, stop and report it — that is a real latent bug, not a plan error.** Every other task in this plan follows strict red-green TDD.

2. **`listFavorites` returns a lean projection; `addFavorite` keeps returning the row.** `FavoriteArticle` is field-for-field identical to `SuggestedArticle` on purpose: the favorites *are* a subset of the suggestion set, so the two reads hand the UI the same shape. `addFavorite` still returns the full `Favorite` because that is the resource the caller just created and a 201 body conventionally echoes it — the finding was about the *collection* read leaking `normalizedName`/`createdAt`, not about the create response.

3. **One comparator, applied to the two lists that are meant to agree.** `compareArticleNames` (new, `src/lib/catalog/sort.ts`) becomes the single article-ordering rule for `computeSuggestions` and `listFavorites`. **`searchCatalog` is deliberately left on Postgres `orderBy`** — it applies `take: limit` server-side, so sorting in JS afterwards would only reorder an already-truncated page and could silently change *which* articles make the cut. That is a separate (Slice 8) concern; a comment in `sort.ts` records the reasoning so nobody "fixes" it by accident.

4. **`N` is not clamped, `M` is.** A non-positive `M` inverts Prisma's `take` (negative `take` means "the last N rows"), which would silently turn the window upside down — so it is clamped to 0 ("no window, no statistic"). A non-positive `N` is a *coherent* configuration (`N <= 0` means "every article in the window qualifies") and needs no guard. Neither value is settable through any endpoint or UI today; this is defense for whenever per-project tuning is exposed.

5. **Pre-fill failure compensates, it does not transact.** `createPrefilledList` deletes the list it created if any `add_item` throws, then rethrows. It does **not** use `db.$transaction`, because `applyOperation`, `createList` and `getOrCreateCatalogItem` all declare their first parameter as `PrismaClient`, while an interactive transaction hands back `Omit<PrismaClient, ITXClientDenyList>` — widening those signatures across the Slice 3/4 cores is a far larger refactor than this finding warrants. The compensating delete relies on the existing `ListItem.list` `onDelete: Cascade`, so the entries go with it. This trade-off is recorded in the code comment and in the meta plan.

6. **MVP design §4.3 step 3 vs. the entity model is a spec wording gap, not a bug.** §4.3 says a pre-filled `ListItem` takes "Menge/Einheit/Kategorie aus `CatalogItem`-Defaults", but §3.1's `CatalogItem` defines only `default_category` and `default_unit` — there has never been a default quantity, in the spec or in the schema. The entity list is authoritative, the implementation (`quantity: null`) is correct, and the German spec must not be edited. Task 6 records the divergence so the next reader does not re-litigate it.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `.superpowers/sdd/progress.md` (commit as-is) | Pending Slice 5 SDD ledger; committed so the tree is clean before work starts. | 1 |
| `src/lib/suggestions/suggestions.test.ts` (modify) | Widen the `completedList` helper to accept a null `completedAt`; add the NULLS-LAST, configurable-`M` and German-sort characterization tests, then the `M`-clamp and rollback tests. | 1, 4, 5 |
| `src/lib/favorites/favorites.test.ts` (modify) | Assert the 404 *message*, cover the malformed-id no-op on `removeFavorite`, switch to the lean shape, add the German-sort test. | 1, 2, 3 |
| `src/lib/favorites/favorites.ts` (modify) | Replace `FavoriteWithItem` with the lean `FavoriteArticle`; sort via the shared comparator. | 2, 3 |
| `src/app/projects/[projectId]/page.tsx` (modify) | Render favorites from the lean shape (`f.name`, `f.catalogItemId` as the React key). | 2 |
| `src/app/api/projects/[projectId]/favorites/route.ts` (modify) | JSDoc response type only: `FavoriteWithItem[]` → `FavoriteArticle[]`. | 2 |
| `src/lib/catalog/sort.ts` (create) | `ARTICLE_NAME_LOCALE` + `compareArticleNames` — the single article-name ordering rule. | 3 |
| `src/lib/suggestions/suggestions.ts` (modify) | Use the shared comparator; clamp the `M` window; roll back a partially pre-filled list. | 3, 4, 5 |
| `docs/implementation-reviews/slice-5-favorites-suggestions.md` (modify) | Replace the open-gaps paragraph with the resolutions; add the spec-wording note. | 6 |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` (modify) | New progress-log entry recording the fixes and the surviving trade-offs. | 6 |

---

### Task 1: Close the test gaps on already-correct behavior

> **This task does not follow red-green.** Every test below is expected to PASS on the current implementation — they pin behavior that Slice 5 implemented deliberately but never verified. See locked decision #1: a failure here is a real bug, so stop and report rather than "fixing" the test.

**Files:**
- Commit as-is: `.superpowers/sdd/progress.md`
- Modify: `src/lib/suggestions/suggestions.test.ts` (widen the `completedList` helper; add three tests to the `computeSuggestions` describe block)
- Modify: `src/lib/favorites/favorites.test.ts` (tighten two 404 assertions; add one `removeFavorite` test)

**Interfaces:**
- Consumes: `computeSuggestions` from `@/lib/suggestions/suggestions`; `addFavorite`, `removeFavorite` from `@/lib/favorites/favorites`; `getOrCreateCatalogItem` from `@/lib/catalog/catalog`; `resetDb` from `@/test/reset-db`. All already imported in the two test files.
- Produces: no production code and no new exports. The `completedList` test helper's signature widens from `(names: string[], completedAt: Date)` to `(names: string[], completedAt: Date | null)`; Tasks 4 and 5 reuse it unchanged.

- [ ] **Step 1: Commit the pending SDD ledger so the tree is clean**

`.superpowers/sdd/progress.md` is already up to date (it records all seven Slice 5 tasks as complete) but was never committed. Commit it untouched before starting:

```bash
git add .superpowers/sdd/progress.md
git commit -m "chore: commit Slice 5 SDD progress ledger"
```

Expected: `git status --short` is now empty.

- [ ] **Step 2: Widen the `completedList` test helper to accept a null completion timestamp**

In `src/lib/suggestions/suggestions.test.ts`, replace this line (it is the helper's signature, at the end of the existing comment block):

```ts
async function completedList(names: string[], completedAt: Date) {
```

with:

```ts
// `completedAt: null` seeds the pathological row the NULLS-LAST ordering exists to defend against —
// a list marked completed that carries no timestamp. completeList never produces one, but a seed or
// a future import path could, so the window has to survive it.
async function completedList(names: string[], completedAt: Date | null) {
```

Nothing else in the helper changes: `db.list.create` already writes `completedAt` straight through, and the column is nullable.

- [ ] **Step 3: Add the three characterization tests for `computeSuggestions`**

Still in `src/lib/suggestions/suggestions.test.ts`, insert the following three tests inside the `describe("computeSuggestions", …)` block, directly AFTER the existing `"respects the project's own N/M parameters"` test (it ends with `expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);` followed by `});`) and BEFORE the `"carries the article name and catalog defaults in the suggestion shape"` test:

```ts
  it("keeps a completed list without completedAt from evicting a real one (NULLS LAST)", async () => {
    // Pins Slice 5 locked decision #4. Postgres sorts NULLs FIRST on a DESC sort, so without the
    // explicit `nulls: "last"` the timestamp-less list below would occupy slot 1 of the M=4 window
    // and push the OLDEST real list out — which would drop Zucker from 2 lists to 1 (< N=2).
    await completedList(["Zwiebel"], null); // completed, but never stamped
    await completedList(["Zucker"], new Date("2026-07-01"));
    await completedList(["Zucker"], new Date("2026-07-02"));
    await completedList(["Mehl"], new Date("2026-07-03"));
    await completedList(["Mehl"], new Date("2026-07-04"));

    const suggestions = await computeSuggestions(db, projectId);
    // Correct (NULLS LAST): window = the four dated lists -> Zucker 2, Mehl 2, both >= N=2.
    // Broken (NULLS FIRST): window = null-list + the three newest -> Zucker 1 -> only Mehl.
    expect(suggestions.map((s) => s.name)).toEqual(["Mehl", "Zucker"]);
  });

  it("respects the project's M window size, not just N", async () => {
    // The existing N test only varies N. M=1 shrinks the window to the single most recent completed
    // list, so the older list's article must not be suggested even though N=1 would otherwise take it.
    await db.project.update({
      where: { id: projectId },
      data: { suggestionRuleN: 1, suggestionRuleM: 1 },
    });
    await completedList(["Alt"], new Date("2026-07-01"));
    await completedList(["Neu"], new Date("2026-07-02"));

    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Neu"]);
  });

  it("sorts the result by German locale rules, not by code point", async () => {
    // localeCompare(…, "de") treats Ä as a diacritic variant of A. A naive code-point sort would put
    // every umlaut AFTER Z ("Apfel, Zucker, Äpfel"), which reads as broken in a German UI.
    // normalizeName only lowercases/trims, so "Apfel" and "Äpfel" are two distinct catalog articles.
    for (const name of ["Zucker", "Äpfel", "Apfel"]) {
      const item = await getOrCreateCatalogItem(db, { projectId, name });
      await addFavorite(db, { projectId, catalogItemId: item.id });
    }
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Apfel", "Äpfel", "Zucker"]);
  });
```

- [ ] **Step 4: Tighten the two 404 assertions and cover `removeFavorite`'s malformed-id path**

In `src/lib/favorites/favorites.test.ts`, replace this test:

```ts
  it("rejects a catalog item from another project with 404 (no cross-project favoriting)", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    await expect(addFavorite(db, { projectId, catalogItemId: foreign.id })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rejects a malformed catalog item id with 404 (never reaches the uuid column)", async () => {
    await expect(addFavorite(db, { projectId, catalogItemId: "not-a-uuid" })).rejects.toMatchObject({
      status: 404,
    });
  });
```

with (both now assert the German message too — a 404 carrying the wrong copy is a user-visible bug that a status-only assertion cannot catch):

```ts
  it("rejects a catalog item from another project with 404 (no cross-project favoriting)", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    await expect(addFavorite(db, { projectId, catalogItemId: foreign.id })).rejects.toMatchObject({
      status: 404,
      // A foreign article must be indistinguishable from a non-existent one: the message must NOT
      // hint that the id exists elsewhere, or the 404 leaks the other project's catalog.
      message: "Artikel nicht gefunden",
    });
  });

  it("rejects a malformed catalog item id with 404 (never reaches the uuid column)", async () => {
    await expect(addFavorite(db, { projectId, catalogItemId: "not-a-uuid" })).rejects.toMatchObject({
      status: 404,
      message: "Artikel nicht gefunden",
    });
  });
```

Then add this test to the `describe("removeFavorite", …)` block, directly after the existing `"is idempotent: removing a non-existent favorite is a no-op"` test and before that block's closing `});`:

```ts
  it("treats a malformed catalog item id as a silent no-op (no P2023 crash)", async () => {
    // removeFavorite's isUuid guard exists so a malformed id never reaches the uuid column, where
    // Prisma would raise P2023 and the route would return a fake 500 instead of an idempotent
    // success. Remove is idempotent by contract, so "id that cannot exist" must resolve, not throw.
    await expect(
      removeFavorite(db, { projectId, catalogItemId: "not-a-uuid" }),
    ).resolves.toBeUndefined();
  });
```

- [ ] **Step 5: Run both test files and confirm everything passes**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts src/lib/favorites/favorites.test.ts`
Expected: PASS — 19 tests in `suggestions.test.ts` (16 + 3) and 9 in `favorites.test.ts` (8 + 1).

**If any of the four new tests fails, STOP.** It means the shipped behavior does not match Slice 5's locked decisions — report the failure and the actual output instead of adjusting the expectation.

- [ ] **Step 6: Commit**

```bash
git add src/lib/suggestions/suggestions.test.ts src/lib/favorites/favorites.test.ts
git commit -m "test: pin NULLS LAST window, configurable M, de sort and the favorites 404 contract"
```

---

### Task 2: `listFavorites` returns a lean `FavoriteArticle` projection

**Files:**
- Modify: `src/lib/favorites/favorites.ts` (replace the `FavoriteWithItem` type and `listFavorites`'s return shape)
- Modify: `src/lib/favorites/favorites.test.ts` (the two `listFavorites` assertions)
- Modify: `src/app/projects/[projectId]/page.tsx` (render from the lean shape)
- Modify: `src/app/api/projects/[projectId]/favorites/route.ts` (JSDoc response type)

**Interfaces:**
- Consumes: `Favorite`, `PrismaClient` from `@prisma/client` (the `CatalogItem` type import becomes unused and is removed); `ApiError`, `isUuid` as before.
- Produces:
  - `export interface FavoriteArticle { catalogItemId: string; name: string; defaultCategory: string | null; defaultUnit: string | null }` — replaces the exported `FavoriteWithItem` type, which is deleted.
  - `listFavorites(db: PrismaClient, projectId: string): Promise<FavoriteArticle[]>` — same ordering contract, lean payload.
  - `addFavorite` and `removeFavorite` are **unchanged** (see locked decision #2).

- [ ] **Step 1: Write the failing test**

In `src/lib/favorites/favorites.test.ts`, replace the whole `describe("listFavorites", …)` block:

```ts
describe("listFavorites", () => {
  it("returns favorites with their catalog item, ordered alphabetically by article name", async () => {
    const brot = await getOrCreateCatalogItem(db, { projectId, name: "Brot" });
    const apfel = await getOrCreateCatalogItem(db, { projectId, name: "Apfel" });
    await addFavorite(db, { projectId, catalogItemId: brot.id });
    await addFavorite(db, { projectId, catalogItemId: apfel.id });
    const favorites = await listFavorites(db, projectId);
    expect(favorites.map((f) => f.catalogItem.name)).toEqual(["Apfel", "Brot"]);
  });

  it("never returns favorites from another project", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    await addFavorite(db, { projectId: other.id, catalogItemId: foreign.id });
    const favorites = await listFavorites(db, projectId);
    expect(favorites).toHaveLength(0);
  });
});
```

with:

```ts
describe("listFavorites", () => {
  it("returns the lean article shape, ordered alphabetically by article name", async () => {
    const brot = await getOrCreateCatalogItem(db, { projectId, name: "Brot" });
    const apfel = await getOrCreateCatalogItem(db, { projectId, name: "Apfel" });
    await addFavorite(db, { projectId, catalogItemId: brot.id });
    await addFavorite(db, { projectId, catalogItemId: apfel.id });
    const favorites = await listFavorites(db, projectId);
    expect(favorites.map((f) => f.name)).toEqual(["Apfel", "Brot"]);
  });

  it("exposes exactly the four article fields — no internal columns cross the boundary", async () => {
    // This read is served straight to the REST client by GET /api/projects/:id/favorites, so the
    // projection IS the wire contract. Asserting the whole object (toEqual, not toMatchObject) is
    // what makes a re-leak of normalizedName/createdAt/projectId fail the suite.
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.catalogItem.update({
      where: { id: milch.id },
      data: { defaultCategory: "Kühlregal", defaultUnit: "l" },
    });
    await addFavorite(db, { projectId, catalogItemId: milch.id });

    const favorites = await listFavorites(db, projectId);
    expect(favorites).toEqual([
      {
        catalogItemId: milch.id,
        name: "Milch",
        defaultCategory: "Kühlregal",
        defaultUnit: "l",
      },
    ]);
  });

  it("never returns favorites from another project", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    await addFavorite(db, { projectId: other.id, catalogItemId: foreign.id });
    const favorites = await listFavorites(db, projectId);
    expect(favorites).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/favorites/favorites.test.ts`
Expected: FAIL — the first test reports `undefined` names (the rows still nest the article under `catalogItem`), and the new `toEqual` test fails because the returned objects still carry `id`, `projectId`, `createdAt` and the nested `catalogItem`.

- [ ] **Step 3: Replace the type and the projection**

In `src/lib/favorites/favorites.ts`, replace the import line:

```ts
import type { CatalogItem, Favorite, PrismaClient } from "@prisma/client";
```

with (the `CatalogItem` type is no longer referenced once the nested shape is gone):

```ts
import type { Favorite, PrismaClient } from "@prisma/client";
```

Replace the `FavoriteWithItem` type:

```ts
// The read shape the UI/REST list renders: a favorite plus its catalog item — the favorite row only
// stores ids, so it is useless for display without the article's name/defaults (article identity,
// MVP design §3.1).
export type FavoriteWithItem = Favorite & { catalogItem: CatalogItem };
```

with:

```ts
// The read shape the UI/REST list renders. The favorite row only stores ids, so it is useless for
// display without the article's name/defaults (article identity, MVP design §3.1) — but the raw
// Prisma row is the wrong thing to hand out: it also carries normalizedName (an internal identity
// key), projectId and createdAt, none of which a client needs. Projecting here follows the same
// "don't over-expose" precedent as Slice 2's MemberUser and Slice 4's CatalogSuggestion.
// The fields are field-for-field identical to SuggestedArticle ON PURPOSE: favorites are a SUBSET of
// the suggestion set, so both reads hand the UI the same article shape. The two types stay separate
// (rather than one importing the other) because that would point the favorites core at the
// suggestions core, inverting the real dependency — suggestions read favorites, never the reverse.
export interface FavoriteArticle {
  catalogItemId: string;
  name: string;
  defaultCategory: string | null;
  defaultUnit: string | null;
}
```

Then replace the whole `listFavorites` function:

```ts
// All favorites of a project, each with its catalog item, alphabetical by article name for a stable
// UI. Permission is checked by the caller (requireMembership).
export async function listFavorites(
  db: PrismaClient,
  projectId: string,
): Promise<FavoriteWithItem[]> {
  return db.favorite.findMany({
    where: { projectId }, // project-scoped: favorites are per-project shared memory
    include: { catalogItem: true }, // the article's name/defaults are needed to render/suggest
    // Order by the RELATED catalog item's name (Prisma supports relation ordering) — human-friendly
    // and deterministic without storing a separate sort column on the favorite.
    orderBy: { catalogItem: { name: "asc" } },
  });
}
```

with:

```ts
// All favorites of a project as lean article rows, alphabetical by article name for a stable UI.
// Permission is checked by the caller (requireMembership).
export async function listFavorites(
  db: PrismaClient,
  projectId: string,
): Promise<FavoriteArticle[]> {
  const favorites = await db.favorite.findMany({
    where: { projectId }, // project-scoped: favorites are per-project shared memory
    include: { catalogItem: true }, // the article's name/defaults are needed to render/suggest
    // Order by the RELATED catalog item's name (Prisma supports relation ordering) — human-friendly
    // and deterministic without storing a separate sort column on the favorite.
    orderBy: { catalogItem: { name: "asc" } },
  });

  // Map to the lean article shape (drop internal columns before they cross a boundary) — same
  // mapping step searchCatalog performs for CatalogSuggestion.
  return favorites.map((favorite) => ({
    catalogItemId: favorite.catalogItemId,
    name: favorite.catalogItem.name,
    defaultCategory: favorite.catalogItem.defaultCategory,
    defaultUnit: favorite.catalogItem.defaultUnit,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/favorites/favorites.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Update the two consumers**

In `src/app/projects/[projectId]/page.tsx`, replace the favorites `<ul>`:

```tsx
      <ul>
        {favorites.map((f) => (
          <li key={f.id}>
            {/* The display name comes from the catalog item (article identity, MVP design §3.1). */}
            {f.catalogItem.name}{" "}
            <form action={removeFavoriteAction} style={{ display: "inline" }}>
              <input type="hidden" name="catalogItemId" value={f.catalogItemId} />
              <button type="submit">Entfernen</button>
            </form>
          </li>
        ))}
      </ul>
```

with (the favorite row's own id is no longer exposed, so the React key becomes the catalog item id — which is equally stable and unique here, because a project holds at most one favorite per article):

```tsx
      <ul>
        {favorites.map((f) => (
          <li key={f.catalogItemId}>
            {/* The display name comes from the catalog item (article identity, MVP design §3.1),
                already flattened onto the lean FavoriteArticle shape by listFavorites. */}
            {f.name}{" "}
            <form action={removeFavoriteAction} style={{ display: "inline" }}>
              <input type="hidden" name="catalogItemId" value={f.catalogItemId} />
              <button type="submit">Entfernen</button>
            </form>
          </li>
        ))}
      </ul>
```

In `src/app/api/projects/[projectId]/favorites/route.ts`, replace the GET JSDoc line:

```ts
 * Response: 200 FavoriteWithItem[]
```

with:

```ts
 * Response: 200 FavoriteArticle[] — the lean article projection, not the raw favorite row.
```

- [ ] **Step 6: Verify the whole suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS — **164 tests in 18 files** (159 baseline + 4 from Task 1 + 1 from this task). Confirm the exact number at execution and carry the real figure into Task 6. The build must show no type error from the removed `FavoriteWithItem` — if one appears, a consumer was missed; find it with `grep -rn "FavoriteWithItem" src/`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/favorites/favorites.ts src/lib/favorites/favorites.test.ts "src/app/projects/[projectId]/page.tsx" "src/app/api/projects/[projectId]/favorites/route.ts"
git commit -m "refactor: listFavorites returns the lean FavoriteArticle projection"
```

---

### Task 3: One shared article-name comparator

**Files:**
- Create: `src/lib/catalog/sort.ts`
- Modify: `src/lib/favorites/favorites.ts` (sort in JS with the shared comparator)
- Modify: `src/lib/suggestions/suggestions.ts` (use the shared comparator instead of an inline `localeCompare`)
- Test: `src/lib/favorites/favorites.test.ts` (the failing German-sort test)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export const ARTICLE_NAME_LOCALE = "de"`
  - `export function compareArticleNames(a: string, b: string): number` — an `Array.prototype.sort` comparator over article display names.
  - `listFavorites` keeps its `Promise<FavoriteArticle[]>` signature from Task 2; only the ordering mechanism changes.
  - `computeSuggestions` keeps its `Promise<SuggestedArticle[]>` signature; only the ordering mechanism changes.

- [ ] **Step 1: Write the failing test**

In `src/lib/favorites/favorites.test.ts`, add this test inside the `describe("listFavorites", …)` block, directly after the `"exposes exactly the four article fields …"` test added in Task 2:

```ts
  it("orders by German locale rules, matching computeSuggestions exactly", async () => {
    // Both reads render article lists to the same German user, so they must agree. Postgres' column
    // collation and JS localeCompare(…, "de") do NOT: this test fails while listFavorites sorts in
    // the DB, and passes once both go through compareArticleNames.
    for (const name of ["Zucker", "Äpfel", "Apfel"]) {
      const item = await getOrCreateCatalogItem(db, { projectId, name });
      await addFavorite(db, { projectId, catalogItemId: item.id });
    }
    const favorites = await listFavorites(db, projectId);
    expect(favorites.map((f) => f.name)).toEqual(["Apfel", "Äpfel", "Zucker"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/favorites/favorites.test.ts -t "German locale"`
Expected: FAIL — the DB collation returns a different order than `["Apfel", "Äpfel", "Zucker"]`.

> If this test happens to PASS on the Neon test branch's collation, do **not** delete it and do not skip the rest of the task. The finding is that the two orderings are *not guaranteed* to agree — a collation change on the database would silently split them. Note the pass in the commit message and continue with Steps 3–5; the point of the task is to make the ordering independent of the DB.

- [ ] **Step 3: Create the shared comparator**

Create `src/lib/catalog/sort.ts`:

```ts
// The ONE ordering rule for article display names (MVP design §3.1 article identity).
//
// WHY a shared module instead of an inline sort at each call site: the app renders article names in
// several places (the Favoriten section, the suggestion set, a pre-filled list), and they are meant
// to look like the same list to the same user. Two of them previously disagreed — computeSuggestions
// sorted in JS with localeCompare("de") while listFavorites sorted in Postgres under the database's
// collation — so umlauts could land in different positions in the two lists. Making the rule a named
// export means the next article list added to the app inherits the agreed order for free.

// The product is German (in-app strings are German, CLAUDE.md), so article names sort under German
// rules: "Äpfel" belongs next to "Apfel", not after "Zucker" where a code-point sort puts it.
export const ARTICLE_NAME_LOCALE = "de";

// Comparator for Array.prototype.sort over article DISPLAY names (CatalogItem.name — never
// normalizedName, which is a lowercase identity key and not meant for humans).
//
// NOTE: searchCatalog deliberately does NOT use this and keeps its Postgres `orderBy: { name: "asc" }`.
// It applies `take: limit` in the query, so sorting in JS afterwards would only reorder an
// already-truncated page — and worse, it could change WHICH articles survive the cut. Fixing that
// properly means moving the cut client-side (a Slice 8 concern, when the datalist is replaced by a
// fetch-on-keystroke dropdown). Do not "unify" it by adding this comparator there.
export function compareArticleNames(a: string, b: string): number {
  return a.localeCompare(b, ARTICLE_NAME_LOCALE);
}
```

- [ ] **Step 4: Use the comparator in both reads**

In `src/lib/favorites/favorites.ts`, add the import directly below the existing `isUuid` import so the import block reads:

```ts
import type { Favorite, PrismaClient } from "@prisma/client";
import { compareArticleNames } from "@/lib/catalog/sort";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";
```

Then, in `listFavorites`, replace the query's ordering line:

```ts
    // Order by the RELATED catalog item's name (Prisma supports relation ordering) — human-friendly
    // and deterministic without storing a separate sort column on the favorite.
    orderBy: { catalogItem: { name: "asc" } },
```

with (drop the DB ordering entirely — the JS sort below is now the single source of order):

```ts
    // NOTE: no `orderBy` here on purpose. Ordering happens in JS below via compareArticleNames, so
    // this list and computeSuggestions cannot drift apart under a different database collation.
```

and replace the return statement:

```ts
  // Map to the lean article shape (drop internal columns before they cross a boundary) — same
  // mapping step searchCatalog performs for CatalogSuggestion.
  return favorites.map((favorite) => ({
    catalogItemId: favorite.catalogItemId,
    name: favorite.catalogItem.name,
    defaultCategory: favorite.catalogItem.defaultCategory,
    defaultUnit: favorite.catalogItem.defaultUnit,
  }));
```

with:

```ts
  // Map to the lean article shape (drop internal columns before they cross a boundary) — same
  // mapping step searchCatalog performs for CatalogSuggestion — then sort with the shared rule.
  // Sorting AFTER the projection (not before) keeps the comparator working on plain names, which is
  // exactly the contract compareArticleNames declares.
  return favorites
    .map((favorite) => ({
      catalogItemId: favorite.catalogItemId,
      name: favorite.catalogItem.name,
      defaultCategory: favorite.catalogItem.defaultCategory,
      defaultUnit: favorite.catalogItem.defaultUnit,
    }))
    .sort((a, b) => compareArticleNames(a.name, b.name));
```

In `src/lib/suggestions/suggestions.ts`, add the import directly below the existing `applyOperation` import so the import block reads:

```ts
import type { CatalogItem, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { List } from "@prisma/client";
import { createList, type CreateListInput } from "@/lib/lists/lists";
import { applyOperation } from "@/lib/lists/operations";
import { compareArticleNames } from "@/lib/catalog/sort";
```

Then replace the final return of `computeSuggestions`:

```ts
  // Stable, human-friendly output: alphabetical by article name (localeCompare with "de" so umlauts
  // sort sensibly for the German UI).
  return [...byCatalog.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
```

with:

```ts
  // Stable, human-friendly output: alphabetical by article name under the shared rule
  // (compareArticleNames — German locale, so umlauts sort sensibly for the German UI). Sharing the
  // comparator with listFavorites is what guarantees the Favoriten section and a pre-filled list
  // present the same articles in the same order.
  return [...byCatalog.values()].sort((a, b) => compareArticleNames(a.name, b.name));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/favorites/favorites.test.ts src/lib/suggestions/suggestions.test.ts`
Expected: PASS — 11 tests in `favorites.test.ts` and 19 in `suggestions.test.ts`. The Task 1 German-sort test for `computeSuggestions` must still pass, proving the comparator swap was behavior-preserving there.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/sort.ts src/lib/favorites/favorites.ts src/lib/favorites/favorites.test.ts src/lib/suggestions/suggestions.ts
git commit -m "fix: one shared article-name comparator so favorites and suggestions agree on order"
```

---

### Task 4: Clamp a non-positive `M` window

**Files:**
- Modify: `src/lib/suggestions/suggestions.ts` (the window query in `computeSuggestions`)
- Test: `src/lib/suggestions/suggestions.test.ts` (one new test in the `computeSuggestions` describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change. `computeSuggestions` gains an internal `windowSize` local; a `suggestionRuleM <= 0` now yields an empty statistic instead of an inverted window.

- [ ] **Step 1: Write the failing test**

In `src/lib/suggestions/suggestions.test.ts`, add this test inside the `describe("computeSuggestions", …)` block, directly after the `"respects the project's M window size, not just N"` test added in Task 1:

```ts
  it("treats a non-positive M as an empty window instead of inverting it", async () => {
    // Prisma reads a NEGATIVE `take` as "the LAST n rows", so an unclamped take: -1 would silently
    // flip the window and return the OLDEST completed list instead of none. N=1 makes the difference
    // observable: unclamped -> ["Alt"] (the oldest list), clamped -> [] (no window, no statistic).
    await db.project.update({
      where: { id: projectId },
      data: { suggestionRuleN: 1, suggestionRuleM: -1 },
    });
    await completedList(["Alt"], new Date("2026-07-01"));
    await completedList(["Neu"], new Date("2026-07-02"));

    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0);
  });

  it("still returns favorites when M is non-positive (only the statistic goes silent)", async () => {
    // The clamp must disable the STATISTIC half only. Favorites are unconditional (MVP design §4.3:
    // "Favoriten: alle Favorite des Projekts"), so they survive any window configuration.
    await db.project.update({ where: { id: projectId }, data: { suggestionRuleM: 0 } });
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: milch.id });

    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts -t "non-positive M"`
Expected: FAIL on the first test — it receives `["Alt"]` (length 1) instead of an empty array, because `take: -1` returned the last row of the descending window. The second test is expected to pass already (`take: 0` returns no rows); it is there to pin that the clamp does not accidentally silence favorites too.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/suggestions/suggestions.ts`, replace this block inside `computeSuggestions`:

```ts
  const recent = await db.list.findMany({
    where: { projectId, status: "completed" },
    // nulls: "last" is deliberate — Postgres sorts NULLs FIRST on DESC, so a completed row with no
    // completedAt (never produced by completeList, but possible via a seed/import) would otherwise
    // occupy the top of the window and evict a real recent list.
    orderBy: { completedAt: { sort: "desc", nulls: "last" } },
    take: project.suggestionRuleM, // the window size M
    select: { id: true },
  });
```

with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/suggestions/suggestions.ts src/lib/suggestions/suggestions.test.ts
git commit -m "fix: clamp a non-positive suggestion window M so take cannot invert it"
```

---

### Task 5: Roll back a partially pre-filled list

**Files:**
- Modify: `src/lib/suggestions/suggestions.ts` (the pre-fill loop in `createPrefilledList`)
- Test: `src/lib/suggestions/suggestions.test.ts` (one new test in the `createPrefilledList` describe block)

**Interfaces:**
- Consumes: nothing new — the compensating delete uses `db.list.delete`, and the existing `ListItem.list` relation's `onDelete: Cascade` removes the entries that were already added.
- Produces: no signature change. `createPrefilledList` still returns `Promise<List>` on success; on failure it now leaves no list behind and rethrows the original error unchanged (so the route's `toErrorResponse` still maps an `ApiError` to its real status).

- [ ] **Step 1: Write the failing test**

In `src/lib/suggestions/suggestions.test.ts`, add this test inside the `describe("createPrefilledList", …)` block, directly after the existing `"gives the pre-filled entries distinct, ascending sortIndexes"` test and before that block's closing `});`:

```ts
  it("leaves no half-filled list behind when an entry fails mid-loop", async () => {
    // Force a failure PART WAY THROUGH the loop. "Apfel" is valid and sorts first, so it is added
    // successfully; the second article's name is 201 chars, one over MAX_ITEM_NAME_LENGTH, so
    // getOrCreateCatalogItem throws ApiError 400 on it. Seeding that row directly via
    // db.catalogItem.create is what bypasses the very validation we want to trip later — no public
    // path can create such an article, which is exactly why this is the cheapest failure injection.
    const apfel = await getOrCreateCatalogItem(db, { projectId, name: "Apfel" });
    await addFavorite(db, { projectId, catalogItemId: apfel.id });

    const tooLong = "B".repeat(201); // MAX_ITEM_NAME_LENGTH is 200 (src/lib/catalog/catalog.ts)
    const broken = await db.catalogItem.create({
      data: { projectId, name: tooLong, normalizedName: tooLong.toLowerCase() },
    });
    await addFavorite(db, { projectId, catalogItemId: broken.id });

    await expect(createPrefilledList(db, { projectId, name: "Kaputt" })).rejects.toMatchObject({
      status: 400,
    });

    // The compensating delete must have removed the list AND (via the list->items cascade) the
    // "Apfel" entry that had already been written before the failure.
    expect(await db.list.findMany({ where: { projectId } })).toHaveLength(0);
    expect(await db.listItem.findMany({})).toHaveLength(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts -t "half-filled"`
Expected: FAIL — the rejection happens as expected, but the list assertion reports 1 list (and 1 orphan entry) instead of 0: today the list survives the failure with only part of its suggestions.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/suggestions/suggestions.ts`, replace the body of `createPrefilledList` after the `createList` call:

```ts
  // Compute the suggestions for the project and add each as an entry. We pass ONLY the name:
  // add_item resolves it to the existing catalog row and INHERITS its category/unit defaults (the
  // very values the suggestion carries), so we neither duplicate the inheritance logic nor risk a
  // stale copy. Sequential (not Promise.all): each add_item derives the next sortIndex from the
  // current max, so the writes must not race each other.
  const suggestions = await computeSuggestions(db, input.projectId);
  for (const article of suggestions) {
    await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(), // stable entry identity, generated caller-side by convention
      name: article.name,
    });
  }
  return list;
```

with:

```ts
  // Compute the suggestions for the project and add each as an entry. We pass ONLY the name:
  // add_item resolves it to the existing catalog row and INHERITS its category/unit defaults (the
  // very values the suggestion carries), so we neither duplicate the inheritance logic nor risk a
  // stale copy. Sequential (not Promise.all): each add_item derives the next sortIndex from the
  // current max, so the writes must not race each other.
  const suggestions = await computeSuggestions(db, input.projectId);
  try {
    for (const article of suggestions) {
      await applyOperation(db, list, {
        op: "add_item",
        itemId: randomUUID(), // stable entry identity, generated caller-side by convention
        name: article.name,
      });
    }
  } catch (error) {
    // Pattern: COMPENSATING ACTION. If any entry fails, the list created above is a half-filled
    // artifact the user never asked for — it would show up in "Listen" with an arbitrary subset of
    // the suggestions and no indication anything went wrong. Delete it, then rethrow the ORIGINAL
    // error so the transport still maps the real ApiError status (a swallowed error would surface as
    // a fake success). The list->items cascade (ListItem.list, onDelete: Cascade) removes whatever
    // entries were already written.
    //
    // WHY NOT db.$transaction: applyOperation, createList and getOrCreateCatalogItem all declare
    // their first parameter as PrismaClient, while an interactive transaction hands back
    // Omit<PrismaClient, ITXClientDenyList> — not assignable. Widening those signatures across the
    // Slice 3/4 cores is a much larger change than this failure mode justifies. Revisit if a second
    // multi-write orchestrator appears.
    //
    // .catch(): the cleanup is best-effort. If the delete ALSO fails we still want the caller to see
    // the original cause, not a confusing secondary error from the rollback path.
    await db.list.delete({ where: { id: list.id } }).catch(() => undefined);
    throw error;
  }
  return list;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Run the full suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS — **168 tests in 18 files** (159 baseline + 4 in Task 1 + 1 in Task 2 + 1 in Task 3 + 2 in Task 4 + 1 in Task 5 = 9 new). Confirm the exact number at execution and use the measured figure in Task 6, not this estimate. Lint clean. Build clean apart from the two known pre-existing warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/suggestions/suggestions.ts src/lib/suggestions/suggestions.test.ts
git commit -m "fix: roll back a partially pre-filled list when an entry fails"
```

---

### Task 6: Record the resolutions in the review and the meta plan

**Files:**
- Modify: `docs/implementation-reviews/slice-5-favorites-suggestions.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:** none (documentation). Closing the loop on a review is part of the Definition of Done in CLAUDE.md; the meta plan's progress log is the durable record a future agent reads.

- [ ] **Step 1: Re-run the full verification and capture the real numbers**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Write down the exact test/file counts — the estimates in Tasks 2 and 5 are estimates, and the review must carry the measured figures.

- [ ] **Step 2: Update the Slice 5 implementation review**

In `docs/implementation-reviews/slice-5-favorites-suggestions.md`, replace this paragraph (the last paragraph of §2 "Steps taken"):

```markdown
The only implementation deviation was in Task 4's sort-index assertion: it expects `[1, 2]`, not the
plan's `[0, 1]`, because `applyOperation` starts sort indexes at 1, matching the existing operations
contract. Earlier minor review notes remain non-blocking: the 404 message assertion gap and missing
focused tests for `NULLS LAST`, configurable M, and German locale sorting.
```

with (fill in `<N>` from Step 1):

```markdown
The only implementation deviation was in Task 4's sort-index assertion: it expects `[1, 2]`, not the
plan's `[0, 1]`, because `applyOperation` starts sort indexes at 1, matching the existing operations
contract.

A follow-up review pass on 2026-07-26 raised seven findings, all of which were fixed on this branch
(plan: `docs/superpowers/plans/2026-07-26-slice-5-review-fixes.md`), bringing the suite to <N> tests
in <N> files:

1. **Untested defensive lines** — `NULLS LAST`, the configurable `M` window and the German locale
   sort are now pinned by characterization tests, as are the favorites 404 *message* and
   `removeFavorite`'s malformed-id no-op.
2. **Two disagreeing orderings** — `listFavorites` sorted in Postgres while `computeSuggestions`
   sorted in JS with `localeCompare(…, "de")`, so umlauts could land differently in the two lists.
   Both now use the shared `compareArticleNames` (`src/lib/catalog/sort.ts`).
3. **Over-exposed REST payload** — `listFavorites` returned the raw Prisma row (leaking
   `normalizedName`, `projectId`, `createdAt`). It now returns the lean `FavoriteArticle`, matching
   the "don't over-expose" precedent of `MemberUser` and `CatalogSuggestion`.
4. **Unguarded window size** — a non-positive `suggestionRuleM` would have inverted Prisma's `take`.
   It is clamped to `Math.max(0, …)`; `N` is left unclamped because `N <= 0` is coherent.
5. **Half-filled list on failure** — `createPrefilledList` now deletes the list it created if any
   `add_item` throws, then rethrows the original error.
6. **Spec wording vs. entity model** — MVP design §4.3 step 3 mentions *Menge* among the values a
   pre-filled entry inherits from `CatalogItem`, but §3.1 defines only `default_category` and
   `default_unit`; there has never been a default quantity in the spec or the schema. The entity list
   is authoritative and `quantity: null` is correct. Recorded here so it is not re-litigated.
7. **Uncommitted tracking file** — the Slice 5 SDD ledger is committed.
```

Then, in §5 "Architecture contribution", append this paragraph at the very end of the file (after the paragraph ending "Only Slice 8, PWA polish, remains."):

```markdown
One trade-off deliberately survives the fix pass: `createPrefilledList` compensates rather than
transacts. `applyOperation`, `createList` and `getOrCreateCatalogItem` all take a `PrismaClient`,
which an interactive Prisma transaction's client is not assignable to, so making pre-fill atomic
would mean widening those signatures across the Slice 3 and 4 cores. If a second multi-write
orchestrator ever appears, that refactor becomes worth doing — until then the compensating delete
covers the only failure mode that can leave user-visible debris.
```

- [ ] **Step 3: Add the meta-plan progress-log entry**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`, add this entry at the TOP of the "Progress log" section — above the existing `### 2026-07-26 — Slice 5: Favorites + Suggestions — Done` entry (newest first). Fill in `<N>` from Step 1 and `<hashes>` from `git log --oneline main..HEAD`:

```markdown
### 2026-07-26 — Slice 5: Review fixes — Done
- **Delivered:** All seven findings from the Slice 5 code review, fixed on the same branch (plan: [2026-07-26-slice-5-review-fixes.md](2026-07-26-slice-5-review-fixes.md)). (1) Characterization tests pinning `NULLS LAST`, the configurable `M` window, the German locale sort, the favorites 404 message and `removeFavorite`'s malformed-id no-op. (2) New `compareArticleNames` (`src/lib/catalog/sort.ts`) shared by `listFavorites` and `computeSuggestions`. (3) `listFavorites` returns the lean `FavoriteArticle` instead of the raw Prisma row. (4) `suggestionRuleM` clamped to `Math.max(0, …)`. (5) `createPrefilledList` deletes its list if an entry fails. (6) The §4.3-vs-§3.1 "Menge" wording gap documented. (7) The Slice 5 SDD ledger committed.
- **Tested:** `npm test` passed (<N> files, <N> tests — 9 new); `npm run lint` + `npm run build` passed (with the two pre-existing warnings noted in the Slice 7 entry). No manual browser pass needed: the only UI change is the favorites `<ul>` reading `f.name`/`f.catalogItemId` from the lean shape, covered by build + the core tests behind it.
- **Deviations from the plan:** <fill in, or "none">.
- **Follow-up decisions for later slices:**
  - `compareArticleNames` (`src/lib/catalog/sort.ts`) is THE article-ordering rule — any new article list must use it. `searchCatalog` is the deliberate exception: it truncates with `take` in the query, so a JS sort would reorder an already-cut page and could change which articles survive. Fix that when Slice 8 replaces the `<datalist>` with a fetch-on-keystroke dropdown.
  - `listFavorites` and `computeSuggestions` now return the same four-field article shape (`FavoriteArticle` / `SuggestedArticle`). They stay separate types so the favorites core does not import the suggestions core — suggestions read favorites, never the reverse.
  - `createPrefilledList` compensates (delete-on-failure) rather than transacts, because the Slice 3/4 cores type their first parameter as `PrismaClient` and an interactive transaction client is not assignable to it. Revisit only if a second multi-write orchestrator appears.
  - `suggestionRuleN`/`suggestionRuleM` are still not settable through any endpoint or UI. `M` is clamped at the read; if per-project tuning is ever exposed, validate both at the write instead.
  - MVP design §4.3 step 3 lists *Menge* among the catalog defaults a pre-filled entry inherits, but §3.1's `CatalogItem` has only `default_category`/`default_unit`. The entity list wins; `quantity: null` is correct. Do not add a `defaultQuantity` column on the strength of §4.3 alone.
- **Inherited open items:** Slice 8 (PWA polish) plan still to be created — it is the only remaining slice. Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0; overlapping polls; cancelled-before-JSON race) stay open and are untouched. The pre-existing Next.js hydration overlay from locale-sensitive date formatting on the project/list pages is also still open.
- **Commit(s):** <hashes>
```

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-5-favorites-suggestions.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md docs/superpowers/plans/2026-07-26-slice-5-review-fixes.md
git commit -m "docs: record the Slice 5 review-fix pass"
```

---

## Self-Review (performed while writing this plan on 2026-07-26)

**1. Finding coverage** — every review finding maps to a task:

| # | Finding | Task | Verified by |
|---|---|---|---|
| 1 | `NULLS LAST` / configurable `M` / de-sort untested; 404 message and `removeFavorite` malformed-id gaps | 1 | 4 new tests, all expected green on current code |
| 2 | `listFavorites` (Postgres collation) vs. `computeSuggestions` (`localeCompare("de")`) disagree | 3 | red-green test + shared `compareArticleNames` |
| 3 | `GET /favorites` leaks `normalizedName`/`projectId`/`createdAt` | 2 | `toEqual` assertion on the whole projection |
| 4 | `createPrefilledList` leaves a half-filled list on failure | 5 | red-green test with an over-long catalog name |
| 5 | Non-positive `suggestionRuleM` inverts Prisma's `take` | 4 | red-green test (`M=-1`) + a favorites-survive test |
| 6 | §4.3 "Menge" vs. §3.1 `CatalogItem` — spec wording gap, not a bug | 6 | documented in the review and the meta plan |
| 7 | `.superpowers/sdd/progress.md` uncommitted | 1 | Step 1 commit; `git status` empty |

**2. Placeholder scan:** No TBD/TODO/"add appropriate…". Every code step contains complete code; every test step complete tests. The only intentional fill-ins are the measured test counts, the deviations line and the commit hashes in Task 6 — none of which can be known before execution.

**3. Type consistency:** `FavoriteArticle { catalogItemId, name, defaultCategory, defaultUnit }` is defined in Task 2, returned by `listFavorites` in Tasks 2 and 3, consumed in `page.tsx` as `f.name`/`f.catalogItemId` (Task 2) and asserted as `f.name` in the tests of Tasks 2 and 3. `FavoriteWithItem` is deleted in Task 2 and referenced nowhere afterwards (Task 2 Step 6 greps for stragglers). `compareArticleNames(a: string, b: string): number` is defined in Task 3 and called with two plain names in both call sites. `addFavorite`/`removeFavorite`/`computeSuggestions`/`createPrefilledList` keep their existing signatures throughout. `MAX_ITEM_NAME_LENGTH = 200` (`src/lib/catalog/catalog.ts`) is the constant Task 5's 201-char name is chosen against. `ListItem.list` `onDelete: Cascade` (verified in `prisma/schema.prisma`) is what makes Task 5's single `db.list.delete` sufficient.

**4. Anchor verification:** every exact-match block quoted above was read from the current working tree at `bba0973` + the uncommitted `.superpowers/sdd/progress.md`. Task 3's anchors in `favorites.ts` deliberately quote the **post-Task-2** state of that file (the lean projection), so Task 2 must run first. Tasks 4 and 5 both edit `suggestions.ts` but touch non-overlapping blocks — Task 4 the window query inside `computeSuggestions`, Task 5 the pre-fill loop inside `createPrefilledList` — so their anchors are valid in either order. Execute the tasks in the numbered order regardless.

**5. Ordering rationale:** Task 2 (shape) precedes Task 3 (comparator) so the German-sort test is written once, against the final lean shape, instead of being rewritten a task later. Task 1 comes first because its tests must be green against untouched code — running them after any of the fixes would blur "already correct" with "just fixed".

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-26-slice-5-review-fixes.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with a two-stage review between tasks. Fast iteration, clean context per task.
2. **Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`, batched with checkpoints for your review.

Which approach?
