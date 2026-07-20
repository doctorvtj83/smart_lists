# Slice 5 — Favorites + Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⛔ DO NOT EXECUTE THIS PLAN UNTIL SLICE 6 (Completion + Archive) IS BUILT AND VERIFIED.**
> Slice 5's N-of-M statistic reads *completed* lists, which do not exist until Slice 6 ships. Build
> [2026-07-20-slice-6-completion-archive.md](2026-07-20-slice-6-completion-archive.md) first, then return here.
>
> **↻ AFTER Slice 6 is merged, RE-VERIFY AND UPDATE THIS PLAN before executing** — Slice 6 edits two
> files this plan also edits, so the exact-match code blocks below may have drifted:
> - **Task 6, Step 2** replaces the `Promise.all` read block in `src/app/projects/[projectId]/page.tsx`.
>   Slice 6 changes that same block (it splits `listLists(prisma, projectId)` into
>   `listLists(prisma, projectId, "active")` + `"completed"` and renames the destructured vars to
>   `activeLists` / `archivedLists`). Re-derive Task 6's `Promise.all` edit from the **post-Slice-6**
>   file: add `listFavorites(...)` and `searchCatalog(...)` to the existing 4-element array (keeping
>   `activeLists` / `archivedLists`), not to the old 3-element one shown below.
> - **Task 6, Step 4** inserts the Favoriten/prefill JSX "after the lists `<ul>`". Slice 6 adds an
>   "Archiv" section right after that `<ul>`. Insert the Slice 5 sections **after the Archiv block**
>   (still before the `{isOwner && (` owner-only block) so the anchors are unambiguous.
> - No other task conflicts: Tasks 1–5 touch files Slice 6 does not.
> Once this plan is executed, the statistic half of the suggestions is **live** (no longer dormant) —
> update the review/verification notes accordingly (drop the "statistic dormant" caveat).

**Goal:** Give a project a shared list of favorite articles and a pure read function that suggests articles to pre-fill a new list — the union of the project's favorites and the articles that appear in ≥ N of the last M completed lists (MVP design §4.3).

**Architecture:** One new persisted entity (`Favorite`, unique per project+article) plus two pure functions and one orchestrator on top of the Slice 3/4 catalog and operations. `computeSuggestions` is a **pure read** over favorites + completed lists that returns a deduplicated set of articles — the §7 "Vorschlags-Logik" testable seam. `createPrefilledList` creates a list and then adds one entry per suggested article **through `applyOperation`** (the single mutation path), letting the existing add-time inheritance fill category/unit from the catalog defaults. Favorites get member-level REST endpoints and a project-detail UI section; pre-fill is exposed both as a `prefill` flag on the lists POST and as a "Vorbefüllte Liste anlegen" button.

**Tech Stack:** Next.js (App Router, TypeScript), Prisma ORM against Neon Postgres, Auth.js (NextAuth v5), Vitest. No new dependencies.

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
- **Reuse, do not redefine** existing helpers/constants: `getOrCreateCatalogItem` (`src/lib/catalog/catalog.ts`), `createList` / `CreateListInput` (`src/lib/lists/lists.ts`), `applyOperation` (`src/lib/lists/operations.ts`), `requireMembership` (`src/lib/projects/guard.ts`), `requireUserId` (`src/lib/auth/session.ts`), `ApiError` / `toErrorResponse` (`src/lib/http/errors.ts`), `isUuid` (`src/lib/validate.ts`), `searchCatalog` / `CATALOG_DATALIST_LIMIT` (`src/lib/catalog/search.ts`).
- **Test convention (Slices 1–4):** core functions are unit-tested against the Neon test branch (`new PrismaClient()` + `resetDb(db)` in `beforeEach`); route handlers and pages are thin adapters with **no unit tests** — they are verified by `npm run build` + `npm run lint` + a manual browser pass. Follow this split; do not invent route/page tests.

---

## Design decisions locked for this slice

