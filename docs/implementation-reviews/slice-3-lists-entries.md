# Implementation Review — Slice 3: Lists + Entries (Operations)

## 1. What was achieved

Slice 3 delivered the full Lists + Entries layer of the Smart Lists MVP — the **mutation model** that all later sync and offline work builds on. Concretely:

- **Lists CRUD:** create, list, get (with items), rename, and delete lists inside a project; all member-level per the permission matrix.
- **Minimal catalog identity:** `normalizeName` + `getOrCreateCatalogItem` resolve typed article names to a per-project `CatalogItem` row (unique on `normalized_name`); variant spellings share one catalog row.
- **Entry-level operations:** four idempotent, ID-bearing operations (`add_item`, `update_item`, `check_item`, `remove_item`) are the **only** mutation path for list entries; `parseOperation` validates untrusted JSON, `applyOperation` dispatches with semantics.
- **List-scoped authorization:** `requireListAccess` composes the Slice 2 membership guard for list routes — resolves the list, checks project membership, hides existence with 404.
- **REST API:** three route groups — project lists collection, list detail (GET/PATCH/DELETE), and entry operations (`POST /ops`).
- **Server-rendered UI:** project detail page gains a "Listen" section; new list detail page renders entries grouped by category with quantity/unit, check/remove via server actions.
- **106 tests** across 14 test files (50 new in this slice + 56 from Slices 1+2), all green; `npm run lint` and `npm run build` pass cleanly.
- The slice goal was **fully met**: members mutate entries exclusively through the four operations, each carrying a stable client-generatable UUID; replay semantics and catalog identity behave as specified.

---

## 2. Steps taken

**Task 1 — Schema (`CatalogItem`, `List`, `ListItem`, `ListStatus`):** Added the `ListStatus` enum (`active` / `completed`), `CatalogItem` model with `@@unique([projectId, normalizedName])`, `List` model scoped to a project, and `ListItem` model referencing a catalog item (no `name` column on the entry — article identity lives on the catalog). Client-generatable UUIDs on all PKs; `@updatedAt` on `ListItem` for the future LWW/cursor basis. Migration generated and applied; `reset-db.ts` extended to truncate the three new tables.

**Task 2 — `normalizeName`:** Created `src/lib/catalog/normalize.ts` with the article-identity rule (lowercase + trim + collapse spaces). Five unit tests cover variants, empty input, and whitespace edge cases.

**Task 3 — Catalog identity core:** Created `src/lib/catalog/catalog.ts` with `getOrCreateCatalogItem` — upsert on the compound unique key, first-typed display name wins, defaults stay null until Slice 4. Five unit tests verify get-or-create, normalization variants, and validation.

**Task 4 — List core functions:** Created `src/lib/lists/lists.ts` with `createList`, `listLists`, `getListWithItems`, `renameList`, `deleteList`. Reads include catalog items for rendering. Eleven unit tests cover CRUD, client-supplied list ids, and cascade delete.

**Task 5 — List access guard:** Created `src/lib/lists/access.ts` with `requireListAccess` — resolves list by id, delegates to `requireMembership` on the list's project, returns `{ list, role }`. Five unit tests cover member access, non-member 404, unknown list 404, and malformed UUID 404.

**Task 6 — Operations core:** Created `src/lib/lists/operations.ts` with `Operation` types, `parseOperation` (shape validation), and `applyOperation` (dispatch + idempotency + catalog inheritance). Twenty-four unit tests cover all four operations, idempotent replay, independent operations on different entries, validation, and cross-list id collision.

**Task 7 — REST routes:** Created `src/app/api/projects/[projectId]/lists/route.ts` (GET + POST), `src/app/api/lists/[listId]/route.ts` (GET + PATCH + DELETE), and `src/app/api/lists/[listId]/ops/route.ts` (POST one operation). All handlers follow session-check → guard → core function → `toErrorResponse`.

**Task 8 — UI + verification:** Modified `src/app/projects/[projectId]/page.tsx` with a "Listen" section (create form + links); created `src/app/lists/[listId]/page.tsx` with entries grouped by category, add/check/remove server actions calling `applyOperation`.

---

## 3. Core components built

