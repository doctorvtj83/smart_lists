# Slice 6 — Completion + Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **BUILD ORDER NOTE:** This slice is built **before** Slice 5 (Favorites + Suggestions), even though it is numbered 6. Slice 5's N-of-M statistic reads *completed* lists, which only exist once this slice ships — so building Completion first makes Slice 5 verifiable end-to-end. This slice depends only on Slice 3 (Lists + Entries), which is done. See the meta plan's dependency graph.

**Goal:** Let a member complete a list (manually, and via an "all entries checked" auto-suggestion with undo), stamp `completedAt`, and view completed lists in a per-project archive — feeding the completed-list history that Slice 5's suggestion statistic will read.

**Architecture:** Three small additions to the Slice 3 list core plus two thin lifecycle endpoints and UI. `completeList` / `reopenList` are list-level mutations (like the existing `renameList` / `deleteList`) that flip `List.status` and stamp/clear `List.completedAt`; completion is **idempotent** (re-completing never re-stamps the archive timestamp). `allItemsChecked` is a pure predicate over a list's items that drives the auto-suggest prompt (§7 "Auto-Vorschlag bei vollständig abgehakt"). `listLists` gains an optional status filter so the project page can show active lists under "Listen" and completed lists under "Archiv" (newest-completed first). No schema change — `List.status` and `List.completedAt` already exist (added in Slice 3 for exactly this).

**Tech Stack:** Next.js (App Router, TypeScript), Prisma ORM against Neon Postgres, Auth.js (NextAuth v5), Vitest. No new dependencies, no migration.

## Global Constraints

Copied verbatim from CLAUDE.md and the meta project plan. Every task inherits these.

- **Implementation docs, code identifiers, and code comments: English.** In-app user-facing strings stay **German** (the product is German).
- **Meticulous inline comments** on every function (what + **why**) and every non-obvious line; name the pattern when one is used; never remove or thin existing comments when editing a file.
- **Stable, client-generatable UUIDs** for all entities (offline-prep convention).
- **Entry-level, idempotent operations** (`add_item`/`update_item`/`check_item`/`remove_item`) remain the ONLY mutation path for list **entries**. List **lifecycle** changes (complete/reopen, like rename/delete) are separate list-level mutations — they are not entry operations and do not go through `applyOperation`.
- **Every API operation re-checks membership + role** via `requireListAccess` (which composes the Slice 2 `requireMembership`); never trust the client. Completing/reopening/archiving are **member-level** (permission matrix, MVP design §6: "Liste erstellen/abschließen/löschen" is Owner ✓ / Mitglied ✓).
- **DB access through an injectable `PrismaClient`** (first parameter of every core function), so logic stays unit-testable in isolation.
- **Test-first (TDD)**, small vertical slices, frequent commits.
- **Reuse, do not redefine** existing helpers: `requireListAccess` (`src/lib/lists/access.ts`), `getListWithItems` / `createList` / `renameList` / `deleteList` (`src/lib/lists/lists.ts`), `requireUserId` (`src/lib/auth/session.ts`), `requireMembership` (`src/lib/projects/guard.ts`), `ApiError` / `toErrorResponse` (`src/lib/http/errors.ts`).
- **Test convention (Slices 1–4):** core functions are unit-tested against the Neon test branch (`new PrismaClient()` + `resetDb(db)` in `beforeEach`); route handlers and pages are thin adapters with **no unit tests** — verified by `npm run build` + `npm run lint` + a manual browser pass. Follow this split; do not invent route/page tests.

---

## Design decisions locked for this slice

