# Slice 3: Lists + Entries (Operations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **On completion:** Record progress in the
> [meta project plan](2026-06-04-smart-lists-projektplan-meta.md) (status table + progress log).
> This is part of the Definition of Done.
>
> **Code documentation:** All code must be meticulously documented with inline comments — every
> function, every non-obvious line, every pattern choice. See the "Code documentation standard"
> section in [CLAUDE.md](../../../CLAUDE.md). This is mandatory, not optional.
>
> **Implementation review:** After completing this slice, write
> `docs/implementation-reviews/slice-3-lists-entries.md` covering: what was achieved, steps taken,
> core components built, most important lines of code (quoted), and architecture contribution.
> See the "Implementation review" section in [CLAUDE.md](../../../CLAUDE.md). This is part of the
> Definition of Done.
>
> **Learning mode:** The user is a beginner developer learning along the way. While implementing,
> explain each step — *what* and *why* — and keep the inline comments in the code (see
> [CLAUDE.md](../../../CLAUDE.md)). In-app user-facing strings stay German (the product is German).

**Goal:** Members of a project can create lists and mutate their entries exclusively through
idempotent, ID-bearing, entry-level operations (`add_item`, `update_item`, `check_item`,
`remove_item`) — the mutation model that Slice 7 (polling/sync) and Phase 2 (offline queue) build on
without API changes.

**Architecture:** Three new tables (`lists`, `list_items`, `catalog_items`) extend the schema.
Article identity (`CatalogItem` with a per-project unique `normalized_name`) is created **now**,
because `ListItem` references a catalog item by design (MVP design §3.1) and article identity is one
of the explicitly named cut-across concerns that would be expensive to retrofit (§1). Slice 3 only
adds the minimal *get-or-create-by-normalized-name* core; autocomplete and category flow-back stay
in Slice 4. All list/entry logic lives in dependency-injected core functions under `src/lib/lists/*`
and `src/lib/catalog/*`; a new `requireListAccess` guard composes the Slice 2 membership guard for
list-scoped routes; thin REST route handlers and a minimal server-rendered UI sit on top, exactly
mirroring the Slice 2 layering.

**Tech Stack:** Next.js (App Router, TypeScript) · Auth.js (NextAuth v5) · Prisma ORM · Neon Postgres · Vitest

---

## Global Constraints

Project-wide rules (from the [meta project plan](2026-06-04-smart-lists-projektplan-meta.md)); every
task implicitly includes these:

- **Stable, client-generatable UUIDs** for all entities: `String @id @default(uuid()) @db.Uuid` for
  primary keys, `@db.Uuid` on every UUID FK column. `ListItem.id` (and optionally `List.id`) may be
  **supplied by the client** — the server validates the shape with `isUuid` and uses
  `@default(uuid())` only as a fallback.
- **Entry-level, idempotent operations** are the ONLY mutation path for list entries: `add_item`,
  `update_item` (field + value), `check_item`, `remove_item` — each carrying the stable `ListItem`
  id. No bulk "replace the list" endpoint. Keep contracts field/entry-granular (offline-prep,
  MVP design §4.5).
- **Every API operation re-checks membership + role** server-side via the Slice 2 guard
  (`src/lib/projects/guard.ts`). Per the permission matrix (MVP design §6), **all list/entry
  actions are allowed for owner AND member**, forbidden for non-members (who get `404`, never
  `403` — existence is hidden).
- **Runtime is Next.js 16**: dynamic route `params` is a `Promise` and must be awaited. Keep
  `src/middleware.ts` as-is (its matcher already protects the new `/lists/*` pages and
  `/api/lists/*` routes — everything except the listed exceptions).
- **DB access through an injectable Prisma instance** (`db: PrismaClient` first parameter of every
  core function). Production passes the singleton from `src/lib/db.ts`; tests pass a test-DB client.
- **`ApiError` + `toErrorResponse`** (`src/lib/http/errors.ts`) is the HTTP error convention;
  `requireUserId` (`src/lib/auth/session.ts`) resolves the caller in route handlers.
- **`isUuid` (`src/lib/validate.ts`)** is the standard shape check before any URL-derived or
  client-supplied id reaches a uuid DB column (else Prisma throws P2023 → fake 500).
- **Input length limits live in the core functions** (not only routes), following the Slice 2
  post-review convention (`MAX_PROJECT_NAME_LENGTH` precedent).
- **Test-first (TDD)**, small vertical slices, frequent commits.
- **Language:** implementation docs, code identifiers, and code comments in **English**; in-app
  user-facing strings (including `ApiError` messages) in **German**.

---

## Prerequisites

Slices 1 + 2 are merged on `main` and verified (see the meta plan progress log). The concrete
artifacts this slice builds on:

- `prisma/schema.prisma` — `User`, `AllowlistEntry`, `Project`, `Membership`, `Role` enum.
- `src/lib/db.ts` — Prisma singleton `prisma`.
- `src/lib/projects/guard.ts` — `getRole` / `requireMembership` / `requireOwner`.
- `src/lib/http/errors.ts` — `ApiError`, `toErrorResponse`.
- `src/lib/auth/session.ts` — `requireUserId()`.
- `src/lib/validate.ts` — `isUuid(value: string): boolean`.
- Test infra: `vitest.config.ts` (globalSetup migrates the test DB, `.env.test` via setupFiles,
  `fileParallelism: false`); `src/test/reset-db.ts` exports `resetDb(db)`. Tests instantiate
  `new PrismaClient()` directly and call `resetDb` in `beforeEach`.

> Before starting, confirm the baseline: `npm test` (9 files, 56 tests), `npm run lint`,
> `npm run build` — all green. Work on a feature branch (e.g. `slice-3-lists-entries`), not
> directly on `main`, matching how Slice 2 was integrated (PR merge).

---

