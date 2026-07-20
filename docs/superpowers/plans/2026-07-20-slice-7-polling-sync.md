# Slice 7 — Polling / Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **BUILD ORDER NOTE:** In the meta plan's dependency graph, **Slice 7 hangs off Slice 3 only** ("Slices 6 + 7 hang off 3") — it does **not** require Slices 5 or 6. It is written against the current built state (Slice 4). It layers on top of Slices 5/6 cleanly if those already shipped: it only **adds** a read function, a GET endpoint, one client component, and two derived constants + one child element on the list page (see the reconciliation note in Task 4). No existing behavior changes.

**Goal:** Make another member's edits to an open list appear automatically — a cursor-based delta endpoint plus a lightweight client poller (~2 s) that refreshes the list when entries are added, changed, checked, removed, or the list is renamed/completed elsewhere.

**Architecture:** One new read function, `getListDelta`, returns a compact, JSON-serializable snapshot of a list: the full current entry-id set (so deletions are observable even though `remove_item` leaves no tombstone), the entry bodies that changed since a cursor (`ListItem.updatedAt` in epoch-ms), the list's metadata, and the next cursor. A thin `GET /api/lists/:listId/delta?since=<ms>` endpoint exposes it (member-level). A `"use client"` `ListSyncPoller` component — the project's first client component — polls that endpoint on an interval and, when the delta differs from the truth already on screen, calls `router.refresh()` to re-pull the server-rendered list. **Last-writer-wins is already enforced server-side** by the single-column, `@updatedAt`-stamped writes in `applyOperation` (Slice 3); Slice 7's job is only to make remote writes *visible*. There is deliberately **no** client-side entry store, optimistic UI, or offline queue — that is Phase 2 (MVP design §4.5). No schema change, no migration.

**Tech Stack:** Next.js (App Router, TypeScript), Prisma ORM against Neon Postgres, Auth.js (NextAuth v5), Vitest. No new dependencies, no migration.

## Global Constraints

Copied verbatim from CLAUDE.md and the meta project plan. Every task inherits these.

- **Implementation docs, code identifiers, and code comments: English.** In-app user-facing strings stay **German** (the product is German).
- **Meticulous inline comments** on every function (what + **why**) and every non-obvious line; name the pattern when one is used; never remove or thin existing comments when editing a file.
- **Stable, client-generatable UUIDs** for all entities (offline-prep convention).
- **Entry-level, idempotent operations** (`add_item`/`update_item`/`check_item`/`remove_item`) remain the ONLY mutation path for list entries via `applyOperation`. Slice 7 is **read-only sync** — it adds a delta *read* and a poller; it never introduces a new write path. The delta endpoint MUST be a `GET` (no side effects).
- **Every API operation re-checks membership + role** via `requireListAccess` (which composes the Slice 2 `requireMembership`); never trust the client. Reading the delta is **member-level** (permission matrix, MVP design §6: any member may read a list); non-members / unknown / malformed ids get a 404 from `requireListAccess`.
- **DB access through an injectable `PrismaClient`** (first parameter of every core function), so logic stays unit-testable in isolation.
- **Test-first (TDD)**, small vertical slices, frequent commits.
- **Reuse, do not redefine** existing helpers: `requireListAccess` (`src/lib/lists/access.ts`), `getListWithItems` (`src/lib/lists/lists.ts`), `applyOperation` (`src/lib/lists/operations.ts`), `requireUserId` (`src/lib/auth/session.ts`), `requireMembership` (`src/lib/projects/guard.ts`), `ApiError` / `toErrorResponse` (`src/lib/http/errors.ts`).
- **Test convention (Slices 1–4):** core functions are unit-tested against the Neon test branch (`new PrismaClient()` + `resetDb(db)` in `beforeEach`); route handlers and pages/client components are thin adapters with **no unit tests** — verified by `npm run build` + `npm run lint` + a manual browser pass. Follow this split; do not invent route/component tests.

---

## Design decisions locked for this slice

