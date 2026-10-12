# Slice 20 — Unit Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Units of one scale group (g/Pfund/kg, ml/cl/dl/l, mm/cm/m) convert into each other, so
„500 ml Milch" merges into „1 l Milch" as 1,5 l, lands in the catalog's default unit on a new row,
no longer re-units the catalog, and the entry sheet converts MENGE live when EINHEIT changes.

**Architecture:** A new pure module `src/lib/units/` owns the unit vocabulary (moved out of the
parser), `round3` (moved out of `merge.ts`) and the scale groups. The `add_item` funnel in
`operations.ts` uses it at three points — effective unit (step 5), merge match + contribution
(step 6, via `findMergeTarget`), and flow-back — so typed adds, recipe applies and pre-fills all
inherit the behaviour. The entry sheet uses the same module client-side with an anchor so live
conversion never chains roundings.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/Neon, Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-10-12-unit-scaling-design.md](../specs/2026-10-12-unit-scaling-design.md)
— decisions U1–U12 are referenced by number below.

## Global Constraints

- Scale groups, verbatim (U1): weight base g: `g 1, Pfund 500, kg 1000` · volume base ml:
  `ml 1, cl 10, dl 100, l 1000` · length base mm: `mm 1, cm 10, m 1000`.
- Not scaled (U2): Stk, Packung, Dose, Flasche, Glas, Becher, Bund, Beutel, Tüte, Rolle, Tafel,
  Scheibe, Kiste, Karton, TL, EL, Prise — and any unit the alias table does not know.
- Converted quantities are rounded with `round3` (U6).
- No schema change, no migration (U12).
- `update_item` never converts and its flow-back is unchanged (U8, U10).
- CLAUDE.md documentation standard: every function gets a what+why comment; non-obvious lines get
  reasoning comments; never thin out existing comments when moving code (move them with it).
- Code and comments in English; user-facing strings stay German.
- Component tests: `// @vitest-environment jsdom`, Testing Library, assert roles/text, never
  CSS-Module class names.
- DB tests run against the Neon `test` branch via `.env.test` (never copy `.env`'s URL).

## Review Focus

Inputs the spec implies but its test list does not exercise, most likely to bite first. Each has
its test added to the owning task.

1. **A conversion that rounds to zero** (0,4 g into a catalog in kg → `round3(0.0004) = 0`).
   Expected: no 400 „Menge muss eine positive Zahl sein", no ledger row with contribution 0 (which
   is the presence-merge replay discriminator) — the add behaves as unconvertible and becomes its
   own row in its own unit. → `convertQuantity` returns `null` for a zero result (Task 2); tests
   in Tasks 2, 3, 4.