1. **The statistic reads completed lists produced by Slice 6.** `List.status` (`active` | `completed`) and `List.completedAt` already exist in the schema (added in Slice 3 for exactly this reason). Slice 6 (Completion + Archive) is what flips lists to `completed` — and **per this plan's header note it is built first**, so by the time Slice 5 executes the statistic is fully live and end-to-end verifiable (complete some lists → watch articles get suggested). `computeSuggestions` reads `status = "completed"` lists; its unit tests seed completed lists directly, so the function is testable regardless of build order. (If, contrary to the recommendation, Slice 5 were built before Slice 6, the statistic half would simply be dormant until Slice 6 lands — still correct, just favorites-only in the live app, with no schema change or rework needed. Meta plan dependency note: "Slice 5 needs 4 … **and** 6".)
2. **Pre-fill goes through `applyOperation` with the article name only.** For each suggested article, `createPrefilledList` sends `add_item` with just the `name`; `add_item` resolves it to the existing catalog row and **inherits** `defaultCategory` / `defaultUnit` (the same values the suggestion carries). This keeps the single mutation path intact for Slice 7 and reuses the Slice 4 inheritance path instead of duplicating it.
3. **Favorites are project-shared, keyed by `(projectId, catalogItemId)`.** Not per-user (MVP design §3.1: "Favoriten gehören dem Projekt (geteilt)"). Adding is an idempotent upsert; removing is an idempotent `deleteMany`. A favorite may only point at the project's **own** catalog (guarded), so a member cannot favorite another project's article by guessing an id.

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
| `src/app/projects/[projectId]/page.tsx` (modify) | Favoriten section (add by name + list + remove) and a "Vorbefüllte Liste anlegen" button. | 6 |
| `docs/implementation-reviews/slice-5-favorites-suggestions.md` (create) | Per-slice implementation review (Definition of Done). | 7 |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` (modify) | Flip Slice 5 status to ✅, add progress-log entry. | 7 |

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

In `prisma/schema.prisma`, add the back-relation to `Project` (inside the `model Project { … }` block, next to the existing `lists`/`catalogItems` back-relations):

```prisma
  // Back-relation added in Slice 5 (Favorites + Suggestions). Favorites are project-shared.
  favorites Favorite[]
```

Add the back-relation to `CatalogItem` (inside `model CatalogItem { … }`, next to `listItems`):

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

In `src/test/reset-db.ts`, add `"favorites"` to the TRUNCATE list. Replace the raw SQL line:

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

// Seeds a COMPLETED list containing the given article names. Slice 6 will set completedAt in the
// app; here we set it directly to exercise the statistic. Each name resolves to (or creates) the
// project's catalog item, then gets a list item (entries are created directly — this is test setup,
// not the app's mutation path).
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
  // "Last M" = the M most recently completed lists (completedAt desc). Slice 6 sets completedAt when
  // a list is completed; until then this query returns nothing, so the statistic is dormant and only
  // favorites are suggested (a locked, intended property of this slice).
  const recent = await db.list.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
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
Expected: PASS (9 tests).

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

Append to `src/lib/suggestions/suggestions.test.ts` (add `createPrefilledList` to the existing import from `./suggestions`, then add the block below):

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
Expected: PASS (9 from Task 3 + 5 new = 14 tests).

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — all files green (Slice 4 baseline 118 + Task 2's 8 + Task 3's 9 + Task 4's 5 = 140; confirm the exact number at execution).

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

In `src/app/api/projects/[projectId]/lists/route.ts`, add the import next to the existing lists import:

```ts
import { createList, listLists } from "@/lib/lists/lists";
import { createPrefilledList } from "@/lib/suggestions/suggestions";
```

(Replace the existing single `import { createList, listLists } from "@/lib/lists/lists";` line with the two lines above.)

Then, in the `POST` handler, replace this block:

```ts
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
    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; id?: unknown; prefill?: unknown }
      | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");
    // The optional client id is passed through as-is: createList validates the UUID shape (400).
    const id = typeof body?.id === "string" ? body.id : undefined;
    // prefill=true asks the server to seed the new list from the project's suggestions (favorites +
    // statistic). Anything but a literal true means a plain, empty list.
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

### Task 6: Project detail UI — Favoriten section + "Vorbefüllte Liste anlegen"