1. **The cursor is the max `ListItem.updatedAt` in epoch-milliseconds.** `ListItem.updatedAt` is the `@updatedAt`-managed last-writer-wins timestamp (schema comment, Slice 3). The client sends it back as `?since=<ms>`; the endpoint returns entry bodies with `updatedAt > since`. Epoch-ms (a plain number) is chosen over an ISO string so the client can compare/store it trivially and it survives JSON without parsing.
2. **Deletions are observed by diffing the full entry-id set, not by tombstones.** `remove_item` hard-deletes the row (Slice 3 follow-up note explicitly hands this to Slice 7). So every delta returns `itemIds` = **all** current entry ids; the client prunes anything it holds that is no longer in that set. Entry *bodies* are the delta (only what changed); the id set is always complete (ids are tiny — this is not a full pull of the entries, satisfying MVP design §8 "Cursor-basiertes Delta … nicht Vollabzug").
3. **List metadata is always returned in full.** `List` has **no** `updatedAt` column, so rename/complete/reopen cannot be timestamped. The metadata (`name`, `status`, `completedAt`) is one tiny row, so the delta always includes it and the client compares values directly to detect a change.
4. **Last-writer-wins lives server-side; Slice 7 adds no merge.** Two writes to the same field of the same entry resolve LWW automatically because `applyOperation` writes exactly one column and `@updatedAt` stamps it — the later write wins the column (MVP design §4.5). Online, there is no divergent client state to merge, so the poller just re-pulls server truth. A client-side store + offline queue that would need a real merge is Phase 2 — out of scope.
5. **The client refreshes the server component; it does not maintain its own entry store.** `ListSyncPoller` calls `router.refresh()` (an RSC re-fetch, not a full page reload) when the delta differs from what is on screen. This keeps the existing zero-client-state, server-action UI intact and adds sync with the smallest possible surface. A richer client store with optimistic updates is a possible Slice 8 / Phase 2 upgrade that would consume this same delta endpoint.
6. **Accepted MVP limitation (documented, §8 "letzter gewinnt" simplification):** the cursor is millisecond-precision and the body filter is strict `>`. In the rare case two writes land in the *same* millisecond as the cursor, one field update could be deferred until that entry changes again or the list otherwise refreshes. This never loses adds/deletes (the id-set diff catches those) and never corrupts data; it is acceptable under the MVP's explicit eventual-consistency stance. Do **not** switch the filter to `>=` — that would re-report the boundary item on every poll and cause a refresh loop.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/lists/delta.ts` (create) | `computeCursor` (pure) + `getListDelta` (the delta read function) and its `ListDelta` / `DeltaItem` types. | 1 |
| `src/lib/lists/delta.test.ts` (create) | Unit tests for `computeCursor` and `getListDelta` (baseline, delta window, deletion visibility, cursor monotonicity, check + metadata serialization). | 1 |
| `src/app/api/lists/[listId]/delta/route.ts` (create) | `GET` delta endpoint honoring `?since=<ms>` (member-level, thin adapter). | 2 |
| `src/app/lists/[listId]/ListSyncPoller.tsx` (create) | `"use client"` interval poller that refreshes the page when the delta changes. | 3 |
| `src/app/lists/[listId]/page.tsx` (modify) | Compute the render-time baseline (cursor + id set) and mount `<ListSyncPoller/>`. | 4 |
| `docs/implementation-reviews/slice-7-polling-sync.md` (create) | Per-slice implementation review (Definition of Done). | 5 |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` (modify) | Flip Slice 7 status to ✅, add progress-log entry. | 5 |

---

### Task 1: Delta core — `computeCursor` + `getListDelta`

**Files:**
- Create: `src/lib/lists/delta.ts`
- Test: `src/lib/lists/delta.test.ts`

**Interfaces:**
- Consumes: `CatalogItem`, `ListItem`, `ListStatus`, `PrismaClient` from `@prisma/client`; `applyOperation` from `./operations` (test only, to exercise real mutations).
- Produces:
  - `export interface DeltaItem { id: string; name: string; quantity: number | null; unit: string | null; category: string | null; checked: boolean; sortIndex: number; updatedAt: number }` — a JSON-serializable entry (name resolved from the catalog item; `updatedAt` in epoch-ms).
  - `export interface ListDelta { list: { id: string; name: string; status: ListStatus; completedAt: number | null }; items: DeltaItem[]; itemIds: string[]; cursor: number }`.
  - `export function computeCursor(items: { updatedAt: Date }[], since?: number): number` — the max entry `updatedAt` in epoch-ms, never below `since` (monotonic guard); `0` for an empty set with no `since`. Pure, synchronous.
  - `export async function getListDelta(db: PrismaClient, listId: string, since?: number): Promise<ListDelta>` — loads the list + items, returns changed bodies (`updatedAt > since`; all bodies when `since` is undefined), the full id set, list metadata, and the next cursor. The caller has already authorized access via `requireListAccess`, so this read does not re-check permissions.

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/delta.test.ts`:

```ts
import { PrismaClient, type List } from "@prisma/client";
import { randomUUID } from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { applyOperation } from "./operations";
import { computeCursor, getListDelta } from "./delta";

// Same DB-test setup as operations.test.ts: a real client against the Neon test branch, reset to a
// deterministic baseline before each test, with a fresh user/project/list.
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

// Add one entry through the REAL operations funnel (so updatedAt is stamped exactly as in prod) and
// return its id. Each awaited op does several Neon round-trips, so consecutive adds land in distinct
// milliseconds — the strict `> since` delta window is deterministic here.
async function addItem(name: string): Promise<string> {
  const itemId = randomUUID();
  await applyOperation(db, list, { op: "add_item", itemId, name });
  return itemId;
}

describe("computeCursor", () => {
  it("is 0 for an empty item set (nothing has been updated yet)", () => {
    expect(computeCursor([])).toBe(0);
  });

  it("returns the max updatedAt in epoch ms", () => {
    const a = new Date("2020-01-01T00:00:00.000Z");
    const b = new Date("2021-06-15T12:00:00.000Z");
    expect(computeCursor([{ updatedAt: a }, { updatedAt: b }])).toBe(b.getTime());
  });

  it("never goes below the given `since` (monotonic guard)", () => {
    const old = new Date("2020-01-01T00:00:00.000Z");
    const since = new Date("2021-01-01T00:00:00.000Z").getTime();
    // The newest remaining item is older than `since` (e.g. the newest entry was just deleted) —
    // the cursor must stay at `since`, never move backward.
    expect(computeCursor([{ updatedAt: old }], since)).toBe(since);
  });
});

describe("getListDelta", () => {
  it("baseline (no since): returns every item body, the full id set, and a positive cursor", async () => {
    const id1 = await addItem("Milch");
    const id2 = await addItem("Brot");
    const delta = await getListDelta(db, list.id);
    expect(delta.items.map((i) => i.name).sort()).toEqual(["Brot", "Milch"]);
    expect(delta.itemIds.slice().sort()).toEqual([id1, id2].sort());
    expect(delta.cursor).toBeGreaterThan(0);
    expect(delta.list).toMatchObject({
      id: list.id,
      name: "Einkauf",
      status: "active",
      completedAt: null,
    });
  });

  it("delta (with since): returns only bodies changed after the cursor, but ALWAYS the full id set", async () => {
    const id1 = await addItem("Milch");
    const baseline = await getListDelta(db, list.id); // cursor now covers id1
    const id2 = await addItem("Brot"); // changed AFTER the cursor
    const delta = await getListDelta(db, list.id, baseline.cursor);
    expect(delta.items.map((i) => i.name)).toEqual(["Brot"]); // only the new body
    expect(delta.itemIds.slice().sort()).toEqual([id1, id2].sort()); // but both ids (full set)
  });

  it("makes a deletion observable via a shrunken id set (no tombstone needed)", async () => {
    const id1 = await addItem("Milch");
    const baseline = await getListDelta(db, list.id);
    await applyOperation(db, list, { op: "remove_item", itemId: id1 });
    const delta = await getListDelta(db, list.id, baseline.cursor);
    expect(delta.items).toEqual([]); // nothing NEW changed...
    expect(delta.itemIds).toEqual([]); // ...but the id is gone -> the client prunes it
  });

  it("keeps the cursor monotonic across a deletion-only poll (never moves backward)", async () => {
    await addItem("Milch");
    const first = await getListDelta(db, list.id);
    const id2 = await addItem("Brot");
    const second = await getListDelta(db, list.id, first.cursor);
    await applyOperation(db, list, { op: "remove_item", itemId: id2 }); // remove the NEWEST entry
    const third = await getListDelta(db, list.id, second.cursor);
    expect(third.cursor).toBeGreaterThanOrEqual(second.cursor);
  });

  it("surfaces a check_item change in the delta with checked=true", async () => {
    const id1 = await addItem("Milch");
    const baseline = await getListDelta(db, list.id);
    await applyOperation(db, list, { op: "check_item", itemId: id1, checked: true });
    const delta = await getListDelta(db, list.id, baseline.cursor);
    expect(delta.items).toHaveLength(1);
    expect(delta.items[0]).toMatchObject({ id: id1, checked: true });
  });

  it("serializes list completion metadata as epoch ms", async () => {
    const when = new Date("2022-02-02T00:00:00.000Z");
    await db.list.update({
      where: { id: list.id },
      data: { status: "completed", completedAt: when },
    });
    const delta = await getListDelta(db, list.id);
    expect(delta.list.status).toBe("completed");
    expect(delta.list.completedAt).toBe(when.getTime());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/lists/delta.test.ts`