1. **Completion is idempotent and does not re-stamp `completedAt`.** `completeList` uses an `updateMany` guarded by `status: "active"`, so completing an already-completed list is a no-op that leaves the original archive timestamp intact. This matters because Slice 5 orders the "last M completed lists" window by `completedAt` — a re-stamp would silently reshuffle that window.
2. **Reopen (undo) sets `status = active` and `completedAt = null`.** The auto-suggest prompt's "undo" is just a reopen. A reopened list drops out of the archive and (once Slice 5 exists) out of the statistic window until completed again.
3. **Auto-suggest is a UI prompt, not a separate mutation.** When `allItemsChecked` is true on an active list, the page shows a "Alle Einträge abgehakt — Liste abschließen?" prompt above the ordinary manual "Liste abschließen" button. Both submit the same `completeList` action.
4. **Completed lists stay editable.** The MVP does not require read-only archived lists; enforcing that is out of scope (a possible later polish). A completed list still renders its entry forms; completing is reversible via reopen.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/lists/lists.ts` (modify) | Add `completeList`, `reopenList`, `allItemsChecked`; add optional `status` filter to `listLists`. | 1, 2 |
| `src/lib/lists/lists.test.ts` (modify) | Unit tests for completion/reopen/idempotency, the `allItemsChecked` predicate, and the status filter. | 1, 2 |
| `src/app/api/lists/[listId]/complete/route.ts` (create) | `POST` to complete a list (member-level, idempotent). | 3 |
| `src/app/api/lists/[listId]/reopen/route.ts` (create) | `POST` to reopen (undo) a completed list (member-level). | 3 |
| `src/app/api/projects/[projectId]/lists/route.ts` (modify) | `GET` accepts an optional `?status=active|completed` filter for the archive. | 3 |
| `src/app/lists/[listId]/page.tsx` (modify) | Status banner, manual + auto-suggest completion, and reopen (undo). | 4 |
| `src/app/projects/[projectId]/page.tsx` (modify) | Split "Listen" (active) from a new "Archiv" (completed) section. | 4 |
| `docs/implementation-reviews/slice-6-completion-archive.md` (create) | Per-slice implementation review (Definition of Done). | 5 |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` (modify) | Flip Slice 6 status to ✅, add progress-log entry. | 5 |

---

### Task 1: Completion core — `completeList`, `reopenList`, `allItemsChecked`

**Files:**
- Modify: `src/lib/lists/lists.ts` (append the three functions; add `ListStatus` to the `@prisma/client` import)
- Test: `src/lib/lists/lists.test.ts` (append new `describe` blocks; extend the import)

**Interfaces:**
- Consumes: `List`, `ListStatus`, `PrismaClient` from `@prisma/client`.
- Produces:
  - `export async function completeList(db: PrismaClient, listId: string): Promise<List>` — marks an active list completed and stamps `completedAt = now`; idempotent (already-completed lists keep their timestamp). Returns the current list row.
  - `export async function reopenList(db: PrismaClient, listId: string): Promise<List>` — sets `status = active`, `completedAt = null`.
  - `export function allItemsChecked(items: { checked: boolean }[]): boolean` — true iff the list has at least one entry and every entry is `checked` (the auto-suggest predicate). Pure, synchronous.

- [ ] **Step 1: Write the failing test**

In `src/lib/lists/lists.test.ts`, extend the import on line 4 to add the three new functions:

```ts
import {
  allItemsChecked,
  completeList,
  createList,
  deleteList,
  getListWithItems,
  listLists,
  renameList,
  reopenList,
} from "./lists";
```

Then append these blocks at the end of the file:

```ts
describe("completeList", () => {
  it("marks an active list completed and stamps completedAt", async () => {
    const list = await createList(db, { projectId, name: "Einkauf" });
    const completed = await completeList(db, list.id);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it("is idempotent: re-completing does NOT re-stamp completedAt", async () => {
    const list = await createList(db, { projectId, name: "Einkauf" });
    await completeList(db, list.id);
    // Force a known past timestamp, then complete again: the status guard must skip the write, so
    // the timestamp Slice 5 orders by is preserved.
    const past = new Date("2020-01-01T00:00:00.000Z");
    await db.list.update({ where: { id: list.id }, data: { completedAt: past } });
    const again = await completeList(db, list.id);
    expect(again.completedAt).toEqual(past); // unchanged — not re-stamped to "now"
  });
});

describe("reopenList", () => {
  it("reopens a completed list (undo): status active, completedAt cleared", async () => {
    const list = await createList(db, { projectId, name: "Einkauf" });
    await completeList(db, list.id);
    const reopened = await reopenList(db, list.id);
    expect(reopened.status).toBe("active");
    expect(reopened.completedAt).toBeNull();
  });
});

describe("allItemsChecked", () => {
  it("is false for a list with no entries (nothing to complete)", () => {
    expect(allItemsChecked([])).toBe(false);
  });

  it("is false when at least one entry is unchecked", () => {
    expect(allItemsChecked([{ checked: true }, { checked: false }])).toBe(false);
  });

  it("is true when the list has entries and all are checked", () => {
    expect(allItemsChecked([{ checked: true }, { checked: true }])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/lists/lists.test.ts`
Expected: FAIL — `completeList` / `reopenList` / `allItemsChecked` cannot be imported from `./lists` (not exported yet).

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/lists/lists.ts`, extend the type import on line 1 to include `ListStatus`:

```ts
import type { CatalogItem, List, ListItem, ListStatus, PrismaClient } from "@prisma/client";
```

Then append these functions at the end of the file (below `deleteList`):

```ts
// Marks a list as completed (MVP design §4.6, "Abschließen"). List-level lifecycle mutation — NOT an
// entry operation — so it lives here beside renameList/deleteList, not in the operations funnel.
//
// IDEMPOTENCY (locked decision): the write is guarded by `status: "active"`, so completing an
// already-completed list changes nothing and, crucially, does NOT re-stamp completedAt. Slice 5
// orders the "last M completed lists" window by completedAt, so a re-stamp would silently reshuffle
// that window. updateMany (not update) tolerates the guarded no-match without throwing.
export async function completeList(db: PrismaClient, listId: string): Promise<List> {
  await db.list.updateMany({
    where: { id: listId, status: "active" }, // only an active list transitions (idempotent guard)
    data: { status: "completed", completedAt: new Date() },
  });
  // Return the current row whether we just completed it or it was already completed. findUniqueOrThrow
  // is safe: the caller has already resolved the list via requireListAccess, so it exists.
  return db.list.findUniqueOrThrow({ where: { id: listId } });
}

// Reopens a completed list — the "undo" of the auto-suggest prompt (MVP design §4.6, "mit Undo").
// Clears completedAt so the list leaves the archive (and, once Slice 5 ships, the statistic window)
// until it is completed again.
export async function reopenList(db: PrismaClient, listId: string): Promise<List> {
  return db.list.update({
    where: { id: listId },
    data: { status: "active", completedAt: null },
  });
}

