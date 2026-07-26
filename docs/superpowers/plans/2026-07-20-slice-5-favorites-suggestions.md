# Slice 5 — Favorites + Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **✅ Reconciled against post-Slice-7 `main` (`ab81e2f`) on 2026-07-26 — this plan is ready to execute.**
> The original version of this plan carried a "do not execute until Slice 6 ships" block plus a list of
> shared-file edits to re-derive. **Slice 5 is now the LAST unbuilt slice before PWA polish:** Slices 6
> (Completion + Archive, `66e4283`) and 7 (Polling / Sync, `ab81e2f`) are both merged. That block is
> gone and every code block below was re-read from the **current** files:
> - `src/app/projects/[projectId]/page.tsx` now destructures `activeLists` / `archivedLists` from a
>   **four-element** `Promise.all` and renders an "Archiv" section — Task 6 edits that shape. Slice 7
>   also touched this file, but only to add a `← Zu meinen Projekten` back-link above the `<h1>`; all
>   four Task 6 anchors are unaffected (re-verified against `ab81e2f`).
> - `src/lib/lists/lists.ts` now exports `listLists(db, projectId, status?)`, `completeList`,
>   `reopenList`, `allItemsChecked` — Task 3's statistic reads what `completeList` writes.
> - The test baseline is **16 files / 135 tests** (Slice 7), not Slice 6's 126 or Slice 4's 118.
> - Slice 7 added `src/lib/lists/delta.ts`, `GET /api/lists/:id/delta` and the `ListSyncPoller` client
>   component. This slice needs **no change** to any of them — see locked decision #5.
> **The N-of-M statistic is LIVE, not dormant.** Completed lists exist in the app now, so the
> statistic half of `computeSuggestions` is end-to-end verifiable (Task 6, Step 7) and no "dormant"
> caveat belongs in the review or the meta-plan entry.

**Goal:** Give a project a shared list of favorite articles and a pure read function that suggests articles to pre-fill a new list — the union of the project's favorites and the articles that appear in ≥ N of the last M completed lists (MVP design §4.3).

**Architecture:** One new persisted entity (`Favorite`, unique per project+article) plus two pure functions and one orchestrator on top of the Slice 3/4 catalog and operations. `computeSuggestions` is a **pure read** over favorites + completed lists that returns a deduplicated set of articles — the §7 "Vorschlags-Logik" testable seam. `createPrefilledList` creates a list and then adds one entry per suggested article **through `applyOperation`** (the single mutation path), letting the existing add-time inheritance fill category/unit from the catalog defaults. Favorites get member-level REST endpoints and a project-detail UI section; pre-fill is exposed both as a `prefill` flag on the lists POST and as a "Vorbefüllte Liste anlegen" button.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Prisma 6 against Neon Postgres, Auth.js (NextAuth v5), Vitest 4. No new dependencies.

## Global Constraints

Copied verbatim from CLAUDE.md and the meta project plan. Every task inherits these.

- **Implementation docs, code identifiers, and code comments: English.** In-app user-facing strings stay **German** (the product is German).
- **Meticulous inline comments** on every function (what + **why**) and every non-obvious line; name the pattern when one is used; never remove or thin existing comments when editing a file.
- **Stable, client-generatable UUIDs** for all entities (offline-prep convention).
- **Entry-level, idempotent operations** (`add_item`, `update_item`, `check_item`, `remove_item`) are the ONLY mutation path for list entries — pre-fill MUST create entries through `applyOperation`, never with ad-hoc `listItem.create` writes.
- **Every API operation re-checks membership + role** via the Slice 2/3 guards (`requireMembership` / `requireListAccess`); never trust the client. Favorites and suggestions are **member-level** (permission matrix, MVP design §6: "Favoriten/Katalog pflegen" = Owner ✓ / Mitglied ✓).
- **DB access through an injectable `PrismaClient`** (first parameter of every core function), so logic stays unit-testable in isolation.
- **Test-first (TDD)**, small vertical slices, frequent commits.
- Article-name normalization rule (MVP design §4.4): **lowercase + trim + collapse repeated whitespace** — already implemented as `normalizeName` (`src/lib/catalog/normalize.ts`); reuse it, never reimplement.
- **Reuse, do not redefine** existing helpers/constants: `getOrCreateCatalogItem` (`src/lib/catalog/catalog.ts`), `createList` / `CreateListInput` / `listLists` (`src/lib/lists/lists.ts`), `applyOperation` (`src/lib/lists/operations.ts`), `requireMembership` (`src/lib/projects/guard.ts`), `requireUserId` (`src/lib/auth/session.ts`), `ApiError` / `toErrorResponse` (`src/lib/http/errors.ts`), `isUuid` (`src/lib/validate.ts`), `searchCatalog` / `CATALOG_DATALIST_LIMIT` (`src/lib/catalog/search.ts`).
- **Test convention (Slices 1–4, 6, 7):** core functions are unit-tested against the Neon test branch (`new PrismaClient()` + `resetDb(db)` in `beforeEach`); route handlers, pages and client components are thin adapters with **no unit tests** — they are verified by `npm run build` + `npm run lint` + a manual browser pass. Follow this split; do not invent route/page tests.
- **Baseline before this slice:** `npm test` = **16 files, 135 tests**, all green (meta plan, Slice 7 entry).

---

## Design decisions locked for this slice