Expected: FAIL — `computeCursor` / `getListDelta` cannot be imported from `./delta` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/lists/delta.ts`:

```ts
import type { CatalogItem, ListItem, ListStatus, PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// The wire shape of a sync delta (MVP design §4.5 "Polling-Endpunkt liefert Änderungen seit einem
// Cursor"). Everything here is plain JSON — numbers/strings/nulls — so it survives fetch().json()
// on the client with no date parsing.
// ---------------------------------------------------------------------------

// One entry, flattened for the client. The display NAME lives on the catalog item (article identity,
// MVP design §3.1), so we resolve it here; `updatedAt` is epoch-ms (the LWW timestamp, exposed so a
// future client-side store could merge on it — see design decision #4).
export interface DeltaItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
  sortIndex: number;
  updatedAt: number;
}

// A full delta response. `items` is the CHANGED bodies (the actual delta); `itemIds` is EVERY
// current entry id (so the client can detect deletions — see design decision #2); `list` is the
// always-full metadata (List has no updatedAt — decision #3); `cursor` is what to send back as
// ?since next time.
export interface ListDelta {
  list: { id: string; name: string; status: ListStatus; completedAt: number | null };
  items: DeltaItem[];
  itemIds: string[];
  cursor: number;
}

// Flattens a loaded entry (with its catalog item) into the client shape. Kept tiny and separate so
// getListDelta reads cleanly and the mapping lives in one place.
function serializeItem(item: ListItem & { catalogItem: CatalogItem }): DeltaItem {
  return {
    id: item.id,
    name: item.catalogItem.name, // article identity: the name is on the catalog row, not the entry
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    checked: item.checked,
    sortIndex: item.sortIndex,
    updatedAt: item.updatedAt.getTime(), // Date -> epoch-ms for the wire (and the cursor)
  };
}

// The sync cursor: the newest entry `updatedAt` across the given items, in epoch-ms, but NEVER below
// the incoming `since`. The monotonic guard matters because a deletion of the newest entry leaves
// only older rows — without the guard the cursor would move backward and re-send already-seen
// bodies forever. Pure and synchronous, so both getListDelta and the list page (for its render-time
// baseline) compute the cursor the exact same way from already-loaded items (DRY).
export function computeCursor(items: { updatedAt: Date }[], since = 0): number {
  let max = since;
  for (const item of items) max = Math.max(max, item.updatedAt.getTime());
  return max;
}