**Files:**
- Modify: `src/app/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `listFavorites`, `addFavorite`, `removeFavorite` from `@/lib/favorites/favorites`; `createPrefilledList` from `@/lib/suggestions/suggestions`; `getOrCreateCatalogItem` from `@/lib/catalog/catalog`; `searchCatalog` + `CATALOG_DATALIST_LIMIT` from `@/lib/catalog/search`. Reuses the existing `requireMembership`, `revalidatePath`, `redirect`, `auth`, `prisma`.
- Produces: a member-level Favoriten section (add-by-name with a `<datalist>`, list of favorites, per-favorite Entfernen) and a "Vorbefüllte Liste anlegen" form that creates a pre-filled list and navigates to it. No behavior change to the existing owner-only controls. No unit test — page verified by build + manual pass.

- [ ] **Step 1: Add the imports**

In `src/app/projects/[projectId]/page.tsx`, add below the existing `@/lib` imports (after the `import { createList, listLists } …` line):

```ts
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { CATALOG_DATALIST_LIMIT, searchCatalog } from "@/lib/catalog/search";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/favorites/favorites";
import { createPrefilledList } from "@/lib/suggestions/suggestions";
```

- [ ] **Step 2: Load favorites and catalog suggestions alongside the existing reads**

Replace the existing parallel read block:

```ts
  const [project, members, lists] = await Promise.all([
    getProject(prisma, projectId),
    listMembers(prisma, projectId),
    // Slice 3: the project's lists (newest first) render alongside the members.
    listLists(prisma, projectId),
  ]);
```

with:

```ts
  const [project, members, lists, favorites, catalogSuggestions] = await Promise.all([
    getProject(prisma, projectId),
    listMembers(prisma, projectId),
    // Slice 3: the project's lists (newest first) render alongside the members.
    listLists(prisma, projectId),
    // Slice 5: the project's favorites (alphabetical) and the whole catalog for the favorite
    // datalist. We pass CATALOG_DATALIST_LIMIT (not the short search default) because a native
    // <datalist> filters client-side over exactly the options we pre-render — see search.ts.
    listFavorites(prisma, projectId),
    searchCatalog(prisma, projectId, "", CATALOG_DATALIST_LIMIT),
  ]);
```

- [ ] **Step 3: Add the three member-level server actions**

Directly after the existing `createListAction` function (just before the `return (` of the component), add:

```ts
  // Add-favorite action (Slice 5). MEMBER-level: favorites/catalog upkeep is allowed for every
  // member (permission matrix, MVP design §6). Favoriting by NAME (not id) is friendlier and lets a
  // member favorite an article they have not listed yet — getOrCreateCatalogItem resolves the name
  // to the project's catalog row (creating it on first use), then addFavorite pins it.
  async function addFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (same convention as the other actions).
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

  // Create-prefilled-list action (Slice 5). Member-level. Creates a list seeded from the project's
  // suggestions (favorites + statistic), then navigates to it so the user immediately sees the
  // pre-filled entries and can remove the unwanted ones (MVP design §4.3, step 4).
  async function createPrefilledListAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const list = await createPrefilledList(prisma, { projectId, name });
    // redirect() throws internally — do not wrap it in try/catch.
    redirect(`/lists/${list.id}`);
  }
```

- [ ] **Step 4: Render the Favoriten section and the prefilled-list form**

In the JSX, the "Listen" section currently ends with the lists `<ul>`:

```tsx
      <ul>
        {lists.map((l) => (
          <li key={l.id}>
            <Link href={`/lists/${l.id}`}>{l.name}</Link>
          </li>
        ))}
      </ul>
```

Immediately AFTER that `</ul>` (and before the `{isOwner && (` owner-only block), insert:

```tsx
      {/* Slice 5: create a list already pre-filled from the project's suggestions (favorites +
          statistic). Separate from the plain "Liste anlegen" form above so the two intents are
          clearly distinct. Member-level. */}
      <form action={createPrefilledListAction}>
        <input
          name="name"
          placeholder="Listenname (vorbefüllt)"
          aria-label="Vorbefüllte Liste anlegen"
        />
        <button type="submit">Vorbefüllte Liste anlegen</button>
      </form>

      {/* Slice 5: the project's shared favorites. Every member may add/remove (member-level). Adding
          is by article name, backed by a <datalist> of the catalog for autocomplete; a brand-new
          name creates a catalog article and favorites it in one step. */}
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
            {/* The display name comes from the catalog item (article identity). */}
            {f.catalogItem.name}{" "}
            <form action={removeFavoriteAction} style={{ display: "inline" }}>
              <input type="hidden" name="catalogItemId" value={f.catalogItemId} />
              <button type="submit">Entfernen</button>
            </form>
          </li>
        ))}
      </ul>
