# Smart Lists — Unit Scaling (Einheiten-Umrechnung) — Design

**Date:** 2026-10-12
**Status:** Approved design, ready for an implementation plan
**Supersedes:** nothing. Extends the [recipes design](2026-09-13-smart-lists-recipes-design.md)
(§3 entry merging, D1/D2) and the [MVP design](2026-06-02-smart-lists-mvp-design.md)
(§4.4 catalog flow-back, §4.5 operations).

---

## 1. What this adds, and why

Some of the base units the app already knows are scaled versions of each other: 500 ml and 0,5 l
are the same amount of milk. Today the app treats them as unrelated words. Two consequences:

1. **Duplicate rows.** `findMergeTarget` merges only when the unit spelling matches
   (`unitsMatch`). With „1 l Milch" on the list, adding „500 ml Milch" (typed, or from a recipe)
   creates a second row instead of summing to 1,5 l.
2. **Catalog unit drift.** Every `add_item` that carries an explicit unit flows that unit back to
   the catalog's `defaultUnit`. One recipe written in ml silently re-units Milch from l to ml for
   every future list and pre-fill.

This feature defines **scale groups** of units that convert into each other, and uses them in the
`add_item` funnel (merge + new rows + flow-back) and in the entry sheet.

### Locked product decisions

| # | Decision |
|---|---|
| U1 | Three scale groups: **weight** g, Pfund, kg · **volume** ml, cl, dl, l · **length** mm, cm, m. mm, dl and Pfund are new to the base unit list. |
| U2 | Packaging/count units (Stk, Packung, Dose, Flasche, …), cooking units (TL, EL, Prise), mg and Dutzend are **not** scaled. |
| U3 | The **catalog default unit is canonical**: a same-group incoming amount is converted to the catalog's default unit — on a new row as well as on a merge (500 ml → 0,5 l). |
| U4 | On a merge into a row whose unit differs from the catalog default, the amount is converted into **the row's** unit (a row holds exactly one unit). |
| U5 | No catalog default → the amount stays as typed, and its unit flows back as today. |
| U6 | Converted quantities are rounded with the existing `round3`. Precision loss below 0,001 of the target unit (2,5 g → 0,003 kg) is **accepted**. |
| U7 | `add_item` flow-back **skips** the unit when it is in the same group as the catalog default. A unit outside the group (or with no default) still flows back. |
| U8 | `update_item` flow-back is **unchanged**: changing a row's unit in the entry sheet is deliberate and still teaches the catalog. The catalog screen can set the default directly, as today. |
| U9 | The **entry sheet converts MENGE live** when EINHEIT changes within a group, so the user sees 1,5 l → 1500 ml before saving. Saving sends the usual single-field updates. |
| U10 | `update_item` itself never converts — an operation touches exactly one field (MVP §4.5). |
| U11 | The merge banner speaks the row's unit only: „Zu 1 l Milch addiert → 1,5 l". |
| U12 | No schema change, no migration. |

---

## 2. The unit-scale module — `src/lib/units/`

Two pure files (no Prisma, no React), importable from server and client code.

### 2.1 `aliases.ts`

- `BASE_UNIT_ALIASES` **moves here** from `src/lib/lists/parseEntryInput.ts`; the parser imports
  it. Reason: both the parser and the converter need "which canonical unit does this spelling
  mean?" — two copies would drift.
- New aliases:
  - `mm`, `millimeter` → `mm`
  - `dl`, `deziliter` → `dl`
  - `pfund` → `Pfund`
  - `zentiliter` → `cl`, `zentimeter` → `cm`, `meter` → `m`
- `canonicalUnit(raw: string | null): string | null` — trim + lowercase, then an own-property
  lookup (same `Object.hasOwn` guard as the parser). Unknown text → `null`.

### 2.2 `scale.ts`

```
weight  base g   : g 1,  Pfund 500, kg 1000
volume  base ml  : ml 1, cl 10, dl 100, l 1000
length  base mm  : mm 1, cm 10, m 1000
```

Keyed by canonical unit. Exports:

- `sameScaleGroup(a, b): boolean` — both resolve (via `canonicalUnit`) into the same group. The
  same unit in two spellings counts („l" / „Liter").
- `convertQuantity(quantity: number, from: string, to: string): number | null` —
  `round3(quantity × factor(from) / factor(to))`, or `null` when the two units are not in one
  group.