// Pure predicate: are ALL of a list's entries checked (and is there at least one)? Drives the
// auto-suggest completion prompt (§7 "Auto-Vorschlag bei vollständig abgehakt"). Kept pure and
// synchronous — it takes just the checked flags — so the UI can call it on already-loaded items and
// it is trivially unit-testable without a DB. An EMPTY list is deliberately NOT "all checked": there
// is nothing to complete, so we must not nag the user to finish an empty list.
export function allItemsChecked(items: { checked: boolean }[]): boolean {
  return items.length > 0 && items.every((item) => item.checked);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/lists/lists.test.ts`
Expected: PASS — existing list tests plus the 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/lists.ts src/lib/lists/lists.test.ts
git commit -m "feat: completeList/reopenList (idempotent) + allItemsChecked predicate"
```

---

### Task 2: Archive split — optional `status` filter on `listLists`

**Files:**
- Modify: `src/lib/lists/lists.ts` (extend `listLists` with an optional status filter)
- Test: `src/lib/lists/lists.test.ts` (append cases to the existing `describe("listLists")`)

**Interfaces:**
- Consumes: `ListStatus` from `@prisma/client` (imported in Task 1).
- Produces:
  - `export async function listLists(db: PrismaClient, projectId: string, status?: ListStatus): Promise<List[]>` — no `status` returns ALL lists newest-created first (unchanged behavior, backward compatible with the existing GET route); `status: "active"` returns active lists newest-created first; `status: "completed"` returns completed lists newest-**completed** first (archive ordering).

- [ ] **Step 1: Write the failing test**

Append these two cases inside the existing `describe("listLists", () => { … })` block in `src/lib/lists/lists.test.ts` (after the current "returns only this project's lists, newest first" test):

```ts
  it("filters to active lists when status='active'", async () => {
    const active = await createList(db, { projectId, name: "Offen" });
    const done = await createList(db, { projectId, name: "Fertig" });
    await completeList(db, done.id);
    const lists = await listLists(db, projectId, "active");
    expect(lists.map((l) => l.name)).toEqual(["Offen"]);
    expect(active.id).toBeTruthy(); // (created above; referenced to satisfy the linter)
  });

  it("returns completed lists newest-completed first when status='completed'", async () => {
    const first = await createList(db, { projectId, name: "Zuerst" });
    const second = await createList(db, { projectId, name: "Danach" });
    await completeList(db, first.id);
    // Force a later completedAt on `second` so the desc ordering is deterministic.
    await db.list.update({
      where: { id: second.id },
      data: { status: "completed", completedAt: new Date(Date.now() + 60_000) },
    });
    const archived = await listLists(db, projectId, "completed");
    expect(archived.map((l) => l.name)).toEqual(["Danach", "Zuerst"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/lists/lists.test.ts`
Expected: FAIL — `listLists` ignores the third argument and (for the completed case) does not order by `completedAt`.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/lists/lists.ts`, replace the existing `listLists` function:

```ts
// All lists of a project, newest first: on a phone you almost always want the list you just
// created or used most recently at the top. (Slice 6 will split active vs. archived views.)
export async function listLists(db: PrismaClient, projectId: string): Promise<List[]> {
  return db.list.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
}
```

with:

```ts
// All lists of a project, optionally filtered by lifecycle status (Slice 6 archive split).
// - no status  -> every list, newest-CREATED first (unchanged behavior; the REST collection default).
// - "active"   -> open lists, newest-created first (what you're working on sits on top).
// - "completed"-> the archive, newest-COMPLETED first (recently finished lists on top) — a different
//   sort key on purpose, because for archived lists the meaningful recency is when they were closed.
export async function listLists(
  db: PrismaClient,
  projectId: string,
  status?: ListStatus,
): Promise<List[]> {
  return db.list.findMany({
    // Spread the status filter only when one is given, so the no-arg call still returns everything.
    where: { projectId, ...(status ? { status } : {}) },
    // Completed lists sort by completedAt (archive recency); everything else by createdAt.
    orderBy: status === "completed" ? { completedAt: "desc" } : { createdAt: "desc" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/lists/lists.test.ts`
Expected: PASS — including the pre-existing no-arg "newest first" test (still valid) and the two new filter cases.

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — all files green (Slice 4 baseline 118 + Task 1's 6 + Task 2's 2 = 126; confirm the exact number at execution).

- [ ] **Step 6: Commit**

```bash
git add src/lib/lists/lists.ts src/lib/lists/lists.test.ts
git commit -m "feat: listLists status filter (active vs. archived, archive by completedAt)"
```

---

### Task 3: REST endpoints — complete, reopen, and the archive filter

**Files:**
- Create: `src/app/api/lists/[listId]/complete/route.ts`
- Create: `src/app/api/lists/[listId]/reopen/route.ts`
- Modify: `src/app/api/projects/[projectId]/lists/route.ts` (GET honors `?status=`)

**Interfaces:**
- Consumes: `requireUserId`, `requireListAccess`, `requireMembership`, `toErrorResponse`, `prisma`, and the Task 1/2 core (`completeList`, `reopenList`, `listLists`).
- Produces: `POST /api/lists/:listId/complete` → 200 List; `POST /api/lists/:listId/reopen` → 200 List; `GET /api/projects/:projectId/lists?status=active|completed` → 200 List[] filtered. All member-level. No unit tests — thin adapters; verified by lint + build.

- [ ] **Step 1: Create the complete route**

Create `src/app/api/lists/[listId]/complete/route.ts`:

```ts
/**
 * Route handler for /api/lists/[listId]/complete — mark a list completed (MVP design §4.6).
 *
 * A dedicated action sub-route (like /ops) rather than overloading PATCH: completing is a lifecycle
 * transition, not a field edit. Member-level (permission matrix §6: every member may complete a
 * list); non-members / unknown / malformed ids get 404 from requireListAccess.
 *
 * Pattern: thin HTTP adapter — identity → list-access guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { completeList } from "@/lib/lists/lists";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * POST /api/lists/:listId/complete
 * Marks the list completed (idempotent). Member-level.
 * Response: 200 List
 */
export async function POST(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    // Guard resolves the list AND checks membership in its project (404 for both failure modes).
    await requireListAccess(prisma, listId, userId);
    const list = await completeList(prisma, listId);
    return NextResponse.json(list);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Create the reopen route**

Create `src/app/api/lists/[listId]/reopen/route.ts`:

```ts
/**
 * Route handler for /api/lists/[listId]/reopen — undo completion (MVP design §4.6, "mit Undo").
 *
 * Member-level; non-members / unknown / malformed ids get 404 from requireListAccess.
 *
 * Pattern: thin HTTP adapter — identity → list-access guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { reopenList } from "@/lib/lists/lists";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * POST /api/lists/:listId/reopen
 * Reopens a completed list (status active, completedAt cleared). Member-level.
 * Response: 200 List
 */
export async function POST(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    await requireListAccess(prisma, listId, userId);
    const list = await reopenList(prisma, listId);
    return NextResponse.json(list);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 3: Let the lists GET honor `?status=`**

In `src/app/api/projects/[projectId]/lists/route.ts`, replace the existing `GET` handler:

```ts
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
```

with (note the first parameter changes from `_request` to `request` because we now read the query string):

```ts
export async function GET(request: Request, { params }: Context) {
  try {
    // Identity first — no session means 401 before any data access.
    const userId = await requireUserId();
    const { projectId } = await params;
    // Any member may read; non-members get 404 (existence hidden).
    await requireMembership(prisma, projectId, userId);

    // Optional ?status=active|completed filter (Slice 6 archive). Anything else (or absent) means
    // "all lists" — listLists ignores an undefined status. We only forward the two valid values so a
    // junk query can never reach the enum column.
    const statusParam = new URL(request.url).searchParams.get("status");
    const status =
      statusParam === "active" || statusParam === "completed" ? statusParam : undefined;

    const lists = await listLists(prisma, projectId, status);
    return NextResponse.json(lists);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npm run lint && npm run build`
Expected: PASS — no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/lists/[listId]/complete" "src/app/api/lists/[listId]/reopen" "src/app/api/projects/[projectId]/lists/route.ts"
git commit -m "feat: complete/reopen endpoints + ?status archive filter on lists GET"
```

---

### Task 4: UI — completion + auto-suggest on the list page, Archiv on the project page

**Files:**
- Modify: `src/app/lists/[listId]/page.tsx`
- Modify: `src/app/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `completeList`, `reopenList`, `allItemsChecked`, `listLists` from `@/lib/lists/lists`; existing `requireListAccess`, `auth`, `prisma`, `revalidatePath`, `redirect`, `Link`.
- Produces: on the list page, a status banner + manual "Liste abschließen" button + an "all checked" auto-suggest prompt + a "Wieder öffnen" (undo) button; on the project page, the "Listen" section shows only active lists and a new "Archiv" section shows completed lists (newest-completed first). No unit tests — verified by build + manual pass.

- [ ] **Step 1: List page — import the completion core**

In `src/app/lists/[listId]/page.tsx`, replace the existing lists import:

```ts
import { deleteList, getListWithItems, type ListWithItems } from "@/lib/lists/lists";
```

with:

```ts
import {
  allItemsChecked,
  completeList,
  deleteList,
  getListWithItems,
  type ListWithItems,
  reopenList,
} from "@/lib/lists/lists";
```

- [ ] **Step 2: List page — add the complete/reopen server actions**

Directly after the existing `removeItem` action (and before `removeList`), add:

```ts
  // Complete the list (member-level). Manual completion AND the auto-suggest prompt both submit
  // this action (MVP design §4.6). completeList is idempotent, so a double submit is harmless.
  async function completeListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await completeList(prisma, l.id);
    revalidatePath(`/lists/${listId}`);
  }

  // Reopen the list — the "undo" of completion (MVP design §4.6, "mit Undo"). Member-level.
  async function reopenListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await reopenList(prisma, l.id);
    revalidatePath(`/lists/${listId}`);
  }
```

- [ ] **Step 3: List page — compute the completion flags**

The component currently has, just before `return (`:

```ts
  const groups = groupByCategory(list.items);
```

Add two derived flags right after it:

```ts
  const groups = groupByCategory(list.items);

  // Completion UI state. `isCompleted` switches the banner between "abschließen" and "wieder öffnen".
  // `suggestComplete` is the auto-suggest trigger: all entries checked on a still-open list — the
  // cue to prompt the user to finish it (MVP design §4.6). Both are derived, not stored.
  const isCompleted = list.status === "completed";
  const suggestComplete = !isCompleted && allItemsChecked(list.items);
```

- [ ] **Step 4: List page — render the completion controls**

The header currently reads:

```tsx
      <h1>{list.name}</h1>

      {/* Add-entry form: name is required, the value fields are optional. The name input is wired to
```

Insert the completion section between the `<h1>` and that add-entry comment:

```tsx
      <h1>{list.name}</h1>

      {/* Completion controls (Slice 6, MVP design §4.6). A completed list shows an archive banner +
          undo; an open list shows the manual "abschließen" button, preceded by an auto-suggest
          prompt once every entry is checked. */}
      {isCompleted ? (
        <section>
          <p>
            ✓ Abgeschlossen
            {list.completedAt ? ` am ${list.completedAt.toLocaleDateString("de-DE")}` : ""}
          </p>
          <form action={reopenListAction}>
            <button type="submit">Wieder öffnen</button>
          </form>
        </section>
      ) : (
        <section>
          {/* Auto-suggest: shown only when all entries are checked (never on an empty list). */}
          {suggestComplete && <p>Alle Einträge sind abgehakt. Liste abschließen?</p>}
          <form action={completeListAction}>
            <button type="submit">Liste abschließen</button>
          </form>
        </section>
      )}

      {/* Add-entry form: name is required, the value fields are optional. The name input is wired to
```

- [ ] **Step 5: Project page — split active lists from the archive**

In `src/app/projects/[projectId]/page.tsx`, replace the existing parallel read block:

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
  const [project, members, activeLists, archivedLists] = await Promise.all([
    getProject(prisma, projectId),
    listMembers(prisma, projectId),
    // Slice 6: split the project's lists into the working set ("Listen") and the archive ("Archiv").
    // Active = newest-created first; archive = newest-completed first (see listLists).
    listLists(prisma, projectId, "active"),
    listLists(prisma, projectId, "completed"),
  ]);
```

Then, in the JSX, the "Listen" section currently maps `lists`:

```tsx
      <ul>
        {lists.map((l) => (
          <li key={l.id}>
            <Link href={`/lists/${l.id}`}>{l.name}</Link>
          </li>
        ))}
      </ul>
```

Replace it with the active-lists map plus a conditional "Archiv" section:

```tsx
      <ul>
        {activeLists.map((l) => (
          <li key={l.id}>
            <Link href={`/lists/${l.id}`}>{l.name}</Link>
          </li>
        ))}
      </ul>

      {/* Slice 6: the archive of completed lists. Rendered only when non-empty so an all-active
          project shows no empty heading. Completed lists stay visible (and feed Slice 5's statistic)
          until deleted (MVP design §4.6). */}
      {archivedLists.length > 0 && (
        <>
          <h2>Archiv</h2>
          <ul>
            {archivedLists.map((l) => (
              <li key={l.id}>
                <Link href={`/lists/${l.id}`}>{l.name}</Link>
                {l.completedAt ? ` (${l.completedAt.toLocaleDateString("de-DE")})` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
```

- [ ] **Step 6: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: PASS — clean build, no type errors.

- [ ] **Step 7: Manual browser verification**

Start the dev server (`npm run dev`) and, logged in as an allowlisted member:
1. Open a list with a few entries → "Liste abschließen" button is visible; no auto-suggest prompt while any entry is unchecked.
2. Check every entry → the "Alle Einträge sind abgehakt. Liste abschließen?" prompt appears above the button.
3. Click "Liste abschließen" → the page now shows "✓ Abgeschlossen am <date>" and a "Wieder öffnen" button; the entry list still renders.
4. Go back to the project page → the list is gone from "Listen" and appears under "Archiv" with its completion date.
5. Open the archived list, click "Wieder öffnen" → it returns to active; back on the project page it is under "Listen" again and out of "Archiv".

Record the outcome in the Task 5 review; do not claim success without running these.

- [ ] **Step 8: Commit**

```bash
git add "src/app/lists/[listId]/page.tsx" "src/app/projects/[projectId]/page.tsx"
git commit -m "feat: list completion + auto-suggest UI and project archive section"
```

---

### Task 5: Implementation review + meta-plan progress log (Definition of Done)

**Files:**
- Create: `docs/implementation-reviews/slice-6-completion-archive.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:** none (documentation). Part of every slice's Definition of Done.

- [ ] **Step 1: Re-run the full verification and capture the real numbers**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Note the exact test count (Slice 4 baseline 118; this slice adds 6 + 2 = 8 new → expect 126).

- [ ] **Step 2: Write the implementation review**

Create `docs/implementation-reviews/slice-6-completion-archive.md` covering the five required sections (English):

1. **What was achieved** — manual + auto-suggested list completion with undo, `completedAt` stamping, and a per-project archive; state that the slice goal was met and that it unblocks Slice 5's statistic.
2. **Steps taken** — one line per task (completion core, archive filter, endpoints, UI, docs), noting the locked decisions (idempotent completion; reopen clears the timestamp; auto-suggest is a UI prompt).
3. **Core components built** — `completeList`/`reopenList`/`allItemsChecked`; the `listLists` status filter; the complete/reopen routes + the `?status` archive filter; the list-page completion UI and project-page Archiv section.
4. **Most important lines of code** — quote and explain (a) the `updateMany({ where: { status: "active" } })` idempotency guard in `completeList` (why it protects Slice 5's window ordering); (b) `items.length > 0 && items.every(...)` in `allItemsChecked` (why an empty list is not "all checked"); (c) the conditional `orderBy` in `listLists` (why archive sorts by completedAt); (d) the `suggestComplete` derivation on the list page (why auto-suggest is derived state, not stored).
5. **Architecture contribution** — Slice 6 assembles the list lifecycle + archive and produces the completed-list history that Slice 5 (built next) reads; notes that Slice 7 sync will later need to include `status`/`completedAt` in its list delta.

- [ ] **Step 3: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- In the "8 slices" status table, set the Slice 6 row **Status** to `✅ Done / verified` (its **Plan** column should already link `2026-07-20-slice-6-completion-archive.md`; add it if not).
- Add a new progress-log entry at the TOP of the "Progress log" section (newest first):

```markdown
### 2026-07-20 — Slice 6: Completion + Archive — Done
- **Delivered:** `completeList` (idempotent, stamps completedAt), `reopenList` (undo, clears it), `allItemsChecked` predicate; `listLists` optional status filter (active by createdAt, archive by completedAt); `POST /api/lists/:id/complete` + `/reopen` endpoints; `?status=` filter on the lists GET; list-page completion UI (manual + auto-suggest prompt + undo) and project-page "Archiv" section.
- **Tested:** `npm test` passed (N files, 126 tests — 8 new in Slice 6); `npm run lint` + `npm run build` passed cleanly. Manual browser check of complete → archive → reopen: <fill in>.
- **Deviations from the plan:** <fill in, or "none">.
- **Follow-up decisions for later slices:**
  - Completion is idempotent and never re-stamps completedAt — Slice 5 may rely on a stable "last M completed" ordering.
  - List lifecycle changes (complete/reopen) are list-level mutations, NOT entry operations; Slice 7's delta must surface `status`/`completedAt` changes separately from the entry ops.
  - Completed lists remain editable (read-only archive was intentionally out of scope) — revisit if needed.
- **Inherited open items:** Slice 5 plan (`docs/superpowers/plans/2026-07-20-slice-5-favorites-suggestions.md`) is written and ready; its statistic is now live because completed lists exist. Reconcile Slice 5's project-page edits against this slice's changes to the same file (see that plan's header note).
- **Commit(s):** <hashes>
```

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-6-completion-archive.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: Slice 6 implementation review + meta-plan progress log"
```

---

## Self-Review (performed while writing this plan)

**1. Spec coverage** (MVP design §2, §4.6, §7 "Abschluss-Logik"; build-order item 6 "Completion + Archive: complete a list (manual + auto-suggest when all checked), archive view"):
- Manual completion → Task 1 (`completeList`) + Task 3 (endpoint) + Task 4 (button). ✅
- Auto-suggest when all entries checked → Task 1 (`allItemsChecked`) + Task 4 (prompt). ✅
- Undo → Task 1 (`reopenList`) + Task 3 + Task 4 (button). ✅
- `completedAt` stamped, archive stays visible until deleted → Task 1 (stamp) + Task 2 (archive query) + Task 4 (Archiv section). ✅
- Completed lists feed the statistic (§4.3) → guaranteed by the idempotent, stable `completedAt` (locked decision #1); consumed by Slice 5. ✅
- Member-level permission (matrix §6) → `requireListAccess` in every endpoint (Task 3) and action (Task 4). ✅

**2. Placeholder scan:** No TBD/TODO/"add appropriate…". Every code step contains full code; every test step full tests. The only intentional fill-ins are the review's factual test count, manual-check outcome, deviations, and commit hashes in Task 5 — unknowable before execution.

**3. Type consistency:** `completeList(db, listId): Promise<List>`, `reopenList(db, listId): Promise<List>`, and `allItemsChecked(items: { checked: boolean }[]): boolean` are defined in Task 1 and used with the same signatures in Tasks 3 and 4. `listLists(db, projectId, status?: ListStatus)` (Task 2) is called as `listLists(prisma, projectId)` (unchanged GET default), `listLists(prisma, projectId, status)` (Task 3 route), and `listLists(prisma, projectId, "active" | "completed")` (Task 4 page). `ListStatus` is the existing Prisma enum. `list.status` / `list.completedAt` are existing `List` fields (Slice 3 schema). Existing helpers (`requireListAccess`, `requireMembership`, `requireUserId`, `toErrorResponse`, `getListWithItems`) are used exactly as in Slices 2–4.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-slice-6-completion-archive.md`. **Build this slice before Slice 5.** Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with a two-stage review between tasks. Fast iteration, clean context per task.
2. **Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`, batched with checkpoints for your review.

Which approach?