```

- [ ] **Step 5: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: PASS — clean build, no type errors.

- [ ] **Step 6: Manual browser verification**

Start the dev server (`npm run dev`) and, logged in as an allowlisted member, on a project detail page:
1. In "Favoriten", type an article name (e.g. "Bananen") — the `<datalist>` suggests existing catalog names — submit "Als Favorit" → "Bananen" appears in the favorites list.
2. Add a second favorite (e.g. "Milch"); confirm the list is alphabetical.
3. Click "Entfernen" on one favorite → it disappears; click it again is impossible (already gone), and re-adding then removing works (idempotent).
4. In "Vorbefüllte Liste anlegen", enter a name and submit → you land on the new list's detail page and it already contains an entry for each favorite (e.g. "Bananen", "Milch"), each in its inherited category.
5. Create a plain list with the original "Liste anlegen" form → it is empty (pre-fill only happens via the prefilled form). 

> Note: because Slice 6 is built first (see the header note), the N-of-M statistic is live — to exercise it, complete two lists that both contain the same article (not a favorite), then create a pre-filled list and confirm that article is pre-filled from the statistic. Record the outcome in the Task 7 review; do not claim success without running these. (If Slice 6 were somehow not yet built, the statistic would be dormant and pre-fill would reflect favorites only — see locked decision #1.)

- [ ] **Step 7: Commit**

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
Expected: all PASS. Note the exact test count for the review (Slice 4 baseline 118; this slice adds 8 + 9 + 5 = 22 new → expect ~140).

- [ ] **Step 2: Write the implementation review**

Create `docs/implementation-reviews/slice-5-favorites-suggestions.md` covering the five required sections (English):

1. **What was achieved** — project-shared favorites plus the pure suggestion read function (favorites ∪ N-of-M statistic) and list pre-fill; state that the slice goal was met, and note the locked caveat that the statistic stays dormant until Slice 6 provides completed lists (favorites-only pre-fill for now).
2. **Steps taken** — one line per task (Favorite model + migration, favorites core, computeSuggestions, createPrefilledList, REST endpoints, project-page UI, docs), noting the three locked decisions.
3. **Core components built** — `Favorite` model; `addFavorite`/`removeFavorite`/`listFavorites` + `FavoriteWithItem`/`FavoriteRef`; `computeSuggestions` + `SuggestedArticle`; `createPrefilledList`; the favorites/suggestions routes + the lists `prefill` flag; the Favoriten UI.
4. **Most important lines of code** — quote and explain (a) the distinct-lists `Set` count `entry.listIds.size >= project.suggestionRuleN` in `computeSuggestions` (why a Set, why per-list); (b) the `byCatalog` map dedup that unions favorites and statistic once; (c) the `createPrefilledList` loop passing only `name` through `applyOperation` (why: reuse inheritance + keep the single mutation path); (d) the `findFirst({ id, projectId })` project-scope guard in `addFavorite` (why cross-project favoriting must be blocked).
5. **Architecture contribution** — Slice 5 assembles the "Vorschlags-Logik" layer (MVP design §5) and the last read/write seams before completion/sync: it depends on Slice 4's catalog and consumes Slice 6's completed lists once they exist; the future PWA client will call the `/suggestions` and `/favorites` endpoints built here.

- [ ] **Step 3: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- In the "8 slices" status table, change the Slice 5 row: set **Plan** to `[2026-07-20-slice-5-favorites-suggestions.md](2026-07-20-slice-5-favorites-suggestions.md)` and **Status** to `✅ Done / verified` (drop the `⬜ Open`).
- Add a new progress-log entry at the TOP of the "Progress log" section (newest first), following the template in the file:

```markdown
### 2026-07-20 — Slice 5: Favorites + Suggestions — Done
- **Delivered:** `Favorite` model + `add_favorites` migration (project-shared, unique per project+article); favorites core (`addFavorite`/`removeFavorite`/`listFavorites`, idempotent, project-scoped); `computeSuggestions` pure read (favorites ∪ articles in ≥ N of the last M completed lists, deduped, sorted); `createPrefilledList` (creates a list, seeds it via `applyOperation`); member-level REST endpoints (`GET`/`POST /favorites`, `DELETE /favorites/:catalogItemId`, `GET /suggestions`, `prefill` flag on lists POST); Favoriten section + "Vorbefüllte Liste anlegen" on the project page.
- **Tested:** `npm test` passed (N files, ~140 tests — 22 new in Slice 5); `npm run lint` + `npm run build` passed cleanly. Manual browser check of favorites + prefill: <fill in>.
- **Deviations from the plan:** <fill in, or "none">.
- **Follow-up decisions for later slices:**
  - The statistic half of `computeSuggestions` is dormant until Slice 6 sets `List.completedAt`; Slice 6 needs no change to this function — completing lists automatically feeds the window.
  - Pre-fill goes through `applyOperation` (single mutation path) and inherits catalog category/unit — Slice 7 sync sees pre-fill entries as ordinary `add_item` results.
  - Favorites are project-shared and keyed by `(projectId, catalogItemId)`; `addFavorite` blocks cross-project ids (404).
  - `computeSuggestions` (`src/lib/suggestions/suggestions.ts`) and the `/suggestions` endpoint are the read seam the future PWA client consumes.