1. **The statistic is live, because Slice 6 has shipped.** `completeList` (`src/lib/lists/lists.ts`) sets `status = "completed"` + `completedAt = new Date()`, and it is guarded by `where: { status: "active" }` so completing an already-completed list **never re-stamps `completedAt`** — that is exactly what makes "the last M completed lists" a stable window across retries. `reopenList` clears `completedAt`, so a reopened list correctly drops out of the window. `computeSuggestions` therefore reads real app data from day one and is verifiable end-to-end in the browser (Task 6, Step 7, items 6–8). Its unit tests still seed completed lists directly, because the function must stay testable without driving the UI.
2. **Pre-fill goes through `applyOperation` with the article name only.** For each suggested article, `createPrefilledList` sends `add_item` with just the `name`; `add_item` resolves it to the existing catalog row and **inherits** `defaultCategory` / `defaultUnit` (the same values the suggestion carries). This keeps the single mutation path intact for Slice 7 and reuses the Slice 4 inheritance path instead of duplicating it.
3. **Favorites are project-shared, keyed by `(projectId, catalogItemId)`.** Not per-user (MVP design §3.1: "Favoriten gehören dem Projekt (geteilt)"). Adding is an idempotent upsert; removing is an idempotent `deleteMany`. A favorite may only point at the project's **own** catalog (guarded), so a member cannot favorite another project's article by guessing an id.
4. **The "last M" window orders by `completedAt DESC NULLS LAST` explicitly.** Postgres puts NULLs *first* on a `DESC` sort by default. Every list `completeList` produces has a `completedAt`, so this is defensive — but a single NULL row (from a seed or a future import path) would otherwise silently occupy a slot at the *top* of the window and evict a real completed list. Prisma 6 supports `{ sort: "desc", nulls: "last" }` on nullable fields; use it.
5. **Slice 7 (Polling / Sync) needs no changes, and this slice must not touch it.** Two consequences of routing pre-fill through `applyOperation` (decision #2), both free:
   - Every pre-filled entry gets a real `ListItem.updatedAt` (Prisma `@updatedAt`), which is exactly what `computeCursor` / `getListDelta` read. A member already sitting on a list sees nothing odd, and a member who opens the new pre-filled list gets a render-time cursor baseline covering all of it. **Do not** bulk-insert pre-fill entries with `createMany` as an "optimization": that would still set `updatedAt`, but it would bypass the catalog get-or-create and the category/unit inheritance, and it would break the single-mutation-path invariant Slice 7 depends on.
   - The poller (`ListSyncPoller`) is mounted on the **list detail page only**. The project page — where Task 6 puts the Favoriten section — is not polled, so a favorite added by another member appears on the next navigation or refresh, not live. That matches the rest of that page (members, lists, archive are all equally static) and is deliberately out of scope here; live project-level sync is a Phase 2 concern.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `prisma/schema.prisma` (modify) | Add the `Favorite` model + `favorites` back-relations on `Project` and `CatalogItem`. | 1 |
| `prisma/migrations/**` (generated) | Migration `add_favorites` created by `prisma migrate dev`. | 1 |
| `src/test/reset-db.ts` (modify) | Add `"favorites"` to the TRUNCATE list so DB tests stay isolated. | 1 |
| `src/lib/favorites/favorites.ts` (create) | `FavoriteWithItem` / `FavoriteRef` types + `addFavorite`, `removeFavorite`, `listFavorites`. | 2 |
| `src/lib/favorites/favorites.test.ts` (create) | Unit tests for the favorites core (idempotency, project-scoping, ordering). | 2 |
| `src/lib/suggestions/suggestions.ts` (create) | `SuggestedArticle` type + `computeSuggestions` (favorites ∪ N-of-M) + `createPrefilledList`. | 3, 4 |
| `src/lib/suggestions/suggestions.test.ts` (create) | Unit tests for `computeSuggestions` (Task 3) and `createPrefilledList` (Task 4). | 3, 4 |
| `src/app/api/projects/[projectId]/favorites/route.ts` (create) | `GET` (list) + `POST` (add) member-level favorites endpoints. | 5 |
| `src/app/api/projects/[projectId]/favorites/[catalogItemId]/route.ts` (create) | `DELETE` a favorite (member-level, idempotent). | 5 |
| `src/app/api/projects/[projectId]/suggestions/route.ts` (create) | `GET` the suggestion set (member-level). | 5 |
| `src/app/api/projects/[projectId]/lists/route.ts` (modify) | Accept an optional `prefill` flag on POST → `createPrefilledList`. | 5 |
| `src/app/projects/[projectId]/page.tsx` (modify) | "Vorbefüllte Liste anlegen" form in the Listen section + a Favoriten section after the Archiv section. | 6 |
| `docs/implementation-reviews/slice-5-favorites-suggestions.md` (create) | Per-slice implementation review (Definition of Done). | 7 |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` (modify) | Flip Slice 5 status to ✅, drop the stale build-order note, add a progress-log entry. | 7 |

---

### Task 1: `Favorite` model + migration + test reset

**Files:**
- Modify: `prisma/schema.prisma` (add the `Favorite` model; add `favorites` back-relations to `Project` and `CatalogItem`)
- Modify: `src/test/reset-db.ts` (extend the TRUNCATE list)
- Generated: `prisma/migrations/<timestamp>_add_favorites/`

**Interfaces:**
- Consumes: the existing `Project` and `CatalogItem` models.
- Produces: a `favorites` table with columns `id` (uuid pk), `project_id` (uuid fk → projects, cascade), `catalog_item_id` (uuid fk → catalog_items, cascade), `created_at`; a compound unique `@@unique([projectId, catalogItemId])` (Prisma selector `projectId_catalogItemId`). Prisma model name `Favorite`, client accessor `db.favorite`.

- [ ] **Step 1: Add the `Favorite` model to the schema**

In `prisma/schema.prisma`, add the back-relation to `Project`. The `Project` model currently ends with the Slice 3 back-relations:

```prisma
  // Back-relations added in Slice 3 (Lists + Entries + minimal Catalog).
  lists        List[]
  catalogItems CatalogItem[]
```

Add directly below those two lines (still inside the `model Project { … }` block, above `@@map("projects")`):

```prisma
  // Back-relation added in Slice 5 (Favorites + Suggestions). Favorites are project-shared.
  favorites Favorite[]
```

Add the back-relation to `CatalogItem`. That model currently has:

```prisma
  createdAt DateTime   @default(now()) @map("created_at")
  listItems ListItem[]
```

Add directly below `listItems`:

```prisma
  // Back-relation added in Slice 5: which favorites point at this article (0 or 1 per project).
  favorites Favorite[]
```

Then append the new model at the end of the file (after `model ListItem { … }`):

```prisma
// A project-shared favorite article (MVP design §3.1, §4.3). Favorites are ALWAYS suggested when a
// new list is pre-filled. Identity is (project, article) — NOT (user, article): favorites belong to
// the project, so every member sees and edits the same set. This is the second input (besides the
// N-of-M statistic over completed lists) to computeSuggestions.
model Favorite {
  id        String  @id @default(uuid()) @db.Uuid // stable, client-generatable UUID (offline-prep convention)
  projectId String  @db.Uuid @map("project_id")
  // onDelete: Cascade -> deleting a project removes its favorites (project-scoped, like the catalog).
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // The favorited article. onDelete: Cascade keeps referential integrity if a catalog item is ever
  // removed (only ever via project delete in the MVP — there is no standalone catalog-item deletion).
  catalogItemId String      @db.Uuid @map("catalog_item_id")
  catalogItem   CatalogItem @relation(fields: [catalogItemId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")

  // One favorite row per article per project — favoriting an already-favorited article is a no-op.
  // Prisma exposes this as the compound selector `projectId_catalogItemId` in upsert/findUnique.
  @@unique([projectId, catalogItemId])
  @@map("favorites")
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name add_favorites`
Expected: a new folder `prisma/migrations/<timestamp>_add_favorites/` with `CREATE TABLE "favorites" …`; Prisma regenerates the client (so `db.favorite` becomes available). No errors.

- [ ] **Step 3: Extend the test DB reset**

In `src/test/reset-db.ts`, add `"favorites"` to the TRUNCATE list. Replace the raw SQL statement:

```ts
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "allowlist_entries", "projects", "memberships", "catalog_items", "lists", "list_items" RESTART IDENTITY CASCADE;'
  );
```

with:

```ts
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "allowlist_entries", "projects", "memberships", "catalog_items", "lists", "list_items", "favorites" RESTART IDENTITY CASCADE;'
  );
```

- [ ] **Step 4: Verify the client compiles**

Run: `npm run build`
Expected: PASS — the generated Prisma client includes the `Favorite` model and `db.favorite`; the build has no type errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/test/reset-db.ts
git commit -m "feat: add Favorite model + migration (project-shared favorites)"
```

---

### Task 2: Favorites core — `addFavorite` / `removeFavorite` / `listFavorites`

**Files:**
- Create: `src/lib/favorites/favorites.ts`
- Test: `src/lib/favorites/favorites.test.ts`

**Interfaces:**
- Consumes: `Favorite`, `CatalogItem`, `PrismaClient` from `@prisma/client`; `ApiError` from `@/lib/http/errors`; `isUuid` from `@/lib/validate`; `resetDb` from `@/test/reset-db` and `getOrCreateCatalogItem` from `@/lib/catalog/catalog` (test setup only).
- Produces:
  - `export type FavoriteWithItem = Favorite & { catalogItem: CatalogItem }`
  - `export interface FavoriteRef { projectId: string; catalogItemId: string }`
  - `export async function addFavorite(db: PrismaClient, input: FavoriteRef): Promise<Favorite>` — idempotent upsert; throws `ApiError(404)` if the catalog item is not in the project (or the id is malformed).
  - `export async function removeFavorite(db: PrismaClient, input: FavoriteRef): Promise<void>` — idempotent `deleteMany` scoped to the project; malformed id is a silent no-op.
  - `export async function listFavorites(db: PrismaClient, projectId: string): Promise<FavoriteWithItem[]>` — favorites with their catalog item, ordered alphabetically by article name.

- [ ] **Step 1: Write the failing test**

Create `src/lib/favorites/favorites.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { addFavorite, listFavorites, removeFavorite } from "./favorites";

// One shared client for the file (same pattern as the other core tests). resetDb gives every test a
// clean, deterministic project + catalog.
const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("addFavorite", () => {
  it("favorites a catalog article of the project", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    const fav = await addFavorite(db, { projectId, catalogItemId: item.id });
    expect(fav.projectId).toBe(projectId);
    expect(fav.catalogItemId).toBe(item.id);
  });

  it("is idempotent: favoriting the same article twice keeps a single row", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: item.id });
    await addFavorite(db, { projectId, catalogItemId: item.id });
    const rows = await db.favorite.findMany({ where: { projectId } });
    expect(rows).toHaveLength(1);
  });

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
});

describe("removeFavorite", () => {
  it("removes a favorite", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: item.id });
    await removeFavorite(db, { projectId, catalogItemId: item.id });
    const rows = await db.favorite.findMany({ where: { projectId } });
    expect(rows).toHaveLength(0);
  });

  it("is idempotent: removing a non-existent favorite is a no-op", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    // Never favorited — removing must not throw.
    await expect(removeFavorite(db, { projectId, catalogItemId: item.id })).resolves.toBeUndefined();
  });
});

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/favorites/favorites.test.ts`
Expected: FAIL — `addFavorite`/`removeFavorite`/`listFavorites` cannot be imported from `./favorites` (module does not exist).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/favorites/favorites.ts`:

```ts
import type { CatalogItem, Favorite, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

// The read shape the UI/REST list renders: a favorite plus its catalog item — the favorite row only
// stores ids, so it is useless for display without the article's name/defaults (article identity,
// MVP design §3.1).
export type FavoriteWithItem = Favorite & { catalogItem: CatalogItem };

// A favorite is identified by (project, article). Both ids together are the input to add/remove —
// grouping them in one type keeps the two call sites (and the REST adapters) consistent.
export interface FavoriteRef {
  projectId: string;
  catalogItemId: string;
}

// Favorites an article for the whole project (MVP design §4.3). Idempotent by design: favoriting an
// already-favorited article returns the existing row unchanged. Permission (membership) is checked
// by the caller via the guard — the core stays transport- and auth-agnostic.
export async function addFavorite(db: PrismaClient, input: FavoriteRef): Promise<Favorite> {
  const { projectId, catalogItemId } = input;
  // Shape check first: a malformed id can never match a uuid column, and must not reach it (Prisma
  // P2023 -> fake 500). Treat it as "article not found" — the same 404 a non-project article gets.
  if (!isUuid(catalogItemId)) throw new ApiError(404, "Artikel nicht gefunden");

  // The article MUST belong to THIS project. Without this check a member could favorite another
  // project's catalog item by guessing its id (the @@unique alone would happily store it). findFirst
  // scoped by projectId is the enforcement point.
  const catalogItem = await db.catalogItem.findFirst({ where: { id: catalogItemId, projectId } });
  if (!catalogItem) throw new ApiError(404, "Artikel nicht gefunden");

  // Pattern: idempotent upsert on the compound unique (projectId, catalogItemId) — one round-trip,
  // and the DB constraint (not app logic) guarantees a single row even under concurrent adds.
  // `update: {}`: an existing favorite is returned unchanged (there is nothing to update).
  return db.favorite.upsert({
    where: { projectId_catalogItemId: { projectId, catalogItemId } },
    update: {},
    create: { projectId, catalogItemId },
  });
}

// Un-favorites an article. Idempotent: removing a favorite that isn't there is a successful no-op
// (same convention as remove_item). Scoping by projectId keeps foreign favorites untouchable.
export async function removeFavorite(db: PrismaClient, input: FavoriteRef): Promise<void> {
  const { projectId, catalogItemId } = input;
  // A malformed id can't match anything — silent no-op instead of a P2023 crash (idempotent remove).
  if (!isUuid(catalogItemId)) return;
  // deleteMany (not delete): tolerates 0 matches, so an already-removed favorite is a no-op success.
  await db.favorite.deleteMany({ where: { projectId, catalogItemId } });
}

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/favorites/favorites.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/favorites/favorites.ts src/lib/favorites/favorites.test.ts
git commit -m "feat: favorites core (add/remove/list, project-scoped, idempotent)"
```

---

### Task 3: `computeSuggestions` — the pure suggestion read function

**Files:**
- Create: `src/lib/suggestions/suggestions.ts`
- Test: `src/lib/suggestions/suggestions.test.ts`

**Interfaces:**
- Consumes: `CatalogItem`, `PrismaClient` from `@prisma/client`; (test only) `resetDb`, `getOrCreateCatalogItem`, `addFavorite`.
- Produces:
  - `export interface SuggestedArticle { catalogItemId: string; name: string; defaultCategory: string | null; defaultUnit: string | null }`
  - `export async function computeSuggestions(db: PrismaClient, projectId: string): Promise<SuggestedArticle[]>` — the union of the project's favorites and articles appearing in ≥ `suggestionRuleN` of the last `suggestionRuleM` completed lists, deduplicated per article, sorted by name. Uses the project's stored N/M (defaults 2/4). Only `status = "completed"` lists count; the most recent M by `completedAt` form the window.

- [ ] **Step 1: Write the failing test**

Create `src/lib/suggestions/suggestions.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { addFavorite } from "@/lib/favorites/favorites";
import { computeSuggestions } from "./suggestions";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  // Explicit N=2, M=4 (the schema defaults) so the intent of each test is visible.
  const project = await db.project.create({
    data: { name: "Haushalt", ownerId: user.id, suggestionRuleN: 2, suggestionRuleM: 4 },
  });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

// Seeds a COMPLETED list containing the given article names. In the app, Slice 6's completeList sets
// status + completedAt; here we write them directly so the statistic is exercised without driving the
// UI (deterministic inputs, MVP design §7). Each name resolves to (or creates) the project's catalog
// item, then gets a list item (entries are created directly — this is test setup, not the app's
// mutation path).
async function completedList(names: string[], completedAt: Date) {
  const list = await db.list.create({
    data: { projectId, name: "Erledigt", status: "completed", completedAt },
  });
  let sortIndex = 0;
  for (const name of names) {
    const catalogItem = await getOrCreateCatalogItem(db, { projectId, name });
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: catalogItem.id, sortIndex: sortIndex++ },
    });
  }
  return list;
}