// Reads a list's sync delta. The caller (route handler / page) has already authorized access via
// requireListAccess, so this function does not re-check membership — it is a pure read. It always
// loads the full list (one tiny row + its items) because it must return the complete id set for
// deletion detection; the `since` filter only trims which entry BODIES are sent, not the id set.
export async function getListDelta(
  db: PrismaClient,
  listId: string,
  since?: number,
): Promise<ListDelta> {
  // findUniqueOrThrow is safe: the caller resolved the list via requireListAccess, so it exists.
  const list = await db.list.findUniqueOrThrow({
    where: { id: listId },
    include: {
      // sortIndex order keeps the returned bodies in the same order the UI renders them.
      items: { include: { catalogItem: true }, orderBy: { sortIndex: "asc" } },
    },
  });

  // Full current id set — the ONLY way the client learns an entry was removed (no tombstones,
  // design decision #2).
  const itemIds = list.items.map((item) => item.id);

  // Changed bodies: strict `> since` (decision #6 — never `>=`, which would loop). No `since` means
  // a baseline pull: send every body.
  const changed =
    since === undefined
      ? list.items
      : list.items.filter((item) => item.updatedAt.getTime() > since);

  return {
    list: {
      id: list.id,
      name: list.name,
      status: list.status,
      completedAt: list.completedAt ? list.completedAt.getTime() : null,
    },
    items: changed.map(serializeItem),
    itemIds,
    cursor: computeCursor(list.items, since),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/lists/delta.test.ts`
Expected: PASS — the 3 `computeCursor` cases and the 6 `getListDelta` cases.

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — all files green (the Slice 7 additions are new files; no existing test changes). Confirm the exact count at execution.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lists/delta.ts src/lib/lists/delta.test.ts
git commit -m "feat: getListDelta + computeCursor (cursor-based list sync delta)"
```

---

### Task 2: REST endpoint — `GET /api/lists/:listId/delta`

**Files:**
- Create: `src/app/api/lists/[listId]/delta/route.ts`

**Interfaces:**
- Consumes: `requireUserId`, `requireListAccess`, `toErrorResponse`, `prisma`, and `getListDelta` (Task 1).
- Produces: `GET /api/lists/:listId/delta?since=<ms>` → `200 ListDelta`. Member-level (404 for non-member / unknown / malformed id). `since` is optional; a missing or non-numeric value means a baseline pull. No unit tests — thin adapter; verified by lint + build.

- [ ] **Step 1: Create the delta route**

Create `src/app/api/lists/[listId]/delta/route.ts`:

```ts
/**
 * Route handler for /api/lists/[listId]/delta — the polling/sync endpoint (MVP design §4.5).
 *
 * A GET (no side effects): the client polls it every ~2s with the cursor it last saw
 * (?since=<epoch-ms>) and gets back the entry bodies that changed since then, the full current
 * entry-id set (to detect deletions), the list metadata, and the next cursor. Member-level;
 * non-members / unknown / malformed ids get 404 from requireListAccess.
 *
 * Pattern: thin HTTP adapter — identity -> list-access guard -> read function -> JSON.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { getListDelta } from "@/lib/lists/delta";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * GET /api/lists/:listId/delta?since=<epoch-ms>
 * Returns the ListDelta for the list. Member-level.
 * Response: 200 ListDelta
 */
export async function GET(request: Request, { params }: Context) {
  try {
    // Identity first — no session means 401 before any data access.
    const userId = await requireUserId();
    const { listId } = await params;
    // Resolve the list AND check membership in its project (404 for both failure modes).
    await requireListAccess(prisma, listId, userId);

    // Optional ?since cursor. Anything non-numeric (or absent) means "baseline pull" — we pass
    // undefined so junk can never poison the epoch-ms comparison. Number("") is 0, so we guard the
    // empty string explicitly by requiring a finite number.
    const sinceParam = new URL(request.url).searchParams.get("since");
    const sinceNum = sinceParam !== null ? Number(sinceParam) : Number.NaN;
    const since = Number.isFinite(sinceNum) ? sinceNum : undefined;

    const delta = await getListDelta(prisma, listId, since);
    return NextResponse.json(delta);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint && npm run build`
Expected: PASS — no type or lint errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/lists/[listId]/delta"
git commit -m "feat: GET /api/lists/:id/delta polling endpoint (member-level)"
```

---

### Task 3: Client poller — `ListSyncPoller`

**Files:**
- Create: `src/app/lists/[listId]/ListSyncPoller.tsx`

**Interfaces:**
- Consumes: `useRouter` (`next/navigation`), `useEffect`/`useRef` (`react`); the delta endpoint from Task 2; the `ListDelta` wire shape from Task 1 (structurally — this file does not import server-only code).
- Produces:
  - `export const POLL_INTERVAL_MS: number` (default 2000).
  - `export default function ListSyncPoller(props: { listId: string; initialCursor: number; initialItemIds: string[]; initialList: { name: string; status: string; completedAt: number | null } }): null` — a render-nothing client component that polls and calls `router.refresh()` on change.

- [ ] **Step 1: Create the poller component**

Create `src/app/lists/[listId]/ListSyncPoller.tsx`:

```tsx
"use client";

// The project's FIRST client component. Everything else is server-rendered with server actions; this
// is the one piece that needs the browser (a timer + fetch). It renders nothing — it is a pure
// side-effect: poll the delta endpoint and, when something changed, refresh the server component.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Poll cadence for an open list (MVP design §4.5: "~1–3 s"). 2s balances freshness against request
// volume on a phone; exported so any tuning has a single source of truth.
export const POLL_INTERVAL_MS = 2000;

// The list-metadata subset we compare to detect rename / complete / reopen. List has no updatedAt
// (design decision #3), so we compare the values directly rather than a timestamp.
interface ListMeta {
  name: string;
  status: string;
  completedAt: number | null;
}

interface ListSyncPollerProps {
  listId: string;
  // The cursor + id set + metadata AS RENDERED by the server component. Polling starts from here so
  // a change made between this render and the first poll is still detected.
  initialCursor: number;
  initialItemIds: string[];
  initialList: ListMeta;
}

// Cheap unordered string-set equality. The id set is how we detect an add OR a delete (remove_item
// leaves no tombstone — design decision #2), so we need to compare sets, not sequences.
function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export default function ListSyncPoller({
  listId,
  initialCursor,
  initialItemIds,
  initialList,
}: ListSyncPollerProps) {
  const router = useRouter();

  // Baselines are refs, NOT state: advancing them must not re-render (this component renders null).
  // They hold "the last server truth we have already reflected on screen".
  const cursorRef = useRef(initialCursor);
  const itemIdsRef = useRef(initialItemIds);
  const metaRef = useRef(initialList);

  useEffect(() => {
    // Guards against a late fetch resolving after the component unmounted (avoids a refresh on a
    // page the user already left).
    let cancelled = false;

    async function poll() {
      // Don't poll a tab the user isn't looking at — saves battery/requests on iPhone. The next
      // visible tick picks up whatever changed in the meantime.
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const res = await fetch(`/api/lists/${listId}/delta?since=${cursorRef.current}`, {
          // Never serve a cached delta — we always want the current server truth.
          cache: "no-store",
        });
        if (!res.ok || cancelled) return; // transient error / unmounted — just try again next tick
        const delta = await res.json();

        // Did anything change vs. what is on screen? Three independent signals:
        //  - a changed/added entry body came back (updatedAt > cursor),
        //  - the id set differs (an add OR a DELETE — deletions ONLY show up here),
        //  - list metadata changed (rename / complete / reopen).
        const changed =
          delta.items.length > 0 ||
          !sameIdSet(delta.itemIds, itemIdsRef.current) ||
          delta.list.name !== metaRef.current.name ||
          delta.list.status !== metaRef.current.status ||
          delta.list.completedAt !== metaRef.current.completedAt;

        // Advance the baseline on EVERY poll so a given change is acted on once, not on every tick
        // after it (which would be a refresh loop). Next poll's ?since is now past these changes.
        cursorRef.current = delta.cursor;
        itemIdsRef.current = delta.itemIds;
        metaRef.current = delta.list;

        // Re-render the server component to pull the merged server truth. No client-side entry store
        // or optimistic UI — online LWW is enforced server-side in applyOperation; a client store +
        // offline queue is Phase 2 (design decisions #4/#5).
        if (changed) router.refresh();
      } catch {
        // Network blip — swallow and let the interval retry on the next tick.
      }
    }

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    // Cleanup: stop polling and ignore any in-flight response when the list page unmounts.
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // listId/router are stable for the life of the page; the refs carry all mutable state.
  }, [listId, router]);

  // Pure side-effect component: nothing to render.
  return null;
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint && npm run build`
Expected: PASS. (The component is not yet mounted anywhere — Task 4 wires it in — but it must type-check and lint on its own.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/lists/[listId]/ListSyncPoller.tsx"
git commit -m "feat: ListSyncPoller client component (interval poll + router.refresh on change)"
```

---

### Task 4: Wire the poller into the list detail page

**Files:**
- Modify: `src/app/lists/[listId]/page.tsx`

**Interfaces:**
- Consumes: `computeCursor` (Task 1), `ListSyncPoller` (Task 3); the existing `list` (a `ListWithItems`) already loaded on the page.
- Produces: the list page renders `<ListSyncPoller/>` with a render-time baseline, so remote edits appear automatically. No unit tests — verified by build + manual pass.

> **Reconciliation note (if Slices 5/6 already shipped):** those slices also edit this page. The two changes below are **purely additive** and their anchors are stable: (a) add two `const` lines immediately after the existing `const groups = groupByCategory(list.items);`; (b) render `<ListSyncPoller/>` as the first child inside `<main>`. If `list.status` / `list.completedAt` are already destructured or used by Slice 6, reuse them instead of re-reading — the values are the same.

- [ ] **Step 1: Import the poller and the cursor helper**

In `src/app/lists/[listId]/page.tsx`, replace the existing lists import line:

```ts
import { deleteList, getListWithItems, type ListWithItems } from "@/lib/lists/lists";
```

with (add the `computeCursor` import and the client-component import right below it):

```ts
import { deleteList, getListWithItems, type ListWithItems } from "@/lib/lists/lists";
import { computeCursor } from "@/lib/lists/delta";
import ListSyncPoller from "./ListSyncPoller";
```

- [ ] **Step 2: Compute the render-time sync baseline**

The component currently has, just before `return (`:

```ts
  const groups = groupByCategory(list.items);
```

Add the baseline right after it:

```ts
  const groups = groupByCategory(list.items);

  // Sync baseline for the poller (Slice 7): the cursor (newest entry updatedAt) and the id set AS
  // RENDERED. computeCursor is the SAME function the delta endpoint uses, so the client starts from a
  // cursor consistent with the server's — any change between this render and the first poll is seen.
  const initialCursor = computeCursor(list.items);
  const initialItemIds = list.items.map((item) => item.id);
```

- [ ] **Step 3: Mount the poller as the first child of `<main>`**

The render currently opens:

```tsx
  return (
    <main style={{ padding: 24 }}>
      {/* Back-link to the owning project for basic navigation. */}
      <p>
```

Insert `<ListSyncPoller/>` as the first child inside `<main>`:

```tsx
  return (
    <main style={{ padding: 24 }}>
      {/* Slice 7 background sync: renders nothing. Every ~2s it asks the delta endpoint whether the
          list changed (another member's edit, a deletion, a rename/completion) and, if so, refreshes
          this server component to show the merged truth. Server-side LWW already resolved conflicts. */}
      <ListSyncPoller
        listId={listId}
        initialCursor={initialCursor}
        initialItemIds={initialItemIds}
        initialList={{
          name: list.name,
          status: list.status,
          completedAt: list.completedAt ? list.completedAt.getTime() : null,
        }}
      />
      {/* Back-link to the owning project for basic navigation. */}
      <p>
```

- [ ] **Step 4: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: PASS — clean build, no type errors.

- [ ] **Step 5: Manual browser verification (two sessions)**

Start the dev server (`npm run dev`). Open the SAME list in two browser sessions logged in as two allowlisted members of the project (e.g. two profiles / a normal + a private window). In session B, keep the list visible; make changes in session A:
1. **Add** an entry in A → within ~2s it appears in B without a manual reload.
2. **Check** an entry in A → the checkbox/strike-through updates in B.
3. **Edit** a field (e.g. re-add with a category, or via `/ops`) in A → the change appears in B.
4. **Remove** an entry in A → it disappears in B (proves the id-set deletion detection).
5. **Rename or complete** the list in A (if Slices 5/6 UI is present, or via the API) → B reflects the new name / status.
6. Switch B's tab to the background for a few seconds, change something in A, return to B → the change shows on the next visible poll (proves the `document.hidden` skip does not lose updates).

Record the outcome in the Task 5 review; do not claim success without running these.

- [ ] **Step 6: Commit**

```bash
git add "src/app/lists/[listId]/page.tsx"
git commit -m "feat: mount ListSyncPoller on the list page with a render-time cursor baseline"
```

---

### Task 5: Implementation review + meta-plan progress log (Definition of Done)

**Files:**
- Create: `docs/implementation-reviews/slice-7-polling-sync.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:** none (documentation). Part of every slice's Definition of Done.

- [ ] **Step 1: Re-run the full verification and capture the real numbers**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Note the exact test count (this slice adds 9 new tests: 3 `computeCursor` + 6 `getListDelta`). If Slices 5/6 shipped first, the total will include their tests too — record the real number at execution.

- [ ] **Step 2: Write the implementation review**

Create `docs/implementation-reviews/slice-7-polling-sync.md` covering the five required sections (English):

1. **What was achieved** — cursor-based delta sync: remote edits to an open list now appear automatically via a ~2s poll; state the goal was met and that online multi-user editing (MVP design §4.5) is now live.
2. **Steps taken** — one line per task (delta core, GET endpoint, poller component, page wiring, docs), noting the locked decisions (epoch-ms cursor, id-set deletion detection, always-full list metadata, server-side LWW, router.refresh over a client store).
3. **Core components built** — `computeCursor` / `getListDelta` + `ListDelta`/`DeltaItem`; the `GET …/delta` endpoint; `ListSyncPoller`; the list-page baseline + mount.
4. **Most important lines of code** — quote and explain (a) the `itemIds = list.items.map(...)` full id set (why deletions are observable without tombstones); (b) the strict `updatedAt.getTime() > since` body filter + `computeCursor`'s monotonic guard (why `>` not `>=`, and why the cursor never moves backward); (c) the `changed = ...` three-signal check in the poller (adds/updates via bodies, deletes via id set, metadata via direct compare); (d) advancing the refs every poll before `router.refresh()` (why this prevents a refresh loop).
5. **Architecture contribution** — Slice 7 assembles the online sync layer on top of the Slice 3 operations funnel and hands Phase 2 a ready delta contract (the same `updatedAt`-based cursor and id set an offline queue would replay against); notes the remaining PWA polish (Slice 8) can later add a client-side store/optimistic UI consuming this endpoint.

- [ ] **Step 3: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- In the "8 slices" status table, set the Slice 7 row **Plan** column to link `2026-07-20-slice-7-polling-sync.md` and its **Status** to `✅ Done / verified`.
- Add a new progress-log entry at the TOP of the "Progress log" section (newest first):

```markdown
### 2026-07-20 — Slice 7: Polling / Sync — Done
- **Delivered:** `getListDelta` + `computeCursor` (cursor = max ListItem.updatedAt in epoch-ms; changed bodies via strict `> since`; full id set for tombstone-less deletion detection; always-full list metadata); `GET /api/lists/:id/delta?since=` member-level endpoint; `ListSyncPoller` client component (~2s interval, `document.hidden` skip, `router.refresh()` on change); mounted on the list page with a render-time baseline.
- **Tested:** `npm test` passed (N files, M tests — 9 new in Slice 7); `npm run lint` + `npm run build` passed cleanly. Manual two-session browser check (add/check/edit/remove/rename propagate within ~2s): <fill in>.
- **Deviations from the plan:** <fill in, or "none">.
- **Follow-up decisions for later slices:**
  - Last-writer-wins is enforced SERVER-SIDE in applyOperation; the poller only makes remote writes visible. A client-side entry store + optimistic UI + offline queue is Phase 2 and would consume this same delta endpoint (Slice 8 may start it).
  - The cursor is millisecond-precision with a strict `>` filter (never switch to `>=` — refresh loop). Rare same-ms field updates may defer until the next change; adds/deletes are always caught by the id-set diff (accepted MVP limitation, §8).
  - `ListSyncPoller` is the project's first client component; further client-side interactivity builds on this pattern.
- **Inherited open items:** Slice 8 (PWA polish) plan to be created per maintenance guide step 3.
- **Commit(s):** <hashes>
```

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-7-polling-sync.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: Slice 7 implementation review + meta-plan progress log"
```

---

## Self-Review (performed while writing this plan)

**1. Spec coverage** (MVP design §4.5 "Parallele Bearbeitung (online)", §5.2 "Polling/Änderungs-Cursor", §7 "Eintrags-Merge", §8 "Polling-Last … Cursor-basiertes Delta"; build-order item 7 "Polling/Sync: Cursor-based delta endpoint, client polling (1–3 s), last-writer-wins merge"):
- Cursor-based delta endpoint → Task 1 (`getListDelta`, cursor = epoch-ms `updatedAt`) + Task 2 (`GET …/delta?since=`). ✅
- Client polling ~1–3 s → Task 3 (`POLL_INTERVAL_MS = 2000`, interval) + Task 4 (mounted on the list page). ✅
- Deltas, not full pull → Task 1 (changed bodies via `> since`; id set is the only always-full part, and ids are tiny — §8). ✅
- Deletions observable (no tombstones) → Task 1 (`itemIds` full set) + Task 3 (`sameIdSet` diff). ✅ (resolves the Slice 3 follow-up hand-off.)
- Last-writer-wins → server-side in `applyOperation` (Slice 3, single-column `@updatedAt` writes); Slice 7 reflects it (locked decision #4). ✅
- Member-level permission (matrix §6) → `requireListAccess` in the endpoint (Task 2). ✅
- Offline-prep intact → the delta reuses the same `updatedAt` cursor + entry-id contract Phase 2 would replay against; no API contract changed. ✅

**2. Placeholder scan:** No TBD/TODO/"add appropriate…". Every code step contains full code; the test step contains full tests. The only intentional fill-ins are the review's factual test count, the manual two-session outcome, deviations, and commit hashes in Task 5 — unknowable before execution.

**3. Type consistency:** `computeCursor(items: { updatedAt: Date }[], since?: number): number` and `getListDelta(db, listId, since?: number): Promise<ListDelta>` are defined in Task 1 and used with the same signatures in Task 2 (`getListDelta(prisma, listId, since)`) and Task 4 (`computeCursor(list.items)`). `ListDelta`/`DeltaItem` fields (`list.name/status/completedAt`, `items`, `itemIds`, `cursor`) are produced in Task 1 and consumed field-by-field by the poller in Task 3 (`delta.items.length`, `delta.itemIds`, `delta.list.name/status/completedAt`, `delta.cursor`) and the page baseline in Task 4 (`list.completedAt?.getTime()`). `ListSyncPoller` props (`listId`, `initialCursor: number`, `initialItemIds: string[]`, `initialList: { name; status; completedAt }`) defined in Task 3 match the JSX in Task 4 exactly. Existing helpers (`requireListAccess`, `requireUserId`, `toErrorResponse`, `getListWithItems`, `applyOperation`) are used exactly as in Slices 2–4. `ListStatus` is the existing Prisma enum; `ListItem.updatedAt` / `List.completedAt` are existing schema fields.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-slice-7-polling-sync.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with a two-stage review between tasks. Fast iteration, clean context per task.
2. **Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`, batched with checkpoints for your review.

Which approach?
