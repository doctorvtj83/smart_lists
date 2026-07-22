# Implementation Review — Slice 7: Polling / Sync

## 1. What was achieved

Slice 7 adds the online synchronization layer described in MVP design §4.5. While a list is open, the browser now polls its delta endpoint every two seconds and refreshes the server-rendered page when another session changes an entry, removes an entry, renames the list, or changes its completion state.

The slice goal was met: online multi-user editing is now live at the implementation level. The server returns only entry bodies newer than an epoch-millisecond cursor, plus the complete current entry-id set needed to observe deletions without tombstones and the always-full list metadata needed because `List` has no `updatedAt`. Last-writer-wins remains enforced server-side in the existing operations funnel; the poller only makes the merged server truth visible.

Automated verification passed with **16 test files / 135 tests** (9 new in Slice 7: 3 for `computeCursor`, 6 for `getListDelta`), plus successful lint and production build runs. The build emitted the repository's existing multiple-lockfile/Turbopack-root and `middleware` deprecation warnings.

**Manual two-session browser verification was not run in this agent environment.** Google OAuth and two allowlisted interactive sessions were unavailable, so propagation of add/check/edit/remove/rename actions within approximately two seconds remains pending human verification and is not claimed as passed.

---

## 2. Steps taken

**Task 1 — Delta core:** Added `computeCursor`, `getListDelta`, `ListDelta`, and `DeltaItem`. The locked wire contract uses an epoch-ms cursor, strict `updatedAt > since` body filtering, a complete id set for deletion detection, always-full list metadata, and a monotonic cursor.

**Task 2 — GET endpoint:** Added the member-level `GET /api/lists/:id/delta?since=` route as a thin identity → access guard → delta-read adapter.

**Task 3 — Poller component:** Added `ListSyncPoller`, the project's first client component. It polls every two seconds, skips hidden documents, detects entry/id-set/metadata changes, and calls `router.refresh()` instead of introducing a client-side store.

**Task 4 — List-page wiring:** Mounted the poller on the server-rendered list page with a render-time cursor, item-id set, and metadata baseline computed from exactly the list state rendered to the user.

**Task 5 — Documentation:** Added this implementation review and updated the meta project plan with the verified result, known limitations, and Phase 2 hand-off.

The implementation deliberately leaves conflict resolution in the server-side `applyOperation` path. The polling client observes the result; it does not duplicate last-writer-wins or optimistic merge logic.

---

## 3. Core components built

| File / component | Role |
|---|---|
| `src/lib/lists/delta.ts` — `computeCursor` | Computes the newest entry `updatedAt` as epoch-ms while never returning a value below the incoming cursor. |
| `src/lib/lists/delta.ts` — `getListDelta` | Loads current list truth and returns changed entry bodies, all current entry ids, full list metadata, and the next cursor. |
| `src/lib/lists/delta.ts` — `ListDelta` / `DeltaItem` | Defines the JSON-safe synchronization contract, including epoch-ms dates for cursor and future LWW use. |
| `src/lib/lists/delta.test.ts` | Covers cursor computation, strict body filtering, deletion-observable id sets, metadata serialization, ordering, and monotonic cursor behavior. |
| `src/app/api/lists/[listId]/delta/route.ts` | Exposes the member-authorized polling endpoint and parses the optional `since` query parameter. |
| `src/app/lists/[listId]/ListSyncPoller.tsx` | Runs the browser interval, compares three change signals, advances baselines, and refreshes the Server Component when needed. |
| `src/app/lists/[listId]/page.tsx` | Computes the baseline from the rendered list and mounts `ListSyncPoller` with matching cursor, ids, and metadata. |

---

## 4. Most important lines of code

### Full id set for deletion detection (`src/lib/lists/delta.ts`)

```typescript
// Full current id set — the ONLY way the client learns an entry was removed (no tombstones,
// design decision #2).
const itemIds = list.items.map((item) => item.id);
```

Why it matters: `remove_item` physically deletes a row, so there is no updated tombstone body for a cursor query to return. Sending the small complete id set lets the poller compare previous and current membership and observe both additions and deletions without changing the Slice 3 data model.

### Strict filtering and monotonic cursor (`src/lib/lists/delta.ts`)

```typescript
export function computeCursor(items: { updatedAt: Date }[], since = 0): number {
  let max = since;
  for (const item of items) max = Math.max(max, item.updatedAt.getTime());
  return max;
}

const changed =
  since === undefined
    ? list.items
    : list.items.filter((item) => item.updatedAt.getTime() > since);
```

Why it matters: strict `>` ensures an entry at the current cursor is not returned forever; `>=` would repeatedly signal the same body and cause a refresh loop. Starting `max` at `since` prevents the cursor moving backward when the newest entry is deleted, which would otherwise resend older bodies.

### Three independent change signals (`src/app/lists/[listId]/ListSyncPoller.tsx`)

```typescript
const changed =
  delta.items.length > 0 ||
  !sameIdSet(delta.itemIds, itemIdsRef.current) ||
  delta.list.name !== metaRef.current.name ||
  delta.list.status !== metaRef.current.status ||
  delta.list.completedAt !== metaRef.current.completedAt;
```

Why it matters: changed entry bodies detect adds and updates, the id-set comparison detects tombstone-less deletions (and also additions), and direct metadata comparison detects rename, completion, and reopen changes despite `List` having no `updatedAt`.

### Advance baselines before refreshing (`src/app/lists/[listId]/ListSyncPoller.tsx`)

```typescript
cursorRef.current = delta.cursor;
itemIdsRef.current = delta.itemIds;
metaRef.current = delta.list;

if (changed) router.refresh();
```

Why it matters: every response becomes the next polling baseline before the refresh is requested. Therefore the same response is acted on once; later interval ticks do not compare against stale refs and repeatedly call `router.refresh()`.

---

## 5. Architecture contribution

Slice 7 assembles the MVP's **online sync layer** on top of Slice 3's entry-operation funnel. All writes still pass through `applyOperation`, where idempotency and server-side last-writer-wins are enforced; the new read side exposes the resulting server truth through a stable cursor contract and makes it visible in another open session.

The delta contract is also the hand-off to Phase 2. An offline queue can replay the same stable, ID-bearing operations and then reconcile against the same `updatedAt` epoch-ms cursor, changed bodies, and complete id set without replacing the API shape introduced here.

The deliberately simple `router.refresh()` integration keeps the MVP server-rendered and avoids a second source of truth. Slice 8's PWA polish can later introduce a client-side entry store and optimistic UI that consumes this endpoint, while preserving the server-side mutation and conflict-resolution architecture.

Two minor, plan-faithful review notes remain non-blocking: an empty `?since=` currently converts via `Number("")` to cursor `0`, effectively a baseline pull; and the interval does not suppress overlapping requests or re-check cancellation after JSON parsing, leaving a narrow cancelled-before-JSON race. The accepted millisecond cursor limitation also remains: rare same-ms field updates can wait until a later change, while adds and deletes remain observable through the id-set comparison.