2. **Catalog default in a free-text spelling** („Liter", „KG"). Expected: 500 ml converts and the
   row is spelled like the catalog („0,5 Liter"). → Task 4.
3. **Pfund as catalog default.** Expected: 250 g → 0,5 Pfund, 1 kg → 2 Pfund. → Tasks 2, 4.
4. **Unquantified same-group add** („ml Milch" with default l onto a bare „Milch" l row).
   Expected: presence merge, not a second bare row. → Task 4.
5. **Sheet round trip** l → ml → l. Expected: MENGE back to „1,5" and Save sends no quantity
   change (LWW safety). → Task 5.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/units/aliases.ts` | Create | `BASE_UNIT_ALIASES` (moved + extended), `canonicalUnit` |
| `src/lib/units/round.ts` | Create | `round3` (moved from `merge.ts`, avoids an import cycle with `scale.ts`) |
| `src/lib/units/scale.ts` | Create | scale groups, `sameScaleGroup`, `convertQuantity`, `scaleToDefault` |
| `src/lib/units/scale.test.ts` | Create | pure table tests |
| `src/lib/lists/parseEntryInput.ts` | Modify | import aliases instead of defining them |
| `src/lib/lists/parseEntryInput.test.ts` | Modify | new alias rows |
| `src/lib/lists/merge.ts` | Modify | re-export `round3`; group-aware match; `contribution` on the target |
| `src/lib/lists/merge.test.ts` | Modify | flip the "no conversion" case, add group rows |
| `src/lib/lists/operations.ts` | Modify | `add_item` steps 5–7 + flow-back unit |
| `src/lib/lists/operations.test.ts` | Modify | funnel tests |
| `src/lib/recipes/apply.test.ts` | Modify | recipe-in-ml onto list-in-l |
| `src/app/lists/[listId]/EntrySheet.tsx` | Modify | anchor-based live conversion |
| `src/app/lists/[listId]/EntrySheet.test.tsx` | Modify | sheet tests |
| `docs/implementation-reviews/slice-20-unit-scaling.md` | Create | slice review |

Unchanged on purpose: `src/lib/recipes/build.ts` (deriving a recipe still refuses two selected
rows of one article in different units — its existing test stays green), `apply.ts`, `expand.ts`,
the schema.

---

### Task 1: Move the unit vocabulary into `src/lib/units/aliases.ts` and extend it

**Files:**
- Create: `src/lib/units/aliases.ts`
- Modify: `src/lib/lists/parseEntryInput.ts:20-76` (the `BASE_UNIT_ALIASES` block and its comment)
- Test: `src/lib/lists/parseEntryInput.test.ts`

**Interfaces:**
- Produces: `export const BASE_UNIT_ALIASES: Record<string, string>` and
  `export function canonicalUnit(raw: string | null | undefined): string | null` from
  `@/lib/units/aliases`.

- [ ] **Step 1: Write the failing parser tests** (append to `describe("parseEntryInput")`):

```ts
it.each([
  ["500 mm Schraube", 500, "mm", "Schraube"],
  ["2 dl Sahne", 2, "dl", "Sahne"],
  ["1 Pfund Hack", 1, "Pfund", "Hack"],
  ["3 Zentimeter Band", 3, "cm", "Band"],
  ["2 Meter Kabel", 2, "m", "Kabel"],
  ["5 Zentiliter Rum", 5, "cl", "Rum"],
  ["1 Deziliter Milch", 1, "dl", "Milch"],
  ["4 Millimeter Draht", 4, "mm", "Draht"],
])("recognises the scale-group unit in %s", (raw, quantity, unit, name) => {
  expect(parseEntryInput(raw, units)).toEqual({ quantity, unit, name });
});
```

And a new `describe("canonicalUnit")` in the same file, importing from `@/lib/units/aliases`:

```ts
expect(canonicalUnit(" Liter ")).toBe("l");
expect(canonicalUnit("KG")).toBe("kg");
expect(canonicalUnit("pfund")).toBe("Pfund");
expect(canonicalUnit("Ltr")).toBeNull();
expect(canonicalUnit("")).toBeNull();
expect(canonicalUnit(null)).toBeNull();
expect(canonicalUnit("constructor")).toBeNull(); // Object.hasOwn guard
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/lists/parseEntryInput.test.ts`
Expected: FAIL — module `@/lib/units/aliases` not found / mm, dl, Pfund not parsed.

- [ ] **Step 3: Create `aliases.ts`**

Move `BASE_UNIT_ALIASES` with its full comment verbatim; export it. Add under the matching groups:
`zentiliter: "cl"`, `dl: "dl"`, `deziliter: "dl"`, `pfund: "Pfund"`, `mm: "mm"`,
`millimeter: "mm"`, `zentimeter: "cm"`, `meter: "m"`. Implement `canonicalUnit` as trim →
lowercase → `Object.hasOwn` lookup → value or `null`. Add a module comment explaining why the table
lives here (parser and converter share it; two copies would drift). In `parseEntryInput.ts`,
replace the block with `import { BASE_UNIT_ALIASES } from "@/lib/units/aliases";` and leave a
one-line comment pointing to the new home.

- [ ] **Step 4: Run to verify pass, including all existing parser tests**

Run: `npx vitest run src/lib/lists/parseEntryInput.test.ts src/lib/lists/addEntry.test.ts`
Expected: PASS (existing cases unchanged proves the move).

- [ ] **Step 5: Commit**

```bash
git add src/lib/units/aliases.ts src/lib/lists/parseEntryInput.ts src/lib/lists/parseEntryInput.test.ts
git commit -m "feat(units): move the unit vocabulary to lib/units and add mm, dl, Pfund"
```

---

### Task 2: Scale groups and conversion — `src/lib/units/scale.ts`

**Files:**
- Create: `src/lib/units/round.ts`, `src/lib/units/scale.ts`, `src/lib/units/scale.test.ts`
- Modify: `src/lib/lists/merge.ts:14-24` (move `round3` out, re-export it)

**Interfaces:**
- Consumes: `canonicalUnit` (Task 1).
- Produces, from `@/lib/units/round`: `export function round3(value: number): number`.
  `merge.ts` keeps `export { round3 } from "@/lib/units/round";` so `operations.ts`, `expand.ts`
  and `merge.test.ts` need no import change.
- Produces, from `@/lib/units/scale`:
  - `sameScaleGroup(a: string | null | undefined, b: string | null | undefined): boolean`
  - `convertQuantity(quantity: number, from: string, to: string): number | null` — `null` when the
    units are not in one group **or the rounded result is 0** (Review Focus 1).
  - `scaleToDefault(quantity: number | null, unit: string | null | undefined, defaultUnit: string | null): { quantity: number | null; unit: string | null | undefined } | null`
    — returns `{ quantity: converted, unit: defaultUnit }` when `unit` is in the same group as a
    non-null `defaultUnit` (identity conversion for the same unit in another spelling; with a
    `null` quantity only the unit is replaced). Returns `null` ("leave the add as it is") when not
    applicable or when `convertQuantity` returns `null`.

- [ ] **Step 1: Write the failing table tests** in `scale.test.ts`:

```ts
it.each([
  [1, "kg", "g", 1000], [500, "g", "kg", 0.5], [1, "Pfund", "kg", 0.5], [250, "g", "Pfund", 0.5],
  [1, "kg", "Pfund", 2], [500, "ml", "l", 0.5], [2, "dl", "cl", 20], [1, "l", "dl", 10],
  [1, "m", "mm", 1000], [15, "mm", "cm", 1.5], [1.5, "Liter", "ml", 1500], [2, "KG", " g ", 2000],
])("converts %d %s to %s", (q, from, to, expected) => {
  expect(convertQuantity(q, from, to)).toBe(expected);
});

it("rounds to three decimals (accepted loss, U6)", () => {
  expect(convertQuantity(2.5, "g", "kg")).toBe(0.003);
});
it("returns null when the rounded result would be 0", () => {
  expect(convertQuantity(0.4, "g", "kg")).toBeNull();
});
it.each([["g", "l"], ["l", "m"], ["l", "Flasche"], ["Ltr", "l"], ["TL", "EL"]])(
  "refuses %s → %s", (from, to) => expect(convertQuantity(1, from, to)).toBeNull(),
);

// sameScaleGroup
expect(sameScaleGroup("l", "ml")).toBe(true);
expect(sameScaleGroup("Liter", "l")).toBe(true);
expect(sameScaleGroup("Pfund", "kg")).toBe(true);
expect(sameScaleGroup("g", "ml")).toBe(false);
expect(sameScaleGroup("Flasche", "Flasche")).toBe(false); // not in any group
expect(sameScaleGroup(null, "l")).toBe(false);
expect(sameScaleGroup(undefined, undefined)).toBe(false);

// scaleToDefault
expect(scaleToDefault(500, "ml", "l")).toEqual({ quantity: 0.5, unit: "l" });
expect(scaleToDefault(2, "Liter", "l")).toEqual({ quantity: 2, unit: "l" });
expect(scaleToDefault(500, "ml", "Liter")).toEqual({ quantity: 0.5, unit: "Liter" });
expect(scaleToDefault(250, "g", "Pfund")).toEqual({ quantity: 0.5, unit: "Pfund" });
expect(scaleToDefault(null, "ml", "l")).toEqual({ quantity: null, unit: "l" });
expect(scaleToDefault(500, "ml", null)).toBeNull();          // U5: no default
expect(scaleToDefault(2, "Flasche", "l")).toBeNull();        // other group
expect(scaleToDefault(2, undefined, "l")).toBeNull();        // inherit path, step 5 handles it
expect(scaleToDefault(0.4, "g", "kg")).toBeNull();           // rounds to zero
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/units/scale.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`round.ts`: move `round3` with its comment verbatim. `scale.ts`: a `Record<string, { group: "weight" | "volume" | "length"; factor: number }>` keyed by canonical unit, exactly the Global Constraints table; every lookup goes through `canonicalUnit`. `convertQuantity` = `round3(quantity * from.factor / to.factor)`, `null` if groups differ, either unit is unknown, or the result is `0`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/units src/lib/lists/merge.test.ts src/lib/recipes/expand.test.ts`
Expected: PASS (existing `round3` tests in `merge.test.ts` still pass through the re-export).

- [ ] **Step 5: Commit**

```bash
git add src/lib/units src/lib/lists/merge.ts
git commit -m "feat(units): add scale groups and quantity conversion"
```

---

### Task 3: Group-aware merge decision — `findMergeTarget`

**Files:**
- Modify: `src/lib/lists/merge.ts` (`MergeTarget`, `findMergeTarget`, module comment)
- Test: `src/lib/lists/merge.test.ts`

**Interfaces:**
- Consumes: `sameScaleGroup`, `convertQuantity`, `canonicalUnit`.
- Produces: `export type MergeTarget = MergeCandidate & { contribution: number | null }` —
  the incoming quantity expressed in the target row's unit; `null` on a presence merge.
  `findMergeTarget(candidates, incoming): MergeTarget | null` keeps its signature.

Rule: a candidate passes the unit check when `unitsMatch(candidate.unit, incoming.unit)` **or**
`sameScaleGroup(candidate.unit, incoming.unit)`. For a sum merge, `contribution` is
`incoming.quantity` when `unitsMatch` or both resolve to the same canonical unit, otherwise
`convertQuantity(incoming.quantity, incoming.unit, candidate.unit)`; a `null` conversion
disqualifies the candidate (Review Focus 1). All other rules (D1, D2, article, tie-break) unchanged.
`unitsMatch` itself stays exact — its test „does not convert units: l and ml are different" stays.

- [ ] **Step 1: Write the failing tests**

Replace `it("refuses a different unit (no conversion: 1 l and 500 ml stay apart)")` with, and add:

```ts
it("merges a same-group unit and converts the contribution into the row's unit", () => {
  expect(findMergeTarget([row({ unit: "l" })], incoming({ quantity: 500, unit: "ml" })))
    .toMatchObject({ id: "row-1", contribution: 0.5 });
});
it("merges g into a kg row", () => {
  expect(findMergeTarget([row({ unit: "kg" })], incoming({ quantity: 250, unit: "g" })))
    .toMatchObject({ contribution: 0.25 });
});
it("refuses a unit from another group", () => {
  expect(findMergeTarget([row({ unit: "g" })], incoming({ unit: "l" }))).toBeNull();
});
it("matches an unscaled unit by exact spelling with an unchanged contribution", () => {
  expect(findMergeTarget([row({ unit: "Flasche" })], incoming({ quantity: 2, unit: "flasche" })))
    .toMatchObject({ contribution: 2 });
});
it("refuses a same-group add whose conversion rounds to zero", () => {
  expect(findMergeTarget([row({ unit: "kg" })], incoming({ quantity: 0.4, unit: "g" }))).toBeNull();
});
it("carries a null contribution on a presence merge across a scale group", () => {
  expect(findMergeTarget([row({ unit: "l", quantity: null })], incoming({ quantity: null, unit: "ml" })))
    .toMatchObject({ contribution: null });
});
it("still refuses a checked same-group row", () => {
  expect(findMergeTarget([row({ unit: "l", checked: true })], incoming({ quantity: 500, unit: "ml" })))
    .toBeNull();
});
```

Also extend the existing same-unit test with `expect(...).toMatchObject({ contribution: 2 })`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/lists/merge.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement** per the rule above; update the „same unit bucket, no conversion" comment to describe scale groups (spec §3.2).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/lists/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/merge.ts src/lib/lists/merge.test.ts
git commit -m "feat(merge): merge across a unit scale group with a converted contribution"
```

---

### Task 4: The `add_item` funnel — convert, sum, record, guard flow-back

**Files:**
- Modify: `src/lib/lists/operations.ts:306-435` (steps 5–7)
- Test: `src/lib/lists/operations.test.ts`, `src/lib/recipes/apply.test.ts`

**Interfaces:**
- Consumes: `scaleToDefault`, `sameScaleGroup` (Task 2); `MergeTarget.contribution` (Task 3).
- Produces: no new exports. `applyOperationDetailed`'s contract is unchanged.

Changes:
- **Step 5:** after the existing `effectiveUnit`/`quantity` lines, apply
  `scaleToDefault(quantity, operation.unit, catalogItem.defaultUnit)`; when non-null, its values
  replace `quantity` and `effectiveUnit`. Pass the scaled values to `findMergeTarget` and to the create.
- **Flow-back unit:** compute once before the branches:
  `const flowBackUnit = sameScaleGroup(operation.unit, catalogItem.defaultUnit) ? undefined : operation.unit;`
  and use it in all three `add_item` `flowBackCatalogDefaults` calls (presence merge, sum merge, create).
- **Step 7:** `const contribution = target.contribution!` (non-null on the sum path) replaces
  `const contribution = quantity;`; the increment, the `AbsorbedEntry.quantity`, and
  `previousQuantity` all use it.

- [ ] **Step 1: Write the failing DB tests** in `operations.test.ts`

Replace `it("does not merge across different units (1 l and 500 ml stay apart)")` and add a
`describe("add_item — unit scaling")` using the existing `add` helper and a local
`catalog(name, defaultUnit)` helper that creates the catalog row (as in the Joghurt test):

| Test name | Arrange | Act | Assert |
|---|---|---|---|
| merges 500 ml into a 1 l row as 1,5 l | add 1 l Milch | add 500 ml | one row; quantity 1.5, unit "l"; merge `{ previousQuantity: 1, quantity: 1.5, unit: "l" }` |
| converts a new row to the catalog default | catalog Milch "l" | add 500 ml | row 0.5 "l"; `defaultUnit` "l" |
| spells the row like the catalog default | catalog Milch "Liter" | add 500 ml | row 0.5 "Liter" |
| converts into a Pfund default | catalog Hack "Pfund" | add 250 g | row 0.5 "Pfund" |
| converts into the row's unit when it differs from the default | add 1 l Milch, then set catalog `defaultUnit` "ml" directly | add 500 ml | one row 1.5 "l" |
| replays a converted merge without adding twice | add 1 l; add 500 ml with fixed `itemId` | same op again | quantity 1.5; ledger row `quantity` 0.5; same merge outcome |
| presence-merges a bare same-group add | catalog Milch "l"; add Milch (no qty) | add `{ quantity: null, unit: "ml" }` | one row, quantity null, unit "l" |
| keeps a rounds-to-zero add as its own row | catalog Mehl "kg"; add 1 kg | add 0.4 g | two rows; second 0.4 "g"; no ledger row; `defaultUnit` "kg" |
| does not re-unit the catalog on a same-group add | catalog Milch "l" | add 500 ml | `defaultUnit` "l" |
| still flows a unit from another group back | catalog Milch "l" | add 2 Flasche | new row "Flasche"; `defaultUnit` "Flasche" |
| learns the unit when the catalog has none | — | add 500 ml Milch | `defaultUnit` "ml" |
| update_item unit change still flows back | add 1 l Milch | `update_item` unit "ml" | `defaultUnit` "ml"; row quantity still 1 (U10) |

In `apply.test.ts`, add `it("merges a recipe line in ml into a list row in l and keeps the catalog unit")`:
`makeArticle("Milch", "l")`, list with an `add_item` of 1 l Milch, recipe line 500 ml, apply count 1 →
`entriesOf` equals `[{ name: "Milch", quantity: 1.5, unit: "l" }]`, article `defaultUnit` still "l".

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/lists/operations.test.ts src/lib/recipes/apply.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement** the three changes above, with comments citing U3/U4/U7 and why the
ledger must hold the converted contribution (replay derives „total minus my contribution").

- [ ] **Step 4: Run the whole lists + recipes suites**

Run: `npx vitest run src/lib/lists src/lib/recipes`
Expected: PASS, including every existing merge, idempotency and flow-back test unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/operations.ts src/lib/lists/operations.test.ts src/lib/recipes/apply.test.ts
git commit -m "feat(lists): convert same-group units in add_item and keep the catalog default unit"
```

---

### Task 5: Live MENGE conversion in the entry sheet

**Files:**
- Modify: `src/app/lists/[listId]/EntrySheet.tsx`
- Test: `src/app/lists/[listId]/EntrySheet.test.tsx`

**Interfaces:**
- Consumes: `convertQuantity`, `sameScaleGroup` (Task 2); `parseGermanDecimal`, `formatGermanNumber` (existing).
- Produces: no prop change.

Behaviour (spec §4): state `anchor: { quantity: string; unit: string }`, initialised from the
initial drafts. MENGE `onChange` sets the quantity draft **and** the anchor `{ quantity: text, unit: current unit }`.
EINHEIT `onChange` sets the unit draft, then: if `parseGermanDecimal(anchor.quantity)` is a finite
number > 0 and `sameScaleGroup(anchor.unit, newUnit)` and `convertQuantity(...)` is non-null,
set MENGE to `formatGermanNumber(converted)`; otherwise set MENGE to `anchor.quantity`. The anchor
is not changed by EINHEIT edits. `collectChanges` is unchanged.

- [ ] **Step 1: Write the failing tests** (fixture `milch` is 1,5 l):

```ts
it("converts MENGE live when EINHEIT changes within a scale group", async () => {
  renderSheet();
  const unit = screen.getByLabelText("Einheit");
  await userEvent.clear(unit);
  await userEvent.type(unit, "ml");
  expect(screen.getByLabelText("Menge")).toHaveValue("1500");
  await userEvent.clear(unit);
  await userEvent.type(unit, "dl");
  expect(screen.getByLabelText("Menge")).toHaveValue("15");
});

it("converts from the anchor, not step by step (cm → m → mm)", async () => {
  renderSheet({ entry: { ...milch, quantity: 0.5, unit: "mm" } });
  const unit = screen.getByLabelText("Einheit");
  await userEvent.clear(unit);
  await userEvent.type(unit, "m");   // passes through a valid length unit
  await userEvent.type(unit, "m");   // now "mm" again
  expect(screen.getByLabelText("Menge")).toHaveValue("0,5");
});

it("shows the anchor quantity for a half-typed or other-group unit", async () => {
  renderSheet();
  const unit = screen.getByLabelText("Einheit");
  await userEvent.clear(unit);
  expect(screen.getByLabelText("Menge")).toHaveValue("1,5");
  await userEvent.type(unit, "kg");
  expect(screen.getByLabelText("Menge")).toHaveValue("1,5");
});

it("re-anchors on a typed MENGE", async () => {
  renderSheet();
  await userEvent.clear(screen.getByLabelText("Einheit"));
  await userEvent.type(screen.getByLabelText("Einheit"), "ml");
  await userEvent.clear(screen.getByLabelText("Menge"));
  await userEvent.type(screen.getByLabelText("Menge"), "2000");
  await userEvent.clear(screen.getByLabelText("Einheit"));
  await userEvent.type(screen.getByLabelText("Einheit"), "l");
  expect(screen.getByLabelText("Menge")).toHaveValue("2");
});

it("does not convert an empty MENGE", async () => {
  renderSheet({ entry: { ...milch, quantity: null } });
  await userEvent.clear(screen.getByLabelText("Einheit"));
  await userEvent.type(screen.getByLabelText("Einheit"), "ml");
  expect(screen.getByLabelText("Menge")).toHaveValue("");
});

it("saves a converted quantity and the new unit as separate changes", async () => {
  const onSave = vi.fn();
  renderSheet({ onSave });
  await userEvent.clear(screen.getByLabelText("Einheit"));
  await userEvent.type(screen.getByLabelText("Einheit"), "ml");
  await userEvent.click(screen.getByRole("button", { name: "Fertig" }));
  expect(onSave).toHaveBeenCalledWith({ quantity: 1500, unit: "ml" });
});

it("sends no quantity change after a round trip back to the original unit", async () => {
  const onSave = vi.fn();
  renderSheet({ onSave });
  const unit = screen.getByLabelText("Einheit");
  await userEvent.clear(unit);
  await userEvent.type(unit, "ml");
  await userEvent.clear(unit);
  await userEvent.type(unit, "l");
  await userEvent.click(screen.getByRole("button", { name: "Fertig" }));
  expect(onSave).toHaveBeenCalledWith({});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/lists/[listId]/EntrySheet.test.tsx"`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement** per the behaviour above, with a comment explaining why the anchor exists
(free-text EINHEIT passes through valid intermediate units; chaining would compound `round3`).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "src/app/lists/[listId]"`
Expected: PASS, existing sheet tests included.

- [ ] **Step 5: Commit**

```bash
git add "src/app/lists/[listId]/EntrySheet.tsx" "src/app/lists/[listId]/EntrySheet.test.tsx"
git commit -m "feat(entry-sheet): convert MENGE live when EINHEIT changes within a scale group"
```

---

### Task 6: Verification, UAT and the slice review

**Files:**
- Create: `docs/implementation-reviews/slice-20-unit-scaling.md`

- [ ] **Step 1: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all green; no migration files in `git diff main --stat -- prisma/`.

- [ ] **Step 2: Signed-in UAT** (CLAUDE.md „Signed-in UAT", owner user, dev branch)

Checklist: (a) on a list with „1 l Milch", type „500 ml Milch" → one row „1,5 l", banner
„Zu 1 l Milch addiert → 1,5 l"; (b) a recipe with „500 ml Milch" applied onto that list → 2 l;
(c) a new list, type „500 ml Milch" → „0,5 l"; (d) entry sheet l → ml shows 1500 and saves;
(e) catalog screen shows Milch's default unit after (a)–(c) still „l", after (d) „ml".
Report what was performed and what was not.

- [ ] **Step 3: Write the review** with the five CLAUDE.md sections (what was achieved, steps,
core components, 5–10 key lines, architecture contribution). State explicitly: no migration, so
no migration gate.

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-20-unit-scaling.md
git commit -m "docs: add the Slice 20 implementation review"
```