A unit the alias table does not know (a project's own „Ltr", „Flasche") is in **no** group: it
keeps today's exact-spelling behaviour and is never converted.

---

## 3. Funnel changes — `src/lib/lists/operations.ts` (`add_item`) and `merge.ts`

### 3.1 Step 5 — effective unit (U3, U5)

Unchanged: `undefined` unit → inherit `catalogItem.defaultUnit`; explicit unit with no default, a
different group, or unknown units → used as typed.

New: an explicit unit that is in the **same group** as a non-null catalog default (including the
same unit in another spelling, „Liter" vs „l"):

- `quantity` is replaced by `convertQuantity(quantity, operation.unit, defaultUnit)` (identity
  when both are the same canonical unit);
- `effectiveUnit` becomes the catalog default **as the catalog spells it**, so a row never shows
  „Liter" when the project says „l";
- with no quantity (a bare „ml Milch"), only the unit is replaced.

### 3.2 Step 6 — merge match (U4)

`findMergeTarget` (pure, `merge.ts`):

- the unit check passes when `unitsMatch(candidate.unit, incoming.unit)` (exact rule, still
  covering unknown units) **or** `sameScaleGroup(candidate.unit, incoming.unit)`;
- the result additionally carries **`contribution: number | null`** — the incoming quantity in
  the target row's unit (`convertQuantity` when the canonical units differ, the incoming quantity
  otherwise; `null` on a presence merge).

Unchanged: checked rows never absorb (D2), quantified/unquantified pairing (D1), lowest-sortIndex
tie-break, and the rule that the existing row keeps every field but the number.

### 3.3 Step 7 — writes

- The atomic increment uses `contribution`.
- The `AbsorbedEntry` ledger records `contribution` (the converted value). The replay derivation
  „total minus my contribution" therefore stays correct without change.
- `MergeOutcome.unit` stays the row's unit (U11).

### 3.4 Flow-back (U7, U8)

Computed once in `add_item`, before the merge/create branches:

```
flowBackUnit = sameScaleGroup(operation.unit, catalogItem.defaultUnit) ? undefined : operation.unit
```

All three `add_item` flow-back calls (presence merge, sum merge, create) pass `flowBackUnit`.
`update_item` flow-back is untouched.

### 3.5 Not touched

Recipe apply (`apply.ts`), recipe expansion, pre-fill, suggestions, the parser's splitting logic,
the schema.

---

## 4. Entry sheet — `src/app/lists/[listId]/EntrySheet.tsx` (U9)

EINHEIT is a free-text field updated on every keystroke, so intermediate states are real: going
from „cm" to „mm" passes through „m". Converting step by step would chain roundings
(0,5 mm → 0,001 m → 1 mm).

**Rule: always convert from an anchor, never from the previous step.**

- State `anchor = { quantity: string, unit: string }`, initialised from the entry's values.
- Typing into MENGE resets the anchor to the new text plus the current unit.
- On every EINHEIT change: if the anchor quantity parses (`parseGermanDecimal`) to a finite
  number > 0 **and** `sameScaleGroup(anchor.unit, newUnit)`, MENGE shows
  `formatGermanNumber(convertQuantity(anchorQty, anchor.unit, newUnit))`; otherwise MENGE shows
  the anchor's quantity text unchanged (half-typed units, other groups, unknown text).
- Empty or invalid MENGE never converts; the existing validation message stays the error path.
- Saving keeps today's diffing: quantity and unit are sent as separate field changes.

Out of scope: `RecipeItemSheet` (recipe lines are plans, converted on apply) and the catalog
screen (a default unit has no quantity to convert).

---

## 5. Testing

Test-first, along the existing seams.

**Pure**

- `src/lib/units/scale.test.ts` — table: every in-group pair (kg→g, l→ml, Pfund→kg = 0,5,
  dl→cl, m→mm); alias spellings („Liter", „KG", „ ml "); cross-group and unknown → `null`;
  rounding (2,5 g → 0,003 kg).
- `parseEntryInput.test.ts` — existing cases pass unchanged (proves the alias move); new rows
  „500 mm Schraube", „2 dl Sahne", „1 Pfund Hack".
- `merge.test.ts` — l row + ml add → match, contribution converted; g row + kg add → match;
  g row + l add → no match; „Flasche" row + „flasche" add → match, contribution unchanged; checked
  rows and mixed presence still refuse.

**Database** (`operations.test.ts`, `apply.test.ts`, Neon test branch)

- Catalog l, add 500 ml, no row on the list → new row 0,5 l; catalog stays l.
- „1 l" row + 500 ml → 1,5 l; outcome previous 1 / now 1,5 / unit l.
- Replay with the same `itemId` → identical outcome, no second 0,5 (ledger holds the converted
  contribution).
- Same-group add leaves `defaultUnit` alone; „Flasche" add still overwrites it; no default →
  learns the incoming unit.
- `update_item` unit change still flows back.
- Recipe line „500 ml Milch" applied to a list with „1 l Milch" → one row 1,5 l; catalog stays l.

**Component** (`EntrySheet.test.tsx`, jsdom + Testing Library)

- EINHEIT l → ml shows 1500; then „dl" shows 15.
- cm → m → mm by deleting characters ends on the exact value (no anchor drift).
- Half-typed or cross-group unit leaves MENGE at the anchor value.
- Typing into MENGE resets the anchor.
- Save sends quantity and unit as separate changes.

---

## 6. Definition of Done

- All tests above green; `npm run lint` and `npm run build` clean.
- Implementation review `docs/implementation-reviews/slice-20-unit-scaling.md`.
- No migration gate (U12).
- Signed-in UAT in the browser (dev session): typed „500 ml Milch" onto „1 l Milch"; a recipe in
  ml applied to a list in l; the entry sheet l → ml conversion; catalog default unchanged after
  both adds.
