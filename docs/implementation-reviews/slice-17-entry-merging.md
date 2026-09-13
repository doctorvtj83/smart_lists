# Implementation Review — Slice 17: Entry merging

## 1. What was achieved

Slice 17 makes quantified adds converge on the row already representing the same article and unit:
adding “2 l Milch” to an unchecked “1 l Milch” row now returns and displays that existing row with
quantity `3`, rather than creating a duplicate. Checked rows, different unit buckets, and entries
without quantities remain separate by design.

The behavioral goal is fully implemented, including replay safety and the user-visible explanation.
The operation shape and delta endpoint stay unchanged. An `AbsorbedEntry` ledger preserves the
stable-ID/idempotency contract even though a merged add no longer creates a `ListItem` under the
client's `itemId`; the inline banner and 1.4-second row flash make the otherwise subtle update visible.

Fresh verification on 2026-09-13 produced **89 test files / 722 tests passed**. `npm run lint` exited
0 with **0 errors / 14 warnings**, all unused typed mock parameters in `ListBody.test.tsx`.
`npx tsc --noEmit` exited 2 with **7 test-only diagnostics**: five inherited diagnostics in
`RevokeSheet.test.tsx`, `CatalogBrowser.test.tsx`, and `InviteForm.test.tsx`, plus **two Slice 17
diagnostics** in `ListBody.test.tsx` where older failure stubs do not include the newly required
`merge: null`. The runtime suite is green, but the slice therefore does not claim a clean standalone
TypeScript check.

---

## 2. Steps taken

**Task 1 — Ledger model:** Added `AbsorbedEntry`, its list cascade, a deliberately non-FK
`targetItemId`, the migration, and test-reset coverage.

**Task 2 — Pure merge decision:** Added DB-free quantity rounding, unit-bucket matching, deterministic
target selection, the `MergeOutcome` contract, and the truth-table tests in `merge.ts`.

**Task 3 — Merge-aware funnel:** Split the operation seam into `applyOperationDetailed` plus the
compatible `applyOperation` wrapper; resolved inherited units before matching and paired an atomic
quantity increment with the ledger insert.

**Task 4 — Replay safety:** Added the ledger read, same-list replay reconstruction, target-deleted
fall-through, cross-list UUID collision handling, and composition/cascade tests.

**Task 5 — `addEntryFromRow` contract:** Passed `MergeOutcome` to the caller, returned the affected
target row, and made `needsCategory` explicitly false after a merge.

**Task 6 — Banner:** Carried merge state through the Server Action and rendered the German,
decimal-aware “Zu … addiert → …” status banner.

**Task 7 — Flash:** Added the `flashNonce` contract so repeated merges can remount and replay the
existing 1.4-second highlight on exactly the row that absorbed the quantity.

---

## 3. Core components built

| File / component | Role |
|---|---|
| `src/lib/lists/merge.ts` | Pure source of truth for rounding, unit equivalence, target selection, `MergeOutcome`, and the German merge message. |
| Prisma `AbsorbedEntry` | Server-side idempotency ledger keyed by the absorbed add's client-generated UUID; its target id intentionally survives target deletion without an FK. |
| `applyOperationDetailed` | Ruling R1's detailed operation seam: returns both the affected row and the merge facts needed by the UI. |
| `applyOperation` wrapper | Preserves the original `Promise<ListItem \| null>` API for callers that only need the affected row, whose id may now differ from the submitted id. |
| `addEntryFromRow` result | Carries `merge` to the list screen and locally guarantees that a merge never opens the category sheet. |
| `formatMergeMessage` + `Banner` | Announces the old and new total through the existing accessible `role="status"` primitive. |
| `flashNonce` prop | Targets and restarts the row highlight even when the same row absorbs two consecutive adds. |
| `operations.test.ts` / UI tests | Pin merge rules, atomic result behavior, ledger replay and fall-through, flow-back, banner copy, and target-only flash behavior. |

---

## 4. Most important lines of code

### (a) The ledger deliberately has no target foreign key (`prisma/schema.prisma`)

```prisma
list List @relation(fields: [listId], references: [id], onDelete: Cascade)

targetItemId String @db.Uuid @map("target_item_id")
quantity Float
```

Why it matters: the ledger belongs to the list and dies with it, but deleting the target row must not
erase the replay fact. A stale target id is re-checked safely; a cascading target FK would make a
later replay capable of adding the contribution again.

### (b) The target predicate owns the complete rule (`src/lib/lists/merge.ts`)

```ts
if (quantity === null) continue;
if (candidate.checked) continue;
if (candidate.catalogItemId !== incoming.catalogItemId) continue;
if (!unitsMatch(candidate.unit, incoming.unit)) continue;
if (best === null || candidate.sortIndex < best.sortIndex) best = { ...candidate, quantity };
```