| File | Role |
|---|---|
| `prisma/schema.prisma` (amended) | Adds `ListStatus` enum, `CatalogItem`, `List`, `ListItem` models with UUID PKs, compound unique on catalog identity, cascade deletes, `@updatedAt` on entries |
| `prisma/migrations/*/migration.sql` | Applies schema changes to dev + test databases |
| `src/test/reset-db.ts` (amended) | Truncates `catalog_items`, `lists`, `list_items` in test teardown |
| `src/lib/catalog/normalize.ts` | `normalizeName` — the article-identity normalization rule |
| `src/lib/catalog/catalog.ts` | `getOrCreateCatalogItem` — minimal catalog identity core (Slice 4 extends this) |
| `src/lib/lists/lists.ts` | `createList`, `listLists`, `getListWithItems`, `renameList`, `deleteList` — list CRUD, no HTTP concerns |
| `src/lib/lists/access.ts` | `requireListAccess` — **list-scoped authorization primitive**; Slices 6 + 7 must call it |
| `src/lib/lists/operations.ts` | `Operation` types, `parseOperation`, `applyOperation` — **the mutation model**; only path for entry changes |
| `src/app/api/projects/[projectId]/lists/route.ts` | REST collection: GET (project's lists) + POST (create list) |
| `src/app/api/lists/[listId]/route.ts` | REST item: GET (detail with items) + PATCH (rename) + DELETE |
| `src/app/api/lists/[listId]/ops/route.ts` | REST: POST (apply one entry operation) |
| `src/app/projects/[projectId]/page.tsx` (amended) | Server-rendered project detail — adds "Listen" section |
| `src/app/lists/[listId]/page.tsx` | Server-rendered list detail — entries by category, add/check/remove |

---

## 4. Most important lines of code

### The compound unique on catalog identity (`prisma/schema.prisma`)

```prisma
@@unique([projectId, normalizedName])
```

Why it matters: this is the database-enforced guarantee that "Milch", "milch", and "  Milch  " all resolve to one `CatalogItem` per project. Prisma exposes it as `projectId_normalizedName` for upsert lookups. Without this constraint, concurrent adds of the same new name could create duplicate catalog rows — breaking statistics, autocomplete, and favorites in later slices.

### The `@updatedAt` line on `ListItem` (`prisma/schema.prisma`)

```prisma
updatedAt DateTime @updatedAt @map("updated_at")
```

Why it matters: Prisma automatically bumps this timestamp on every update operation. Slice 7 will use it as the last-writer-wins basis and as the sync cursor — two clients updating different fields of the same entry can merge by comparing `updatedAt` per field write. Slice 3 does not implement LWW; it lays the timestamp groundwork.

### The idempotent early-return in `add_item` (`src/lib/lists/operations.ts`)

```typescript
const existing = await db.listItem.findUnique({ where: { id: operation.itemId } });
if (existing) {
  if (existing.listId === list.id) return existing;
  throw new ApiError(409, "Eintrags-ID wird bereits verwendet");
}
```

Why it matters: the client generates `itemId` before sending (offline-prep). If the same `add_item` is replayed after a network retry, the server finds the existing row and returns it unchanged — no duplicate entry. If the same UUID appears in a different list, that is a real collision (409), not a silent merge.

### The `deleteMany` no-op in `remove_item` (`src/lib/lists/operations.ts`)

```typescript
await db.listItem.deleteMany({ where: { id: operation.itemId, listId: list.id } });
return null;
```

Why it matters: `deleteMany` tolerates zero matches, so removing an already-removed entry is a successful no-op — safe replay. Using `delete` would throw on a missing row and break idempotency. Scoping by both `itemId` and `listId` prevents a member from deleting entries in another list by guessing ids.

### The computed single-column write in `update_item` (`src/lib/lists/operations.ts`)

```typescript
return db.listItem.update({
  where: { id: item.id },
  data: { [operation.field]: operation.value },
});
```

Why it matters: each `update_item` touches exactly one field (`quantity`, `unit`, `category`, or `sortIndex`). This field granularity is what makes per-field last-writer-wins merge possible in Slice 7 — a coarse "update everything" operation would clobber concurrent edits to other fields. `@updatedAt` bumps automatically.

### The `requireMembership` composition in `requireListAccess` (`src/lib/lists/access.ts`)

```typescript
const list = await db.list.findUnique({ where: { id: listId } });
if (!list) throw new ApiError(404, "Liste nicht gefunden");

const role = await requireMembership(db, list.projectId, userId);
return { list, role };
```

Why it matters: list routes only know a `listId`, but permission is defined per project. This guard bridges the two scopes — it loads the list to discover `projectId`, then delegates to the Slice 2 guard. Non-members get 404 (not 403), hiding whether the list exists. Every list-scoped route in Slices 6 + 7 should call this instead of reimplementing the lookup chain.

### The upsert in `getOrCreateCatalogItem` (`src/lib/catalog/catalog.ts`)

```typescript
return db.catalogItem.upsert({
  where: { projectId_normalizedName: { projectId: input.projectId, normalizedName } },
  update: {},
  create: { projectId: input.projectId, name: displayName, normalizedName },
});
```

Why it matters: one round-trip get-or-create keyed on normalized identity. `update: {}` means an existing article is returned unchanged — the first-typed display name wins. Slice 4 will add flow-back (entry edits updating catalog defaults); Slice 3 only establishes identity.

---

## 5. Architecture contribution

Slice 3 assembled the **mutation model** — the operation funnel every later slice consumes.

Slice 2 established project-scoped authorization (`requireMembership`). Slice 3 extends that chain for list-scoped work:

```
Request (list-scoped)
  └── requireUserId()           ← Slice 1: who you are
        └── requireListAccess() ← Slice 3: resolve list + check project membership
              └── applyOperation() ← Slice 3: the ONLY entry mutation path
                    └── getOrCreateCatalogItem() ← Slice 3: article identity
```

**How later slices connect:**

- **Slice 4 (Catalog + Autocomplete)** extends `getOrCreateCatalogItem` and the catalog model with autocomplete queries and category/unit flow-back from entry edits. The `@@unique([projectId, normalizedName])` constraint and `normalizeName` are already in place.
- **Slice 6 (Completion + Archive)** will set `List.status` to `completed` and populate `completedAt` — columns exist but are never written in Slice 3. List completion reads entries maintained here.
- **Slice 7 (Polling / Sync)** will replay `applyOperation` from client queues and observe deltas via `ListItem.updatedAt`. It must account for: idempotent `add_item`/`remove_item` replays, 404 on stale `update_item`/`check_item`, and deletion observability (no tombstones — pollers need the current item-id set).
- **Phase 2 (Offline)** queues the exact `Operation` shapes defined here; client-generated UUIDs on lists and entries mean offline-created entities merge losslessly on sync.

The catalog stub (`CatalogItem` with get-or-create identity, null defaults) is deliberately minimal — enough for entries to reference article identity and inherit defaults, but autocomplete, favorites, and flow-back wait for Slices 4–5.
