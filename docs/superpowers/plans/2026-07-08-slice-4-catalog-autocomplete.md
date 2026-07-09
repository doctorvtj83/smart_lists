# Slice 4 — Catalog + Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the project's per-project article catalog into working memory — autocomplete new entry names from it, and flow a user-set category/unit back into the catalog default so future lists inherit it.

**Architecture:** Two pure-read + one write-back seam on top of the Slice 3 catalog. `searchCatalog` is a pure read over `CatalogItem` (prefix match on `normalizedName`) exposed both as a core function and a member-level REST endpoint. `flowBackCatalogDefaults` is a small write invoked from inside `applyOperation` whenever an entry gains a concrete category/unit (via `add_item` with explicit values or `update_item` on those fields). The UI gets autocomplete via a native, server-rendered `<datalist>` — no client-side JavaScript — and category/unit "prefill" happens automatically through the existing add-time inheritance path once the catalog default is populated by flow-back.

**Tech Stack:** Next.js (App Router, TypeScript), Prisma ORM against Neon Postgres, Auth.js (NextAuth v5), Vitest. No new dependencies.

## Global Constraints

Copied verbatim from CLAUDE.md and the meta project plan. Every task inherits these.

- **Implementation docs, code identifiers, and code comments: English.** In-app user-facing strings stay **German** (the product is German).
- **Meticulous inline comments** on every function (what + **why**) and every non-obvious line; name the pattern when one is used; never remove or thin existing comments when editing a file.
- **Stable, client-generatable UUIDs** for all entities.
- **Entry-level, idempotent operations** (`add_item`, `update_item`, `check_item`, `remove_item`) are the ONLY mutation path for entries — new catalog side effects must live *inside* `applyOperation`, never as a separate ad-hoc write from a route/UI.
- **Every API operation re-checks membership + role** via the Slice 2/3 guards (`requireMembership` / `requireListAccess`); never trust the client.
- **DB access through an injectable `PrismaClient`** (first parameter of every core function), so logic stays unit-testable in isolation.
- **Test-first (TDD)**, small vertical slices, frequent commits.
- Article-name normalization rule (MVP design §4.4): **lowercase + trim + collapse repeated whitespace** — already implemented as `normalizeName` (`src/lib/catalog/normalize.ts`); reuse it, do not reimplement.
- Existing length caps to reuse (do not redefine): `MAX_ITEM_NAME_LENGTH = 200` (`src/lib/catalog/catalog.ts`), `MAX_TEXT_FIELD_LENGTH = 100` (`src/lib/lists/operations.ts`).
- **Test convention (established in Slices 1–3):** core functions are unit-tested against the Neon test branch (`new PrismaClient()` + `resetDb(db)` in `beforeEach`); route handlers and pages are thin adapters with **no unit tests** — they are verified by `npm run build` + `npm run lint` + a manual browser/curl pass. Follow this split; do not invent route/page tests.

---

## Design decisions locked for this slice

Two product forks were decided with the user before planning; the tasks below implement exactly these:

1. **Autocomplete UI = native server-rendered `<datalist>`.** No client component, no fetch-on-keystroke. The list detail page renders the project's catalog names into a `<datalist>` wired to the name input. Category/unit are NOT prefilled into the input boxes; instead, leaving them blank lets `add_item` inherit the (flowed-back) catalog default — so the category still lands on the created entry.
2. **Flow-back fires on add AND edit, non-null only.** A concrete category/unit set via `add_item` (explicit value) or `update_item` (category/unit field) becomes the catalog default. Clearing a field to `null` NEVER erases the shared default.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/catalog/search.ts` (create) | `CatalogSuggestion` type + `searchCatalog` pure-read autocomplete function. | 1 |
| `src/lib/catalog/search.test.ts` (create) | Unit tests for `searchCatalog` (prefix, blank-browse, lean shape, cap, project isolation). | 1 |
| `src/lib/catalog/catalog.ts` (modify) | Add `CatalogDefaults` + `flowBackCatalogDefaults` write-back helper. | 2 |
| `src/lib/catalog/catalog.test.ts` (modify) | Unit tests for `flowBackCatalogDefaults`. | 2 |
| `src/lib/lists/operations.ts` (modify) | Call `flowBackCatalogDefaults` from `add_item` (explicit values) and `update_item` (category/unit). | 3 |
| `src/lib/lists/operations.test.ts` (modify) | Tests for the flow-back wiring inside `applyOperation`. | 3 |
| `src/app/api/projects/[projectId]/catalog/route.ts` (create) | `GET` member-level autocomplete endpoint over `searchCatalog`. | 4 |
| `src/app/lists/[listId]/page.tsx` (modify) | Load catalog suggestions; render `<datalist>`; wire the name input to it. | 5 |
| `docs/implementation-reviews/slice-4-catalog-autocomplete.md` (create) | Per-slice implementation review (Definition of Done). | 6 |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` (modify) | Flip Slice 4 status to ✅, add progress-log entry. | 6 |

---

### Task 1: `searchCatalog` — the autocomplete read function

**Files:**
- Create: `src/lib/catalog/search.ts`
- Test: `src/lib/catalog/search.test.ts`

**Interfaces:**
- Consumes: `normalizeName` from `src/lib/catalog/normalize.ts`; `PrismaClient`, `CatalogItem` from `@prisma/client`; `resetDb` from `src/test/reset-db.ts`; `getOrCreateCatalogItem` from `./catalog` (test setup only).
- Produces:
  - `export const CATALOG_SEARCH_LIMIT = 20`
  - `export interface CatalogSuggestion { id: string; name: string; defaultCategory: string | null; defaultUnit: string | null }`
  - `export async function searchCatalog(db: PrismaClient, projectId: string, query: string, limit?: number): Promise<CatalogSuggestion[]>` — blank query returns the first `limit` articles alphabetically; non-blank returns prefix matches on `normalizedName`, capped at `limit`, mapped to the lean shape.

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalog/search.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "./catalog";
import { searchCatalog } from "./search";