Why it matters: quantified, unchecked, same-article, same-unit rows are the only legal targets, and
the lowest `sortIndex` makes existing duplicate candidates deterministic. Keeping every rule in this
pure predicate prevents the database query and the tested truth table from drifting apart.

### (c) A replay only resolves while its target still exists (`src/lib/lists/operations.ts`)

```ts
const absorbed = await db.absorbedEntry.findUnique({ where: { id: operation.itemId } });
if (absorbed) {
  if (absorbed.listId !== list.id) {
    throw new ApiError(409, "Eintrags-ID wird bereits verwendet");
  }
  const target = await db.listItem.findFirst({
    where: { id: absorbed.targetItemId, listId: list.id },
    include: { catalogItem: true },
  });
  if (target) {
    // Reconstruct and return the original merge outcome.
  }
}
// No surviving target: fall through to the ordinary create path.
```

Why it matters: this is both replay safety and ruling R4. A same-list retry is a no-op against the
surviving target; reusing the ledger id against another list is a clean 409; deleting the target frees
the client's id to become a real row again, matching the established remove-then-replay behavior.

### (d) Inherited units are resolved before matching (`src/lib/lists/operations.ts`)

```ts
const effectiveUnit =
  operation.unit !== undefined ? operation.unit : catalogItem.defaultUnit;
const quantity = operation.quantity ?? null;
```

Why it matters: matching the raw operation would put two entries that both inherit “Becher” into a
false no-unit bucket. Matching the actual value to be stored makes catalog inheritance and merging one
consistent rule, while explicit `null` still means “no unit”.

### (e) The quantity write and ledger fact commit together (`src/lib/lists/operations.ts`)

```ts
const [mergedItem] = await db.$transaction([
  db.listItem.update({
    where: { id: target.id },
    data: { quantity: { increment: contribution } },
  }),
  db.absorbedEntry.create({
    data: { id: operation.itemId, listId: list.id, targetItemId: target.id, quantity: contribution },
  }),
]);
```

Why it matters: neither write is valid alone. The approved Task 3 plan deviation uses an atomic
increment rather than an absolute total calculated from a stale read, so concurrent merges into an
existing target cannot silently lose one contribution.

### (f) The visible outcome comes from the row actually written (`src/lib/lists/operations.ts`)

```ts
const summed = round3(mergedItem.quantity!);
const previousQuantity = round3(summed - contribution);
```

Why it matters: `mergedItem` contains the database result after the atomic increment. Deriving the
prior value from that result keeps the banner truthful even when another contribution commits between
target discovery and this write.

### (g) The category sheet cannot open over a merge (`src/lib/lists/addEntry.ts`)

```ts
needsCategory: merge === null && knownArticle === null && item.category === null,
merge,
```

Why it matters: `knownArticle` currently makes the guard partly redundant, but `merge === null` states
the product rule locally and protects it if the catalog lookup changes later.

### (h) A nonce replays the highlight on the same row (`src/app/lists/[listId]/ListBody.tsx`)

```ts
if (next.merge) {
  const targetId = next.merge.targetItemId;
  setFlash((current) => ({ id: targetId, nonce: (current?.nonce ?? 0) + 1 }));
}
```

Why it matters: a boolean would remain true and CSS would not restart the animation for a second
merge. The increasing nonce remounts only the named target's flashing row.

---

## 5. Architecture contribution

Before Slice 17, `add_item` idempotency relied on a simple invariant: after a successful add, a
`ListItem` existed under the client's UUID, so replay found that row and stopped. Entry merging
necessarily breaks that invariant because the contribution lands in a pre-existing target row.
`AbsorbedEntry` replaces the missing row as the durable replay marker without changing the serialized
operation contract, while `applyOperationDetailed` adds an opt-in reporting seam without forcing
uninterested callers to change.

This is the prerequisite Slice 19 applies recipes through. Each expanded recipe line can remain an
ordinary `add_item`; if two selected recipes both need milk in the same unit, the shared funnel
produces one row with the summed quantity, and each generated operation id remains independently
replay-safe.

The approved Task 3 deviation strengthened concurrent writes: the merge uses atomic
`quantity: { increment: contribution }` and reconstructs `MergeOutcome` from the written row rather
than writing a stale absolute sum. The remaining known MVP limit is self-revealing rather than silent:
two parallel first adds can both miss a target and create two rows. Closing that needs a partial unique
index plus retry and has no concurrency test in this slice.

Minor deferred polish: `addEntry.ts` still describes itself at file level as a thin wrapper around
`applyOperation`, although it now calls `applyOperationDetailed`. The architecture statement remains
correct—the operations funnel is still the only write path—but the named function in that comment is
stale.