- **Inherited open items:** Slice 6 plan (`docs/superpowers/plans/YYYY-MM-DD-slice-6-completion-archive.md`) to be created per maintenance guide step 3.
- **Commit(s):** <hashes>
```

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-5-favorites-suggestions.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: Slice 5 implementation review + meta-plan progress log"
```

---

## Self-Review (performed while writing this plan)

**1. Spec coverage** (MVP design §3.1 Favorite, §4.3 pre-fill, §5 Vorschlags-Logik, §7 seam; build-order item 5 "Per-project favorites, pure suggestion read function (favorites ∪ N-of-M statistic), pre-fill"):
- `Favorite` entity, unique per (project, article), project-shared → Task 1. ✅
- Favorites CRUD → Task 2 (core) + Task 5 (endpoints) + Task 6 (UI). ✅
- Suggestion = favorites ∪ (articles in ≥ N of last M completed lists), pure read, per-project N/M → Task 3 (`computeSuggestions`), tested against §7's deterministic-inputs seam. ✅
- Pre-fill a new list from the suggestion set, entries carry catalog defaults, via the operations model → Task 4 (`createPrefilledList`) + Task 5 (`prefill` flag) + Task 6 (button). ✅
- Member-level permission for favorites/catalog upkeep (matrix §6) → guarded in every endpoint (Task 5) and action (Task 6). ✅
- Slice-6 dependency (statistic needs completed lists) → handled: schema fields already exist; tests seed completed lists; documented as locked decision #1. ✅

**2. Placeholder scan:** No TBD/TODO/"add appropriate…". Every code step contains full code; every test step full tests. The only intentional fill-ins are the review's factual test count, manual-check outcome, deviations, and commit hashes in Task 7 — none of which can be known before execution.

**3. Type consistency:** `FavoriteRef { projectId, catalogItemId }` is defined in Task 2 and passed identically to `addFavorite`/`removeFavorite` in Tasks 2, 5, 6. `FavoriteWithItem` (Task 2) is the return of `listFavorites`, rendered via `f.catalogItem.name`/`f.catalogItemId` in Task 6. `SuggestedArticle { catalogItemId, name, defaultCategory, defaultUnit }` is defined in Task 3 and returned by `computeSuggestions` (Tasks 3, 5) and consumed by `createPrefilledList` via `article.name` (Task 4). `createPrefilledList(db, CreateListInput): Promise<List>` (Task 4) is called with the same signature in Task 5 (`{ projectId, name, id }`) and Task 6 (`{ projectId, name }`). `CreateListInput` is the existing exported type from `src/lib/lists/lists.ts`. `db.favorite` and the compound selector `projectId_catalogItemId` match the `@@unique([projectId, catalogItemId])` added in Task 1. Existing helpers (`getOrCreateCatalogItem`, `applyOperation`, `createList`, `requireMembership`, `requireUserId`, `toErrorResponse`, `searchCatalog`, `CATALOG_DATALIST_LIMIT`) are used exactly as they exist in Slices 2–4.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-slice-5-favorites-suggestions.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with a two-stage review between tasks. Fast iteration, clean context per task.
2. **Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`, batched with checkpoints for your review.

Which approach?
