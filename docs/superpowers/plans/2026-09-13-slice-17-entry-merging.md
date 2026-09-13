# Slice 17 — Entry merging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adding „2 l Milch" to a list that already shows „1 l Milch" makes that row read **3 l** instead of creating a second Milch row — and replaying the same operation never double-counts it.

**Architecture:** `applyOperation`'s `add_item` becomes merge-aware. A pure predicate (`findMergeTarget`) decides whether an incoming add is absorbed by an existing row; the write path then either sums into that row or creates a new one exactly as today. Because a merged add leaves **no row carrying the client's `itemId`**, the slice carries an `AbsorbedEntry` ledger keyed by that id, so a retry or an offline-queue replay resolves to the same target row instead of adding the quantity twice. The operation *shape* does not change — no new field on `AddItemOperation`, no change to the delta endpoint — so every existing transport keeps working; what changes is the **return contract**: callers must use the returned row, whose id may differ from the one they sent.

**Tech Stack:** Next.js App Router (Server Actions), TypeScript, Prisma / Neon Postgres, Vitest (+ jsdom & Testing Library for the two component tasks). No new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-13-smart-lists-recipes-design.md](../specs/2026-09-13-smart-lists-recipes-design.md) — §2 (data model), §3 (merge semantics, the operations funnel), §10 (the test list), §11 (slice cut). This plan implements **slice 1 of the three** the spec proposes; recipes themselves are Slices 18 and 19 and are deliberately absent here.

## Global Constraints

- **Implementation docs, code identifiers and code comments: English. In-app user-facing strings stay German.** (CLAUDE.md § Language convention.)
- **Meticulous inline comments are mandatory.** Every function gets a comment saying what it does *and why it exists*; every non-obvious block gets a *why* comment. Do not remove or thin out existing comments when editing a file. (CLAUDE.md § Code documentation standard.)
- **Merge rule (spec D1), verbatim:** same article **and** same unit — where "no unit" is its own bucket — and **both** entries must carry a quantity. **No unit conversion**: 1 l and 500 ml stay separate rows.
- **Merge on add only, into an unchecked row only (spec D2).** `update_item` never merges. A checked row is settled and never absorbs.
- **The operation contract does not change.** Nothing may be added to `Operation` that `parseOperation` cannot rebuild from JSON — an operation must fully describe its own effect, or the Phase 2 offline queue replays it differently than the online path did.
- **Mutations stay entry/field-granular and go through `applyOperation`.** No new write path, no direct `listItem.update` outside the operations funnel. (MVP design §4.5.)
- **Rounding: 3 decimals**, matching `formatGermanNumber`'s `maximumFractionDigits: 3`. Without it `0.1 + 0.2` stores `0.30000000000000004`.
- **`count` / recipes / project settings are NOT in this slice.** If a task tempts you toward `Recipe`, `recipesEnabled` or `suggestionRuleN`, stop — that is Slice 18.
- **Styling: CSS Modules only. Icons: `lucide-react` through `Icon`.** No new UI primitive is needed; the merge cue reuses `Banner` and the existing `sl-flash` keyframes in `globals.css`.
- **Component tests** start with `// @vitest-environment jsdom`, use Testing Library, and assert roles, text and data attributes — **never CSS-Module class names**.
- **Tests run against the Neon `test` branch via `.env.test`.** Never copy `.env`'s `DATABASE_URL` into `.env.test`.
- **German decimal comma** everywhere the user sees a number (`1,5`), per handoff §2 — `formatQuantityLabel` already owns this.
- Commit after every task with a Conventional-Commits message.

---

## Decisions this plan locks (beyond the spec)

The spec settles the product rules. Four implementation questions it leaves open are answered here so no task has to invent an answer:

| # | Question | Ruling |
|---|----------|--------|
| R1 | How do callers learn that a merge happened, without changing `applyOperation`'s signature for its four existing call sites? | A **second entry point**: `applyOperationDetailed(db, list, op)` returns `{ item, merge }`; `applyOperation` stays a thin wrapper returning `item`, so `page.tsx`, the REST route, `suggestions.ts` and `delta.test.ts` are untouched. Only `addEntryFromRow` — the one caller that must render a cue — calls the detailed form. |
| R2 | The spec's `addEntryFromRow` returns `{ item, needsCategory, merged }`. Boolean or object? | **Object: `merge: MergeOutcome \| null`.** `merged` is recoverable as `merge !== null`, and the banner needs the target's name, its quantity before and after, and its unit — all of which only the funnel knows. A boolean would force the UI to re-query. |
| R3 | Where is the "both sides need a quantity / units match / target unchecked" rule enforced — in the Prisma `where`, or in the pure function? | **Entirely in the pure function.** The query narrows to *candidate rows* only (`listId` + `catalogItemId`, ordered by `sortIndex`); `findMergeTarget` owns every rule, including re-checking `catalogItemId`. One source of truth, and the truth table in §10 of the spec becomes a literal test table. The row count per article per list is tiny, so nothing is lost. |
| R4 | A ledger row exists for this `itemId`, but it belongs to a **different list**. | **409 „Eintrags-ID wird bereits verwendet"** — the exact mirror of the existing cross-list rule for a `ListItem` with a foreign id. The spec only covers "target still exists"; this is the same client bug (a reused UUID) and must not surface as a Prisma P2002 → 500. This is why `AbsorbedEntry` carries `listId` beyond its cascade duty. |

**Two behaviours that look like bugs and are not** — do not "fix" them:

- **A replay whose target row was deleted falls through to a normal create.** That is exactly what `add_item` already does after a `remove_item`: the id is free again. One rule, not two (spec §3).
- **A merged add still runs the catalog flow-back.** An explicitly supplied unit/category is *catalog memory* and is independent of where the entry landed (spec §3, step 7). The **target row's** own category, unit spelling, `sortIndex` and `checked` state stay untouched — the existing row wins every field except the number.

**Deliberate cut:** the row highlight in Task 7 is a **local** flash driven by the server's answer to *your own* add. It is not Slice 16 (the flash for *remote* members' changes, which needs a `FlashProvider` and a poller seam). When Slice 16 lands it should absorb this; until then this costs one prop and one CSS class.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| **Modify** `prisma/schema.prisma` | `AbsorbedEntry` model + the `absorbedEntries` back-relation on `List`. | 1 |
| **Generated** `prisma/migrations/<timestamp>_add_absorbed_entries/` | `CREATE TABLE "absorbed_entries" …`. | 1 |
| **Modify** `src/test/reset-db.ts` | Extend the TRUNCATE list with `"absorbed_entries"`. | 1 |
| **Create** `src/lib/lists/merge.ts` | The whole merge *decision*, pure and DB-free: `round3`, `unitsMatch`, `findMergeTarget`, the `MergeOutcome` shape, and (Task 6) the German banner text. Sibling of `swipe.ts` and `parseEntryInput.ts` — list-domain rules with no I/O. | 2, 6 |
| **Create** `src/lib/lists/merge.test.ts` | The spec §10 truth table, one `it` per row. Node environment, no DB. | 2, 6 |
| **Modify** `src/lib/lists/operations.ts` | Merge-aware `add_item`: `applyOperationDetailed` + the `applyOperation` wrapper, the ledger write, the ledger replay. | 3, 4 |
| **Modify** `src/lib/lists/operations.test.ts` | The DB-level behaviour: merging, non-merging, idempotency, the ledger. | 3, 4 |
| **Modify** `src/app/api/lists/[listId]/ops/route.ts` | Doc comment only: the 200 body may be a row with a **different id** than the one posted. | 3 |
| **Modify** `src/lib/lists/addEntry.ts` | Calls the detailed form, passes `merge` through, suppresses `needsCategory` on a merge. | 5 |
| **Modify** `src/lib/lists/addEntry.test.ts` | The trailing row's server-side merge behaviour. | 5 |
| **Modify** `src/app/lists/[listId]/formState.ts` | `EntryFormState.merge` + the idle value. | 6 |
| **Modify** `src/app/lists/[listId]/page.tsx` | `addEntryAction` returns the merge; the three other `EntryFormState` literals gain `merge: null`. | 6 |
| **Modify** `src/app/lists/[listId]/ListBody.tsx` | Renders the merge `Banner`; holds the flash state. | 6, 7 |
| **Modify** `src/app/lists/[listId]/ListBody.module.css` | One wrapper class for the banner's spacing. | 6 |
| **Modify** `src/app/lists/[listId]/ListBody.test.tsx` | Banner text after a merged add; the flash lands on the target row. | 6, 7 |
| **Modify** `src/app/lists/[listId]/EntryRow.tsx` | `flashNonce` prop → the highlight. | 7 |
| **Modify** `src/app/lists/[listId]/EntryRow.module.css` | `.flash` bound to the existing `sl-flash` keyframes. | 7 |
| **Modify** `src/app/lists/[listId]/EntryRow.test.tsx` | The prop-level flash contract. | 7 |
| **Create** `docs/implementation-reviews/slice-17-entry-merging.md` | Definition of Done (CLAUDE.md § Implementation review). | 8 |
| **Modify** `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` | Status row + progress-log entry. | 8 |

---

### Task 1: `AbsorbedEntry` model + migration + test reset

**Files:**
- Modify: `prisma/schema.prisma` (add the `AbsorbedEntry` model; add the `absorbedEntries` back-relation to `List`)
- Modify: `src/test/reset-db.ts`
- Generated: `prisma/migrations/<timestamp>_add_absorbed_entries/`