describe("computeSuggestions", () => {
  it("always suggests every project favorite (even with no completed lists)", async () => {
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: milch.id });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);
  });

  it("suggests an article that appears in >= N of the last M completed lists", async () => {
    // Milch in 2 completed lists (>= N=2) -> suggested; Brot in 1 (< 2) -> not suggested.
    await completedList(["Milch", "Brot"], new Date("2026-07-01"));
    await completedList(["Milch"], new Date("2026-07-02"));
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);
  });

  it("counts an article once per list even if it is listed twice in the same list", async () => {
    // Milch twice in ONE completed list = 1 list, which is < N=2 -> not suggested.
    const list = await db.list.create({
      data: { projectId, name: "Erledigt", status: "completed", completedAt: new Date("2026-07-01") },
    });
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.listItem.create({ data: { listId: list.id, catalogItemId: milch.id, sortIndex: 0 } });
    await db.listItem.create({ data: { listId: list.id, catalogItemId: milch.id, sortIndex: 1 } });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0);
  });

  it("unions favorites and the statistic without duplicating an article that is both", async () => {
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: milch.id });
    await completedList(["Milch"], new Date("2026-07-01"));
    await completedList(["Milch"], new Date("2026-07-02")); // now also statistic-qualified
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]); // exactly once
  });

  it("only considers the last M completed lists (older lists fall out of the window)", async () => {
    // M=4. Butter appears in the 1st and 5th most-recent completed lists — the 5th is OUTSIDE the
    // window, so Butter is seen in only 1 of the last 4 (< N=2) and is not suggested.
    await completedList(["Butter"], new Date("2026-07-01")); // 5th most recent -> outside window
    await completedList(["Zucker"], new Date("2026-07-02"));
    await completedList(["Zucker"], new Date("2026-07-03"));
    await completedList(["Mehl"], new Date("2026-07-04"));
    await completedList(["Butter", "Zucker"], new Date("2026-07-05")); // most recent
    const suggestions = await computeSuggestions(db, projectId);
    // Zucker: in lists dated 07-02, 07-03, 07-05 within the window -> 3 lists (>= 2) -> suggested.
    // Butter: only in 07-05 within the window (07-01 is out) -> 1 list -> not suggested.
    expect(suggestions.map((s) => s.name)).toEqual(["Zucker"]);
  });

  it("ignores active (non-completed) lists in the statistic", async () => {
    const active = await db.list.create({ data: { projectId, name: "Offen" } }); // status active
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.listItem.create({ data: { listId: active.id, catalogItemId: milch.id, sortIndex: 0 } });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0); // active list contributes nothing
  });

  it("ignores a reopened list: clearing completedAt drops it out of the window", async () => {
    // Slice 6's reopenList sets status back to active AND clears completedAt. Two completed lists
    // qualify Milch (N=2); reopening one must push it back below the threshold.
    await completedList(["Milch"], new Date("2026-07-01"));
    const second = await completedList(["Milch"], new Date("2026-07-02"));
    await db.list.update({
      where: { id: second.id },
      data: { status: "active", completedAt: null }, // exactly what reopenList writes
    });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0); // only 1 completed list left -> < N=2
  });

  it("respects the project's own N/M parameters", async () => {
    await db.project.update({ where: { id: projectId }, data: { suggestionRuleN: 1 } });
    await completedList(["Milch"], new Date("2026-07-01")); // 1 list, now enough with N=1
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);
  });

  it("carries the article name and catalog defaults in the suggestion shape", async () => {
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.catalogItem.update({
      where: { id: milch.id },
      data: { defaultCategory: "Kühlregal", defaultUnit: "l" },
    });
    await addFavorite(db, { projectId, catalogItemId: milch.id });
    const [suggestion] = await computeSuggestions(db, projectId);
    expect(suggestion).toEqual({
      catalogItemId: milch.id,
      name: "Milch",
      defaultCategory: "Kühlregal",
      defaultUnit: "l",
    });
  });

  it("is project-scoped: another project's favorites and completed lists never leak", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    await addFavorite(db, { projectId: other.id, catalogItemId: foreign.id });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts`
Expected: FAIL — `computeSuggestions` cannot be imported from `./suggestions` (module does not exist).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/suggestions/suggestions.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/suggestions/suggestions.ts src/lib/suggestions/suggestions.test.ts
git commit -m "feat: computeSuggestions (favorites union N-of-M statistic, pure read)"
```

---

### Task 4: `createPrefilledList` — create a list and pre-fill it from suggestions

**Files:**
- Modify: `src/lib/suggestions/suggestions.ts` (append the orchestrator; do not touch `computeSuggestions`)
- Test: `src/lib/suggestions/suggestions.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `List` from `@prisma/client`; `randomUUID` from `node:crypto`; `createList` + `CreateListInput` from `@/lib/lists/lists`; `applyOperation` from `@/lib/lists/operations`; `computeSuggestions` (same file).
- Produces:
  - `export async function createPrefilledList(db: PrismaClient, input: CreateListInput): Promise<List>` — creates an active list (via `createList`, inheriting its name/id validation), then adds one `add_item` per suggested article **through `applyOperation`**, inheriting each article's catalog category/unit. Returns the created `List`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/suggestions/suggestions.test.ts` (add `createPrefilledList` to the existing import from `./suggestions`, then add the block below). It reuses the `completedList` helper defined in Task 3's test file:

```ts
describe("createPrefilledList", () => {
  it("creates an active list with the given name", async () => {
    const list = await createPrefilledList(db, { projectId, name: "Wocheneinkauf" });
    expect(list.name).toBe("Wocheneinkauf");
    expect(list.status).toBe("active"); // pre-fill produces a normal, editable active list
  });

  it("pre-fills one entry per favorite, inheriting the catalog category/unit", async () => {
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.catalogItem.update({
      where: { id: milch.id },
      data: { defaultCategory: "Kühlregal", defaultUnit: "l" },
    });
    await addFavorite(db, { projectId, catalogItemId: milch.id });

    const list = await createPrefilledList(db, { projectId, name: "Wocheneinkauf" });
    const items = await db.listItem.findMany({
      where: { listId: list.id },
      include: { catalogItem: true },
    });
    expect(items).toHaveLength(1);
    expect(items[0].catalogItem.name).toBe("Milch");
    expect(items[0].category).toBe("Kühlregal"); // inherited from the catalog default at add time
    expect(items[0].unit).toBe("l");
  });

  it("pre-fills from the N-of-M statistic as well as favorites", async () => {
    // Milch in 2 of the last completed lists (N=2) -> statistic-suggested even without a favorite.
    await completedList(["Milch"], new Date("2026-07-01"));
    await completedList(["Milch"], new Date("2026-07-02"));
    const list = await createPrefilledList(db, { projectId, name: "Wocheneinkauf" });
    const items = await db.listItem.findMany({
      where: { listId: list.id },
      include: { catalogItem: true },
    });
    expect(items.map((i) => i.catalogItem.name)).toEqual(["Milch"]);
  });

  it("creates an empty list when there is nothing to suggest", async () => {
    const list = await createPrefilledList(db, { projectId, name: "Leer" });
    const items = await db.listItem.findMany({ where: { listId: list.id } });
    expect(items).toHaveLength(0);
  });

  it("honors a client-supplied list id (offline-prep convention)", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const list = await createPrefilledList(db, { projectId, name: "Mit ID", id });
    expect(list.id).toBe(id);
  });

  it("gives the pre-filled entries distinct, ascending sortIndexes", async () => {
    // Each add_item derives sortIndex from the current max, so the loop must run sequentially. Two
    // suggestions with the same index would make the list order ambiguous in the UI.
    for (const name of ["Apfel", "Brot"]) {
      const item = await getOrCreateCatalogItem(db, { projectId, name });
      await addFavorite(db, { projectId, catalogItemId: item.id });
    }
    const list = await createPrefilledList(db, { projectId, name: "Wocheneinkauf" });
    const items = await db.listItem.findMany({
      where: { listId: list.id },
      orderBy: { sortIndex: "asc" },
      include: { catalogItem: true },
    });
    expect(items.map((i) => i.sortIndex)).toEqual([0, 1]);
    expect(items.map((i) => i.catalogItem.name)).toEqual(["Apfel", "Brot"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts`
Expected: FAIL — `createPrefilledList` is not exported from `./suggestions`.

- [ ] **Step 3: Write the minimal implementation**

At the TOP of `src/lib/suggestions/suggestions.ts`, add these imports below the existing `import type { CatalogItem, PrismaClient } …` line:

```ts
import { randomUUID } from "node:crypto";
import type { List } from "@prisma/client";
import { createList, type CreateListInput } from "@/lib/lists/lists";
import { applyOperation } from "@/lib/lists/operations";
```

Then append the orchestrator at the END of the file (below `computeSuggestions`):

```ts
// Creates a new list and pre-fills it from the project's suggestion set (MVP design §4.3, step 3).
// Reuses createList for the list itself (so name/id validation is not duplicated), then adds one
// entry per suggested article THROUGH applyOperation — the single mutation path (MVP design §4.5),
// so pre-fill obeys the same contract as every other entry write and stays replayable for Slice 7.
export async function createPrefilledList(
  db: PrismaClient,
  input: CreateListInput,
): Promise<List> {
  // Create the (active) list first; createList enforces the name rules and the optional client id.
  const list = await createList(db, input);

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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts`
Expected: PASS (10 from Task 3 + 6 new = 16 tests).

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — all files green. Baseline 135 (16 files) + Task 2's 8 + Task 3's 10 + Task 4's 6 = **159 in 18 files**; confirm the exact number at execution and use the real number in the Task 7 review.

- [ ] **Step 6: Commit**

```bash
git add src/lib/suggestions/suggestions.ts src/lib/suggestions/suggestions.test.ts
git commit -m "feat: createPrefilledList pre-fills a new list from suggestions via applyOperation"
```

---

### Task 5: REST endpoints — favorites CRUD, suggestions, and the lists `prefill` flag

**Files:**
- Create: `src/app/api/projects/[projectId]/favorites/route.ts` (GET + POST)
- Create: `src/app/api/projects/[projectId]/favorites/[catalogItemId]/route.ts` (DELETE)
- Create: `src/app/api/projects/[projectId]/suggestions/route.ts` (GET)
- Modify: `src/app/api/projects/[projectId]/lists/route.ts` (POST accepts `prefill`)

**Interfaces:**
- Consumes: `requireUserId`, `requireMembership`, `toErrorResponse`, `ApiError`, `prisma`, and the Task 2/3/4 core functions (`addFavorite`, `removeFavorite`, `listFavorites`, `computeSuggestions`, `createPrefilledList`), plus the existing `createList`, `listLists`.
- Produces: four member-level HTTP surfaces. No unit tests — thin adapters per the established convention; verified by `npm run lint` + `npm run build` (+ the Task 6 manual pass).

- [ ] **Step 1: Create the favorites collection route (GET + POST)**

Create `src/app/api/projects/[projectId]/favorites/route.ts`:

```ts
/**
 * Route handlers for /api/projects/[projectId]/favorites — a project's favorites collection.
 *
 * Both handlers are member-level (permission matrix, MVP design §6: "Favoriten/Katalog pflegen" is
 * allowed for every member); non-members get 404 from the guard (project existence stays hidden).
 *
 * Pattern: thin HTTP adapters — identity → membership guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { addFavorite, listFavorites } from "@/lib/favorites/favorites";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/favorites
 * The project's favorites (with their catalog item), alphabetical by article name. Member-level.
 * Response: 200 FavoriteWithItem[]
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);
    const favorites = await listFavorites(prisma, projectId);
    return NextResponse.json(favorites);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/projects/:projectId/favorites
 * Favorites an article of the project. Member-level.
 * Request body: { catalogItemId: string } — the id of a catalog item in THIS project (addFavorite
 * rejects a foreign/malformed id with 404).
 * Response: 201 Favorite
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);

    // .catch(() => null): malformed/empty JSON becomes a clean 400, not an unhandled throw.
    const body = (await request.json().catch(() => null)) as { catalogItemId?: unknown } | null;
    if (typeof body?.catalogItemId !== "string") {
      throw new ApiError(400, "catalogItemId fehlt");
    }
    const favorite = await addFavorite(prisma, { projectId, catalogItemId: body.catalogItemId });
    return NextResponse.json(favorite, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Create the favorites item route (DELETE)**

Create `src/app/api/projects/[projectId]/favorites/[catalogItemId]/route.ts`:

```ts
/**
 * Route handler for /api/projects/[projectId]/favorites/[catalogItemId] — un-favorite one article.
 *
 * Member-level; non-members get 404 from the guard. Idempotent: removing a favorite that isn't there
 * still returns 204 (removeFavorite is a no-op in that case).
 *
 * Pattern: thin HTTP adapter — identity → membership guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { removeFavorite } from "@/lib/favorites/favorites";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string; catalogItemId: string }> };

/**
 * DELETE /api/projects/:projectId/favorites/:catalogItemId
 * Un-favorites the article. Member-level. Idempotent.
 * Response: 204 No Content
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId, catalogItemId } = await params;
    await requireMembership(prisma, projectId, userId);
    await removeFavorite(prisma, { projectId, catalogItemId });
    // 204: success with no body (the favorite is gone, or was already gone — idempotent).
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 3: Create the suggestions route (GET)**

Create `src/app/api/projects/[projectId]/suggestions/route.ts`:

```ts
/**
 * Route handler for /api/projects/[projectId]/suggestions — the pre-fill suggestion set for a
 * project (MVP design §4.3). Member-level; non-members get 404 from the guard.
 *
 * Pattern: thin HTTP adapter — identity → membership guard → core function → response. All the real
 * logic (favorites ∪ N-of-M statistic, dedup, sort) lives in computeSuggestions.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { computeSuggestions } from "@/lib/suggestions/suggestions";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/suggestions
 * The suggestion set (favorites ∪ statistic), deduplicated, alphabetical by name. Member-level.
 * Response: 200 SuggestedArticle[]
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);
    const suggestions = await computeSuggestions(prisma, projectId);
    return NextResponse.json(suggestions);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Add the `prefill` flag to the lists POST**

In `src/app/api/projects/[projectId]/lists/route.ts`, replace the existing single import line:

```ts
import { createList, listLists } from "@/lib/lists/lists";
```

with these two lines:

```ts
import { createList, listLists } from "@/lib/lists/lists";
import { createPrefilledList } from "@/lib/suggestions/suggestions";
```

Then update the JSDoc block above `POST` — replace:

```ts
/**
 * POST /api/projects/:projectId/lists
 * Creates a list. Member-level (per the permission matrix, creating lists is not owner-only).
 * Request body: { name: string, id?: string } — id is the optional client-generated UUID
 * (offline-prep convention); createList validates its shape.
 * Response: 201 List
 */
```

with:

```ts
/**
 * POST /api/projects/:projectId/lists
 * Creates a list. Member-level (per the permission matrix, creating lists is not owner-only).
 * Request body: { name: string, id?: string, prefill?: boolean } — id is the optional
 * client-generated UUID (offline-prep convention); createList validates its shape. prefill=true
 * seeds the new list from the project's suggestions (Slice 5, MVP design §4.3).
 * Response: 201 List
 */
```

Finally, in the `POST` handler body, replace this block:

```ts
    // .catch(() => null): malformed/empty JSON becomes a clean 400, not an unhandled throw.
    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; id?: unknown }
      | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");
    // The optional client id is passed through as-is: createList validates the UUID shape (400).
    const id = typeof body?.id === "string" ? body.id : undefined;

    const list = await createList(prisma, { projectId, name, id });
    return NextResponse.json(list, { status: 201 });
