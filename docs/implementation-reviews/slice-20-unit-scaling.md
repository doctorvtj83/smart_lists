# Slice 20 — Unit Scaling

## 1. What was achieved

Slice 20 teaches the app that some units are scaled versions of each other: 500 ml and 0,5 l are
the same milk. Three **scale groups** now exist — weight (g, Pfund, kg), volume (ml, cl, dl, l) and
length (mm, cm, m). Packaging, count and cooking units (Stk, Flasche, TL, Prise, …) are deliberately
outside every group and keep the old exact-spelling behaviour.

Two user-visible problems are gone. **Duplicate rows:** with „1 l Milch" on the list, typing or
applying „500 ml Milch" used to create a second row; it now merges into one row („1,5 l") and the
banner says „Zu 1 l Milch addiert → 1,5 l". **Catalog unit drift:** one recipe written in ml used to
silently re-unit Milch from l to ml for every future list; a same-group unit no longer flows back to
the catalog default, so the catalog stays on „l". On a *new* row the amount is expressed in the
catalog default as well (500 ml of a „l" article is stored as 0,5 l). The entry sheet also converts
MENGE live when EINHEIT changes inside a group, so the user sees 2 l → 2000 ml before saving.

The slice is fully met. **There is no migration** — the diff against `main` touches nothing under
`prisma/` — so **no migration gate applies**; the change can merge without migrating production
first.

Verification: `npm test` passed with **108 test files / 1001 tests**, `npm run lint` exited with
**0 errors / 14 warnings** (the same unused `_prev` / `_formData` warnings that earlier slices
already reported), `npm run build` succeeded, and `git diff main --stat -- prisma/` is empty.

Signed-in UAT was performed in a real browser (Playwright, minted `uat-owner@example.test` cookie,
dev branch) against the checklist; all five checks passed, with one deviation in the order of
(d), described under *Steps taken*.

## 2. Steps taken

1. **Unit vocabulary moved to `lib/units`.** `BASE_UNIT_ALIASES` left `parseEntryInput.ts` for
   `src/lib/units/aliases.ts` so the parser and the converter share one table; added `mm`, `dl`,
   `Pfund` and the long spellings (Millimeter, Deziliter, Zentimeter, Meter, …), plus
   `canonicalUnit`. `round3` moved to `src/lib/units/round.ts` and is re-exported from `merge.ts`
   so existing imports keep working.
2. **Scale groups and conversion.** Added `sameScaleGroup`, `convertQuantity` and `scaleToDefault`
   in `src/lib/units/scale.ts` as pure functions (no Prisma, no React), importable from server and
   client.
3. **Merge across a scale group.** `findMergeTarget` now accepts a candidate when the unit is the
   same spelling *or* the same scale group, and returns the incoming amount already converted into
   the target row's unit (`MergeTarget.contribution`). A conversion that rounds to zero disqualifies
   the candidate instead of merging a zero.
4. **A narrowing fix.** `scaleToDefault` needed its `unit` narrowed before it could call
   `convertQuantity`; fixed in its own commit.
5. **`add_item` funnel.** The operation now scales an incoming amount to the catalog default before
   matching and writing, writes the *converted* contribution to the absorbed-entry ledger (so a
   replay computes „row total minus my contribution" in the row's unit), and withholds same-group
   units from the catalog flow-back.
6. **Entry sheet.** `EntrySheet` converts MENGE live when EINHEIT changes within a group, always
   from an *anchor* (the last typed MENGE in its unit) rather than from the displayed value, so
   typing „mm" and passing through „m" on the way cannot chain rounding errors. `collectChanges` is
   untouched: saving still sends single-field `update_item`s.
7. **Verification and UAT.** Full `npm test && npm run lint && npm run build`; signed-in
   walkthrough of the five-point checklist.

**UAT performed** (owner, dev branch, project „UAT-Projekt", real browser):

- (a) List A with „1 l Milch", typed „500 ml Milch" → one row „1,5 l", banner „Zu 1 l Milch
  addiert → 1,5 l". ✔
- (b) Created recipe „UAT Milchrezept" with „500 ml Milch" and applied it ×1 to list A → one row
  „2 l", result „UAT Milchrezept ×1 hinzugefügt · 1 zusammengeführt". ✔
- (c) New list B, typed „500 ml Milch" → one row „0,5 l". ✔
- (e, part 1) After (a)–(c) the catalog screen shows Milch with default unit „l". ✔
- (d) Entry sheet of Milch, EINHEIT l → ml → MENGE showed **2000**, saved with „Fertig", and after a
  reload the row reads „2000 ml". ✔
- (e, part 2) After (d) the catalog screen shows Milch with default unit „ml". ✔

**Deviations from the written checklist, stated honestly:** (d) was run on a row holding 2 l (after
(b)), not 1,5 l, so the expected value was 2000 instead of 1500; the conversion logic exercised is
identical. Recipes were switched off in the UAT project, so the walkthrough enabled them in the
project settings and created the recipe — that setting and the three UAT lists/recipe stay in the
dev branch, like the owner's other UAT data. Not performed: the member user, a second browser for
polling, and any mobile viewport.

## 3. Core components built

- **`src/lib/units/aliases.ts`** — the single vocabulary table (spelling → canonical unit) and
  `canonicalUnit`, shared by parser and converter.
- **`src/lib/units/round.ts`** — `round3`, moved out of `merge.ts` so unit code does not depend on
  list code.
- **`src/lib/units/scale.ts`** — `SCALE_UNITS` (group + factor per canonical unit),
  `sameScaleGroup`, `convertQuantity`, `scaleToDefault`. The only place unit arithmetic lives.
- **`src/lib/lists/merge.ts`** (changed) — `findMergeTarget` matches across a scale group and
  returns `MergeTarget.contribution`, the amount in the target row's unit.
- **`src/lib/lists/operations.ts`** (changed) — the `add_item` branch applies „scale to catalog
  default", records the converted contribution, and computes `flowBackUnit`.
- **`src/lib/lists/parseEntryInput.ts`** (changed) — imports the alias table instead of owning it.
- **`src/app/lists/[listId]/EntrySheet.tsx`** (changed) — anchor state plus `changeQuantity` /
  `changeUnit` for live conversion.
- **Tests** — `scale.test.ts` (new), plus new cases in `merge.test.ts`, `operations.test.ts`,
  `parseEntryInput.test.ts`, `apply.test.ts` (recipes onto a scaled row) and `EntrySheet.test.tsx`.

## 4. Most important lines of code

### Express the amount in the catalog's unit before anything else

```ts
const scaled = scaleToDefault(quantity, operation.unit, catalogItem.defaultUnit);
if (scaled) {
  quantity = scaled.quantity;
  effectiveUnit = scaled.unit ?? null;
}
```

This is decision U3 in four lines. Converting *before* matching means `findMergeTarget` compares
like with like and a brand-new row already reads like the catalog („0,5 l", not „500 ml").
`scaleToDefault` returns `null` whenever nothing should change, so the unscaled path is byte-for-byte
the old behaviour. It is also why `quantity` and `effectiveUnit` became `let`.

### Keep the catalog from flip-flopping

```ts
const flowBackUnit = sameScaleGroup(operation.unit, catalogItem.defaultUnit)
  ? undefined
  : operation.unit;
```

Flow-back normally makes an explicitly typed unit the new catalog default. For a same-group unit
that would let every „500 ml" add rewrite „l" to „ml". `undefined` is the funnel's existing „skip"
signal, so the guard needs no new mechanism; a unit from another group, or an article with no
default yet, still flows back as before. `update_item` is deliberately *not* guarded — changing a
row's unit in the sheet is deliberate and still teaches the catalog (UAT (d)/(e) shows exactly that).

### Write the converted contribution, not the typed one

```ts
const contribution = target.contribution!;
```

The absorbed-entry ledger records how much each add contributed to a row, and replay derives „row
total minus my contribution" **in the row's unit**. Recording the raw 500 for a „l" row would make a
retry report a nonsense previous quantity. The `!` is safe: the null-quantity (presence) merge was
handled earlier and a candidate whose conversion failed was already disqualified by the matcher.

### One accepted candidate, one converted number

```ts
if (!exactUnitMatch && !scaleGroupMatch) continue; // same exact unit or convertible scale group
```

The merge rule changes from „same spelling" to „same spelling or same scale group". Everything else
about D1/D2 (checked rows are never targets, quantified and unquantified never mix) is untouched,
which is why the slice stayed small. The companion line `if (contribution === null) continue;`
refuses a conversion that rounds to zero, so a 0 never enters the ledger.

### Convert from an anchor, not from what is on screen

```ts
const converted = convertQuantity(anchorValue, anchor.unit, newUnit);
```

While the user types „ml" in the EINHEIT field the field passes through intermediate values („m").
Converting the *displayed* MENGE on every keystroke would chain conversions and compound `round3`.
Always converting from the anchor (the last MENGE the user typed, in its unit) means any unit the
user lands on is exactly one conversion of the original, and returning to the original unit restores
the original text. Only a typed MENGE re-anchors.

### Unit factors as data

```ts
l: { group: "volume", factor: 1000 },
```

The whole conversion model is a table of „how many base units is one of these" — g, ml, mm are the
bases. Adding a unit later is one row plus an alias; there is no pairwise conversion matrix to keep
consistent.

## 5. Architecture contribution

Slice 20 adds a small, pure **unit domain** (`src/lib/units/`) beneath the existing operation
funnel and does not move any boundary. The entry-level operation model is intact: `add_item` is still
idempotent and ID-bearing, `update_item` still touches exactly one field and never converts
(entry-sheet conversion happens client-side before the individual updates are sent), and merging is
still the Slice 17 rule with one wider equality test. The catalog stays the project's „memory", now
protected from unit drift by the flow-back guard — which also means a recipe, a typed entry and a
pre-fill all converge on one row per article and one default unit.

It connects forward in two ways. Any future surface that adds entries must go through
`applyOperationDetailed` to inherit scaling — nothing else needs to know about units. And because
the factors live in one table, units the design deliberately left out (mg, Dutzend, packaging and
cooking units) could be added later by one table row and an alias, without touching the merge or
operation code.

**No migration:** the slice changes no schema, so there is nothing under `prisma/migrations/` and
the production **migration gate does not apply** to this change.