// One shared client for the file (same pattern as the other core tests). resetDb gives every test
// a clean, deterministic catalog.
const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  // A catalog item needs a project to belong to; the user is only the project owner.
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("searchCatalog", () => {
  it("returns items whose normalized name starts with the query (case-insensitive)", async () => {
    await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await getOrCreateCatalogItem(db, { projectId, name: "Milchreis" });
    await getOrCreateCatalogItem(db, { projectId, name: "Brot" });
    const results = await searchCatalog(db, projectId, "MIL"); // upper-case query still matches
    expect(results.map((r) => r.name)).toEqual(["Milch", "Milchreis"]);
  });

  it("returns a lean suggestion shape carrying the catalog defaults", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.catalogItem.update({
      where: { id: item.id },
      data: { defaultCategory: "Kühlregal", defaultUnit: "l" },
    });
    const [result] = await searchCatalog(db, projectId, "Milch");
    // Exactly the four fields autocomplete needs — no projectId/normalizedName/createdAt leak.
    expect(result).toEqual({
      id: item.id,
      name: "Milch",
      defaultCategory: "Kühlregal",
      defaultUnit: "l",
    });
  });

  it("returns all items alphabetically for a blank/whitespace query (browse mode)", async () => {
    await getOrCreateCatalogItem(db, { projectId, name: "Brot" });
    await getOrCreateCatalogItem(db, { projectId, name: "Apfel" });
    const results = await searchCatalog(db, projectId, "   ");
    expect(results.map((r) => r.name)).toEqual(["Apfel", "Brot"]);
  });

  it("caps the number of results at the given limit", async () => {
    for (let i = 0; i < 5; i++) {
      await getOrCreateCatalogItem(db, { projectId, name: `Artikel ${i}` });
    }
    const results = await searchCatalog(db, projectId, "", 3);
    expect(results).toHaveLength(3);
  });

  it("never returns catalog items from another project", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    const results = await searchCatalog(db, projectId, "Milch");
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/catalog/search.test.ts`
Expected: FAIL — `searchCatalog` cannot be imported from `./search` (module does not exist).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/catalog/search.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { normalizeName } from "./normalize";

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
// (browse); a non-blank query returns prefix matches on the normalized name. Matching on
// `normalizedName` (already lowercased) with a normalized query is why "MIL" finds "Milch"
// regardless of the user's casing — no Prisma `mode: "insensitive"` needed.
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
      // Add the prefix filter ONLY when there is a query; a blank query browses everything (capped).
      ...(normalized ? { normalizedName: { startsWith: normalized } } : {}),
    },
    orderBy: { name: "asc" }, // stable, human-friendly ordering for the dropdown
    take: limit, // hard cap — see CATALOG_SEARCH_LIMIT
  });

  // Map to the lean suggestion shape (drop internal columns before they cross a boundary).
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    defaultCategory: item.defaultCategory,
    defaultUnit: item.defaultUnit,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog/search.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/search.ts src/lib/catalog/search.test.ts
git commit -m "feat: searchCatalog autocomplete read over the project catalog"
```

---

### Task 2: `flowBackCatalogDefaults` — the write-back helper

**Files:**
- Modify: `src/lib/catalog/catalog.ts` (append the type + function; do not touch `getOrCreateCatalogItem`)
- Test: `src/lib/catalog/catalog.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `PrismaClient` from `@prisma/client` (already imported in `catalog.ts`).
- Produces:
  - `export interface CatalogDefaults { category?: string | null; unit?: string | null }`
  - `export async function flowBackCatalogDefaults(db: PrismaClient, catalogItemId: string, changes: CatalogDefaults): Promise<void>` — writes ONLY the non-null fields present in `changes` to the catalog item's `defaultCategory` / `defaultUnit`; a call with no concrete value is a no-op (no DB round-trip).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/catalog/catalog.test.ts` (add `flowBackCatalogDefaults` to the existing import from `./catalog`, then add the block below):

```ts
describe("flowBackCatalogDefaults", () => {
  it("sets a concrete category and unit as the catalog default", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await flowBackCatalogDefaults(db, item.id, { category: "Kühlregal", unit: "l" });
    const updated = await db.catalogItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.defaultCategory).toBe("Kühlregal");
    expect(updated.defaultUnit).toBe("l");
  });

  it("does NOT erase an existing default when the value is null (clearing an entry's field)", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await flowBackCatalogDefaults(db, item.id, { category: "Kühlregal" });
    await flowBackCatalogDefaults(db, item.id, { category: null }); // clearing must be ignored
    const updated = await db.catalogItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.defaultCategory).toBe("Kühlregal"); // unchanged — shared memory preserved
  });

  it("updates only the field that carries a concrete value", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await flowBackCatalogDefaults(db, item.id, { category: "Kühlregal", unit: "l" });
    await flowBackCatalogDefaults(db, item.id, { unit: "Liter" }); // category omitted -> untouched
    const updated = await db.catalogItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.defaultCategory).toBe("Kühlregal");
    expect(updated.defaultUnit).toBe("Liter");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/catalog/catalog.test.ts`
Expected: FAIL — `flowBackCatalogDefaults` is not exported from `./catalog`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/catalog/catalog.ts` (below `getOrCreateCatalogItem`):

```ts
// The defaults a catalog article can learn from an entry. Both optional; a field that is
// null/undefined means "no concrete value to flow back" for that field.
export interface CatalogDefaults {
  category?: string | null;
  unit?: string | null;
}

// The category/unit "flow-back" (MVP design §4.4): when a user sets a CONCRETE category/unit on a
// list entry, that value becomes the article's catalog default so future lists inherit it. Called
// from applyOperation (add_item with explicit values, update_item on category/unit). RULE: only
// non-null values flow back — clearing an entry's own field must NEVER erase the project's shared
// catalog memory (a decision locked for this slice).
export async function flowBackCatalogDefaults(
  db: PrismaClient,
  catalogItemId: string,
  changes: CatalogDefaults,
): Promise<void> {
  // Build a sparse update: include a column ONLY when a concrete (non-null) value was supplied.
  const data: { defaultCategory?: string; defaultUnit?: string } = {};
  // `!= null` (loose) catches BOTH null (explicit clear) and undefined (field not touched) in one check.
  if (changes.category != null) data.defaultCategory = changes.category;
  if (changes.unit != null) data.defaultUnit = changes.unit;

  // Nothing concrete to write (both omitted/cleared) -> skip the DB round-trip entirely.
  if (Object.keys(data).length === 0) return;

  await db.catalogItem.update({ where: { id: catalogItemId }, data });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/catalog/catalog.test.ts`
Expected: PASS (existing 5 + 3 new = 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/catalog.ts src/lib/catalog/catalog.test.ts
git commit -m "feat: flowBackCatalogDefaults writes user-set category/unit back to the catalog"
```

---

### Task 3: Wire flow-back into `applyOperation`

**Files:**
- Modify: `src/lib/lists/operations.ts` (import the helper; call it in `add_item` and `update_item`)
- Test: `src/lib/lists/operations.test.ts` (append a `describe("catalog flow-back")` block)

**Interfaces:**
- Consumes: `flowBackCatalogDefaults` from `@/lib/catalog/catalog` (Task 2); the existing `getOrCreateCatalogItem` import stays.
- Produces: no new exported symbols — this task changes the *behavior* of `applyOperation` (existing signature unchanged): after `add_item` creates an entry, a user-supplied concrete category/unit is flowed back; after `update_item` sets `category`/`unit`, that value is flowed back.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/lists/operations.test.ts` (the file already imports `applyOperation`, `randomUUID`, and defines the `addMilk` helper which adds "Milch" with `category: "Kühlregal"`, `unit: "l"`):

```ts
describe("catalog flow-back", () => {
  it("add_item with an explicit category seeds the catalog default", async () => {
    await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Bananen",
      category: "Obst",
    });
    const cat = await db.catalogItem.findFirstOrThrow({
      where: { projectId, normalizedName: "bananen" },
    });
    expect(cat.defaultCategory).toBe("Obst"); // learned from the add-time value
  });

  it("update_item category flows back to the catalog default", async () => {
    const item = await addMilk(); // adds Milch (category "Kühlregal") -> default seeded on add
    await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "category",
      value: "Vorrat",
    });
    const cat = await db.catalogItem.findUniqueOrThrow({ where: { id: item.catalogItemId } });
    expect(cat.defaultCategory).toBe("Vorrat"); // edit overwrites the default (last value wins)
  });

  it("clearing an entry's category does NOT erase the catalog default", async () => {
    const item = await addMilk(); // default becomes "Kühlregal"
    await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "category",
      value: null,
    });
    const cat = await db.catalogItem.findUniqueOrThrow({ where: { id: item.catalogItemId } });
    expect(cat.defaultCategory).toBe("Kühlregal"); // unchanged
  });

  it("a later add of the same article inherits the flowed-back default", async () => {
    const item = await addMilk();
    await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "category",
      value: "Vorrat",
    });
    // Add the same article WITHOUT a category -> inherits the (now updated) catalog default.
    const created = (await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Milch",
    }))!;
    expect(created.category).toBe("Vorrat");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/lists/operations.test.ts`
Expected: FAIL — the flow-back assertions fail (e.g. `cat.defaultCategory` is `null`, not `"Obst"`), because `applyOperation` does not flow back yet.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/lists/operations.ts`, add the import near the existing catalog import (top of file):