```

with:

```ts
    // .catch(() => null): malformed/empty JSON becomes a clean 400, not an unhandled throw.
    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; id?: unknown; prefill?: unknown }
      | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");
    // The optional client id is passed through as-is: createList validates the UUID shape (400).
    const id = typeof body?.id === "string" ? body.id : undefined;
    // prefill=true asks the server to seed the new list from the project's suggestions (favorites +
    // statistic). Strict === true (not truthiness): only a real boolean opts in, so a stray string
    // like "false" can never silently pre-fill a list.
    const prefill = body?.prefill === true;

    // Same 201 contract either way; createPrefilledList reuses createList internally, then adds the
    // suggested entries through applyOperation (the single mutation path).
    const list = prefill
      ? await createPrefilledList(prisma, { projectId, name, id })
      : await createList(prisma, { projectId, name, id });
    return NextResponse.json(list, { status: 201 });
```

- [ ] **Step 5: Verify it compiles and lints**

Run: `npm run lint && npm run build`
Expected: PASS — no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/projects/[projectId]/favorites" "src/app/api/projects/[projectId]/suggestions" "src/app/api/projects/[projectId]/lists/route.ts"
git commit -m "feat: favorites + suggestions REST endpoints and lists prefill flag"
```

---

### Task 6: Project detail UI — "Vorbefüllte Liste anlegen" + Favoriten section