## File structure for this slice

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | Add `ListStatus` enum, `CatalogItem`, `List`, `ListItem` models + back-relations on `Project`. |
| `prisma/migrations/<ts>_add_lists_entries_catalog/` (create) | Migration generated from the schema change. |
| `src/test/reset-db.ts` (modify) | Truncate the three new tables too. |
| `src/lib/catalog/normalize.ts` (create) | `normalizeName` — the article-identity rule (lowercase + trim + collapse spaces). |
| `src/lib/catalog/catalog.ts` (create) | `getOrCreateCatalogItem` — minimal catalog identity core (Slice 4 extends this file). |
| `src/lib/lists/lists.ts` (create) | List core: `createList`, `listLists`, `getListWithItems`, `renameList`, `deleteList`. |
| `src/lib/lists/access.ts` (create) | `requireListAccess` — resolves a list AND enforces membership in its project (the list-scoped guard for Slices 6 + 7 too). |
| `src/lib/lists/operations.ts` (create) | The operations model: `Operation` types, `parseOperation` (untrusted JSON → typed op), `applyOperation` (dispatch + idempotency). |
| `src/app/api/projects/[projectId]/lists/route.ts` (create) | REST: `GET` (project's lists), `POST` (create list). |
| `src/app/api/lists/[listId]/route.ts` (create) | REST: `GET` (list detail incl. items), `PATCH` (rename), `DELETE`. |
| `src/app/api/lists/[listId]/ops/route.ts` (create) | REST: `POST` (apply one entry operation). |
| `src/app/projects/[projectId]/page.tsx` (modify) | UI: add a "Listen" section (create form + links). |
| `src/app/lists/[listId]/page.tsx` (create) | UI: list detail — entries grouped by category, add/check/remove via server actions calling `applyOperation`. |
| Test files alongside each `src/lib/**` module | TDD coverage for the core + guards. |

### Design decisions locked in by this slice

- **`ListItem` has no `name` column.** The display name lives on the referenced `CatalogItem`
  (MVP design §3.1) — this is the article-identity decision. `add_item` takes a `name`, resolves it
  to a catalog item via `normalized_name` get-or-create, and links it. Reads include the catalog
  item so the UI can render the name.
- **Idempotency semantics:** `add_item` with an already-existing item id in the same list is a
  no-op returning the existing item (safe replay); `remove_item` on a missing item is a no-op
  (already gone = success); `check_item` / `update_item` on a missing item throw `404` ("Eintrag
  nicht gefunden") — replaying them is idempotent, but targeting a removed entry is a real
  conflict the client must learn about. Record this as a follow-up decision for Slice 7.
- **`updated_at` via Prisma `@updatedAt`** on `ListItem` — every operation bumps it. This is the
  basis for the Slice 7 cursor and the last-writer-wins rule; Slice 3 does not implement LWW
  merge (server arrival order wins for now).
- **`sort_index` is server-assigned** on `add_item` (`max + 1` within the list) and mutable via
  `update_item` with `field: "sortIndex"` for manual reordering. No fractional indexing (YAGNI).
- **`status` / `completed_at` are created now** on `List` (default `active`) so Slice 6 needs no
  migration — same precedent as `suggestion_rule_n/m` in Slice 2. Completing a list is out of
  scope here.
- **`quantity` is `Float?`** (Postgres `double precision`): quantities like `1.5` (kg) must work;
  a string ("2–3 Stück") stays representable via `unit`/name conventions and is not needed (YAGNI).
- **Deleting is real deletion:** `remove_item` deletes the row (no tombstones in the MVP —
  tombstones/soft-delete would only matter for offline merge and can be added in Phase 2; note
  for Slice 7: the delta endpoint must handle deletions, e.g. by returning current item ids).

### Permission matrix this slice implements (MVP design §6)

| Action | Owner | Member | Non-member | Enforced by |
|---|---|---|---|---|
| Read lists + entries | ✓ | ✓ | ✗ (404) | `requireMembership` / `requireListAccess` |
| Create / rename / delete a list | ✓ | ✓ | ✗ (404) | `requireMembership` / `requireListAccess` |
| Apply entry operations | ✓ | ✓ | ✗ (404) | `requireListAccess` |

---

## Task 1: Data model — `CatalogItem`, `List`, `ListItem`, `ListStatus` enum

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/test/reset-db.ts`
- Create: `prisma/migrations/<timestamp>_add_lists_entries_catalog/` (generated by the migrate command)

**Interfaces:**
- Produces: Prisma models `CatalogItem { id, projectId, name, normalizedName, defaultCategory,
  defaultUnit, createdAt }` with `@@unique([projectId, normalizedName])` (Prisma compound selector:
  `projectId_normalizedName`); `List { id, projectId, name, status, createdAt, completedAt }`;
  `ListItem { id, listId, catalogItemId, quantity, unit, category, checked, sortIndex, createdAt,
  updatedAt }`; enum `ListStatus` (`active` | `completed`). All later tasks rely on these names.

- [ ] **Step 1: Add the enum, models, and back-relations to the schema**

Modify `prisma/schema.prisma`. First, add three back-relation fields to the existing `Project` model
(inside the `model Project { ... }` block, directly after the existing `memberships Membership[]`
line and before `@@map("projects")`):

```prisma
  // Back-relations added in Slice 3 (Lists + Entries + minimal Catalog).
  // lists: the project's lists (active and completed — archive filtering comes in Slice 6).
  lists        List[]
  // catalogItems: the project's article catalog — its "memory" across lists (MVP design §3.1).
  catalogItems CatalogItem[]
```

Then append the new enum and models at the end of the file:

```prisma
// Lifecycle of a list. Slice 3 only ever creates `active` lists; Slice 6 (Completion + Archive)
// flips lists to `completed`. The enum + completedAt exist NOW so Slice 6 needs no migration —
// same precedent as suggestionRuleN/M in Slice 2.
enum ListStatus {
  active
  completed
}

// An article in the project's catalog — the project's "memory" (MVP design §3.1).
// Slice 3 creates catalog items implicitly when an entry with a new name is added (get-or-create);
// Slice 4 adds autocomplete over this table and the category/unit flow-back on entry edits.
model CatalogItem {
  id        String  @id @default(uuid()) @db.Uuid // stable, client-generatable UUID (offline-prep convention)
  projectId String  @db.Uuid @map("project_id")
  // onDelete: Cascade -> deleting a project removes its catalog (the catalog is project-scoped memory).
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Display name exactly as first typed (trimmed, inner whitespace collapsed) — what the UI shows.
  name String
  // Identity key: lowercase + trim + collapse spaces (normalizeName, MVP design §4.4). Two spellings
  // of the same article ("Milch", " milch ") MUST resolve to one catalog row — this uniqueness is
  // what makes autocomplete (Slice 4) and the suggestion statistic (Slice 5) work per article.
  normalizedName String @map("normalized_name")

  // Defaults inherited by new list entries referencing this article. Nullable: unknown until a user
  // sets them. Slice 4 adds the flow-back that updates these when an entry's category/unit is edited.
  defaultCategory String? @map("default_category")
  defaultUnit     String? @map("default_unit")

  createdAt DateTime   @default(now()) @map("created_at")
  listItems ListItem[]

  // One catalog row per article identity per project. Prisma exposes this as the compound
  // selector `projectId_normalizedName` in findUnique/upsert — the race-safe get-or-create key.
  @@unique([projectId, normalizedName])
  @@map("catalog_items")
}

// A list (shopping / to-do / packing) inside a project. Entries hang off it as ListItems.
model List {
  id        String  @id @default(uuid()) @db.Uuid // client MAY supply this id (offline-prep); default is the server fallback
  projectId String  @db.Uuid @map("project_id")
  // onDelete: Cascade -> deleting a project removes its lists (and, transitively, their items).
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String

  // active | completed. Slice 3 never sets `completed`; the field exists for Slice 6 (see enum comment).
  status      ListStatus @default(active)
  completedAt DateTime?  @map("completed_at") // set by Slice 6 when the list is completed

  createdAt DateTime   @default(now()) @map("created_at")
  items     ListItem[]

  @@map("lists")
}

// A single entry on a list. The MUTATION UNIT of the whole app: all changes arrive as entry-level
// operations carrying this row's stable id (MVP design §4.5) — that granularity is what makes
// Phase 2 offline merge possible without API changes.
model ListItem {
  // NO server-only id: the client GENERATES this UUID for add_item (so an entry created offline in
  // Phase 2 keeps its identity across the sync). @default(uuid()) is only a fallback for callers
  // that don't supply one.
  id     String @id @default(uuid()) @db.Uuid
  listId String @db.Uuid @map("list_id")
  // onDelete: Cascade -> deleting a list removes its entries.
  list   List   @relation(fields: [listId], references: [id], onDelete: Cascade)

  // The article this entry refers to. The entry has NO name column — the name lives on the catalog
  // item (article identity, MVP design §3.1). onDelete: Cascade keeps project deletion consistent:
  // when the project cascade removes catalog_items, dependent list_items go too (there is no
  // standalone catalog-item deletion in the MVP, so this cascade only ever fires via project delete).
  catalogItemId String      @db.Uuid @map("catalog_item_id")
  catalogItem   CatalogItem @relation(fields: [catalogItemId], references: [id], onDelete: Cascade)

  // Quantity/unit/category are all nullable per the domain model. category is COPIED from the
  // catalog default at add time (then overridable per entry) — a snapshot, not a live reference,
  // so later catalog edits don't rewrite existing lists.
  quantity Float?
  unit     String?
  category String?

  checked Boolean @default(false)

  // Manual ordering within the list (and within category groups). Server-assigned max+1 on add;
  // mutable via update_item(field: "sortIndex").
  sortIndex Int @map("sort_index")

  createdAt DateTime @default(now()) @map("created_at")
  // @updatedAt: Prisma bumps this on EVERY update. This is the last-writer-wins timestamp and the
  // sync-cursor basis for Slice 7 — do not remove or set manually.
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("list_items")
}
```

- [ ] **Step 2: Create and apply the migration against the main DB**

Run: `npx prisma migrate dev --name add_lists_entries_catalog`
Expected: Prisma creates the `catalog_items`, `lists`, `list_items` tables + the `ListStatus` enum
in the Neon main DB, writes `prisma/migrations/<timestamp>_add_lists_entries_catalog/`, and
regenerates the typed client (`prisma.catalogItem` / `prisma.list` / `prisma.listItem`).

- [ ] **Step 3: Extend the test-DB reset helper**

Modify `src/test/reset-db.ts` — keep the existing function and comments; make a targeted edit to the
`TRUNCATE` statement. Change this exact line:

```ts
    'TRUNCATE TABLE "users", "allowlist_entries", "projects", "memberships" RESTART IDENTITY CASCADE;'
```

to:

```ts
    'TRUNCATE TABLE "users", "allowlist_entries", "projects", "memberships", "catalog_items", "lists", "list_items" RESTART IDENTITY CASCADE;'
```

- [ ] **Step 4: Verify the client compiles with the new models**

Run: `npx tsc --noEmit`
Expected: no errors (confirms the regenerated client exposes the three new models and the
`ListStatus` type, and that the `Project` back-relations are valid).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/test/reset-db.ts
git commit -m "feat: data model CatalogItem + List + ListItem (ListStatus enum), test-DB reset"
```

---

## Task 2: Article-name normalization (`normalizeName`)

The identity rule from MVP design §4.4: lowercase + trim + collapse repeated whitespace. It lives in
`src/lib/catalog/` (not `src/lib/auth/normalize.ts`) because it is a *different* rule than email
normalization — emails deliberately do not collapse inner spaces (see the comment in the existing
`normalizeEmail`). This covers the "Normalisierung & Katalog-Identität" test seam (MVP design §7)
at the function level; the end-to-end catalog-identity seam follows in Task 3.

**Files:**
- Create: `src/lib/catalog/normalize.ts`
- Test: `src/lib/catalog/normalize.test.ts`

**Interfaces:**
- Produces: `normalizeName(name: string): string` — Tasks 3 and 6 call it; Slice 4's autocomplete
  will call it too (same identity rule on the query side).

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalog/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalize";

// The article-identity rule (MVP design §4.4): two spellings of the same article must produce the
// same normalized string, because CatalogItem.normalizedName is unique per project.
describe("normalizeName", () => {
  it("lowercases", () => {
    expect(normalizeName("Milch")).toBe("milch");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeName("  Brot ")).toBe("brot");
  });

  it("collapses repeated inner whitespace to single spaces", () => {
    expect(normalizeName("rote   Paprika")).toBe("rote paprika");
  });

  it("maps different spellings of the same article to one identity", () => {
    expect(normalizeName(" MILCH ")).toBe(normalizeName("milch"));
  });

  it("returns an empty string for whitespace-only input (caller rejects it)", () => {
    expect(normalizeName("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/catalog/normalize.test.ts`
Expected: FAIL — `Cannot find module './normalize'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/catalog/normalize.ts`:

```ts
// Normalizes an article name into its identity key (MVP design §4.4).
// MVP rule: lowercase + trim + collapse repeated whitespace. CatalogItem.normalizedName is unique
// per project on exactly this value, so "Milch", " milch " and "MILCH" are ONE article.
// Deliberately separate from normalizeEmail (src/lib/auth/normalize.ts): emails do not collapse
// inner spaces. Phase 2 may extend this (singular/synonyms) without changing the model.
export function normalizeName(name: string): string {
  // \s+ also collapses tabs/newlines pasted from other apps, not just double spaces.
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/catalog/normalize.test.ts`
Expected: PASS (5 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/normalize.ts src/lib/catalog/normalize.test.ts
git commit -m "feat: article-name normalization (normalizeName) with tests"
```

---

## Task 3: Minimal catalog identity core (`getOrCreateCatalogItem`)

`add_item` (Task 6) must resolve a typed name to a catalog item: existing normalized name → reuse
the row; new name → create it. This is the whole catalog surface Slice 3 needs — autocomplete and
flow-back are Slice 4 and will extend this same file.

**Files:**
- Create: `src/lib/catalog/catalog.ts`
- Test: `src/lib/catalog/catalog.test.ts`

**Interfaces:**
- Consumes: `normalizeName` from `./normalize`; `ApiError` from `@/lib/http/errors`;
  `PrismaClient`, `CatalogItem` from `@prisma/client`.
- Produces:
  - `MAX_ITEM_NAME_LENGTH = 200` (exported constant, mirrored by Task 6's validation).
  - `getOrCreateCatalogItem(db: PrismaClient, input: { projectId: string; name: string }): Promise<CatalogItem>`
    — throws `ApiError(400)` for an empty (after normalization) or over-long name.

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalog/catalog.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "./catalog";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  // A catalog item needs a project to belong to; the user is only needed as the project owner.
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("getOrCreateCatalogItem", () => {
  it("creates a new catalog item with normalized identity and cleaned display name", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "  Rote   Paprika " });
    expect(item.projectId).toBe(projectId);
    expect(item.normalizedName).toBe("rote paprika"); // identity key
    expect(item.name).toBe("Rote Paprika"); // display name keeps the case, whitespace cleaned
    expect(item.defaultCategory).toBeNull(); // unknown until a user sets one (Slice 4 flow-back)
    expect(item.defaultUnit).toBeNull();
  });

  // The core §7 seam "Normalisierung & Katalog-Identität": variants of one name -> ONE row.
  it("returns the existing item for a different spelling of the same name", async () => {
    const first = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    const second = await getOrCreateCatalogItem(db, { projectId, name: " MILCH  " });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Milch"); // first-typed display name wins (flow-back is Slice 4)
    expect(await db.catalogItem.count({ where: { projectId } })).toBe(1);
  });

  it("keeps identities separate per project (same name, two projects, two rows)", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const a = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    const b = await getOrCreateCatalogItem(db, { projectId: otherProject.id, name: "Milch" });
    expect(a.id).not.toBe(b.id);
  });

  it("rejects a name that is empty after normalization with 400", async () => {
    await expect(getOrCreateCatalogItem(db, { projectId, name: "   " })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a name longer than 200 characters with 400", async () => {
    await expect(
      getOrCreateCatalogItem(db, { projectId, name: "x".repeat(201) }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/catalog/catalog.test.ts`
Expected: FAIL — `Cannot find module './catalog'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/catalog/catalog.ts`:

```ts
import type { CatalogItem, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { normalizeName } from "./normalize";

// Upper bound for article names (same rationale and value as MAX_PROJECT_NAME_LENGTH: the DB column
// is unbounded TEXT; 200 chars is generous for a human-entered article). Exported so the operations
// core and any transport reference the same limit.
export const MAX_ITEM_NAME_LENGTH = 200;

export interface GetOrCreateCatalogItemInput {
  projectId: string;
  name: string;
}

// Resolves a typed article name to THE catalog row for that article in this project — creating it
// on first use. This get-or-create is how the catalog "remembers" every article ever entered
// (MVP design §4.4): known normalized name -> reuse (identity preserved for statistics and
// autocomplete), new name -> new row.
export async function getOrCreateCatalogItem(
  db: PrismaClient,
  input: GetOrCreateCatalogItemInput,
): Promise<CatalogItem> {
  const normalizedName = normalizeName(input.name);

  // Core-level validation (defense in depth, Slice 2 convention): every transport inherits it.
  if (!normalizedName) throw new ApiError(400, "Name darf nicht leer sein");
  if (input.name.length > MAX_ITEM_NAME_LENGTH) {
    throw new ApiError(400, `Name darf höchstens ${MAX_ITEM_NAME_LENGTH} Zeichen lang sein`);
  }

  // Display name: keep the user's casing, but trim + collapse whitespace so the stored name is clean.
  const displayName = input.name.trim().replace(/\s+/g, " ");

  // Pattern: upsert on the compound unique (projectId, normalizedName) — one round-trip, and the DB
  // constraint (not application logic) guarantees a single row per article identity even under
  // concurrent adds of the same new name.
  // `update: {}`: an existing article is returned unchanged — the FIRST-typed display name wins for
  // now; updating defaults/display via entry edits is the Slice 4 flow-back, not this function.
  return db.catalogItem.upsert({
    where: { projectId_normalizedName: { projectId: input.projectId, normalizedName } },
    update: {},
    create: { projectId: input.projectId, name: displayName, normalizedName },
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/catalog/catalog.test.ts`
Expected: PASS (5 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/catalog.ts src/lib/catalog/catalog.test.ts
git commit -m "feat: minimal catalog identity core (getOrCreateCatalogItem) with tests"
```

---

## Task 4: List core functions

**Files:**
- Create: `src/lib/lists/lists.ts`
- Test: `src/lib/lists/lists.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `List`, `ListItem`, `CatalogItem` from `@prisma/client`; `ApiError`;
  `isUuid` from `@/lib/validate`.
- Produces:
  - `MAX_LIST_NAME_LENGTH = 200` (exported constant).
  - `type ListWithItems = List & { items: (ListItem & { catalogItem: CatalogItem })[] }` — the read
    shape Tasks 7 + 8 render (items carry their catalog item because the display name lives there).
  - `createList(db, input: { projectId: string; name: string; id?: string }): Promise<List>` —
    optional client-supplied UUID (offline-prep); `ApiError(400)` for a malformed id or bad name.
  - `listLists(db, projectId: string): Promise<List[]>` — newest first.
  - `getListWithItems(db, listId: string): Promise<ListWithItems | null>` — items ordered by
    `sortIndex` ascending, each including its `catalogItem`.
  - `renameList(db, listId: string, name: string): Promise<List>`
  - `deleteList(db, listId: string): Promise<void>` — items cascade via FK.

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/lists.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createList, deleteList, getListWithItems, listLists, renameList } from "./lists";

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

describe("createList", () => {
  it("creates an active list with a generated id when none is supplied", async () => {
    const list = await createList(db, { projectId, name: "Wocheneinkauf" });
    expect(list.id).toBeTruthy();
    expect(list.name).toBe("Wocheneinkauf");
    expect(list.status).toBe("active"); // schema default; completion is Slice 6
    expect(list.completedAt).toBeNull();
  });

  // Offline-prep convention: the client may generate the UUID so an offline-created list keeps
  // its identity when synced later (Phase 2). The server only validates the shape.
  it("honors a client-supplied UUID", async () => {
    const id = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
    const list = await createList(db, { projectId, name: "Packliste", id });
    expect(list.id).toBe(id);
  });

  it("rejects a malformed client-supplied id with 400", async () => {
    await expect(
      createList(db, { projectId, name: "Kaputt", id: "not-a-uuid" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an empty (whitespace-only) name with 400", async () => {
    await expect(createList(db, { projectId, name: "   " })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a name longer than 200 characters with 400", async () => {
    await expect(
      createList(db, { projectId, name: "x".repeat(201) }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("listLists", () => {
  it("returns only this project's lists, newest first", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Fremd", ownerId: otherUser.id } });
    const older = await createList(db, { projectId, name: "Alt" });
    // Force a distinct createdAt so the desc ordering is deterministic (same-ms inserts are possible).
    await db.list.update({
      where: { id: older.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    await createList(db, { projectId, name: "Neu" });
    await createList(db, { projectId: otherProject.id, name: "Fremdliste" });

    const lists = await listLists(db, projectId);
    expect(lists.map((l) => l.name)).toEqual(["Neu", "Alt"]);
  });
});

describe("getListWithItems", () => {
  it("returns items ordered by sortIndex, each with its catalog item (name source)", async () => {
    const list = await createList(db, { projectId, name: "Einkauf" });
    const milk = await db.catalogItem.create({
      data: { projectId, name: "Milch", normalizedName: "milch" },
    });
    const bread = await db.catalogItem.create({
      data: { projectId, name: "Brot", normalizedName: "brot" },
    });
    // Inserted out of order on purpose: read order must come from sortIndex, not insertion.
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: bread.id, sortIndex: 2 },
    });
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: milk.id, sortIndex: 1 },
    });

    const loaded = await getListWithItems(db, list.id);
    expect(loaded?.items.map((i) => i.catalogItem.name)).toEqual(["Milch", "Brot"]);
  });

  it("returns null for an unknown list", async () => {
    expect(await getListWithItems(db, "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b")).toBeNull();
  });
});

describe("renameList", () => {
  it("changes the name", async () => {
    const list = await createList(db, { projectId, name: "Alt" });
    const renamed = await renameList(db, list.id, "Neu");
    expect(renamed.name).toBe("Neu");
  });

  it("rejects an empty (whitespace-only) name with 400", async () => {
    const list = await createList(db, { projectId, name: "Alt" });
    await expect(renameList(db, list.id, "   ")).rejects.toMatchObject({ status: 400 });
  });
});

describe("deleteList", () => {
  it("deletes the list and cascades its items", async () => {
    const list = await createList(db, { projectId, name: "Weg" });
    const item = await db.catalogItem.create({
      data: { projectId, name: "Milch", normalizedName: "milch" },
    });
    await db.listItem.create({ data: { listId: list.id, catalogItemId: item.id, sortIndex: 1 } });

    await deleteList(db, list.id);
    expect(await getListWithItems(db, list.id)).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/lists/lists.test.ts`
Expected: FAIL — `Cannot find module './lists'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/lists/lists.ts`:

```ts
import type { CatalogItem, List, ListItem, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

// Upper bound for list names — same rationale and value as MAX_PROJECT_NAME_LENGTH (Slice 2):
// unbounded TEXT column, so the core must cap human input. Exported for transports to reference.
export const MAX_LIST_NAME_LENGTH = 200;

// Core-level name validation (defense in depth, Slice 2 convention): routes trim/check too, but
// server actions and future transports go through this same core.
function assertValidListName(name: string): void {
  if (!name.trim()) throw new ApiError(400, "Name darf nicht leer sein");
  if (name.length > MAX_LIST_NAME_LENGTH) {
    throw new ApiError(400, `Name darf höchstens ${MAX_LIST_NAME_LENGTH} Zeichen lang sein`);
  }
}

// The read shape the UI and REST detail endpoint render: a list with its items, each item carrying
// its catalog item — the entry's display NAME lives on the catalog item (article identity,
// MVP design §3.1), so items are useless for rendering without it.
export type ListWithItems = List & {
  items: (ListItem & { catalogItem: CatalogItem })[];
};

// Input for creating a list. `id` is optional: the client MAY generate the UUID (offline-prep
// convention) — e.g. Phase 2 creates lists offline and syncs them later without losing identity.
export interface CreateListInput {
  projectId: string;
  name: string;
  id?: string;
}

// Creates an active list in a project. Permission (membership) is checked by the caller via the
// guard — the core stays transport- and auth-agnostic, like the Slice 2 project core.
export async function createList(db: PrismaClient, input: CreateListInput): Promise<List> {
  assertValidListName(input.name);
  // A client-supplied id must be a well-formed UUID, or Postgres rejects it with a driver error
  // (Prisma P2023 -> fake 500). Reject malformed ids as a clean 400 instead (see validate.ts).
  if (input.id !== undefined && !isUuid(input.id)) {
    throw new ApiError(400, "Ungültige Listen-ID");
  }
  return db.list.create({
    // `id: undefined` lets the schema's @default(uuid()) generate one server-side (the fallback).
    data: { id: input.id, projectId: input.projectId, name: input.name },
  });
}

// All lists of a project, newest first: on a phone you almost always want the list you just
// created or used most recently at the top. (Slice 6 will split active vs. archived views.)
export async function listLists(db: PrismaClient, projectId: string): Promise<List[]> {
  return db.list.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
}

// Single list with its items (ordered by sortIndex = the manual order) and each item's catalog
// item, or null if it does not exist. Permission is checked by the caller (requireListAccess).
export async function getListWithItems(
  db: PrismaClient,
  listId: string,
): Promise<ListWithItems | null> {
  // Shape check first: a malformed id can never match, and must not reach the uuid column (P2023).
  if (!isUuid(listId)) return null;
  return db.list.findUnique({
    where: { id: listId },
    include: {
      items: {
        // sortIndex is the single source of ordering truth; the UI groups by category on top of it.
        orderBy: { sortIndex: "asc" },
        include: { catalogItem: true },
      },
    },
  });
}

// Renames a list. Same name rules as createList — otherwise the limit could be bypassed via rename.
export async function renameList(db: PrismaClient, listId: string, name: string): Promise<List> {
  assertValidListName(name);
  return db.list.update({ where: { id: listId }, data: { name } });
}

// Deletes a list. Its items are removed automatically by the onDelete: Cascade FK (schema, Task 1).
export async function deleteList(db: PrismaClient, listId: string): Promise<void> {
  await db.list.delete({ where: { id: listId } });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/lists/lists.test.ts`
Expected: PASS (11 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/lists.ts src/lib/lists/lists.test.ts
git commit -m "feat: list core functions (create/list/get-with-items/rename/delete) with tests"
```

---

## Task 5: List access guard (`requireListAccess`)

List-scoped routes (`/api/lists/[listId]/...`) receive only a `listId` — the project (which is what
membership is checked against) must be derived from the list itself. This guard resolves the list
AND runs the Slice 2 membership guard on its project in one call. Slices 6 (complete a list) and 7
(polling a list) will reuse it, so it gets its own module and tests.

**Files:**
- Create: `src/lib/lists/access.ts`
- Test: `src/lib/lists/access.test.ts`

**Interfaces:**
- Consumes: `requireMembership` from `@/lib/projects/guard`; `ApiError`; `isUuid`;
  `PrismaClient`, `List`, `Role` from `@prisma/client`.
- Produces:
  - `requireListAccess(db: PrismaClient, listId: string, userId: string): Promise<{ list: List; role: Role }>`
    — throws `ApiError(404, "Liste nicht gefunden")` for a malformed/unknown list id, and propagates
    the guard's `404` for non-members (existence stays hidden either way).

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/access.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { requireListAccess } from "./access";

const db = new PrismaClient();
let ownerId: string;
let memberId: string;
let strangerId: string;
let listId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const member = await db.user.create({ data: { googleSub: "g-member", email: "member@example.com" } });
  const stranger = await db.user.create({ data: { googleSub: "g-stranger", email: "stranger@example.com" } });
  ownerId = owner.id;
  memberId = member.id;
  strangerId = stranger.id;

  const project = await db.project.create({ data: { name: "Haushalt", ownerId } });
  await db.membership.create({ data: { projectId: project.id, userId: ownerId, role: "owner" } });
  await db.membership.create({ data: { projectId: project.id, userId: memberId, role: "member" } });
  const list = await db.list.create({ data: { projectId: project.id, name: "Einkauf" } });
  listId = list.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("requireListAccess", () => {
  it("returns the list and role for the owner", async () => {
    const { list, role } = await requireListAccess(db, listId, ownerId);
    expect(list.id).toBe(listId);
    expect(role).toBe("owner");
  });

  it("returns the list and role for a member", async () => {
    const { role } = await requireListAccess(db, listId, memberId);
    expect(role).toBe("member");
  });

  // Non-members get 404 (not 403): neither the list nor the project may leak its existence.
  it("throws 404 for a non-member", async () => {
    await expect(requireListAccess(db, listId, strangerId)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 for an unknown list id", async () => {
    await expect(
      requireListAccess(db, "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b", ownerId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 (not a 500) for a malformed list id", async () => {
    await expect(requireListAccess(db, "not-a-uuid", ownerId)).rejects.toMatchObject({
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/lists/access.test.ts`
Expected: FAIL — `Cannot find module './access'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/lists/access.ts`:

```ts
import type { List, PrismaClient, Role } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { isUuid } from "@/lib/validate";

// What list-scoped callers get back: the resolved list (so they don't have to load it again) and
// the caller's role (Slice 3 doesn't branch on it — all list actions are member-level per the
// permission matrix — but Slices 6/7 consumers may).
export interface ListAccess {
  list: List;
  role: Role;
}

// The list-scoped authorization primitive: resolves a list by id and asserts the caller is a
// member of the project it belongs to. List routes only know a listId, but permission is defined
// per PROJECT (MVP design §6) — this is the bridge.
//
// Pattern: composition over duplication — this guard derives the projectId from the list row and
// delegates to the Slice 2 requireMembership, inheriting its 404-hiding behavior for non-members.
// Error order matters: unknown list -> 404, known list but non-member -> the SAME 404 wording
// class, so a stranger cannot distinguish "list doesn't exist" from "list exists but not yours".
export async function requireListAccess(
  db: PrismaClient,
  listId: string,
  userId: string,
): Promise<ListAccess> {
  // Shape check first: a malformed id from the URL must behave like a missing list (404), not
  // crash the uuid column lookup with Prisma P2023 (-> fake 500). See validate.ts.
  if (!isUuid(listId)) throw new ApiError(404, "Liste nicht gefunden");

  const list = await db.list.findUnique({ where: { id: listId } });
  if (!list) throw new ApiError(404, "Liste nicht gefunden");

  // Membership check against the list's project. Throws ApiError(404, "Projekt nicht gefunden")
  // for non-members — a 404 either way, which is exactly the existence-hiding we want.
  const role = await requireMembership(db, list.projectId, userId);
  return { list, role };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/lists/access.test.ts`
Expected: PASS (5 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/access.ts src/lib/lists/access.test.ts
git commit -m "feat: list access guard (requireListAccess) with tests"
```

---

## Task 6: The operations core (`parseOperation` + `applyOperation`)

The heart of the slice and the app's mutation model (MVP design §4.5): every entry change is an
idempotent, ID-bearing operation. `parseOperation` turns untrusted JSON into a typed operation
(or throws 400); `applyOperation` dispatches it against a list. Slice 7 will replay/poll these same
operations; Phase 2 will queue them offline — so get the contracts right here.

**Files:**
- Create: `src/lib/lists/operations.ts`
- Test: `src/lib/lists/operations.test.ts`

**Interfaces:**
- Consumes: `getOrCreateCatalogItem` from `@/lib/catalog/catalog`;
  `ApiError`; `isUuid`; `List`, `ListItem`, `PrismaClient` from `@prisma/client`.
- Produces (Tasks 7 + 8 and Slice 7 rely on these exact names):
  - `MAX_TEXT_FIELD_LENGTH = 100` (cap for `unit` / `category`).
  - `type AddItemOperation = { op: "add_item"; itemId: string; name: string; quantity?: number | null; unit?: string | null; category?: string | null }`
  - `type UpdateItemOperation = { op: "update_item"; itemId: string; field: "quantity" | "unit" | "category" | "sortIndex"; value: number | string | null }`
  - `type CheckItemOperation = { op: "check_item"; itemId: string; checked: boolean }`
  - `type RemoveItemOperation = { op: "remove_item"; itemId: string }`
  - `type Operation = AddItemOperation | UpdateItemOperation | CheckItemOperation | RemoveItemOperation`
  - `parseOperation(body: unknown): Operation` — shape-validates untrusted JSON; throws `ApiError(400)`.
  - `applyOperation(db: PrismaClient, list: List, operation: Operation): Promise<ListItem | null>` —
    returns the resulting item (`null` after `remove_item`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/operations.test.ts`:

```ts
import { PrismaClient, type List } from "@prisma/client";
import { randomUUID } from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { applyOperation, parseOperation } from "./operations";

const db = new PrismaClient();
let projectId: string;
let list: List;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
  list = await db.list.create({ data: { projectId, name: "Einkauf" } });
});

afterAll(async () => {
  await db.$disconnect();
});

// Convenience: add one item and return it (most cases need an existing entry to mutate).
async function addMilk(itemId = randomUUID()) {
  return (await applyOperation(db, list, {
    op: "add_item",
    itemId,
    name: "Milch",
    quantity: 1,
    unit: "l",
    category: "Kühlregal",
  }))!;
}

// Helper for the synchronous parse errors: capture the thrown value and assert its status.
// (toThrowError only matches class/message; the STATUS is what the HTTP boundary cares about.)
function expectParseError(body: unknown, status: number) {
  try {
    parseOperation(body);
    expect.unreachable("parseOperation should have thrown");
  } catch (error) {
    expect(error).toMatchObject({ status });
  }
}

describe("parseOperation", () => {
  it("parses a valid add_item body", () => {
    const op = parseOperation({ op: "add_item", itemId: randomUUID(), name: "Brot" });
    expect(op.op).toBe("add_item");
  });

  it("rejects an unknown op with 400", () => {
    expectParseError({ op: "explode", itemId: randomUUID() }, 400);
  });

  it("rejects a missing/non-string itemId with 400", () => {
    expectParseError({ op: "remove_item" }, 400);
  });

  it("rejects an update_item with an unknown field with 400", () => {
    expectParseError({ op: "update_item", itemId: randomUUID(), field: "checked", value: true }, 400);
  });

  it("rejects a non-object body with 400", () => {
    expectParseError(null, 400);
  });
});

describe("add_item", () => {
  it("creates the entry with the client-supplied id, linked to a catalog item", async () => {
    const itemId = randomUUID();
    const item = await addMilk(itemId);
    expect(item.id).toBe(itemId); // stable client-generated identity (offline-prep)
    expect(item.quantity).toBe(1);
    expect(item.unit).toBe("l");
    expect(item.category).toBe("Kühlregal");
    expect(item.checked).toBe(false);
    expect(item.sortIndex).toBe(1); // first entry -> max(0) + 1

    const catalogItem = await db.catalogItem.findUnique({ where: { id: item.catalogItemId } });
    expect(catalogItem?.normalizedName).toBe("milch");
  });

  it("reuses the catalog item for a known name spelled differently", async () => {
    await addMilk();
    const second = (await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: " MILCH ",
    }))!;
    expect(await db.catalogItem.count({ where: { projectId } })).toBe(1);
    expect(second.sortIndex).toBe(2); // appended after the first entry
  });

  it("inherits category/unit from the catalog defaults when not supplied", async () => {
    await db.catalogItem.create({
      data: {
        projectId,
        name: "Butter",
        normalizedName: "butter",
        defaultCategory: "Kühlregal",
        defaultUnit: "Stück",
      },
    });
    const item = (await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Butter",
    }))!;
    expect(item.category).toBe("Kühlregal"); // snapshot of the default at add time
    expect(item.unit).toBe("Stück");
  });

  // IDEMPOTENCY (the §7 merge seam, add side): replaying the same add must not duplicate.
  it("is idempotent: replaying the same itemId returns the existing entry unchanged", async () => {
    const itemId = randomUUID();
    await addMilk(itemId);
    const replay = (await applyOperation(db, list, {
      op: "add_item",
      itemId,
      name: "Milch",
      quantity: 99, // replay carries different values on purpose -> must NOT overwrite
    }))!;
    expect(replay.quantity).toBe(1); // original values win; a replay is a no-op
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
  });

  it("rejects an itemId that already exists in ANOTHER list with 409", async () => {
    const otherList = await db.list.create({ data: { projectId, name: "Andere" } });
    const itemId = randomUUID();
    await addMilk(itemId);
    await expect(
      applyOperation(db, otherList, { op: "add_item", itemId, name: "Milch" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a malformed itemId with 400", async () => {
    await expect(
      applyOperation(db, list, { op: "add_item", itemId: "not-a-uuid", name: "Milch" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a non-finite or non-positive quantity with 400", async () => {
    await expect(
      applyOperation(db, list, { op: "add_item", itemId: randomUUID(), name: "M", quantity: 0 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      applyOperation(db, list, { op: "add_item", itemId: randomUUID(), name: "M", quantity: NaN }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an over-long unit or category with 400", async () => {
    await expect(
      applyOperation(db, list, {
        op: "add_item",
        itemId: randomUUID(),
        name: "M",
        unit: "x".repeat(101),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("update_item", () => {
  it("updates a single field and bumps updatedAt (the LWW timestamp)", async () => {
    const item = await addMilk();
    const updated = (await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "quantity",
      value: 2,
    }))!;
    expect(updated.quantity).toBe(2);
    expect(updated.unit).toBe("l"); // untouched fields stay (field-granular by design)
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(item.updatedAt.getTime());
  });

  it("can null out a nullable field (e.g. clear the category)", async () => {
    const item = await addMilk();
    const updated = (await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "category",
      value: null,
    }))!;
    expect(updated.category).toBeNull();
  });

  it("can reorder via sortIndex", async () => {
    const item = await addMilk();
    const updated = (await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "sortIndex",
      value: 5,
    }))!;
    expect(updated.sortIndex).toBe(5);
  });

  it("rejects a wrongly-typed value for the field with 400", async () => {
    const item = await addMilk();
    await expect(
      applyOperation(db, list, {
        op: "update_item",
        itemId: item.id,
        field: "quantity",
        value: "viele",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 for an entry that does not exist in this list", async () => {
    await expect(
      applyOperation(db, list, {
        op: "update_item",
        itemId: randomUUID(),
        field: "quantity",
        value: 2,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("check_item", () => {
  it("checks and unchecks an entry", async () => {
    const item = await addMilk();
    const checked = (await applyOperation(db, list, {
      op: "check_item",
      itemId: item.id,
      checked: true,
    }))!;
    expect(checked.checked).toBe(true);
    const unchecked = (await applyOperation(db, list, {
      op: "check_item",
      itemId: item.id,
      checked: false,
    }))!;
    expect(unchecked.checked).toBe(false);
  });

  it("throws 404 for an entry that does not exist in this list", async () => {
    await expect(
      applyOperation(db, list, { op: "check_item", itemId: randomUUID(), checked: true }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("remove_item", () => {
  it("removes the entry and returns null", async () => {
    const item = await addMilk();
    const result = await applyOperation(db, list, { op: "remove_item", itemId: item.id });
    expect(result).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(0);
  });

  // IDEMPOTENCY (the §7 merge seam, remove side): "already gone" is success, not an error —
  // a replayed remove (Phase 2 queue) or two users removing the same entry must both succeed.
  it("is idempotent: removing a missing entry is a silent no-op", async () => {
    await expect(
      applyOperation(db, list, { op: "remove_item", itemId: randomUUID() }),
    ).resolves.toBeNull();
  });

  it("does not remove an entry that belongs to another list", async () => {
    const otherList = await db.list.create({ data: { projectId, name: "Andere" } });
    const item = await addMilk();
    await applyOperation(db, otherList, { op: "remove_item", itemId: item.id });
    expect(await db.listItem.count({ where: { id: item.id } })).toBe(1); // still there
  });
});

// Two operations on DIFFERENT entries must coexist untouched (§7: "unabhängige Operationen
// koexistieren") — the entry-granular model guarantees no cross-entry interference.
describe("independent operations", () => {
  it("operations on different entries do not affect each other", async () => {
    const milk = await addMilk();
    const bread = (await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Brot",
    }))!;
    await applyOperation(db, list, { op: "check_item", itemId: milk.id, checked: true });
    await applyOperation(db, list, {
      op: "update_item",
      itemId: bread.id,
      field: "quantity",
      value: 2,
    });

    const items = await db.listItem.findMany({ where: { listId: list.id } });
    const milkRow = items.find((i) => i.id === milk.id)!;
    const breadRow = items.find((i) => i.id === bread.id)!;
    expect(milkRow.checked).toBe(true);
    expect(milkRow.quantity).toBe(1); // untouched by the bread update
    expect(breadRow.quantity).toBe(2);
    expect(breadRow.checked).toBe(false); // untouched by the milk check
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/lists/operations.test.ts`
Expected: FAIL — `Cannot find module './operations'`.

- [ ] **Step 3: Implement the operations core**

Create `src/lib/lists/operations.ts`:

```ts
import type { List, ListItem, PrismaClient } from "@prisma/client";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

// Upper bound for the short free-text fields (unit, category). Smaller than names on purpose:
// these are labels like "l", "kg", "Kühlregal" — 100 chars is already generous.
export const MAX_TEXT_FIELD_LENGTH = 100;

// ---------------------------------------------------------------------------
// Operation types — THE mutation contract of the app (MVP design §4.5).
// Every mutation is entry-granular and carries the stable, client-generated ListItem id, so
// Phase 2 can queue these exact shapes offline and replay them without API changes.
// ---------------------------------------------------------------------------

// Creates an entry. The client generates itemId (a UUID) so the entry keeps its identity across
// retries/offline replays. quantity/unit/category are optional; unset unit/category fall back to
// the article's catalog defaults (inheritance, MVP design §4.4).
export interface AddItemOperation {
  op: "add_item";
  itemId: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
}

// Field-granular update ("Feld+Wert", MVP design §4.5): exactly ONE field per operation. This
// granularity is what makes per-field last-writer-wins merge possible in Slice 7 — a coarse
// "update everything" operation would clobber concurrent edits to other fields.
// `checked` is NOT a field here: checking has its own semantic operation (check_item).
export interface UpdateItemOperation {
  op: "update_item";
  itemId: string;
  field: "quantity" | "unit" | "category" | "sortIndex";
  value: number | string | null;
}

// Checks/unchecks an entry. Carries the target state (not a toggle!) so replaying it is idempotent:
// applying "checked: true" twice ends in the same state. A toggle would flip-flop on replay.
export interface CheckItemOperation {
  op: "check_item";
  itemId: string;
  checked: boolean;
}

// Removes an entry. Idempotent by definition: removing an already-removed entry is a no-op success.
export interface RemoveItemOperation {
  op: "remove_item";
  itemId: string;
}

export type Operation =
  | AddItemOperation
  | UpdateItemOperation
  | CheckItemOperation
  | RemoveItemOperation;

// ---------------------------------------------------------------------------
// parseOperation — untrusted JSON -> typed Operation (or ApiError 400).
// ---------------------------------------------------------------------------

// The fields update_item may touch. `as const` gives us a checkable runtime list AND the literal
// union type for UpdateItemOperation["field"] from one source of truth.
const UPDATABLE_FIELDS = ["quantity", "unit", "category", "sortIndex"] as const;

// Shape-validates a request body into a typed Operation. This is the ONE place untrusted operation
// JSON is checked, so the route handler and any future transport (offline queue replay) share the
// same validation. Value/semantic validation (lengths, quantity > 0, existence) stays in
// applyOperation — parse checks shape, apply checks meaning.
export function parseOperation(body: unknown): Operation {
  // All operations are JSON objects; anything else (null, string, array) is a malformed request.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "Ungültige Operation");
  }
  // Cast to an indexable record ONCE; each branch below narrows the fields it needs.
  const raw = body as Record<string, unknown>;

  // Every operation carries the stable entry id — reject early if it's missing/not a string.
  if (typeof raw.itemId !== "string") throw new ApiError(400, "Ungültige Operation");
  const itemId = raw.itemId;

  switch (raw.op) {
    case "add_item": {
      if (typeof raw.name !== "string") throw new ApiError(400, "Ungültige Operation");
      // Optional fields: `undefined` = "not supplied" (inherit defaults), `null` = explicit empty.
      // Wrong types are rejected rather than coerced — silent coercion would hide client bugs.
      if (raw.quantity !== undefined && raw.quantity !== null && typeof raw.quantity !== "number") {
        throw new ApiError(400, "Ungültige Operation");
      }
      if (raw.unit !== undefined && raw.unit !== null && typeof raw.unit !== "string") {
        throw new ApiError(400, "Ungültige Operation");
      }
      if (raw.category !== undefined && raw.category !== null && typeof raw.category !== "string") {
        throw new ApiError(400, "Ungültige Operation");
      }
      return {
        op: "add_item",
        itemId,
        name: raw.name,
        quantity: raw.quantity as number | null | undefined,
        unit: raw.unit as string | null | undefined,
        category: raw.category as string | null | undefined,
      };
    }
    case "update_item": {
      // `includes` needs the widened type; the cast back to the literal union is safe after the check.
      if (!UPDATABLE_FIELDS.includes(raw.field as (typeof UPDATABLE_FIELDS)[number])) {
        throw new ApiError(400, "Ungültige Operation");
      }
      const value = raw.value;
      if (value !== null && typeof value !== "number" && typeof value !== "string") {
        throw new ApiError(400, "Ungültige Operation");
      }
      return {
        op: "update_item",
        itemId,
        field: raw.field as UpdateItemOperation["field"],
        value: value as number | string | null,
      };
    }
    case "check_item": {
      if (typeof raw.checked !== "boolean") throw new ApiError(400, "Ungültige Operation");
      return { op: "check_item", itemId, checked: raw.checked };
    }
    case "remove_item":
      return { op: "remove_item", itemId };
    default:
      throw new ApiError(400, "Ungültige Operation");
  }
}

// ---------------------------------------------------------------------------
// applyOperation — dispatch + semantics (idempotency, inheritance, validation).
// ---------------------------------------------------------------------------

// Validates a quantity value: must be a finite number > 0 (or null to clear). NaN/Infinity survive
// JSON parsing via server actions, and 0/negative quantities are meaningless on a list.
function assertValidQuantity(value: number | null | undefined): void {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApiError(400, "Menge muss eine positive Zahl sein");
  }
}

// Validates a short text field (unit/category): null clears it, strings are length-capped.
function assertValidTextField(value: string | null | undefined, label: string): void {
  if (value === null || value === undefined) return;
  if (value.length > MAX_TEXT_FIELD_LENGTH) {
    throw new ApiError(400, `${label} darf höchstens ${MAX_TEXT_FIELD_LENGTH} Zeichen lang sein`);
  }
}

// Applies ONE operation to a list and returns the resulting entry (null after remove_item).
// The caller (route handler / server action) has already authorized access to `list` via
// requireListAccess and passes the loaded row — so this core never re-checks permissions, and the
// list is known to exist. Takes the full List (not just the id) because add_item needs
// list.projectId for the catalog get-or-create.
export async function applyOperation(
  db: PrismaClient,
  list: List,
  operation: Operation,
): Promise<ListItem | null> {
  // Every operation targets an entry by id; a malformed id must be a clean 400 before any query
  // touches the uuid column (Prisma P2023 -> fake 500 otherwise).
  if (!isUuid(operation.itemId)) throw new ApiError(400, "Ungültige Eintrags-ID");

  switch (operation.op) {
    case "add_item": {
      // Semantic validation of the optional value fields (shape was checked by parseOperation).
      assertValidQuantity(operation.quantity);
      assertValidTextField(operation.unit, "Einheit");
      assertValidTextField(operation.category, "Kategorie");
      // Name validation (non-empty after normalization, length cap) lives inside
      // getOrCreateCatalogItem — the single source of truth for the article-name rule; it is
      // deliberately not duplicated here (DRY).

      // IDEMPOTENCY: if this entry id already exists, this is a replay (retry / offline queue).
      const existing = await db.listItem.findUnique({ where: { id: operation.itemId } });
      if (existing) {
        // Replay into the SAME list -> return the existing entry unchanged (no-op, applying twice
        // equals applying once). Same id in a DIFFERENT list -> a real id collision, which is a
        // client bug (UUIDs must be unique); 409 Conflict makes it visible instead of hiding it.
        if (existing.listId === list.id) return existing;
        throw new ApiError(409, "Eintrags-ID wird bereits verwendet");
      }

      // Article identity: resolve the typed name to the project's catalog row (create on first use).
      const catalogItem = await getOrCreateCatalogItem(db, {
        projectId: list.projectId,
        name: operation.name,
      });

      // Append at the end: next sortIndex = current max + 1. _max is null on an empty list -> 0.
      // (Not race-free under concurrent adds, but a duplicate sortIndex only makes ordering
      // ambiguous, never corrupts data — acceptable for the MVP, revisit with Slice 7 if needed.)
      const maxAgg = await db.listItem.aggregate({
        where: { listId: list.id },
        _max: { sortIndex: true },
      });
      const sortIndex = (maxAgg._max.sortIndex ?? 0) + 1;

      return db.listItem.create({
        data: {
          id: operation.itemId, // the client-generated id IS the identity — never remap it
          listId: list.id,
          catalogItemId: catalogItem.id,
          quantity: operation.quantity ?? null,
          // ?? on purpose (not ||): only `undefined`/`null` inherit the catalog default; an
          // explicit empty string would be kept (though parse/UI never send one today).
          unit: operation.unit ?? catalogItem.defaultUnit,
          category: operation.category ?? catalogItem.defaultCategory,
          sortIndex,
        },
      });
    }

    case "update_item": {
      // The entry must exist IN THIS LIST: an id from another list must behave like "not found",
      // otherwise a member of project A could mutate entries in project B by guessing ids
      // (requireListAccess only authorized THIS list). findFirst with both conditions enforces it.
      const item = await db.listItem.findFirst({
        where: { id: operation.itemId, listId: list.id },
      });
      if (!item) throw new ApiError(404, "Eintrag nicht gefunden");

      // Per-field value validation: each field has its own type/range rules.
      switch (operation.field) {
        case "quantity":
          if (operation.value !== null && typeof operation.value !== "number") {
            throw new ApiError(400, "Menge muss eine Zahl sein");
          }
          assertValidQuantity(operation.value);
          break;
        case "sortIndex":
          // sortIndex is structural (not user-visible text): required, integer.
          if (typeof operation.value !== "number" || !Number.isInteger(operation.value)) {
            throw new ApiError(400, "Sortierung muss eine ganze Zahl sein");
          }
          break;
        case "unit":
        case "category":
          if (operation.value !== null && typeof operation.value !== "string") {
            throw new ApiError(400, "Ungültiger Wert");
          }
          assertValidTextField(operation.value, operation.field === "unit" ? "Einheit" : "Kategorie");
          break;
      }

      // Computed property name ([operation.field]) writes exactly ONE column — the field
      // granularity that Slice 7's per-field last-writer-wins depends on. @updatedAt bumps the
      // LWW timestamp automatically.
      return db.listItem.update({
        where: { id: item.id },
        data: { [operation.field]: operation.value },
      });
    }

    case "check_item": {
      // Same in-this-list scoping as update_item (see comment there).
      const item = await db.listItem.findFirst({
        where: { id: operation.itemId, listId: list.id },
      });
      if (!item) throw new ApiError(404, "Eintrag nicht gefunden");
      // Writes the target state (not a toggle) — idempotent under replay by construction.
      return db.listItem.update({ where: { id: item.id }, data: { checked: operation.checked } });
    }

    case "remove_item": {
      // deleteMany (not delete) because it tolerates 0 matches: removing an already-removed entry
      // is a SUCCESSFUL no-op (idempotency), and scoping by listId keeps foreign ids untouchable.
      await db.listItem.deleteMany({ where: { id: operation.itemId, listId: list.id } });
      return null;
    }
  }
}
```

> Note the deliberate decision recorded in the tests: `update_item` / `check_item` on a missing
> entry throw `404` (a real conflict the client must learn about), while `remove_item` on a missing
> entry is a silent no-op (already gone = success). Both behaviors are replay-safe.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/lists/operations.test.ts`
Expected: PASS (24 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/operations.ts src/lib/lists/operations.test.ts
git commit -m "feat: entry operations core (add/update/check/remove, parse + apply) with tests"
```

---

## Task 7: REST route handlers — lists + operations

Thin HTTP adapters over the tested core, exactly like the Slice 2 routes: resolve the user → run
the guard → call the core → map errors. Glue is not unit-tested (it wires already-tested
functions); it is verified by `npm run build`, the curl smoke test in Step 5, and the browser
checks in Task 8.

**Files:**
- Create: `src/app/api/projects/[projectId]/lists/route.ts`
- Create: `src/app/api/lists/[listId]/route.ts`
- Create: `src/app/api/lists/[listId]/ops/route.ts`

**Interfaces:**
- Consumes: `requireUserId`; `requireMembership` (project guard); `requireListAccess`;
  `createList` / `listLists` / `getListWithItems` / `renameList` / `deleteList`;
  `parseOperation` / `applyOperation`; `prisma`; `ApiError` / `toErrorResponse`.
- Produces the HTTP contract (all endpoints member-level; non-members get 404):
  - `GET /api/projects/:projectId/lists` → `200` `List[]` (newest first)
  - `POST /api/projects/:projectId/lists` `{ name, id? }` → `201` `List`
  - `GET /api/lists/:listId` → `200` `ListWithItems` (items ordered by sortIndex, incl. catalogItem)
  - `PATCH /api/lists/:listId` `{ name }` → `200` `List`
  - `DELETE /api/lists/:listId` → `204`
  - `POST /api/lists/:listId/ops` `Operation` → `200` `ListItem | null` (`null` after remove_item)

- [ ] **Step 1: Create the project-scoped lists collection route**

Create `src/app/api/projects/[projectId]/lists/route.ts`:

```ts
/**
 * Route handlers for /api/projects/[projectId]/lists — a project's lists collection.
 *
 * Both handlers are member-level (the permission matrix allows every member to read and create
 * lists); non-members get 404 from the guard (project existence stays hidden).
 *
 * Pattern: Thin HTTP adapters — identity → permission guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { createList, listLists } from "@/lib/lists/lists";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/lists
 * Returns the project's lists, newest first. Member-level.
 * Response: 200 List[]
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    // Identity first — no session means 401 before any data access.
    const userId = await requireUserId();
    const { projectId } = await params;
    // Any member may read; non-members get 404 (existence hidden).
    await requireMembership(prisma, projectId, userId);
    const lists = await listLists(prisma, projectId);
    return NextResponse.json(lists);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/projects/:projectId/lists
 * Creates a list. Member-level (per the permission matrix, creating lists is not owner-only).
 * Request body: { name: string, id?: string } — id is the optional client-generated UUID
 * (offline-prep convention); createList validates its shape.
 * Response: 201 List
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);

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
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Create the list item route (detail / rename / delete)**

Create `src/app/api/lists/[listId]/route.ts`:

```ts
/**
 * Route handlers for /api/lists/[listId] — a single list.
 *
 * Lists get a FLAT URL (not nested under /api/projects/...): the listId alone identifies the
 * resource, and requireListAccess derives the project for the membership check from the list row
 * itself. This keeps client URLs short and is the same shape Slice 7's polling endpoint will use.
 *
 * All handlers are member-level; non-members and unknown/malformed ids get 404 from the guard.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { deleteList, getListWithItems, renameList } from "@/lib/lists/lists";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * GET /api/lists/:listId
 * Returns the list with its items (sortIndex order), each item including its catalog item
 * (the entry's display name lives there). Member-level.
 * Response: 200 ListWithItems
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    // Guard resolves the list AND checks membership in its project (404 for both failure modes).
    await requireListAccess(prisma, listId, userId);
    const list = await getListWithItems(prisma, listId);
    // Rare race: the list was deleted between the guard and this read — handle gracefully.
    if (!list) throw new ApiError(404, "Liste nicht gefunden");
    return NextResponse.json(list);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * PATCH /api/lists/:listId
 * Renames a list. Member-level (lists belong to the project, not to a person).
 * Request body: { name: string }
 * Response: 200 List
 */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    await requireListAccess(prisma, listId, userId);

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");

    // renameList re-validates the name (core-level defense in depth on top of the route check).
    const list = await renameList(prisma, listId, name);
    return NextResponse.json(list);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * DELETE /api/lists/:listId
 * Deletes a list and its entries (FK cascade). Member-level per the permission matrix
 * (MVP design §6: every member may delete lists — only PROJECT deletion is owner-only).
 * Response: 204 No Content
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    await requireListAccess(prisma, listId, userId);
    await deleteList(prisma, listId);
    // 204: success with no body (new NextResponse, not .json — see the Slice 2 DELETE precedent).
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 3: Create the operations route**

Create `src/app/api/lists/[listId]/ops/route.ts`:

```ts
/**
 * Route handler for /api/lists/[listId]/ops — THE mutation endpoint for list entries.
 *
 * All entry changes arrive here as one entry-level operation per request (MVP design §4.5):
 * add_item / update_item / check_item / remove_item, each carrying the stable client-generated
 * ListItem id. There is deliberately NO other way to mutate entries — this single funnel is what
 * lets Slice 7 poll deltas and Phase 2 replay an offline queue against the same contract.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { applyOperation, parseOperation } from "@/lib/lists/operations";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * POST /api/lists/:listId/ops
 * Applies one operation to the list. Member-level.
 * Request body: an Operation (see src/lib/lists/operations.ts for the exact shapes).
 * Response: 200 ListItem (the resulting entry) — or 200 `null` after remove_item.
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;

    // The guard returns the loaded list; applyOperation needs it (projectId for the catalog).
    const { list } = await requireListAccess(prisma, listId, userId);

    // Malformed JSON -> null -> parseOperation throws the clean 400 ("Ungültige Operation").
    const body = await request.json().catch(() => null);
    const operation = parseOperation(body);

    const item = await applyOperation(prisma, list, operation);
    // One uniform response shape for all four ops: the resulting entry, or null when removed.
    return NextResponse.json(item);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Lint + build check**

Run: `npm run lint && npm run build`
Expected: lint clean, build succeeds, no TypeScript errors.

- [ ] **Step 5: Manual curl smoke test of the auth boundary**

With the dev server running (`npm run dev`) and **not** logged in:

Run: `curl -i http://localhost:3000/api/lists/00000000-0000-0000-0000-000000000000`
Expected: a redirect to `/login` (middleware) or `401 {"error":"Nicht angemeldet"}` — either way,
**no** list data. (Authenticated flows are exercised through the UI in Task 8, where the browser
carries the session cookie.) Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects/[projectId]/lists src/app/api/lists
git commit -m "feat: REST routes for lists (collection/detail) and entry operations"
```

---

## Task 8: Minimal UI + manual end-to-end verification

Server-rendered, like Slice 2: the project detail page gains a "Listen" section, and a new list
page renders entries grouped by category with add/check/remove forms. Every server action calls
the **same** guard (`requireListAccess`) and the **same** operations core as the REST routes —
mutations in the UI go through `applyOperation`, never through ad-hoc Prisma writes. In-app strings
are German; comments English. The middleware matcher already protects `/lists/*` (it excludes only
auth endpoints, login/error pages, Next internals, and public files) — no middleware change needed.

**Files:**
- Modify: `src/app/projects/[projectId]/page.tsx`
- Create: `src/app/lists/[listId]/page.tsx`

**Interfaces:**
- Consumes: `createList` / `listLists` / `getListWithItems` / `deleteList` (list core);
  `requireListAccess`; `applyOperation`; `requireMembership`; `auth`; `prisma`;
  `randomUUID` from `node:crypto` (the server action *is* the client here, so it generates the
  entry UUIDs; the interactive PWA client will generate them in the browser in a later slice).

- [ ] **Step 1: Add the "Listen" section to the project detail page**

Modify `src/app/projects/[projectId]/page.tsx` — keep ALL existing content and comments (CLAUDE.md
forbids thinning out); make three targeted edits.

Edit 1 — add two imports below the existing `guard` import line
(`import { requireMembership, requireOwner } from "@/lib/projects/guard";`):

```tsx
import Link from "next/link";
import { createList, listLists } from "@/lib/lists/lists";
```

Edit 2 — extend the parallel fetch. Change this exact block:

```tsx
  const [project, members] = await Promise.all([
    getProject(prisma, projectId),
    listMembers(prisma, projectId),
  ]);
```

to:

```tsx
  const [project, members, lists] = await Promise.all([
    getProject(prisma, projectId),
    listMembers(prisma, projectId),
    // Slice 3: the project's lists (newest first) render alongside the members.
    listLists(prisma, projectId),
  ]);
```

Edit 3 — add a member-level server action and the section markup. Insert the action directly after
the existing `kick` server action function (before the `return (`):

```tsx
  // Create-list action (Slice 3). MEMBER-level, not owner-only: per the permission matrix
  // (MVP design §6) every member may create lists — so this re-checks membership, not ownership.
  async function createListAction(formData: FormData) {
    "use server";
    const s = await auth();
    // requireMembership (not requireOwner): any member may create lists in the project.
    await requireMembership(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (same convention as the other actions).
    await createList(prisma, { projectId, name });
    revalidatePath(`/projects/${projectId}`);
  }
```

Then insert this section into the JSX between the closing `</ul>` of the members list and the
`{isOwner && (` block:

```tsx
      {/* Slice 3: the project's lists. Visible and usable for EVERY member (member-level actions). */}
      <h2>Listen</h2>
      <form action={createListAction}>
        <input name="name" placeholder="Listenname" aria-label="Listenname" />
        <button type="submit">Liste anlegen</button>
      </form>
      <ul>
        {lists.map((l) => (
          <li key={l.id}>
            <Link href={`/lists/${l.id}`}>{l.name}</Link>
          </li>
        ))}
      </ul>
```

- [ ] **Step 2: Create the list detail page**

Create `src/app/lists/[listId]/page.tsx`:

```tsx
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { requireListAccess } from "@/lib/lists/access";
import { deleteList, getListWithItems, type ListWithItems } from "@/lib/lists/lists";
import { applyOperation } from "@/lib/lists/operations";

// Next.js 16: dynamic route params are a Promise in server components — must be awaited.
type Props = { params: Promise<{ listId: string }> };

// Groups the (sortIndex-ordered) items by category for display — the MVP's "group by category"
// view (MVP design §2). Pure presentation helper: the persisted order stays sortIndex; grouping
// happens at render time. Uncategorized entries collect under the German label "Ohne Kategorie".
function groupByCategory(items: ListWithItems["items"]) {
  const groups = new Map<string, ListWithItems["items"]>();
  for (const item of items) {
    const key = item.category ?? "Ohne Kategorie";
    // Map preserves insertion order, so categories appear in the order of their first item —
    // deterministic and stable without inventing a category-sorting rule (YAGNI for the MVP).
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

// Server Component: renders the list with its entries and the entry forms.
// Protects itself via requireListAccess; non-members / unknown lists are redirected to /projects.
export default async function ListDetailPage({ params }: Props) {
  const { listId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route; user.id is safe to assert.
  const userId = session!.user.id;

  // Guard: same rule as the REST routes. requireListAccess throws (404-style) for non-members,
  // unknown ids, and malformed ids — all of them land back on the projects overview.
  try {
    await requireListAccess(prisma, listId, userId);
  } catch {
    redirect("/projects");
  }

  const list = await getListWithItems(prisma, listId);
  // Deleted between guard and read (rare race) — same redirect as an unknown list.
  if (!list) redirect("/projects");

  const groups = groupByCategory(list.items);

  // --- Server actions. Each re-derives identity and re-runs the guard (defense in depth:
  // server actions are individually addressable POST endpoints, exactly like in Slice 2), and
  // every entry mutation goes through applyOperation — the SAME operations core as the REST
  // endpoint, so the mutation model is enforced no matter the transport. ---

  // Add an entry. The action generates the client UUID (the server action IS the client here;
  // the browser-side PWA client of a later slice will generate ids itself — same contract).
  async function addItem(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions.
    // Optional quantity: empty input -> undefined (not sent), otherwise parse the decimal.
    // German keyboards produce "1,5" — accept the comma as decimal separator.
    const quantityRaw = String(formData.get("quantity") ?? "").trim().replace(",", ".");
    const quantity = quantityRaw ? Number(quantityRaw) : undefined;
    const unit = String(formData.get("unit") ?? "").trim() || undefined;
    const category = String(formData.get("category") ?? "").trim() || undefined;
    await applyOperation(prisma, l, {
      op: "add_item",
      itemId: randomUUID(), // stable entry identity, generated caller-side by convention
      name,
      quantity,
      unit,
      category,
    });
    revalidatePath(`/lists/${listId}`);
  }

  // Check/uncheck an entry. The form carries the TARGET state (not a toggle) — matching the
  // idempotent check_item semantics (replaying the action leaves the same state).
  async function toggleItem(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    const itemId = String(formData.get("itemId") ?? "");
    const checked = String(formData.get("checked") ?? "") === "true";
    if (!itemId) return;
    await applyOperation(prisma, l, { op: "check_item", itemId, checked });
    revalidatePath(`/lists/${listId}`);
  }

  // Remove an entry (idempotent: removing an already-removed entry is a no-op).
  async function removeItem(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    const itemId = String(formData.get("itemId") ?? "");
    if (!itemId) return;
    await applyOperation(prisma, l, { op: "remove_item", itemId });
    revalidatePath(`/lists/${listId}`);
  }

  // Delete the whole list (member-level per the permission matrix), then back to the project.
  async function removeList() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await deleteList(prisma, l.id);
    // redirect() throws internally — do not wrap it in try/catch.
    redirect(`/projects/${l.projectId}`);
  }

  return (
    <main style={{ padding: 24 }}>
      {/* Back-link to the owning project for basic navigation. */}
      <p>
        <Link href={`/projects/${list.projectId}`}>← Zum Projekt</Link>
      </p>
      <h1>{list.name}</h1>

      {/* Add-entry form: name is required, the value fields are optional. */}
      <form action={addItem}>
        <input name="name" placeholder="Artikel" aria-label="Artikel" />
        <input name="quantity" placeholder="Menge" aria-label="Menge" inputMode="decimal" />
        <input name="unit" placeholder="Einheit" aria-label="Einheit" />
        <input name="category" placeholder="Kategorie" aria-label="Kategorie" />
        <button type="submit">Hinzufügen</button>
      </form>

      {/* Entries grouped by category (render-time grouping over the sortIndex order). */}
      {[...groups.entries()].map(([category, items]) => (
        <section key={category}>
          <h2>{category}</h2>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {/* Check/uncheck: the button submits the OPPOSITE of the current state. */}
                <form action={toggleItem} style={{ display: "inline" }}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="checked" value={item.checked ? "false" : "true"} />
                  <button type="submit" aria-label={item.checked ? "Abhaken rückgängig" : "Abhaken"}>
                    {item.checked ? "☑" : "☐"}
                  </button>
                </form>{" "}
                {/* The display name comes from the catalog item (article identity). */}
                <span style={{ textDecoration: item.checked ? "line-through" : "none" }}>
                  {item.catalogItem.name}
                  {/* Quantity/unit only when present — e.g. "Milch — 1,5 l". */}
                  {item.quantity !== null &&
                    ` — ${item.quantity.toLocaleString("de-DE")}${item.unit ? ` ${item.unit}` : ""}`}
                  {item.quantity === null && item.unit ? ` — ${item.unit}` : ""}
                </span>{" "}
                <form action={removeItem} style={{ display: "inline" }}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button type="submit">Löschen</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2>Liste löschen</h2>
      <form action={removeList}>
        <button type="submit">Liste löschen</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Lint + build check**

Run: `npm run lint && npm run build`
Expected: lint clean, build succeeds, no TypeScript errors.

- [ ] **Step 4: Manual end-to-end verification in the browser**

Run: `npm run dev`, log in with an enabled Google account, then check in order:

1. Open a project → the "Listen" section appears with a create form. ✅
2. Create a list "Wocheneinkauf" → it appears (newest first) and links to `/lists/<id>`. ✅
3. Add "Milch", Menge `1,5`, Einheit `l`, Kategorie `Kühlregal` → it appears under the
   "Kühlregal" heading as "Milch — 1,5 l". ✅
4. Add "Brot" with no category → it appears under "Ohne Kategorie". ✅
5. Add " MILCH " (different spelling) → a second entry appears, and the catalog stays at ONE
   "Milch" article (verify: `npx prisma studio`, `catalog_items` has one `milch` row for the
   project). ✅
6. Check "Milch" → it renders struck-through; uncheck → normal again. ✅
7. Delete "Brot" → it disappears. ✅
8. *(If a second enabled member account is available)* open the same list as the member → entries
   are visible and editable; open the list URL as a NON-member → redirect to `/projects`. ✅
9. Delete the list → you land back on the project page and the list is gone. ✅

Stop the server with `Ctrl-C`.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/[projectId]/page.tsx src/app/lists
git commit -m "feat: lists UI (project section + list detail with entry operations)"
```

---

## Task 9: Wrap-up — full suite, docs, progress, review

**Files:**
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`
- Create: `docs/implementation-reviews/slice-3-lists-entries.md`
- Modify: `CLAUDE.md` (only if a command changed — none is expected)

- [ ] **Step 1: Run the full test suite + build**

Run: `npm test`
Expected: all green — the 56 tests from Slices 1+2 **plus** the new Slice 3 files: normalize (5),
catalog (5), lists (11), access (5), operations (24) = 50 new tests → 14 files, 106 tests total.

Run: `npm run lint && npm run build`
Expected: lint clean, build succeeds, no errors.

- [ ] **Step 2: Update CLAUDE.md if needed**

No new build/test/run commands are introduced by this slice (same `npm test` / `npm run dev` /
`npx prisma migrate dev`). Expected: **no change needed.**

- [ ] **Step 3: Update the meta project plan**

Modify `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:
- In the status table, set Slice 3 to **✅ Done** (the plan filename
  `2026-07-05-slice-3-lists-entries.md` is already linked there).
- Append a progress-log entry (newest on top) following the template, including these
  **follow-up decisions for later slices:**
  - "`requireListAccess` (`src/lib/lists/access.ts`) is the list-scoped guard — Slices 6 + 7 MUST
    use it for every list-scoped operation (it composes `requireMembership` and hides existence
    with 404)."
  - "`applyOperation` (`src/lib/lists/operations.ts`) is the ONLY mutation path for entries — the
    Slice 7 sync endpoint and any future transport must funnel through it, never ad-hoc writes."
  - "Idempotency semantics: replayed `add_item` (same id, same list) is a no-op returning the
    existing entry; `remove_item` on a missing entry is a silent no-op; `update_item`/`check_item`
    on a missing entry are 404 — Slice 7's merge design must account for the 404 case (stale
    clients operating on removed entries)."
  - "`remove_item` deletes the row (no tombstones). Slice 7's delta endpoint must therefore make
    deletions observable to pollers (e.g. include the list's current item ids in the delta
    response)."
  - "`CatalogItem` exists with get-or-create identity (`getOrCreateCatalogItem`); the first-typed
    display name wins and defaults stay null until Slice 4 adds autocomplete + flow-back."
  - "`ListItem.updatedAt` is maintained via Prisma `@updatedAt` on every operation — the Slice 7
    cursor/LWW basis."
- Also apply the maintenance guide's step 3: create the **Slice 4 plan** next (or explicitly note
  in the log that it is still to be created).

- [ ] **Step 4: Write the implementation review**

Create `docs/implementation-reviews/slice-3-lists-entries.md` covering all five required sections
(see CLAUDE.md "Implementation review"):

1. **What was achieved** — lists inside projects, entries mutated exclusively via idempotent
   entry-level operations, minimal catalog identity; whether the slice goal was fully met.
2. **Steps taken** — one short paragraph per task (1–8): schema, normalizeName, catalog identity,
   list core, list access guard, operations core, REST routes, UI + verification.
3. **Core components built** — each new file with its role (start from the file-structure table at
   the top of this plan).
4. **Most important lines of code** — quote and explain the 5–10 lines with the most conceptual
   weight. Good candidates: the `@@unique([projectId, normalizedName])` constraint (article
   identity), the `@updatedAt` line on `ListItem` (LWW/cursor basis), the idempotent
   early-return in `add_item` (`if (existing.listId === list.id) return existing;`), the
   `deleteMany` no-op in `remove_item`, the computed single-column write
   (`data: { [operation.field]: operation.value }`) in `update_item`, and the
   `requireMembership(db, list.projectId, userId)` composition in `requireListAccess`.
5. **Architecture contribution** — this slice assembled the **mutation model**: the operation
   funnel every later slice consumes (Slice 6 completes lists whose items were maintained here;
   Slice 7 syncs by replaying/observing these operations; Phase 2 queues them offline). Explain
   how the catalog stub connects to Slice 4.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md docs/implementation-reviews/slice-3-lists-entries.md
git commit -m "docs: meta plan progress + implementation review (Slice 3 done)"
```

---

## Definition of Done (Slice 3)

- [ ] `npm test` green (normalize, catalog, lists, access, operations — plus all Slice 1+2 tests).
- [ ] `npm run lint` and `npm run build` with no errors.
- [ ] A member can create, rename, and delete lists in their project; non-members get 404/redirect.
- [ ] Entries can be added / field-updated / checked / removed **only** via the four operations,
      each carrying a stable client-generatable UUID.
- [ ] Replayed `add_item` does not duplicate; replayed `remove_item` does not error; operations on
      different entries never interfere.
- [ ] Two spellings of one article resolve to one `CatalogItem` per project; new entries inherit
      the catalog's default category/unit.
- [ ] Entries render grouped by category with quantity/unit; checking strikes through.
- [ ] All code is meticulously documented with inline comments (CLAUDE.md standard).
- [ ] Meta project plan shows Slice 3 ✅ with a progress-log entry; implementation review exists
      with all five sections.

## Test-seam coverage (against MVP design §7)

| Seam from §7 | Covered by |
|---|---|
| Permission check (member / non-member against list + entry actions) | Task 5 (`access.test.ts`) + Task 8 browser check 8 |
| Normalization & catalog identity (variants of one name → one `CatalogItem`) | Task 2 (`normalize.test.ts`) + Task 3 (`catalog.test.ts`) + Task 8 browser check 5 |
| Entry merge: independent operations coexist | Task 6 (`operations.test.ts`, "independent operations" describe block) |
| Entry merge: idempotent replay (add / remove) | Task 6 (idempotency tests for add_item and remove_item) |

> The remaining §7 seams — suggestion logic (Slice 5), field-conflict last-writer-wins (Slice 7),
> completion logic (Slice 6) — belong to later slices. Slice 3 lays their groundwork
> (`updatedAt`, field-granular updates, `status`/`completedAt` columns) without implementing them.