```ts
import { flowBackCatalogDefaults, getOrCreateCatalogItem } from "@/lib/catalog/catalog";
```

(Replace the existing `import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";` line with the combined import above.)

In the `add_item` case, replace the final `return db.listItem.create({ ... });` block with a captured variable + flow-back. The existing block is:

```ts
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
```

Replace it with:

```ts
      const created = await db.listItem.create({
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

      // Flow-back (Slice 4, MVP design §4.4): a category/unit the user supplied EXPLICITLY at add
      // time becomes the catalog default, so future lists inherit it. Inherited values arrive here
      // as undefined/null and are skipped by the helper — so this never writes a default back onto
      // itself. Runs only on first creation (replays returned early above), keeping add idempotent.
      await flowBackCatalogDefaults(db, catalogItem.id, {
        category: operation.category,
        unit: operation.unit,
      });
      return created;
```

In the `update_item` case, the block currently ends with a single `return db.listItem.update(...)`. Replace that return statement:

```ts
      // Computed property name ([operation.field]) writes exactly ONE column — the field
      // granularity that Slice 7's per-field last-writer-wins depends on. @updatedAt bumps the
      // LWW timestamp automatically.
      return db.listItem.update({
        where: { id: item.id },
        data: { [operation.field]: operation.value },
      });
```