**Files:**
- Modify: `src/app/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `listFavorites`, `addFavorite`, `removeFavorite` from `@/lib/favorites/favorites`; `createPrefilledList` from `@/lib/suggestions/suggestions`; `getOrCreateCatalogItem` from `@/lib/catalog/catalog`; `searchCatalog` + `CATALOG_DATALIST_LIMIT` from `@/lib/catalog/search`. Reuses the existing `requireMembership`, `revalidatePath`, `redirect`, `auth`, `prisma` (all already imported in this file).
- Produces: a "Vorbefüllte Liste anlegen" form inside the existing "Listen" section and a member-level "Favoriten" section (add-by-name with a `<datalist>`, list of favorites, per-favorite Entfernen) placed after the Slice 6 "Archiv" block. No behavior change to the existing owner-only controls or to the Archiv section. No unit test — page verified by build + manual pass.

> **Post-Slice-6 anchors (verified 2026-07-26):** this file's parallel read now destructures FOUR
> values (`project`, `members`, `activeLists`, `archivedLists`) and renders `Archiv` between the
> active-lists `<ul>` and the `{isOwner && (` block. The steps below match that current shape.

- [ ] **Step 1: Add the imports**

In `src/app/projects/[projectId]/page.tsx`, the import block currently ends with:

```ts
import Link from "next/link";
import { createList, listLists } from "@/lib/lists/lists";
```

Add these four lines directly below it:

```ts
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { CATALOG_DATALIST_LIMIT, searchCatalog } from "@/lib/catalog/search";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/favorites/favorites";
import { createPrefilledList } from "@/lib/suggestions/suggestions";
```

- [ ] **Step 2: Load favorites and catalog suggestions alongside the existing reads**

Replace the existing four-element parallel read block:

```ts
  const [project, members, activeLists, archivedLists] = await Promise.all([
    getProject(prisma, projectId),
    listMembers(prisma, projectId),
    // Slice 6: split the project's lists into the working set ("Listen") and the archive ("Archiv").
    // Active = newest-created first; archive = newest-completed first (see listLists).
    listLists(prisma, projectId, "active"),
    listLists(prisma, projectId, "completed"),
  ]);
```

with:

```ts
  const [project, members, activeLists, archivedLists, favorites, catalogSuggestions] =
    await Promise.all([
      getProject(prisma, projectId),
      listMembers(prisma, projectId),
      // Slice 6: split the project's lists into the working set ("Listen") and the archive ("Archiv").
      // Active = newest-created first; archive = newest-completed first (see listLists).
      listLists(prisma, projectId, "active"),
      listLists(prisma, projectId, "completed"),
      // Slice 5: the project's favorites (alphabetical) and the whole catalog for the favorite
      // datalist. We pass CATALOG_DATALIST_LIMIT (not searchCatalog's short default) because a native
      // <datalist> filters client-side over exactly the options we pre-render — same reasoning as the
      // list detail page; see CATALOG_DATALIST_LIMIT in search.ts.
      listFavorites(prisma, projectId),
      searchCatalog(prisma, projectId, "", CATALOG_DATALIST_LIMIT),
    ]);
```

- [ ] **Step 3: Add the three member-level server actions**

Directly after the existing `createListAction` function (it ends with `revalidatePath(\`/projects/${projectId}\`);` followed by `}` and then the component's `return (`), add:

```ts
  // Create-prefilled-list action (Slice 5). MEMBER-level, like createListAction. Creates a list
  // seeded from the project's suggestions (favorites + N-of-M statistic), then navigates to it so the
  // user immediately sees the pre-filled entries and can remove the unwanted ones (MVP design §4.3,
  // step 4).
  async function createPrefilledListAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (same convention as the other actions).
    const list = await createPrefilledList(prisma, { projectId, name });
    // redirect() throws a special Next.js error internally — it must not be wrapped in try/catch,
    // and nothing may run after it.
    redirect(`/lists/${list.id}`);
  }

  // Add-favorite action (Slice 5). MEMBER-level: favorites/catalog upkeep is allowed for every
  // member (permission matrix, MVP design §6). Favoriting by NAME (not id) is friendlier and lets a
  // member favorite an article they have not listed yet — getOrCreateCatalogItem resolves the name
  // to the project's catalog row (creating it on first use), then addFavorite pins it.
  async function addFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const catalogItem = await getOrCreateCatalogItem(prisma, { projectId, name });
    await addFavorite(prisma, { projectId, catalogItemId: catalogItem.id });
    revalidatePath(`/projects/${projectId}`);
  }

  // Remove-favorite action (Slice 5). Member-level; idempotent (removeFavorite tolerates a missing
  // row). The hidden field carries the catalog item id of the favorite to drop.
  async function removeFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const catalogItemId = String(formData.get("catalogItemId") ?? "");
    if (!catalogItemId) return;
    await removeFavorite(prisma, { projectId, catalogItemId });
    revalidatePath(`/projects/${projectId}`);
  }
```

- [ ] **Step 4: Add the prefilled-list form to the Listen section**

In the JSX, the "Listen" section starts with the plain create form:

```tsx
      <form action={createListAction}>
        <input name="name" placeholder="Listenname" aria-label="Listenname" />
        <button type="submit">Liste anlegen</button>
      </form>
```

Insert the second form directly AFTER that `</form>` (so the two creation controls sit together, above the active-lists `<ul>`):

```tsx
      {/* Slice 5: create a list already pre-filled from the project's suggestions (favorites +
          N-of-M statistic). A SEPARATE form from "Liste anlegen" above so the two intents stay
          explicit — the user chooses empty vs. pre-filled, we never guess. Member-level. */}
      <form action={createPrefilledListAction}>
        <input
          name="name"
          placeholder="Listenname (vorbefüllt)"
          aria-label="Vorbefüllte Liste anlegen"
        />
        <button type="submit">Vorbefüllte Liste anlegen</button>
      </form>
```

- [ ] **Step 5: Add the Favoriten section after the Archiv block**

The Slice 6 "Archiv" block ends like this, immediately followed by the owner-only block:

```tsx
      )}

      {/* Owner-only controls: invite, rename, delete. Hidden from plain members. */}
      {isOwner && (
```

Insert the Favoriten section BETWEEN them — i.e. after the Archiv block's closing `)}` and before the `{/* Owner-only controls … */}` comment:

```tsx
      {/* Slice 5: the project's shared favorites — the always-suggested half of the pre-fill set.
          Every member may add/remove (member-level). Adding is by article name, backed by a
          <datalist> of the catalog for zero-JS autocomplete (same pattern as the list detail page);
          a brand-new name creates a catalog article and favorites it in one step. */}
      <h2>Favoriten</h2>
      <datalist id="favorite-suggestions">
        {catalogSuggestions.map((s) => (
          // Only the value is needed — the browser inserts it into the input on selection.
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      <form action={addFavoriteAction}>
        <input
          name="name"
          placeholder="Artikel"
          aria-label="Favorit hinzufügen"
          list="favorite-suggestions"
        />
        <button type="submit">Als Favorit</button>
      </form>
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

- [ ] **Step 6: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: PASS — clean build, no type errors.

- [ ] **Step 7: Manual browser verification**

Start the dev server (`npm run dev`) and, logged in as an allowlisted member, on a project detail page:

*Favorites half:*
1. In "Favoriten", type an article name (e.g. "Bananen") — the `<datalist>` suggests existing catalog names — submit "Als Favorit" → "Bananen" appears in the favorites list.
2. Add a second favorite (e.g. "Milch"); confirm the list is alphabetical.
3. Click "Entfernen" on one favorite → it disappears; re-add it and remove it again (idempotent, no error).
4. In "Vorbefüllte Liste anlegen", enter a name and submit → you land on the new list's detail page and it already contains one entry per favorite, each in its inherited category.
5. Create a plain list with "Liste anlegen" → it is empty (pre-fill only happens via the prefilled form).

*Statistic half — live now that Slice 6 has shipped (do NOT skip this):*
6. Pick an article that is **not** a favorite (e.g. "Nudeln"). Create a list, add "Nudeln", check the entry, and use Slice 6's "Liste abschließen" to complete it. Repeat with a second list. (N=2, so two completed lists are exactly the threshold.)
7. Now create another "Vorbefüllte Liste anlegen" → it must contain "Nudeln" **in addition to** the favorites, and each article exactly once even if it is both a favorite and statistic-qualified.
8. Open one of those two archived lists and click "Liste wieder öffnen" (Slice 6 reopen) → create a pre-filled list again → "Nudeln" must be **gone** (only 1 completed list remains, below N=2). This confirms the window really tracks `completedAt`.

Record the outcome in the Task 7 review; do not claim success without running these.

- [ ] **Step 8: Commit**

```bash
git add "src/app/projects/[projectId]/page.tsx"
git commit -m "feat: Favoriten section + prefilled-list button on the project page"
```

---

### Task 7: Implementation review + meta-plan progress log (Definition of Done)

**Files:**
- Create: `docs/implementation-reviews/slice-5-favorites-suggestions.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:** none (documentation). Part of every slice's Definition of Done (CLAUDE.md "Implementation review" + meta-plan maintenance guide).

- [ ] **Step 1: Re-run the full verification and capture the real numbers**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Note the exact test count for the review (baseline 135 in 16 files; this slice adds 8 + 10 + 6 = 24 new → expect ~159 in 18 files). The build is expected to keep the two known warnings recorded in the Slice 7 log (multiple-lockfile/Turbopack-root and the `middleware` deprecation) — they are pre-existing, not caused by this slice.

- [ ] **Step 2: Write the implementation review**

Create `docs/implementation-reviews/slice-5-favorites-suggestions.md` covering the five required sections (English):

1. **What was achieved** — project-shared favorites plus the pure suggestion read function (favorites ∪ N-of-M statistic over completed lists) and list pre-fill; state that the slice goal was fully met. Because Slice 6 shipped first, the statistic is **live** and was verified end-to-end in the browser (Task 6, Step 7, items 6–8) — no "dormant" caveat.
2. **Steps taken** — one line per task (Favorite model + migration, favorites core, `computeSuggestions`, `createPrefilledList`, REST endpoints, project-page UI, docs), noting the four locked decisions.
3. **Core components built** — `Favorite` model; `addFavorite`/`removeFavorite`/`listFavorites` + `FavoriteWithItem`/`FavoriteRef`; `computeSuggestions` + `SuggestedArticle`; `createPrefilledList`; the favorites/suggestions routes + the lists `prefill` flag; the Favoriten UI + prefilled-list form.
4. **Most important lines of code** — quote and explain (a) the distinct-lists `Set` count `entry.listIds.size >= project.suggestionRuleN` in `computeSuggestions` (why a Set, why per-list); (b) the `byCatalog` map dedup that unions favorites and statistic exactly once; (c) the `orderBy: { completedAt: { sort: "desc", nulls: "last" } }` window (why NULLS LAST matters on a Postgres DESC sort, and how it pairs with Slice 6's never-re-stamped `completedAt`); (d) the `createPrefilledList` loop passing only `name` through `applyOperation` (why: reuse Slice 4's inheritance + keep the single mutation path); (e) the `findFirst({ id, projectId })` project-scope guard in `addFavorite` (why cross-project favoriting must be blocked).
5. **Architecture contribution** — Slice 5 assembles the "Vorschlags-Logik" layer (MVP design §5) and closes the loop that Slices 3, 4 and 6 opened: entries feed the catalog (4), completing lists feeds the statistic (6), and the statistic feeds the next list's pre-fill (5). With Slice 7 already merged, this **completes the MVP's functional surface** — every §9 build-order item except PWA polish now exists. Note that pre-fill needed no sync work at all: because it goes through `applyOperation`, Slice 7's delta picks the entries up as ordinary changes. Only Slice 8 (PWA polish) remains, and the future PWA client consumes the `/suggestions` and `/favorites` endpoints built here.

- [ ] **Step 3: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

**(a)** In the "8 slices" status table, change the Slice 5 row's **Status** cell from `⬜ Open — **build next**` to `✅ Done / verified`. Leave the Plan link as it is (it already points at this file).

**(b)** Delete the now-obsolete build-order note that sits directly below the status legend (both slices are done, so it only misleads a fresh agent):

```markdown
> **Build-order note (2026-07-20):** Slice **6 is built before Slice 5**. Slice 5's N-of-M statistic
> reads *completed* lists, which only exist once Slice 6 ships — the real dependency arrow runs 6 → 5,
> not by slice number. Both plans exist; the Slice 5 plan carries a header block requiring Slice 6
> first and listing the two shared-file edits to reconcile afterward.
```

Replace it with:

```markdown
> **Build-order note (2026-07-26):** Slice 5 was built LAST of the functional slices, after 6 and 7.
> Its N-of-M statistic reads *completed* lists, which only exist once Slice 6 ships, so the real
> dependency arrow runs 6 → 5, not by slice number; Slice 7 was pulled forward while Slice 5's plan
> was being reconciled. Slices 1–7 are done; **Slice 8 (PWA polish) is next and still needs a plan.**
```

**(c)** Add a new progress-log entry at the TOP of the "Progress log" section (newest first — above the existing `### 2026-07-26 — Slice 7: Polling / Sync — Manual browser verification complete` entry), following the template in the file:

```markdown
### 2026-07-26 — Slice 5: Favorites + Suggestions — Done
- **Delivered:** `Favorite` model + `add_favorites` migration (project-shared, unique per project+article); favorites core (`addFavorite`/`removeFavorite`/`listFavorites`, idempotent, project-scoped); `computeSuggestions` pure read (favorites ∪ articles in ≥ N of the last M completed lists, deduped, sorted, `completedAt DESC NULLS LAST` window); `createPrefilledList` (creates a list, seeds it via `applyOperation`); member-level REST endpoints (`GET`/`POST /favorites`, `DELETE /favorites/:catalogItemId`, `GET /suggestions`, `prefill` flag on lists POST); "Vorbefüllte Liste anlegen" form + Favoriten section on the project page.
- **Tested:** `npm test` passed (<N> files, <N> tests — 24 new in Slice 5); `npm run lint` + `npm run build` passed (with the two pre-existing warnings noted in the Slice 7 entry). Manual browser check of favorites, pre-fill, the live statistic (complete 2 lists → article suggested) and the reopen case (article drops out): <fill in>.
- **Deviations from the plan:** <fill in, or "none">.
- **Follow-up decisions for later slices:**
  - The statistic is live (Slice 6 shipped first). `completeList` never re-stamps `completedAt` and `reopenList` clears it, so the "last M completed" window is stable and reversible — do not change that guard without revisiting `computeSuggestions`.
  - Pre-fill goes through `applyOperation` (single mutation path) and inherits catalog category/unit — Slice 7's delta sees pre-fill entries as ordinary `add_item` results with a normal `updatedAt`, no special case needed. Never replace that loop with a bulk `createMany`.
  - The project page is NOT polled (`ListSyncPoller` is list-page only), so favorites do not live-update between members. Deliberate: if Phase 2 wants project-level sync, extend the delta seam rather than special-casing favorites.
  - Favorites are project-shared and keyed by `(projectId, catalogItemId)`; `addFavorite` blocks cross-project ids (404).
  - `computeSuggestions` (`src/lib/suggestions/suggestions.ts`) and the `/suggestions` endpoint are the read seam the future PWA client consumes.
- **Inherited open items:** Slice 8 (PWA polish) plan to be created per maintenance guide step 3 — it is the only remaining slice. Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0; overlapping polls; cancelled-before-JSON race) stay open and are untouched by this slice.
- **Commit(s):** <hashes>
```

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-5-favorites-suggestions.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: Slice 5 implementation review + meta-plan progress log"
```

---

## Self-Review (performed while rewriting this plan on 2026-07-26)

**1. Spec coverage** (MVP design §3.1 Favorite, §4.3 pre-fill, §5 Vorschlags-Logik, §7 seam; build-order item 5 "Per-project favorites, pure suggestion read function (favorites ∪ N-of-M statistic), pre-fill"):
- `Favorite` entity, unique per (project, article), project-shared → Task 1. ✅
- Favorites CRUD → Task 2 (core) + Task 5 (endpoints) + Task 6 (UI). ✅
- Suggestion = favorites ∪ (articles in ≥ N of last M completed lists), pure read, per-project N/M → Task 3 (`computeSuggestions`), tested against §7's deterministic-inputs seam. ✅
- Pre-fill a new list from the suggestion set, entries carry catalog defaults, via the operations model → Task 4 (`createPrefilledList`) + Task 5 (`prefill` flag) + Task 6 (button). ✅
- Member-level permission for favorites/catalog upkeep (matrix §6) → guarded in every endpoint (Task 5) and action (Task 6). ✅
- Slice-6 interaction (statistic reads completed lists; reopen must un-count) → covered by locked decisions #1/#4, a dedicated reopen unit test (Task 3) and manual steps 6–8 (Task 6). ✅

**2. Post-Slice-6 / post-Slice-7 reconciliation** (the reason for this rewrite) — every exact-match block was re-read from current `main` (`ab81e2f`) and machine-checked to appear **verbatim and exactly once** in its target file:
- `src/app/projects/[projectId]/page.tsx`: the `Promise.all` block quoted in Task 6 Step 2 is the current four-element `activeLists`/`archivedLists` version; the insertion anchors in Steps 4 and 5 are the current create-list form and the Archiv-block/owner-block boundary. ✅
- `src/app/api/projects/[projectId]/lists/route.ts`: the POST body block quoted in Task 5 Step 4 matches the current file (which now also has the Slice 6 `?status` filter in GET — untouched by this slice). ✅
- `src/test/reset-db.ts`, `prisma/schema.prisma`: quoted blocks match current content (Slices 6 and 7 added no tables and no reset entries). ✅
- Slice 7's own edits were checked for collisions: it touched `src/app/projects/[projectId]/page.tsx` only to add a back-link above the `<h1>` (clear of all four Task 6 anchors), plus files this slice never opens (`src/lib/lists/delta.ts`, `src/app/api/lists/[listId]/delta/route.ts`, `src/app/lists/[listId]/ListSyncPoller.tsx`, `src/app/lists/[listId]/page.tsx`). No conflict. ✅
- Test baseline corrected from Slice 4's 118 → Slice 7's 135 (16 files). ✅
- Task 7's meta-plan instructions updated for the post-Slice-7 file: the Slice 7 row is already ✅, the new log entry goes above the two existing Slice 7 entries, and the "next slice" is now **8 (PWA polish)**, not 7. ✅
- All "statistic is dormant" language removed from the goal, locked decisions, manual verification, review outline and progress-log template. ✅

**3. Placeholder scan:** No TBD/TODO/"add appropriate…". Every code step contains full code; every test step full tests. The only intentional fill-ins are the review's factual test count, manual-check outcome, deviations, and commit hashes in Task 7 — none of which can be known before execution.

**4. Type consistency:** `FavoriteRef { projectId, catalogItemId }` is defined in Task 2 and passed identically to `addFavorite`/`removeFavorite` in Tasks 2, 5, 6. `FavoriteWithItem` (Task 2) is the return of `listFavorites`, rendered via `f.catalogItem.name`/`f.catalogItemId` in Task 6. `SuggestedArticle { catalogItemId, name, defaultCategory, defaultUnit }` is defined in Task 3, returned by `computeSuggestions` (Tasks 3, 5) and consumed by `createPrefilledList` via `article.name` (Task 4). `createPrefilledList(db, CreateListInput): Promise<List>` (Task 4) is called with the same signature in Task 5 (`{ projectId, name, id }`) and Task 6 (`{ projectId, name }`). `CreateListInput` is the existing exported type from `src/lib/lists/lists.ts`. `db.favorite` and the compound selector `projectId_catalogItemId` match the `@@unique([projectId, catalogItemId])` added in Task 1. `AddItemOperation` is used with exactly its declared fields (`op`, `itemId`, `name`). Existing helpers (`getOrCreateCatalogItem`, `applyOperation`, `createList`, `listLists`, `requireMembership`, `requireUserId`, `toErrorResponse`, `searchCatalog`, `CATALOG_DATALIST_LIMIT`) are used exactly as they exist in Slices 2–4 and 6.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-slice-5-favorites-suggestions.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with a two-stage review between tasks. Fast iteration, clean context per task.
2. **Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`, batched with checkpoints for your review.

Which approach?