**Interfaces:**
- Consumes: the existing `List` model.
- Produces: table `absorbed_entries` with columns `id` (uuid **pk, no default** — it IS the client's `itemId`), `list_id` (uuid fk → `lists`, cascade), `target_item_id` (uuid, **deliberately not a foreign key**), `quantity` (double precision, required), `created_at`. Prisma model `AbsorbedEntry`, client accessor `db.absorbedEntry`.

This task has **no test of its own** — the same precedent as Slice 5's `Favorite` task. Its two modelling decisions (cascade from the list, *no* cascade from the target row) are pinned by behavioural tests in Task 4, which is where they actually matter.

- [ ] **Step 1: Add the back-relation to `List`**

In `prisma/schema.prisma`, the `List` model currently ends:

```prisma
  createdAt DateTime   @default(now()) @map("created_at")
  items     ListItem[]

  @@map("lists")
}
```

Add the back-relation directly below `items`:

```prisma
  createdAt DateTime   @default(now()) @map("created_at")
  items     ListItem[]

  // Back-relation added in Slice 17 (Entry merging): the idempotency ledger of adds that were
  // absorbed by an existing row of this list. Deleting a list discards its ledger with it — the
  // ledger only ever answers "was THIS add already applied to THIS list?", which is meaningless
  // once the list is gone.
  absorbedEntries AbsorbedEntry[]

  @@map("lists")
}
```

- [ ] **Step 2: Append the `AbsorbedEntry` model**

Append at the end of `prisma/schema.prisma` (after `model Favorite { … }`):

```prisma
// The idempotency ledger for MERGED adds (Slice 17, recipes design §2/§3).
//
// WHY THIS TABLE EXISTS: before this slice, `add_item` guaranteed that a row with the client's
// `itemId` existed afterwards, which is what made a replay a cheap no-op ("row already there ->
// return it"). A merged add creates NO such row — the quantity flows into an existing entry — so a
// retry or a Phase 2 offline-queue replay would silently add the amount a second time. This table
// records "the add with id X was absorbed into row Y, contributing Z", so the replay resolves to the
// same target instead of double-counting. It is a SERVER-SIDE ledger: never synced, never rendered,
// never part of a delta (the absorbed entry never existed as a row, so it cannot appear in one).
model AbsorbedEntry {
  // NO @default(uuid()): the id IS the client-generated ListItem id the add carried. That identity is
  // the whole point — it is the key a replay arrives with.
  id String @id @db.Uuid

  listId String @db.Uuid @map("list_id")
  // onDelete: Cascade -> the ledger dies with the list it describes (see the back-relation comment).
  // The column is ALSO read: a ledger id replayed against a DIFFERENT list is a reused UUID, i.e. the
  // same client bug ListItem answers with 409 (operations.ts, add_item step 3).
  list List @relation(fields: [listId], references: [id], onDelete: Cascade)

  // The row this add was absorbed into. DELIBERATELY NOT A FOREIGN KEY, and deliberately not
  // cascading: if the target row is later deleted (swipe-to-delete), this ledger row MUST survive as
  // a tombstone. It is only ever read by primary key and its target existence is re-checked on every
  // read, so a stale pointer is harmless — whereas a cascade would silently delete the ledger row and
  // re-enable the double-count it exists to prevent.
  targetItemId String @db.Uuid @map("target_item_id")

  // What THIS operation contributed to the target — not the target's total. Required (an add without
  // a quantity can never merge, see findMergeTarget), and it is what lets a replay reconstruct the
  // exact message the first application produced.
  quantity Float

  createdAt DateTime @default(now()) @map("created_at")

  @@map("absorbed_entries")
}
```

- [ ] **Step 3: Create and apply the migration**

Run: `npx prisma migrate dev --name add_absorbed_entries`
Expected: a new folder `prisma/migrations/<timestamp>_add_absorbed_entries/` containing `CREATE TABLE "absorbed_entries" …` with a foreign key on `list_id` only (no constraint on `target_item_id` — verify this in the generated SQL, it is the decision the table hangs on). Prisma regenerates the client, so `db.absorbedEntry` becomes available. No errors.

This runs against `.env`'s `DATABASE_URL` (the dev branch). The **test** branch gets the same migration automatically: `src/test/global-setup.ts` runs `npx prisma migrate deploy` once per Vitest invocation.

- [ ] **Step 4: Extend the test DB reset**

In `src/test/reset-db.ts`, replace the raw SQL statement:

```ts
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "allowlist_entries", "projects", "memberships", "catalog_items", "lists", "list_items", "favorites" RESTART IDENTITY CASCADE;'
  );
```

with:

```ts
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "allowlist_entries", "projects", "memberships", "catalog_items", "lists", "list_items", "favorites", "absorbed_entries" RESTART IDENTITY CASCADE;'
  );
```

- [ ] **Step 5: Verify the client compiles and nothing regressed**

Run: `npm run build`
Expected: PASS — the generated Prisma client includes `AbsorbedEntry` / `db.absorbedEntry`, no type errors.

Run: `npm test`
Expected: PASS — the suite is unchanged by this task (594 tests green as of Slice 15; a higher number is fine, failures are not).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/test/reset-db.ts
git commit -m "feat: add AbsorbedEntry ledger model + migration (merge idempotency)"
```

---

### Task 2: The merge decision — `src/lib/lists/merge.ts`

**Files:**
- Create: `src/lib/lists/merge.ts`
- Create: `src/lib/lists/merge.test.ts`

**Interfaces:**
- Consumes: nothing (pure; no Prisma import, no I/O).
- Produces, and these exact names are used by Tasks 3–7:
  - `round3(value: number): number`
  - `unitsMatch(a: string | null, b: string | null): boolean`
  - `interface MergeCandidate { id: string; catalogItemId: string; quantity: number | null; unit: string | null; checked: boolean; sortIndex: number }` — `ListItem` satisfies this structurally, so a Prisma row can be passed straight in.
  - `interface MergeTarget extends MergeCandidate { quantity: number }`
  - `interface IncomingEntry { catalogItemId: string; quantity: number | null; unit: string | null }`
  - `findMergeTarget(candidates: MergeCandidate[], incoming: IncomingEntry): MergeTarget | null`
  - `interface MergeOutcome { targetItemId: string; name: string; previousQuantity: number; quantity: number; unit: string | null }` — declared here (not in `operations.ts`) so `formState.ts` can import the type without dragging Prisma into a client module, and so Task 6's `formatMergeMessage` has no circular import.

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findMergeTarget, round3, unitsMatch, type MergeCandidate } from "./merge";

// One article, one list: every candidate below differs only in the field under test.
const ARTICLE = "11111111-1111-4111-8111-111111111111";
const OTHER_ARTICLE = "22222222-2222-4222-8222-222222222222";

/** A quantified, unchecked row of ARTICLE — the DEFAULT merge target; each test bends one field. */
function row(overrides: Partial<MergeCandidate> = {}): MergeCandidate {
  return {
    id: "row-1",
    catalogItemId: ARTICLE,
    quantity: 1,
    unit: "l",
    checked: false,
    sortIndex: 1,
    ...overrides,
  };
}

/** An incoming „2 l Milch". */
function incoming(overrides: Partial<Parameters<typeof findMergeTarget>[1]> = {}) {
  return { catalogItemId: ARTICLE, quantity: 2, unit: "l" as string | null, ...overrides };
}

describe("round3", () => {
  // The reason this function exists: float addition leaks precision the entry sheet would surface.
  it("kills the float tail of 0.1 + 0.2", () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });

  it("keeps three decimals and rounds the fourth", () => {
    expect(round3(1.2345)).toBe(1.235);
    expect(round3(0.125)).toBe(0.125);
  });

  it("leaves a whole number alone", () => {
    expect(round3(3)).toBe(3);
  });
});

describe("unitsMatch", () => {
  it("matches the same unit spelled in a different case", () => {
    expect(unitsMatch("l", "L")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(unitsMatch(" l ", "l")).toBe(true);
  });

  it("treats 'no unit' as its own bucket that matches only itself", () => {
    expect(unitsMatch(null, null)).toBe(true);
    expect(unitsMatch(null, "l")).toBe(false);
    expect(unitsMatch("l", null)).toBe(false);
  });

  // A blank string is what a cleared text input produces; it must land in the null bucket, not in
  // a third bucket of its own.
  it("treats an empty or whitespace-only unit as no unit", () => {
    expect(unitsMatch("", null)).toBe(true);
    expect(unitsMatch("   ", null)).toBe(true);
  });

  it("does not convert units: l and ml are different", () => {
    expect(unitsMatch("l", "ml")).toBe(false);
  });
});

describe("findMergeTarget", () => {
  it("merges into the same article with the same unit", () => {
    expect(findMergeTarget([row()], incoming())?.id).toBe("row-1");
  });

  it("merges when both sides have no unit at all", () => {
    expect(findMergeTarget([row({ unit: null })], incoming({ unit: null }))?.id).toBe("row-1");
  });

  it("merges across a unit case difference", () => {
    expect(findMergeTarget([row({ unit: "L" })], incoming({ unit: "l" }))?.id).toBe("row-1");
  });

  it("refuses a different unit (no conversion: 1 l and 500 ml stay apart)", () => {
    expect(findMergeTarget([row({ unit: "l" })], incoming({ unit: "ml" }))).toBeNull();
  });

  it("refuses when only one side has a unit", () => {
    expect(findMergeTarget([row({ unit: null })], incoming({ unit: "l" }))).toBeNull();
    expect(findMergeTarget([row({ unit: "l" })], incoming({ unit: null }))).toBeNull();
  });

  // D1: BOTH entries must carry a quantity. A bare „Milch" is an article-level wish and has no
  // number to add — merging it would invent one.
  it("refuses when the incoming add has no quantity", () => {
    expect(findMergeTarget([row()], incoming({ quantity: null }))).toBeNull();
  });

  it("refuses when the existing row has no quantity", () => {
    expect(findMergeTarget([row({ quantity: null })], incoming())).toBeNull();
  });

  // D2: what is already in the basket is settled.
  it("refuses a checked row", () => {
    expect(findMergeTarget([row({ checked: true })], incoming())).toBeNull();
  });

  it("refuses a row of a different article", () => {
    expect(findMergeTarget([row({ catalogItemId: OTHER_ARTICLE })], incoming())).toBeNull();
  });

  it("picks the lowest sortIndex when several rows qualify, whatever order they arrive in", () => {
    const candidates = [
      row({ id: "late", sortIndex: 9 }),
      row({ id: "early", sortIndex: 2 }),
      row({ id: "middle", sortIndex: 5 }),
    ];
    expect(findMergeTarget(candidates, incoming())?.id).toBe("early");
  });

  it("skips disqualified rows and takes the next qualifying one", () => {
    const candidates = [
      row({ id: "checked", sortIndex: 1, checked: true }),
      row({ id: "usable", sortIndex: 2 }),
    ];
    expect(findMergeTarget(candidates, incoming())?.id).toBe("usable");
  });

  it("returns nothing for an empty candidate list", () => {
    expect(findMergeTarget([], incoming())).toBeNull();
  });

  // The narrowed return type is what lets the funnel add without a non-null assertion.
  it("returns a target whose quantity is a number", () => {
    const target = findMergeTarget([row({ quantity: 1.5 })], incoming());
    expect(target?.quantity).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/lists/merge.test.ts`
Expected: FAIL — `Failed to resolve import "./merge"` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/lists/merge.ts`:

```ts
/**
 * The merge DECISION, as pure functions (recipes design §3, D1/D2).
 *
 * Why a separate module rather than a few private helpers inside operations.ts: this is the
 * subtlest rule in the feature — nine ways to say "no" and one to say "yes" — and it is the piece
 * that must be provable without a database. Keeping it pure turns the design's truth table into a
 * literal test table (merge.test.ts) and leaves operations.ts to do the one thing it is about:
 * writing. Nothing here touches Prisma, so Slice 19's recipe apply can reuse the same rule.
 */

/**
 * Rounds a quantity to three decimals.
 *
 * Why it exists: float addition leaks precision — `0.1 + 0.2` is `0.30000000000000004`. The row
 * label would hide that (formatGermanNumber caps at maximumFractionDigits: 3), but the entry
 * sheet's MENGE field prints the stored number and would eventually surface it. Rounding at the
 * same precision the UI formats at keeps the stored value and the displayed value one thing.
 */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Collapses a unit to its comparison key: trimmed, lowercased, and blank -> null.
 *
 * Case-insensitive because the entry sheet accepts free text: „L" and „l" are the same litre.
 * Blank -> null because a cleared input yields "" while the column normally holds null — without
 * this they would be two different "no unit" buckets and an add would refuse to merge for a reason
 * no user could see.
 */
function unitKey(unit: string | null): string | null {
  const trimmed = unit?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Do these two units belong to the same bucket? „No unit" is its own bucket (D1). */
export function unitsMatch(a: string | null, b: string | null): boolean {
  return unitKey(a) === unitKey(b);
}

/**
 * A row the incoming add might be absorbed by. Structurally a subset of Prisma's `ListItem`, so the
 * funnel passes loaded rows straight in with no mapping step.
 */
export interface MergeCandidate {
  id: string;
  catalogItemId: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  sortIndex: number;
}

/**
 * A candidate that PASSED: same article, same unit, unchecked, and quantified. The narrowed
 * `quantity` is the point — the caller adds to it without a non-null assertion, because the rule
 * that guarantees it lives here and nowhere else.
 */
export interface MergeTarget extends MergeCandidate {
  quantity: number;
}

/** The add being applied, after unit inheritance has been resolved (operations.ts step 5). */
export interface IncomingEntry {
  catalogItemId: string;
  quantity: number | null;
  unit: string | null;
}

/**
 * Picks the row an incoming add should be added to, or null when it must become its own row.
 *
 * ALL FIVE RULES LIVE HERE, including the article check the caller's query already performed
 * (ruling R3). The caller narrows the candidate set for cost; this function decides. Duplicating
 * a rule into the `where` clause would be exactly how the two drift apart.
 *
 * Ties break on the LOWEST sortIndex — the row nearest the top of the list, which is the one the
 * user is most likely looking at. The loop does not assume the input is sorted: the caller orders
 * the query for readability, but correctness must not depend on it.
 */
export function findMergeTarget(
  candidates: MergeCandidate[],
  incoming: IncomingEntry,
): MergeTarget | null {
  // D1: an add with no quantity has no number to contribute. Checked first because it disqualifies
  // every candidate at once — the caller uses the same fact to skip the query entirely.
  if (incoming.quantity === null) return null;

  let best: MergeTarget | null = null;
  for (const candidate of candidates) {
    // Destructured so the null check narrows the VALUE, which is what builds the MergeTarget below
    // without a cast (`candidate.quantity` would stay `number | null` after the spread).
    const { quantity } = candidate;
    if (quantity === null) continue; // D1: both sides must carry a quantity
    if (candidate.checked) continue; // D2: a settled row never absorbs
    if (candidate.catalogItemId !== incoming.catalogItemId) continue; // same article only
    if (!unitsMatch(candidate.unit, incoming.unit)) continue; // same unit bucket, no conversion
    if (best === null || candidate.sortIndex < best.sortIndex) best = { ...candidate, quantity };
  }
  return best;
}

/**
 * What a merge did, for the callers that have to show it (recipes design §3, "Making a merge
 * visible"). Declared in this pure module rather than next to applyOperation so the client-side
 * `EntryFormState` can import the type without pulling Prisma into a client bundle.
 */
export interface MergeOutcome {
  /** The row that absorbed the add — the one to highlight. NOT the id the client sent. */
  targetItemId: string;
  /** The article's display name, for „Zu 1 l Milch addiert". */
  name: string;
  /** The target's quantity BEFORE this add. */
  previousQuantity: number;
  /** The target's quantity AFTER it. */
  quantity: number;
  /** The target's unit — unchanged by the merge; the existing row wins every field but the number. */
  unit: string | null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/lists/merge.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/merge.ts src/lib/lists/merge.test.ts
git commit -m "feat: add the pure merge decision (same article, same unit, both quantified)"
```

---

### Task 3: Merge-aware `add_item`

**Files:**
- Modify: `src/lib/lists/operations.ts` (the `add_item` case; the new `applyOperationDetailed` + wrapper)
- Modify: `src/lib/lists/operations.test.ts` (new `describe("add_item — merging")` block)
- Modify: `src/app/api/lists/[listId]/ops/route.ts` (doc comment only)
- Test: `npx vitest run src/lib/lists/operations.test.ts`

**Interfaces:**
- Consumes: `findMergeTarget`, `round3`, `MergeOutcome` from Task 2; `db.absorbedEntry` from Task 1.
- Produces:
  - `interface OperationResult { item: ListItem | null; merge: MergeOutcome | null }`
  - `applyOperationDetailed(db: PrismaClient, list: List, operation: Operation): Promise<OperationResult>`
  - `applyOperation(db: PrismaClient, list: List, operation: Operation): Promise<ListItem | null>` — **unchanged signature**, now a wrapper. Its four existing call sites (`page.tsx`, `ops/route.ts`, `suggestions.ts`, `delta.test.ts`) are not edited.

This task implements steps 4–7 of the funnel (unit inheritance, target search, sum, ledger write). It deliberately does **not** implement step 3 (the ledger replay) — that is Task 4, and the first test there proves why it is needed.

- [ ] **Step 1: Write the failing tests**

In `src/lib/lists/operations.test.ts`, extend the import line:

```ts
import { applyOperation, applyOperationDetailed, parseOperation } from "./operations";
```

and append at the end of the file:

```ts
// ---------------------------------------------------------------------------
// Slice 17 — entry merging. The funnel's most delicate behaviour: an add may now
// resolve to a row the client never named.
// ---------------------------------------------------------------------------

/** Adds one entry through the funnel and returns the detailed result. */
async function add(operation: { itemId?: string; name: string; quantity?: number | null; unit?: string | null; category?: string | null }) {
  return applyOperationDetailed(db, list, {
    op: "add_item",
    itemId: operation.itemId ?? randomUUID(),
    name: operation.name,
    quantity: operation.quantity,
    unit: operation.unit,
    category: operation.category,
  });
}

describe("add_item — merging", () => {
  it("adds the quantity to an existing unchecked row and returns THAT row", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const secondId = randomUUID();

    const { item, merge } = await add({ itemId: secondId, name: "Milch", quantity: 2, unit: "l" });

    expect(item!.id).toBe(first.item!.id); // the TARGET row, not the id we sent
    expect(item!.id).not.toBe(secondId);
    expect(item!.quantity).toBe(3);
    expect(merge).toMatchObject({
      targetItemId: first.item!.id,
      name: "Milch",
      previousQuantity: 1,
      quantity: 3,
      unit: "l",
    });

    // The whole point: ONE row, not two.
    const rows = await db.listItem.findMany({ where: { listId: list.id } });
    expect(rows).toHaveLength(1);
  });

  it("leaves the target's category, unit spelling, sortIndex and checked state untouched", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "L", category: "Kühlregal" });

    await add({ name: "Milch", quantity: 2, unit: "l", category: "Vorrat" });

    const row = await db.listItem.findUniqueOrThrow({ where: { id: first.item!.id } });
    expect(row.quantity).toBe(3); // the ONLY field a merge changes
    expect(row.unit).toBe("L"); // the existing spelling wins
    expect(row.category).toBe("Kühlregal"); // never silently re-filed
    expect(row.sortIndex).toBe(first.item!.sortIndex);
    expect(row.checked).toBe(false);
  });

  it("records the absorbed add in the ledger under the client's id", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const secondId = randomUUID();

    await add({ itemId: secondId, name: "Milch", quantity: 2, unit: "l" });

    const ledger = await db.absorbedEntry.findUniqueOrThrow({ where: { id: secondId } });
    expect(ledger.listId).toBe(list.id);
    expect(ledger.targetItemId).toBe(first.item!.id);
    expect(ledger.quantity).toBe(2); // what THIS add contributed, not the total
  });

  it("does not merge into a checked row", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    await applyOperation(db, list, { op: "check_item", itemId: first.item!.id, checked: true });

    const { item, merge } = await add({ name: "Milch", quantity: 2, unit: "l" });

    expect(merge).toBeNull();
    expect(item!.id).not.toBe(first.item!.id);
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });

  it("does not merge when the incoming add carries no quantity", async () => {
    await add({ name: "Milch", quantity: 1, unit: "l" });

    const { merge } = await add({ name: "Milch" });

    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });

  it("does not merge when the existing row carries no quantity", async () => {
    await add({ name: "Milch" });

    const { merge } = await add({ name: "Milch", quantity: 2, unit: null });

    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });

  it("does not merge across different units (1 l and 500 ml stay apart)", async () => {
    await add({ name: "Milch", quantity: 1, unit: "l" });

    const { merge } = await add({ name: "Milch", quantity: 500, unit: "ml" });

    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });

  it("merges across a unit case difference", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "L" });

    const { item } = await add({ name: "Milch", quantity: 2, unit: "l" });

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(3);
  });

  it("merges into a row whose unit was INHERITED from the catalog default", async () => {
    // The catalog knows Joghurt comes in Becher; neither add names a unit, so both inherit it —
    // and must therefore land in the same bucket (funnel step 5 resolves the unit BEFORE matching).
    await db.catalogItem.create({
      data: { projectId, name: "Joghurt", normalizedName: "joghurt", defaultUnit: "Becher" },
    });
    const first = await add({ name: "Joghurt", quantity: 2 });

    const { item } = await add({ name: "Joghurt", quantity: 3 });

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(5);
    expect(item!.unit).toBe("Becher");
  });

  it("merges two rows of the same article that differ only in spelling", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });

    // Article identity is the normalized name, so „ milch " is the SAME article.
    const { item } = await add({ name: " milch ", quantity: 1.5, unit: "l" });

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(2.5);
  });

  it("rounds the sum to three decimals", async () => {
    await add({ name: "Milch", quantity: 0.1, unit: "l" });

    const { item } = await add({ name: "Milch", quantity: 0.2, unit: "l" });

    expect(item!.quantity).toBe(0.3); // not 0.30000000000000004
  });

  it("merges into the lowest sortIndex when two rows qualify", async () => {
    const top = await add({ name: "Milch", quantity: 1, unit: "l" });
    await add({ name: "Brot" });
    // A second Milch row can only exist from before this slice (or via a checked row that got
    // unchecked) — the funnel is still required to pick deterministically.
    await db.listItem.create({
      data: {
        listId: list.id,
        catalogItemId: top.item!.catalogItemId,
        quantity: 5,
        unit: "l",
        sortIndex: 99,
      },
    });

    const { item } = await add({ name: "Milch", quantity: 1, unit: "l" });

    expect(item!.id).toBe(top.item!.id);
    expect(item!.quantity).toBe(2);
  });

  it("still flows an explicitly supplied unit back to the catalog on a merged add", async () => {
    // Catalog memory is independent of WHERE the entry landed (design §3, step 7).
    await add({ name: "Milch", quantity: 1, unit: "l" });

    await add({ name: "Milch", quantity: 2, unit: "l", category: "Kühlregal" });

    const article = await db.catalogItem.findFirstOrThrow({
      where: { projectId, normalizedName: "milch" },
    });
    expect(article.defaultCategory).toBe("Kühlregal");
    expect(article.defaultUnit).toBe("l");
  });

  it("reports no merge for an ordinary add", async () => {
    const { item, merge } = await add({ name: "Brot", quantity: 1 });

    expect(merge).toBeNull();
    expect(item!.quantity).toBe(1);
  });

  it("keeps applyOperation's old contract: it returns the affected row", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });

    const returned = await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Milch",
      quantity: 2,
      unit: "l",
    });

    expect(returned!.id).toBe(first.item!.id);
    expect(returned!.quantity).toBe(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/lists/operations.test.ts`
Expected: FAIL — `applyOperationDetailed` is not exported from `./operations` (TypeScript/import error), and once that is stubbed, every merge assertion fails because a second row is created.

- [ ] **Step 3: Rewrite `applyOperation` as a detailed core plus a wrapper**

In `src/lib/lists/operations.ts`, extend the imports:

```ts
import type { List, ListItem, PrismaClient } from "@prisma/client";
import { flowBackCatalogDefaults, getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";
import { findMergeTarget, round3, type MergeOutcome } from "./merge";
```

Replace the comment block and signature above `applyOperation` (currently lines ~191–205, from `// Applies ONE operation…` through `switch (operation.op) {`) with:

```ts
/**
 * What one operation did. `item` is the affected entry (null only after remove_item); `merge` is
 * non-null ONLY when an add was absorbed by an existing row.
 *
 * Why a result object instead of just the row: since Slice 17 an add can resolve to a row whose id
 * is NOT the one the client sent, and the UI has to say so („Zu 1 l Milch addiert → 3 l"). The
 * caller cannot reconstruct the target's previous quantity afterwards — subtracting the contribution
 * back out would be a second, drifting copy of the merge arithmetic.
 */
export interface OperationResult {
  item: ListItem | null;
  merge: MergeOutcome | null;
}

/**
 * Applies ONE operation to a list and reports both the resulting entry and whether it was a merge.
 *
 * The caller (route handler / server action) has already authorized access to `list` via
 * requireListAccess and passes the loaded row — so this core never re-checks permissions, and the
 * list is known to exist. Takes the full List (not just the id) because add_item needs
 * list.projectId for the catalog get-or-create.
 *
 * Most callers want `applyOperation` below; this form exists for the one caller that renders the
 * merge cue (addEntryFromRow).
 */
export async function applyOperationDetailed(
  db: PrismaClient,
  list: List,
  operation: Operation,
): Promise<OperationResult> {
  // Every operation targets an entry by id; a malformed id must be a clean 400 before any query
  // touches the uuid column (Prisma P2023 -> fake 500 otherwise).
  if (!isUuid(operation.itemId)) throw new ApiError(400, "Ungültige Eintrags-ID");

  switch (operation.op) {
```

Then adjust the four `case` branches to return `OperationResult` instead of a bare row. In `update_item`, `check_item` and `remove_item` the change is mechanical — these three can never merge:

```ts
      return { item: updated, merge: null };   // update_item, replacing `return updated;`
```

```ts
      // check_item, replacing `return db.listItem.update({ … });`
      const checkedItem = await db.listItem.update({
        where: { id: item.id },
        data: { checked: operation.checked },
      });
      return { item: checkedItem, merge: null };
```

```ts
      return { item: null, merge: null };      // remove_item, replacing `return null;`
```

Finally add the wrapper at the very end of the file, after the closing brace of `applyOperationDetailed`:

```ts
/**
 * The operations funnel as every existing caller knows it: apply one operation, get the affected
 * entry back (null after remove_item).
 *
 * Kept as a thin wrapper rather than changing every call site, because only ONE caller
 * (addEntryFromRow) needs to know that an add was merged. The rest — the REST endpoint, the list
 * screen's check/remove/update actions, the pre-fill loop — care about the row and nothing else.
 *
 * NOTE THE CONTRACT CHANGE THIS INHERITS: since Slice 17 the returned row's id may differ from
 * `operation.itemId`. Callers must use the RETURNED row and never assume the id they sent now
 * exists as a row.
 */
export async function applyOperation(
  db: PrismaClient,
  list: List,
  operation: Operation,
): Promise<ListItem | null> {
  const { item } = await applyOperationDetailed(db, list, operation);
  return item;
}
```

- [ ] **Step 4: Make `add_item` merge-aware**

Replace the body of the `case "add_item":` branch from the idempotency check down to its `return`, so it reads:

```ts
    case "add_item": {
      // Semantic validation of the optional value fields (shape was checked by parseOperation).
      assertValidQuantity(operation.quantity);
      assertValidTextField(operation.unit, "Einheit");
      assertValidTextField(operation.category, "Kategorie");
      // Name validation (non-empty after normalization, length cap) lives inside
      // getOrCreateCatalogItem — the single source of truth for the article-name rule; it is
      // deliberately not duplicated here (DRY).

      // STEP 2 — IDEMPOTENCY: if this entry id already exists, this is a replay (retry / offline
      // queue). Checked BEFORE the ledger (step 3, Task 4): a row under this id is the stronger
      // fact, and it is what a fall-through create leaves behind.
      const existing = await db.listItem.findUnique({ where: { id: operation.itemId } });
      if (existing) {
        // Replay into the SAME list -> return the existing entry unchanged (no-op, applying twice
        // equals applying once). Same id in a DIFFERENT list -> a real id collision, which is a
        // client bug (UUIDs must be unique); 409 Conflict makes it visible instead of hiding it.
        if (existing.listId === list.id) return { item: existing, merge: null };
        throw new ApiError(409, "Eintrags-ID wird bereits verwendet");
      }

      // STEP 4 — Article identity: resolve the typed name to the project's catalog row (create on
      // first use).
      const catalogItem = await getOrCreateCatalogItem(db, {
        projectId: list.projectId,
        name: operation.name,
      });

      // STEP 5 — The unit this entry will ACTUALLY carry, resolved before anything is matched or
      // written. `undefined` = "not supplied" -> inherit the catalog default; `null` = explicit
      // empty. Computing it here rather than inline in the create is what makes two adds that both
      // inherit „Becher" land in the same merge bucket.
      const effectiveUnit = operation.unit !== undefined ? operation.unit : catalogItem.defaultUnit;
      // Normalize the "no quantity" case once: parseOperation admits both undefined and null.
      const quantity = operation.quantity ?? null;

      // STEP 6 — Find the row that should absorb this add. The query narrows to candidates only
      // (this list, this article); findMergeTarget owns every RULE, including re-checking the
      // article — one source of truth, so the `where` clause and the predicate cannot drift apart
      // (recipes design §3 / ruling R3). Skipped entirely when there is no quantity, because
      // findMergeTarget would refuse every candidate anyway and this saves a round-trip on the
      // most common add of all („Milch" with no number).
      const target =
        quantity === null
          ? null
          : findMergeTarget(
              await db.listItem.findMany({
                where: { listId: list.id, catalogItemId: catalogItem.id },
                orderBy: { sortIndex: "asc" },
              }),
              { catalogItemId: catalogItem.id, quantity, unit: effectiveUnit },
            );

      // STEP 7 — MERGE: the only field that changes is the number. Category, unit spelling,
      // sortIndex and checked state belong to the row that was already there; overwriting them
      // would silently re-file an entry the user deliberately placed.
      // KNOWN MVP LIMIT: two parallel adds can both observe no target and create two rows. That
      // race stays deliberately open because it is self-revealing (the user sees both rows), unlike
      // silent quantity loss. Closing it needs a partial unique index plus retry, which is out of
      // MVP scope.
      if (target) {
        // ONE transaction, because these two writes are one fact: "this add became part of that
        // row". If the update landed without the ledger row, a retry would add the amount twice;
        // if the ledger row landed without the update, the quantity would be lost and the retry
        // would report success. The ARRAY form of $transaction is used deliberately — the callback
        // form hands back `Omit<PrismaClient, ITXClientDenyList>`, which none of this module's
        // `PrismaClient` parameters accept (the same constraint documented in suggestions.ts).
        const contribution = quantity!;
        const [mergedItem] = await db.$transaction([
          db.listItem.update({
            where: { id: target.id },
            // An atomic increment, NOT an absolute value computed from the row we read a moment
            // ago: a read-modify-write loses one of the two amounts when two adds merge into the
            // same row concurrently — silently, because there is no duplicate row to reveal it.
            // Postgres performs the addition under the row lock, so both contributions survive.
            data: { quantity: { increment: contribution } },
          }),
          db.absorbedEntry.create({
            data: {
              id: operation.itemId, // the client's id IS the ledger key
              listId: list.id,
              targetItemId: target.id,
              quantity: contribution,
            },
          }),
        ]);

        // Derived from what was actually written, never from the stale read — the same derivation
        // the replay path (funnel step 3, Task 4) uses. "Total minus my own contribution" stays a
        // true statement even when someone else's add landed in between.
        const summed = round3(mergedItem.quantity!);
        const previousQuantity = round3(summed - contribution);

        // Flow-back still fires: an explicitly supplied category/unit is CATALOG memory and is
        // independent of where the entry landed (design §3, step 7).
        await flowBackCatalogDefaults(db, catalogItem.id, {
          category: operation.category,
          unit: operation.unit,
        });

        return {
          item: mergedItem,
          merge: {
            targetItemId: mergedItem.id,
            name: catalogItem.name,
            previousQuantity,
            quantity: summed,
            unit: mergedItem.unit,
          },
        };
      }

      // No target: create the row exactly as before this slice.
      // Append at the end: next sortIndex = current max + 1. _max is null on an empty list -> 0.
      // (Not race-free under concurrent adds, but a duplicate sortIndex only makes ordering
      // ambiguous, never corrupts data — acceptable for the MVP, revisit with Slice 7 if needed.)
      const maxAgg = await db.listItem.aggregate({
        where: { listId: list.id },
        _max: { sortIndex: true },
      });
      const sortIndex = (maxAgg._max.sortIndex ?? 0) + 1;

      const created = await db.listItem.create({
        data: {
          id: operation.itemId, // the client-generated id IS the identity — never remap it
          listId: list.id,
          catalogItemId: catalogItem.id,
          quantity,
          // `undefined` = "not supplied" → inherit the catalog default. `null` = explicit empty
          // (e.g. adding under the „Ohne Kategorie" chip) → store null on the entry. Using `??`
          // here would wrongly collapse both and make an explicit clear impossible.
          unit: effectiveUnit,
          category:
            operation.category !== undefined ? operation.category : catalogItem.defaultCategory,
          sortIndex,
        },
      });

      // Flow-back (Slice 4, MVP design §4.4): a category/unit the user supplied EXPLICITLY at add
      // time becomes the catalog default, so future lists inherit it. Inherited values arrive as
      // undefined; explicit clears arrive as null — both are skipped by the helper (`!= null`),
      // so this never writes a default back onto itself or erases shared catalog memory. Runs only
      // on first creation (replays returned early above), keeping add idempotent.
      await flowBackCatalogDefaults(db, catalogItem.id, {
        category: operation.category,
        unit: operation.unit,
      });
      return { item: created, merge: null };
    }
```

Note `quantity!`: inside `if (target)` the target could only have been found when `quantity !== null` (the ternary above), but TypeScript cannot see through that. If the non-null assertion offends the linter, hoist the merge block into `if (target && quantity !== null)` — behaviourally identical.

**Known limit:** target discovery and the no-target create are not serialized. Two parallel adds can
both find no target and create two visible rows. This is deliberately left open for the MVP because
the duplicate is self-revealing; preventing it requires a partial unique index plus retry. The merge
write itself must remain an atomic increment, because losing a concurrent quantity is silent.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/lists/operations.test.ts`
Expected: PASS for every test in `add_item — merging`, and every pre-existing test in the file still green — in particular "a later add of the same article inherits the flowed-back default", which adds Milch twice but the second time **without** a quantity, so D1 keeps it a separate row.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. Pay attention to `src/lib/lists/addEntry.test.ts`, `src/lib/lists/delta.test.ts` and `src/lib/suggestions/suggestions.test.ts` — all of them add articles repeatedly. They stay green because pre-fill and the delta fixtures add name-only entries (no quantity → no merge). If one does fail, do **not** weaken the merge rule: check whether the fixture really means to create two quantified rows of the same article, and give it two different articles instead.

- [ ] **Step 7: Record the contract change where the wire is documented**

In `src/app/api/lists/[listId]/ops/route.ts`, replace the `POST` doc comment:

```ts
/**
 * POST /api/lists/:listId/ops
 * Applies one operation to the list. Member-level.
 * Request body: an Operation (see src/lib/lists/operations.ts for the exact shapes).
 * Response: 200 ListItem (the resulting entry) — or 200 `null` after remove_item.
 */
```

with:

```ts
/**
 * POST /api/lists/:listId/ops
 * Applies one operation to the list. Member-level.
 * Request body: an Operation (see src/lib/lists/operations.ts for the exact shapes).
 * Response: 200 ListItem (the resulting entry) — or 200 `null` after remove_item.
 *
 * SINCE SLICE 17: the returned entry's `id` may DIFFER from the `itemId` that was posted. An
 * add_item whose article, unit and quantity match an existing unchecked row is absorbed by that row
 * (recipes design §3), and the absorbed row is what comes back. A client must therefore read the
 * response instead of assuming the id it generated now exists — replaying the same operation later
 * resolves to the same target row via the server-side AbsorbedEntry ledger, so retries stay safe.
 */
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/lists/operations.ts src/lib/lists/operations.test.ts "src/app/api/lists/[listId]/ops/route.ts"
git commit -m "feat: merge add_item into a matching unchecked row instead of duplicating it"
```

---

### Task 4: Replay safety — the ledger read

**Files:**
- Modify: `src/lib/lists/operations.ts` (insert funnel step 3)
- Modify: `src/lib/lists/operations.test.ts` (new `describe("add_item — merge idempotency")` block)
- Test: `npx vitest run src/lib/lists/operations.test.ts`

**Interfaces:**
- Consumes: everything from Task 3, plus `db.absorbedEntry`.
- Produces: no new exports. It changes `applyOperationDetailed`'s **behaviour** for a replayed merged add.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lists/operations.test.ts`:

```ts
describe("add_item — merge idempotency", () => {
  // THE test of this slice. Without the ledger, replaying a merged add adds the amount again —
  // silently, with no duplicate row to reveal it.
  it("replaying a merged add does not add the quantity twice", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    const merged = { itemId: replayId, name: "Milch", quantity: 2, unit: "l" };

    await add(merged);
    const { item, merge } = await add(merged); // the retry

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(3); // NOT 5
    // The replay reports the same outcome the first application did, so a retried request paints
    // the same banner rather than nothing.
    expect(merge).toMatchObject({ previousQuantity: 1, quantity: 3 });
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(1);
  });

  // The subtlest behaviour in the feature, and the consistency rule with remove_item: once the
  // target row is gone, the client's id is free again — exactly as it is after a remove.
  it("re-creates the entry when the target row was deleted since", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    const merged = { itemId: replayId, name: "Milch", quantity: 2, unit: "l" };
    await add(merged);

    await applyOperation(db, list, { op: "remove_item", itemId: first.item!.id });
    const { item, merge } = await add(merged); // the retry, target gone

    expect(item!.id).toBe(replayId); // a real row under the client's own id
    expect(item!.quantity).toBe(2);
    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
  });

  it("keeps the stale ledger row harmless on a second replay after that", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    const merged = { itemId: replayId, name: "Milch", quantity: 2, unit: "l" };
    await add(merged);
    await applyOperation(db, list, { op: "remove_item", itemId: first.item!.id });
    await add(merged); // re-created under replayId

    const { item } = await add(merged); // and again

    // Step 2 (a row with this id exists) is reached before step 3, so the stale ledger row pointing
    // at the deleted target is never consulted again.
    expect(item!.id).toBe(replayId);
    expect(item!.quantity).toBe(2);
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
  });

  it("composes two different adds into the correct sum", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });

    await add({ name: "Milch", quantity: 2, unit: "l" });
    const { item } = await add({ name: "Milch", quantity: 0.5, unit: "l" });

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(3.5);
    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(2);
  });

  it("rejects a ledger id replayed against a DIFFERENT list with 409", async () => {
    await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    await add({ itemId: replayId, name: "Milch", quantity: 2, unit: "l" });

    const otherList = await db.list.create({ data: { projectId, name: "Zweite Liste" } });

    // Same rule as a ListItem id reused across lists: a reused UUID is a client bug, and it must
    // surface as a clean 409 rather than a Prisma unique-constraint 500.
    await expect(
      applyOperationDetailed(db, otherList, {
        op: "add_item",
        itemId: replayId,
        name: "Milch",
        quantity: 2,
        unit: "l",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("discards the ledger with the list it belongs to", async () => {
    await add({ name: "Milch", quantity: 1, unit: "l" });
    await add({ name: "Milch", quantity: 2, unit: "l" });
    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(1);

    await db.list.delete({ where: { id: list.id } });

    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/lists/operations.test.ts -t "merge idempotency"`
Expected: FAIL — "replaying a merged add does not add the quantity twice" reports `expected 5 to be 3` (the replay merged a second time), and the 409 test fails with a Prisma `P2002` unique-constraint error instead of an `ApiError`.

- [ ] **Step 3: Insert funnel step 3**

In `src/lib/lists/operations.ts`, inside `case "add_item":`, insert between the `existing` block (step 2) and the `getOrCreateCatalogItem` call (step 4):

```ts
      // STEP 3 — REPLAY OF A MERGE. No row carries this id, but the ledger may say it was absorbed
      // by one. Without this lookup a retried merged add would add its quantity a SECOND time, and
      // nothing on screen would reveal it (there is no duplicate row to notice).
      const absorbed = await db.absorbedEntry.findUnique({ where: { id: operation.itemId } });
      if (absorbed) {
        // Same id, different list: a reused UUID — the exact mirror of step 2's cross-list rule.
        // Falling through would try to insert a second ledger row under this primary key and turn a
        // client bug into a 500 (ruling R4).
        if (absorbed.listId !== list.id) {
          throw new ApiError(409, "Eintrags-ID wird bereits verwendet");
        }
        // `include`: the banner names the ARTICLE, whose name lives on the catalog row (article
        // identity, MVP design §3.1) — one query instead of a second round-trip.
        const target = await db.listItem.findFirst({
          where: { id: absorbed.targetItemId, listId: list.id },
          include: { catalogItem: true },
        });
        // The target must STILL EXIST. If it was deleted since (swipe-to-delete), the ledger is
        // ignored and this add falls through to a normal create — deliberately the same behaviour
        // add_item already has after a remove_item: the id is free again, so a replay re-creates
        // the entry. One rule, not two (recipes design §3).
        if (target) {
          // Reconstruct the outcome of the ORIGINAL application from the contribution the ledger
          // recorded, so a retry renders the identical banner instead of a silent nothing. A null
          // quantity means someone cleared the row afterwards — there is no sum left to describe,
          // so report the row without a merge cue rather than invent numbers.
          const merge =
            target.quantity === null
              ? null
              : {
                  targetItemId: target.id,
                  name: target.catalogItem.name,
                  previousQuantity: round3(target.quantity - absorbed.quantity),
                  quantity: target.quantity,
                  unit: target.unit,
                };
          return { item: target, merge };
        }
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/lists/operations.test.ts`
Expected: PASS — both new describe blocks and every pre-existing test.

- [ ] **Step 5: Run the whole suite and the linter**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: exit 0. Warnings inherited from earlier slices (unused typed mock parameters in `ListBody.test.tsx`) are acceptable; **errors are not**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lists/operations.ts src/lib/lists/operations.test.ts
git commit -m "feat: make a merged add replay-safe via the AbsorbedEntry ledger"
```

---

### Task 5: `addEntryFromRow` reports the merge

**Files:**
- Modify: `src/lib/lists/addEntry.ts`
- Modify: `src/lib/lists/addEntry.test.ts`
- Test: `npx vitest run src/lib/lists/addEntry.test.ts`

**Interfaces:**
- Consumes: `applyOperationDetailed` (Task 3), `MergeOutcome` (Task 2).
- Produces: `AddEntryFromRowResult` gains `merge: MergeOutcome | null`. Existing fields `item` and `needsCategory` keep their meaning; `needsCategory` is now **never true after a merge**.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lists/addEntry.test.ts`:

```ts
describe("addEntryFromRow — merging (Slice 17)", () => {
  it("adds the quantity to the row that is already on the list", async () => {
    const { list } = await seed();
    const first = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1 l Milch",
      activeCategory: null,
    });

    const { item, merge } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "2 l Milch",
      activeCategory: null,
    });

    expect(item.id).toBe(first.item.id);
    expect(item.quantity).toBe(3);
    expect(merge).toMatchObject({ name: "Milch", previousQuantity: 1, quantity: 3, unit: "l" });
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
  });

  // The rule from the design: the row already existed and already has whatever category it has, so
  // the entry sheet must not open on top of a merge.
  it("never asks for a category after a merge", async () => {
    const { list } = await seed();
    // First add lands uncategorized — the case that normally triggers the sheet.
    await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1 l Milch",
      activeCategory: null,
    });

    const { needsCategory, merge } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "2 l Milch",
      activeCategory: null,
    });

    expect(merge).not.toBeNull();
    expect(needsCategory).toBe(false);
  });

  it("reports no merge for an ordinary add", async () => {
    const { list } = await seed();

    const { merge, needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: null,
    });

    expect(merge).toBeNull();
    // Unchanged Slice 12 behaviour: a brand-new article with no category still opens its sheet.
    expect(needsCategory).toBe(true);
  });

  it("does not merge a bare name into a quantified row", async () => {
    const { list } = await seed();
    await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1 l Milch",
      activeCategory: null,
    });

    const { merge } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: null,
    });

    // D1 needs a quantity on BOTH sides — this is exactly the case Slice 19's ordering rule
    // (recipes first, pre-fill second) exists to avoid.
    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/lists/addEntry.test.ts`
Expected: FAIL — `merge` does not exist on the result (TypeScript error / `undefined` rather than an object).

- [ ] **Step 3: Wire the detailed funnel through**

In `src/lib/lists/addEntry.ts`, change the import:

```ts
import { applyOperationDetailed } from "./operations";
```

Extend the result interface:

```ts
export interface AddEntryFromRowResult {
  item: ListItem;
  /** The cue for the UI to open the entry sheet on the category chips. */
  needsCategory: boolean;
  /**
   * Non-null when this add was absorbed by a row that was already on the list (Slice 17). Carries
   * what the banner needs — the target's name and its quantity before and after — because only the
   * funnel saw the previous value. `merge !== null` is the "did it merge?" answer.
   */
  merge: MergeOutcome | null;
}
```

with the type import at the top:

```ts
import type { MergeOutcome } from "./merge";
```

Replace the `applyOperation` call and the return:

```ts
  const { item, merge } = await applyOperationDetailed(db, list, {
    op: "add_item",
    itemId: input.itemId,
    // ONLY the article name reaches the catalog — the rule Slice 15 exists to
    // preserve. An empty name still travels: getOrCreateCatalogItem owns that
    // error („Name darf nicht leer sein"), and duplicating it here would drift.
    name: parsed.name,
    // `undefined` = "not supplied" → inherit the catalog default. `null` from the
    // parser means "found nothing", which is the same thing, so both collapse to
    // undefined rather than to an explicit clear.
    quantity: parsed.quantity ?? undefined,
    // A parsed unit is passed as an ORDINARY explicit unit, so Slice 4's
    // flow-back applies and the project learns that Milch comes in litres
    // (ruling 3). The parser only ever emits a unit from the curated list or the
    // project's own vocabulary, so this is a recognised word, not a guessed one.
    unit: parsed.unit ?? undefined,
    category,
  });

  // applyOperationDetailed returns null only for remove_item. Asserting it loudly beats
  // a non-null assertion, which would hide a future contract change.
  if (!item) throw new Error("add_item must return the affected entry");

  return {
    item,
    // Both halves matter: a KNOWN article without a category is a choice the user
    // already made, and a new article that inherited a chip needs no prompt.
    //
    // `merge === null` is defense in depth (Slice 17): a merge can only happen when a row for this
    // article is already on the list, which means the catalog knows the article, which means
    // `knownArticle` is non-null anyway. Saying it out loud keeps the rule LOCAL instead of
    // emergent — if the lookup above ever changes, the sheet still cannot open on top of a merge.
    needsCategory: merge === null && knownArticle === null && item.category === null,
    merge,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/lists/addEntry.test.ts`
Expected: PASS — the four new tests and every pre-existing one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/addEntry.ts src/lib/lists/addEntry.test.ts
git commit -m "feat: report a merged add from addEntryFromRow and suppress the category prompt"
```

---

### Task 6: The merge banner

**Files:**
- Modify: `src/lib/lists/merge.ts` (add `formatMergeMessage`)
- Modify: `src/lib/lists/merge.test.ts`
- Modify: `src/app/lists/[listId]/formState.ts`
- Modify: `src/app/lists/[listId]/page.tsx`
- Modify: `src/app/lists/[listId]/ListBody.tsx`
- Modify: `src/app/lists/[listId]/ListBody.module.css`
- Modify: `src/app/lists/[listId]/ListBody.test.tsx`
- Test: `npx vitest run src/lib/lists/merge.test.ts "src/app/lists/[listId]/ListBody.test.tsx"`

**Interfaces:**
- Consumes: `MergeOutcome` (Task 2), `addEntryFromRow`'s `merge` (Task 5), the existing `Banner` primitive and `formatQuantityLabel`.
- Produces:
  - `formatMergeMessage(merge: MergeOutcome): string` → e.g. `"Zu 1 l Milch addiert → 3 l"`.
  - `EntryFormState.merge: MergeOutcome | null` (and `ENTRY_FORM_IDLE.merge === null`).

- [ ] **Step 1: Write the failing text test**

Append to `src/lib/lists/merge.test.ts`:

```ts
import { formatMergeMessage } from "./merge";

describe("formatMergeMessage", () => {
  it("names the row that absorbed the add and its new total", () => {
    expect(
      formatMergeMessage({
        targetItemId: "row-1",
        name: "Milch",
        previousQuantity: 1,
        quantity: 3,
        unit: "l",
      }),
    ).toBe("Zu 1 l Milch addiert → 3 l");
  });

  it("uses the German decimal comma", () => {
    expect(
      formatMergeMessage({
        targetItemId: "row-1",
        name: "Milch",
        previousQuantity: 0.5,
        quantity: 2,
        unit: "l",
      }),
    ).toBe("Zu 0,5 l Milch addiert → 2 l");
  });

  it("works for an article without a unit", () => {
    expect(
      formatMergeMessage({
        targetItemId: "row-1",
        name: "Zwiebeln",
        previousQuantity: 2,
        quantity: 5,
        unit: null,
      }),
    ).toBe("Zu 2 Zwiebeln addiert → 5");
  });
});
```

(Merge the new import into the existing `import { … } from "./merge";` line rather than adding a second one.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/lists/merge.test.ts`
Expected: FAIL — `formatMergeMessage is not a function` / no such export.

- [ ] **Step 3: Add the formatter**

Append to `src/lib/lists/merge.ts`:

```ts
import { formatQuantityLabel } from "@/lib/format/quantity";

/**
 * The German sentence that makes a merge visible: „Zu 1 l Milch addiert → 3 l".
 *
 * Why the copy lives next to the rule rather than in the component: a row silently changing from
 * 2 l to 3 l reads as a bug, so this sentence is part of the feature, not decoration — and putting
 * it here makes it testable without a DOM. It reuses formatQuantityLabel, so the German decimal
 * comma and the "quantity without a unit" case are handled exactly as the row label handles them.
 */
export function formatMergeMessage(merge: MergeOutcome): string {
  const before = formatQuantityLabel(merge.previousQuantity, merge.unit);
  const after = formatQuantityLabel(merge.quantity, merge.unit);
  return `Zu ${before} ${merge.name} addiert → ${after}`;
}
```

Move the `import { formatQuantityLabel } …` line to the top of the file with the other imports (the module has none yet, so it becomes line 1 above the file's doc comment's closing — keep the doc comment first).

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/lists/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component test**

In `src/app/lists/[listId]/ListBody.test.tsx`, append:

```ts
describe("ListBody — merge banner (Slice 17)", () => {
  /** An add action that reports the add was absorbed by the Milch row. */
  const mergedAdd = vi.fn(async () => ({
    error: null,
    ok: true,
    openEntryId: null,
    itemId: milch.id,
    merge: {
      targetItemId: milch.id,
      name: "Milch",
      previousQuantity: 1,
      quantity: 3,
      unit: "l",
    },
  }));

  it("explains that the quantity was added to an existing row", async () => {
    renderBody({ addAction: mergedAdd });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "2 l Milch{Enter}");

    // role="status": the banner is a polite live region, which is how a screen-reader user learns
    // that the row above changed rather than a new one appearing.
    expect(await screen.findByRole("status")).toHaveTextContent("Zu 1 l Milch addiert → 3 l");
  });

  it("shows no banner for an ordinary add", async () => {
    renderBody();

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "Brot{Enter}");

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "src/app/lists/[listId]/ListBody.test.tsx" -t "merge banner"`
Expected: FAIL — no element with role `status` is found (the banner does not exist yet). A TypeScript complaint about the extra `merge` key in the mocked action's return is expected too and disappears in Step 7.

- [ ] **Step 7: Carry the merge to the client**

In `src/app/lists/[listId]/formState.ts`, add the field and extend the idle value:

```ts
import type { MergeOutcome } from "@/lib/lists/merge";
```

```ts
  /**
   * Set when the add was ABSORBED by a row that was already on the list (Slice 17). The row's
   * quantity changed without a new row appearing, which reads as a bug unless it is announced —
   * so this drives both the banner and the target row's highlight. null for every other outcome.
   *
   * A type-only import: MergeOutcome lives in the pure merge module precisely so this
   * client-imported file never pulls Prisma types into the browser bundle.
   */
  merge: MergeOutcome | null;
```

```ts
export const ENTRY_FORM_IDLE: EntryFormState = {
  error: null,
  ok: false,
  openEntryId: null,
  itemId: null,
  merge: null,
};
```

In `src/app/lists/[listId]/page.tsx`, `toEntryFormState` becomes:

```ts
function toEntryFormState(error: unknown, itemId: string | null): EntryFormState {
  if (error instanceof ApiError) {
    // merge: null — a failed operation merged nothing.
    return { error: error.message, ok: false, openEntryId: null, itemId, merge: null };
  }
  throw error;
}
```

`addEntryAction`'s success return becomes:

```ts
      const { item, needsCategory, merge } = await addEntryFromRow(prisma, l, {
        itemId,
        name,
        activeCategory,
      });
      revalidatePath(`/lists/${listId}`);
      // The design's rule: a brand-new article with no category opens its sheet. A merge never
      // does — the row already existed and already carries whatever category it has.
      return {
        error: null,
        ok: true,
        openEntryId: needsCategory ? item.id : null,
        itemId: item.id,
        // Slice 17: non-null when this add flowed into an existing row, so the body can say so.
        merge,
      };
```

And `updateEntryAction`'s success return gains `merge: null`:

```ts
      return { error: null, ok: true, openEntryId: null, itemId, merge: null };
```

In `src/app/lists/[listId]/ListBody.tsx`, import the primitive and the formatter:

```ts
import { Banner } from "@/components/ui/Banner";
import { formatMergeMessage } from "@/lib/lists/merge";
```

and render the banner directly below the trailing row, replacing the `addState.error` block at the end of `<div className={styles.content}>`:

```tsx
        {/* An add that failed validation (an empty name reaching the server, a
            name over the length cap) reports here — the row itself has no room. */}
        {addState.error ? <p className={styles.addError}>{addState.error}</p> : null}

        {/* Slice 17: the add went INTO an existing row. Without this line a row
            quietly changing from 1 l to 3 l reads as a bug. It sits under the
            trailing row (where the user's attention already is) and survives until
            the next add — the same lifecycle as the error above it. */}
        {addState.merge ? (
          <div className={styles.mergeBanner}>
            <Banner tone="info">{formatMergeMessage(addState.merge)}</Banner>
          </div>
        ) : null}
```

In `src/app/lists/[listId]/ListBody.module.css`, append:

```css
/* Spacing only — the Banner primitive owns the tint, the radius and the type. */
.mergeBanner {
  margin-top: 8px;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run "src/app/lists/[listId]/ListBody.test.tsx"`
Expected: PASS — the two new tests and every pre-existing one.

- [ ] **Step 9: Run the whole suite and the build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS — no type error from the four `EntryFormState` literals.

- [ ] **Step 10: Commit**

```bash
git add src/lib/lists/merge.ts src/lib/lists/merge.test.ts "src/app/lists/[listId]"
git commit -m "feat: announce a merged add with an inline banner on the list screen"
```

---

### Task 7: Highlight the row that absorbed the quantity

**Files:**
- Modify: `src/app/lists/[listId]/EntryRow.tsx`
- Modify: `src/app/lists/[listId]/EntryRow.module.css`
- Modify: `src/app/lists/[listId]/EntryRow.test.tsx`
- Modify: `src/app/lists/[listId]/ListBody.tsx`
- Modify: `src/app/lists/[listId]/ListBody.test.tsx`
- Test: `npx vitest run "src/app/lists/[listId]"`

**Interfaces:**
- Consumes: `EntryFormState.merge` (Task 6).
- Produces: `EntryRowProps.flashNonce?: number | null` — a counter, not a boolean: a row that absorbs twice within the animation's 1.4 s must replay it, and a CSS animation only restarts when the element remounts or the rule changes.

- [ ] **Step 1: Write the failing tests**

In `src/app/lists/[listId]/EntryRow.test.tsx`, append:

```ts
describe("EntryRow — merge flash (Slice 17)", () => {
  it("marks the row as flashing when a nonce is supplied", () => {
    const { container } = renderRow({ flashNonce: 1 });

    // A data attribute, not a CSS-Module class: the class name is a generated hash and meaningless
    // to a test, while the attribute is the contract this component promises.
    expect(container.querySelector("[data-flash]")).not.toBeNull();
  });

  it("does not mark a row that did not change", () => {
    const { container } = renderRow();

    expect(container.querySelector("[data-flash]")).toBeNull();
  });
});
```

(`renderRow` is the file's existing helper — it already spreads `render`'s result, so `container` comes back with no change to it.)

In `src/app/lists/[listId]/ListBody.test.tsx`, append to the merge describe block from Task 6:

```ts
  it("highlights the row that absorbed the quantity, and only that row", async () => {
    const { container } = renderBody({ addAction: mergedAdd });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "2 l Milch{Enter}");

    await waitFor(() =>
      expect(container.querySelector(`[data-item-id="${milch.id}"] [data-flash]`)).not.toBeNull(),
    );
    expect(container.querySelector(`[data-item-id="${butter.id}"] [data-flash]`)).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/lists/[listId]/EntryRow.test.tsx" "src/app/lists/[listId]/ListBody.test.tsx" -t "flash"`
Expected: FAIL — `[data-flash]` is never found (and TypeScript rejects the unknown `flashNonce` prop).

- [ ] **Step 3: Add the flash to `EntryRow`**

In `src/app/lists/[listId]/EntryRow.tsx`, extend the props:

```ts
type EntryRowProps = {
  entry: ListEntry;
  /** A completed list is read-only: desaturated, no checking, no swipe, no sheet. */
  frozen: boolean;
  /**
   * Non-null while this row should show the 1.4 s highlight (Slice 17) — the cue that the row's
   * quantity just absorbed an add instead of a new row appearing.
   *
   * WHY A COUNTER RATHER THAN A BOOLEAN: a CSS animation replays only when the element is
   * remounted or the matching rule changes. Adding to the same row twice inside 1.4 s would
   * otherwise be a silent second change. The value is used as the row's `key`, so each new nonce
   * remounts exactly this one element and restarts the animation.
   *
   * This is deliberately NOT Slice 16 (highlighting what a REMOTE member changed, which needs a
   * FlashProvider and a poller seam). Here the server names the changed row in its own response to
   * the add, so nothing extra is needed. Slice 16 should absorb this when it lands.
   */
  flashNonce?: number | null;
  /** Receives the TARGET state, matching check_item's idempotent semantics. */
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
};
```

Update the destructuring:

```ts
export function EntryRow({ entry, frozen, flashNonce = null, onToggle, onOpen, onDelete }: EntryRowProps) {
```

and the inner row element:

```tsx
      <div
        key={flashNonce ?? "idle"}
        className={[
          styles.row,
          offset === null ? styles.settling : "",
          flashNonce !== null ? styles.flash : "",
        ]
          .filter(Boolean)
          .join(" ")}
        // The contract the flash test reads. Kept as a data attribute because the class name is a
        // generated CSS-Module hash and tests must never assert on it.
        data-flash={flashNonce ?? undefined}
```

(leave the `style`, the pointer handlers and the children exactly as they are).

In `src/app/lists/[listId]/EntryRow.module.css`, append:

```css
/*
 * The 1.4 s absorb highlight (recipes design §3). `sl-flash` already lives in globals.css — it came
 * with the design handoff's keyframes for exactly this kind of cue — so this rule only binds it.
 * The global prefers-reduced-motion block neutralises it for users who asked for less motion.
 */
.flash {
  animation: sl-flash 1.4s ease-out;
}
```

- [ ] **Step 4: Wire it in `ListBody`**

In `src/app/lists/[listId]/ListBody.tsx`, add the state next to the other view state:

```ts
  // Which row most recently absorbed an add, and how many times we have flashed since mount. The
  // counter is what makes a second merge into the SAME row replay the animation (see EntryRow).
  const [flash, setFlash] = useState<{ id: string; nonce: number } | null>(null);
```

Extend the add action wrapper:

```ts
  const [addState, dispatchAdd] = useActionState(async (prev: EntryFormState, formData: FormData) => {
    const next = await addAction(prev, formData);
    if (next.openEntryId) setOpenEntryId(next.openEntryId);
    // The server tells us exactly which row changed, so the highlight costs one setState.
    if (next.merge) {
      const targetId = next.merge.targetItemId;
      setFlash((current) => ({ id: targetId, nonce: (current?.nonce ?? 0) + 1 }));
    }
    return next;
  }, ENTRY_FORM_IDLE);
```

Pass it to **both** `EntryRow` call sites (the grouped „Alle" view and the filtered view) — they are otherwise identical:

```tsx
                      flashNonce={flash?.id === item.id ? flash.nonce : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "src/app/lists/[listId]"`
Expected: PASS — the flash tests and every pre-existing list-screen test.

- [ ] **Step 6: Verify the whole suite, the linter and the build**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: exit 0 with no errors.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/lists/[listId]"
git commit -m "feat: flash the row that absorbed a merged add"
```

---

### Task 8: Implementation review + meta plan

**Files:**
- Create: `docs/implementation-reviews/slice-17-entry-merging.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–7.
- Produces: nothing executable. This is the Definition of Done (CLAUDE.md § Implementation review) and the handoff Slice 18 reads.

- [ ] **Step 1: Re-run the full verification and record the real numbers**

Run: `npm test`
Run: `npm run lint`
Run: `npx tsc --noEmit`

Write down the actual output. `tsc --noEmit` is known to exit non-zero from test-mock typing errors inherited from earlier slices (`RevokeSheet.test.tsx`, `CatalogBrowser.test.tsx`, `InviteForm.test.tsx`) — report whether any **Slice 17 file** appears in its output, and do not claim a clean run if it is not clean.

- [ ] **Step 2: Write the review document**

Create `docs/implementation-reviews/slice-17-entry-merging.md`, in English, following the five required sections from CLAUDE.md and the shape of `docs/implementation-reviews/slice-9-admin-area.md`:

1. **What was achieved** — the slice goal (adds for an article already on the list sum into that row) and whether it was fully met.
2. **Steps taken** — one line per task: the ledger model, the pure decision, the merge-aware funnel, replay safety, the `addEntryFromRow` contract, the banner, the flash.
3. **Core components built** — `merge.ts`, `AbsorbedEntry`, `applyOperationDetailed`, the `applyOperation` wrapper, the `flashNonce` prop — one sentence each.
4. **Most important lines of code** — quote 5–10 small blocks with why they carry the weight. At minimum: the step-3 ledger read including the "target must still exist" fall-through, the `$transaction` pairing the update with the ledger write, `effectiveUnit` being resolved before matching, and the `merge === null &&` guard on `needsCategory`.
5. **Architecture contribution** — `add_item` stopped guaranteeing that a row with the client's id exists, and the ledger is what keeps the idempotent-operations model intact under that; this is the prerequisite Slice 19 applies recipes through, and the reason applying two recipes that both need milk yields one row.

- [ ] **Step 3: Update the meta plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- In the slice table, row 17: replace `_to be created_` with a link to this plan, and `⬜ Open` with `✅ Done / verified` (or an explicit caveat if anything was skipped).
- Add a progress-log entry at the top of the log, dated, in the established shape: **Delivered / Tested / Deviations from the plan / Inherited open items / Next open slice**. The next open slice is **Slice 18 (Recipes: core, management, settings)**.
- Record the two rulings this plan added beyond the spec, because Slice 19 will rely on them: `applyOperationDetailed` is the seam that reports a merge, and a ledger id replayed against a different list answers 409.

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-17-entry-merging.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: add the Slice 17 implementation review and update the meta plan"
```

---

## Spec coverage check

Every requirement of the spec that belongs to slice 1 of 3, and where it is implemented:

| Spec | Requirement | Task |
|---|---|---|
| §2 | `AbsorbedEntry` model, `targetItemId` deliberately not an FK | 1 |
| §3 step 3 | Ledger replay, conditional on the target still existing | 4 |
| §3 step 5 | `effectiveUnit` resolved before matching | 3 |
| §3 step 6 | Merge target search: article, unit bucket, unchecked, quantified, lowest `sortIndex` | 2, 3 |
| §3 step 7 | Sum + ledger write + flow-back; target's other fields untouched | 3 |
| §3 | Rounding to 3 decimals | 2, 3 |
| §3 | Contract change: `needsCategory` false on merge, callers use the returned row | 5 |
| §3 | Delta sync unchanged (`@updatedAt` bump ships it) — **no code change**, asserted by the untouched `delta.test.ts` staying green | 3 |
| §3 | Making a merge visible: inline `Banner` + 1.4 s row highlight | 6, 7 |
| §10 | Pure merge truth table | 2 |
| §10 | DB tests: merge returns the target; ledger replay is a no-op; replay after deletion re-creates; two merges compose; fields untouched; flow-back still fires | 3, 4 |
| §10 | Component tests (jsdom, roles/text) | 6, 7 |

**Deliberately out of this slice** (spec §11 assigns them to slices 2 and 3): recipes, project settings and labels, `expandRecipe`, the two-step new-list sheet, building a recipe from a completed list, and the `suggestionRuleN` 2 → 3 change. Permission tests for the recipe screens belong there too — this slice adds no route and therefore no new permission surface.