with:

```ts
      // Computed property name ([operation.field]) writes exactly ONE column — the field
      // granularity that Slice 7's per-field last-writer-wins depends on. @updatedAt bumps the
      // LWW timestamp automatically.
      const updated = await db.listItem.update({
        where: { id: item.id },
        data: { [operation.field]: operation.value },
      });

      // Flow-back (Slice 4): editing an entry's category/unit updates the article's catalog default
      // (MVP design §4.4). Only these two fields flow back — quantity/sortIndex are entry-specific,
      // not catalog memory. The helper ignores a null value, so clearing an entry's field never
      // erases the shared default. `item.catalogItemId` came from the findFirst load above.
      if (operation.field === "category" || operation.field === "unit") {
        await flowBackCatalogDefaults(db, item.catalogItemId, {
          [operation.field]: operation.value as string | null,
        });
      }
      return updated;
```

- [ ] **Step 4: Run the operations tests to verify they pass**

Run: `npx vitest run src/lib/lists/operations.test.ts`
Expected: PASS — all existing operation tests plus the 4 new flow-back tests. (The Slice 3 "inherits category/unit … when not supplied" and "can null out … category" tests still pass: the first adds without a category, so nothing flows back; the second only asserts the entry's own field.)

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — all test files green (Slice 3's 106 + Task 1's 5 + Task 2's 3 + Task 3's 4 = 118 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/lists/operations.ts src/lib/lists/operations.test.ts
git commit -m "feat: flow user-set category/unit back to the catalog from applyOperation"
```

---

### Task 4: `GET /api/projects/:projectId/catalog` — the autocomplete endpoint

**Files:**
- Create: `src/app/api/projects/[projectId]/catalog/route.ts`

**Interfaces:**
- Consumes: `requireUserId` from `@/lib/auth/session`; `requireMembership` from `@/lib/projects/guard`; `toErrorResponse` from `@/lib/http/errors`; `searchCatalog` from `@/lib/catalog/search` (Task 1); `prisma` from `@/lib/db`.
- Produces: `GET` handler returning `200 CatalogSuggestion[]` (JSON). Member-level; non-members get `404` from the guard (project existence stays hidden). No unit test — this is a thin adapter per the established test convention; verified by build + curl.

- [ ] **Step 1: Write the route handler**

Create `src/app/api/projects/[projectId]/catalog/route.ts`:

```ts
/**
 * Route handler for /api/projects/[projectId]/catalog — the autocomplete surface over a project's
 * article catalog (MVP design §4.4, §5).
 *
 * Pattern: thin HTTP adapter — identity → membership guard → core function → response. All the real
 * logic (prefix match, lean shape, cap) lives in searchCatalog, so this file stays trivial and the
 * behavior is unit-tested at the core, not here.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { searchCatalog } from "@/lib/catalog/search";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/catalog?q=<prefix>
 * Autocomplete suggestions for the project's catalog. Member-level.
 * `q` is optional: blank/absent returns the first CATALOG_SEARCH_LIMIT articles alphabetically.
 * Response: 200 CatalogSuggestion[]
 */
export async function GET(request: Request, { params }: Context) {
  try {
    // Identity first — no session means 401 before any data access.
    const userId = await requireUserId();
    const { projectId } = await params;
    // Any member may read the catalog; non-members get 404 (existence hidden), same as lists.
    await requireMembership(prisma, projectId, userId);

    // `q` absent -> "" -> searchCatalog browses (first N alphabetically). searchCatalog normalizes.
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const suggestions = await searchCatalog(prisma, projectId, query);
    return NextResponse.json(suggestions);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/projects/[projectId]/catalog/route.ts"
git commit -m "feat: GET catalog autocomplete endpoint (member-level)"
```

---

### Task 5: List detail UI — `<datalist>` autocomplete on the name input

**Files:**
- Modify: `src/app/lists/[listId]/page.tsx`

**Interfaces:**
- Consumes: `searchCatalog` from `@/lib/lists`… → precisely `@/lib/catalog/search` (Task 1). Reuses the `requireListAccess` result for `projectId` (avoids a second lookup).
- Produces: server-rendered `<datalist id="catalog-suggestions">` populated from the project catalog, with the add-entry name input wired via `list="catalog-suggestions"`. No behavior change to the server actions; category/unit still inherit at add time when left blank.

- [ ] **Step 1: Add the catalog import**

In `src/app/lists/[listId]/page.tsx`, add to the imports (near the other `@/lib` imports):

```ts
import { searchCatalog } from "@/lib/catalog/search";
```

- [ ] **Step 2: Load the catalog suggestions alongside the list**

The page currently runs the guard and discards its result, then reads the list:

```ts
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
```

Replace that whole block with a version that keeps the guard's `projectId` and loads suggestions in parallel:

```ts
  // Guard: same rule as the REST routes. requireListAccess throws (404-style) for non-members,
  // unknown ids, and malformed ids — all of them land back on the projects overview. We KEEP its
  // result this time: it carries projectId, which the catalog read needs (no second list lookup).
  let projectId: string;
  try {
    ({ list: { projectId } } = await requireListAccess(prisma, listId, userId));
  } catch {
    redirect("/projects");
  }

  // Load the list (with items) and the project's catalog suggestions in parallel. The suggestions
  // populate the <datalist> below, giving the name input native autocomplete with zero client JS.
  const [list, suggestions] = await Promise.all([
    getListWithItems(prisma, listId),
    searchCatalog(prisma, projectId, ""), // "" = browse: all articles (capped) for the datalist
  ]);
  // Deleted between guard and read (rare race) — same redirect as an unknown list.
  if (!list) redirect("/projects");

  const groups = groupByCategory(list.items);
```

> Note: `redirect()` throws internally, so `projectId` is guaranteed assigned on any path that reaches the `Promise.all` — TypeScript's definite-assignment is satisfied because the `catch` branch calls `redirect` (which never returns). If the compiler still complains about `projectId` being "used before assigned", initialize it as `let projectId = "";` and the guard overwrites it.

- [ ] **Step 3: Render the `<datalist>` and wire the name input**

The add-entry form currently starts with:

```tsx
      {/* Add-entry form: name is required, the value fields are optional. */}
      <form action={addItem}>
        <input name="name" placeholder="Artikel" aria-label="Artikel" />
```

Replace those two lines (the comment + the name `<input>`) with the datalist + a wired input:

```tsx
      {/* Add-entry form: name is required, the value fields are optional. The name input is wired to
          a native <datalist> (server-rendered from the project catalog) for zero-JS autocomplete —
          MVP design §4.4. Category/unit are left to inherit from the catalog default at add time, so
          leaving them blank still fills them on the created entry (flow-back keeps them current). */}
      <datalist id="catalog-suggestions">
        {suggestions.map((s) => (
          // Only the value is needed — the browser inserts it into the input on selection.
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      <form action={addItem}>
        <input name="name" placeholder="Artikel" aria-label="Artikel" list="catalog-suggestions" />
```

- [ ] **Step 4: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: PASS — clean build, no type errors.

- [ ] **Step 5: Manual browser verification**

Start the dev server (`npm run dev`) and, logged in as an allowlisted member, on a list detail page:
1. Add an entry "Bananen" with category "Obst" → it appears under "Obst".
2. Delete that entry (or not), then start typing "Ban" in the Artikel field → the browser suggests "Bananen" from the `<datalist>`.
3. Pick "Bananen", leave Kategorie blank, submit → the new entry appears **under "Obst"** (category inherited from the flowed-back catalog default).
4. Edit an existing entry's category via the (Slice 3) update path or by re-adding with a different explicit category → confirm a subsequent blank-category add of the same article inherits the newest category.

Record the outcome in the Task 6 review (do not claim success without running these).

- [ ] **Step 6: Commit**

```bash
git add "src/app/lists/[listId]/page.tsx"
git commit -m "feat: datalist autocomplete for entry names on the list detail page"
```

---

### Task 6: Implementation review + meta-plan progress log (Definition of Done)

**Files:**
- Create: `docs/implementation-reviews/slice-4-catalog-autocomplete.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:** none (documentation). This task is part of every slice's Definition of Done (CLAUDE.md "Implementation review" section + meta-plan maintenance guide).

- [ ] **Step 1: Re-run the full verification and capture the real numbers**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Note the exact test count for the review (Slice 3 baseline was 106; this slice adds 5 + 3 + 4 = 12 new → expect 118).

- [ ] **Step 2: Write the implementation review**

Create `docs/implementation-reviews/slice-4-catalog-autocomplete.md` covering the five required sections (written in English):

1. **What was achieved** — the catalog became active memory: autocomplete over `normalizedName` + category/unit flow-back so future lists inherit user-set categories; state whether the slice goal was fully met.
2. **Steps taken** — one line per task (searchCatalog, flowBackCatalogDefaults, applyOperation wiring, GET endpoint, datalist UI, docs), noting the two locked design decisions (server `<datalist>`; flow-back on add+edit, non-null only).
3. **Core components built** — `searchCatalog` / `CatalogSuggestion`, `flowBackCatalogDefaults` / `CatalogDefaults`, the `add_item`/`update_item` flow-back wiring, the catalog GET route, the datalist UI.
4. **Most important lines of code** — quote and explain (a) the `startsWith(normalized)` prefix predicate in `searchCatalog`; (b) the `!= null` sparse-update guard in `flowBackCatalogDefaults` (why clearing must not erase); (c) the `add_item` flow-back call passing raw `operation.category`/`operation.unit` (why inherited values are safely skipped); (d) the `<input … list="catalog-suggestions">` + `<datalist>` wiring (zero-JS autocomplete + inheritance instead of input prefill).
5. **Architecture contribution** — Slice 4 makes the per-project catalog self-improving and is a prerequisite for Slice 5 (Favorites + Suggestions reads the catalog) and the future PWA client (which will call the GET endpoint instead of the datalist).

- [ ] **Step 3: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- In the "8 slices" status table, change the Slice 4 row: set **Plan** to `[2026-07-08-slice-4-catalog-autocomplete.md](2026-07-08-slice-4-catalog-autocomplete.md)` and **Status** to `✅ Done / verified` (drop the `⬜ Open`).
- Add a new progress-log entry at the TOP of the "Progress log" section (newest first), following the template already in the file:

```markdown
### 2026-07-08 — Slice 4: Catalog + Autocomplete — Done
- **Delivered:** `searchCatalog` (prefix match on `normalizedName`, blank=browse, lean `CatalogSuggestion` shape, capped at 20); `flowBackCatalogDefaults` (non-null category/unit → catalog default); flow-back wired into `applyOperation` for `add_item` (explicit values) and `update_item` (category/unit); `GET /api/projects/:id/catalog?q=` member-level autocomplete endpoint; server-rendered `<datalist>` autocomplete on the list detail page (category/unit inherit at add time — no input prefill).
- **Tested:** `npm test` passed (N files, 118 tests — 12 new in Slice 4); `npm run lint` passed; `npm run build` passed cleanly. Manual browser check of datalist autocomplete + category inheritance recorded in the Slice 4 review.
- **Deviations from the plan:** <fill in, or "none">.
- **Follow-up decisions for later slices:**
  - `searchCatalog` (`src/lib/catalog/search.ts`) is the catalog read seam — Slice 5 suggestions and the future PWA client build on it.
  - `flowBackCatalogDefaults` runs INSIDE `applyOperation` only — the catalog default is only ever mutated through the operations funnel (keeps the single mutation path intact for Slice 7 sync).
  - Flow-back is non-null only: clearing an entry's category/unit never erases the catalog default (deliberate — shared project memory).
  - Autocomplete UI is a native `<datalist>` (no client component yet); a fetch-based dropdown with live category/unit prefill remains a possible PWA-polish upgrade (Slice 8), consuming the GET endpoint already built here.
- **Inherited open items:** Slice 5 plan (`docs/superpowers/plans/YYYY-MM-DD-slice-5-favorites-suggestions.md`) to be created per maintenance guide step 3.
- **Commit(s):** <hashes>
```

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-4-catalog-autocomplete.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: Slice 4 implementation review + meta-plan progress log"
```

---

## Self-Review (performed while writing this plan)

**1. Spec coverage** (MVP design §4.4 + build-order item 4 "Catalog + Autocomplete: per-project CatalogItem, normalized_name, autocomplete, category flow-back"):
- Autocomplete over `normalized_name` → Task 1 (`searchCatalog`) + Task 4 (endpoint) + Task 5 (datalist UI). ✅
- Category/unit flow-back on entry edit → Task 2 + Task 3 (`update_item`). ✅
- Category/unit flow-back also on explicit add → Task 3 (`add_item`), per the locked decision. ✅
- New name → new CatalogItem: already delivered in Slice 3 (`getOrCreateCatalogItem`); unchanged here. ✅
- Per-project isolation of the catalog → covered by `searchCatalog` test "never returns items from another project" and the existing `@@unique([projectId, normalizedName])`. ✅
- §7 testable seam "Normalisierung & Katalog-Identität" is exercised by the case-insensitive prefix test. ✅

**2. Placeholder scan:** No TBD/TODO/"add appropriate…" — every code step contains the full code and every test step the full test. The only intentional fill-ins are the review's factual numbers and commit hashes in Task 6, which cannot be known until execution.

**3. Type consistency:** `searchCatalog(db, projectId, query, limit?)` and `CatalogSuggestion` are used identically in Tasks 1, 4, 5. `flowBackCatalogDefaults(db, catalogItemId, CatalogDefaults)` is defined in Task 2 and called with the same signature in Task 3 (both call sites pass a `{ category?, unit? }` object). `CATALOG_SEARCH_LIMIT` is defined once (Task 1) and only referenced. `requireMembership`, `requireUserId`, `toErrorResponse`, `requireListAccess`, `getListWithItems`, `applyOperation` are used exactly as they exist in the Slice 2/3 code.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-slice-4-catalog-autocomplete.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with a two-stage review between tasks. Fast iteration, clean context per task.
2. **Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`, batched with checkpoints for your review.

Which approach?
