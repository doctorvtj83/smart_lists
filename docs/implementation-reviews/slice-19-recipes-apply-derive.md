# Slice 19 — Recipes: Applying and Deriving

## 1. What was achieved

Slice 19 is the payoff of the recipes feature. An enabled project can now **apply** a recipe to an
open list (with a 1–99 multiplier), **create a new list** whose second sheet step applies chosen
recipes *before* the suggestion pre-fill (de-duplicating by catalog identity so the button's article
count matches what lands), and **derive** a recipe from a completed list — tick rows, edit amounts
for one portion, name it, then optionally build another from the same list with already-used rows
greyed but still selectable.

Applying is not a second write path: every planned line is an ordinary `add_item` through
`applyOperationDetailed`, so Slice 17's merge rule, the `AbsorbedEntry` ledger, catalog get-or-create,
and unit/category inheritance all apply. Retry safety does not use a transaction; the client posts
one apply token and the server derives each operation UUID from `(token, recipeId, catalogItemId)`,
so a half-applied recipe can be retried without double-counting. Deriving reuses Slice 18's
`createRecipe` + `addRecipeItem`, with a compensating delete if a line fails after the name is
taken. Recipes themselves remain configuration: they never enter the operations funnel or the delta
sync.

The implemented slice is covered by the complete automated suite: `npm test` passed with **105 test
files / 918 tests**, `npm run lint` exited successfully with **0 errors / 14 inherited warnings**, and
`npm run build` completed successfully. The wording audit
(`grep -rn "Rezept" src/ | grep -v "\.test\." | grep -v "src/lib/recipes/labels.ts"`) produced no
output after comment-only English rewording of earlier task comments that had quoted the default
German noun. The signed-in browser walkthrough was not executable: Google OAuth plus the email
allowlist require a real allowlisted account, no signed-in session existed, and no credentials were
invented. None of the twelve UAT checks is claimed as passed.

**Slice 19 completes the recipes feature.** The only unbuilt slice left is **Slice 16** (the optional
per-row remote-change flash), and only if real use asks for it.

## 2. Steps taken

1. **Multiplier.** Added `expandRecipe` as a pure function: integer count 1–99, `null` quantity stays
   `null` at any count (D4), `null` unit stays `null` so catalog inheritance remains `add_item`'s
   job, rounding shared with Slice 17's `round3`.
2. **Apply core and retry-safe ids.** Added RFC-4122 v5 `deriveOperationId`, `applyRecipesToList` as a
   sequential loop over `applyOperationDetailed`, validate-everything-before-writing, and no
   surrounding transaction. A missing token still applies (ruling R2) but is not retry-safe.
3. **Stepper.** Added the `[− N +]` primitive both pickers share, registered its buttons in the
   touch-target suite, and demoed it on `/dev/ui`.
4. **Apply from an open list.** Added `ApplyRecipeSheet` (picker / result / retry), `ApplyFormState`,
   `formatApplyResult`, the list-menu entry gated by ruling R8, and a member-level Server Action that
   re-checks membership and `recipesEnabled`.
5. **New-list orchestration.** Added `createListWithRecipes`: create, apply recipes, then pre-fill
   skipping normalized names already present. `createListWithArticles` was left byte-identical
   (ruling R3); the compensating delete is a deliberate twin, not a shared helper.
6. **Two-step new-list sheet.** Step 1 is name plus de-selectable pre-fill; step 2 is the recipe
   pickers, the overlap note, and a de-duplicated article count on the button. A project with the
   feature off, or with no recipes, keeps the original one-pane sheet. Added `listRecipesForApply`
   so overlap can be computed client-side without a round-trip per stepper tap.
7. **Derive builder.** Added `buildRecipeFromEntries`: empty selection is 400, foreign entry ids are
   404, two ticked rows of the same article are 409 quoting the list's amounts, and line order
   follows the list rather than tick order.
8. **Derive write.** Added `createRecipeFromList` as `createRecipe` plus sequential `addRecipeItem`,
   compensating with `deleteRecipe` on failure so a half-built recipe cannot occupy the chosen name.
9. **Derive sheet.** Added the three-step `DeriveRecipeSheet` (pick → name and per-portion amounts →
   confirm / build another), keyed `quantity:<entryId>` / `unit:<entryId>` fields (ruling R10), the
   409 when the list was reopened (ruling R9), and the menu entry on completed lists when the
   feature is on — including when the project has zero recipes yet, because deriving is how the
   first one is created.
10. **Verification and Definition of Done.** Wording audit, full `npm test && npm run lint && npm run
    build`, honest UAT status, this review, and the meta-plan status row plus progress-log entry.

No product deviation was observed in a browser because no authenticated session could be started.
Automated domain and component tests cover multiplication (including D4), derived ids, merge-aware
apply and retry, new-list ordering and de-duplication, the duplicate-article refusal, compensating
cleanup, label composition, menu gating, and the two sheets' states; the integrated navigation,
persistence, 404 transitions, and renamed-label surfaces remain human UAT.

## 3. Core components built

- **`src/lib/recipes/expand.ts`** — the pure multiplier and count bounds; the only place “n units of
  this recipe” is arithmetic.
- **`src/lib/recipes/operationIds.ts`** — `deriveOperationId(token, recipeId, catalogItemId)`, the
  name-based UUID that makes a retry byte-identical without storing an id list.
- **`src/lib/recipes/apply.ts`** — `applyRecipesToList` (existing list) and `createListWithRecipes`
  (new list: recipes first, then de-duplicated pre-fill). The only module that turns recipes into
  list entries.
- **`src/components/ui/Stepper.tsx`** — the shared `[− N +]` control; 0 means “not chosen” in the
  picker and never reaches `expandRecipe`.
- **`formatApplyResult`, `formatArticleEnumeration`, `formatRecipeOverlapNote`,
  `formatNewListWithRecipesLabel` (`src/lib/format/plural.ts`)** — every new German sentence for
  apply results, overlap, and the two-step commit button, composed from project labels.
- **`listRecipesForApply` (`src/lib/recipes/recipes.ts`)** — id, name, and article identities for the
  new-list sheet's overlap note and de-duplicated count; quantities deliberately absent.
- **`src/app/lists/[listId]/ApplyRecipeSheet.tsx`** and **`ApplyFormState`** — picker, in-sheet
  confirmation (ruling R6), and retry that resubmits the same token.
- **`src/app/lists/[listId]/ListMenu.tsx`** — owns both new ⋮ entries and the sheets they open
  (ruling R7); apply only when recipes exist and the list is open, derive only when completed.
- **`src/app/projects/[projectId]/NewListSheet.tsx`** — optional second pane; hidden inputs keep
  step-1 values across the step change; one apply token per creation attempt.
- **`src/lib/recipes/build.ts`** — `buildRecipeFromEntries`, the pure list-row → recipe-draft
  builder and the one place the list model and the recipe model disagree.
- **`src/lib/recipes/derive.ts`** — `createRecipeFromList`, the compensating write that never sees a
  list.
- **`src/app/lists/[listId]/DeriveRecipeSheet.tsx`** and **`DeriveFormState`** — the three-step flow
  with the build-another loop; consumed-row state is client-only.

## 4. Most important lines of code

### Derive the operation id so a retry is safe without a transaction

```ts
itemId: deriveOperationId(token, recipe.id, planned.catalogItemId),
```

Applying is n separate `add_item`s with no transaction around them, and a merged add no longer
creates a row. Remembering a list of random ids between HTTP requests would break the moment a
recipe line was edited. Computing a v5 UUID from the three values a retry already carries means the
same token produces the same ids, landed lines replay as no-ops through Slice 17's ledger, and a
half-applied recipe is recoverable rather than corrupt. Anything that later applies a recipe from
another surface must send a token (ruling R1).

### Pass `undefined` so the funnel inherits, not clears

```ts
quantity: planned.quantity ?? undefined,
unit: planned.unit ?? undefined,
```

`add_item` treats `undefined` as “not supplied”: no quantity (D4's Salz) and inherit the catalog
default unit. Passing `null` would *explicitly clear* the unit and defeat inheritance. The
distinction is the whole reason recipe lines store `null` rather than a copied default.

### Skip pre-fill articles the recipes already placed

```ts
if (seen.has(normalized)) continue;
```

Recipes land first. The pre-fill is an article-level wish with no quantity, and D1 will not merge a
quantity-less row into “3 l Milch”. After the apply, the core reads `catalogItem.normalizedName`
into a set and skips every remaining suggestion already present — including duplicates inside the
pre-fill loop itself. This is the ordering rule as one line, and it is why the sheet's button must
count de-duplicated articles rather than rows.

### Refuse two list rows that would become one recipe line

```ts
throw new ApiError(
  409,
  `${entry.name} ist zweimal ausgewählt${amounts} — bitte nur eine Zeile wählen`,
);
```

A list may hold “1 l Milch” and “500 ml Milch” because D1 does not convert units. A recipe cannot:
`@@unique([recipeId, catalogItemId])` allows one line per article, and two would be ambiguous under
the multiplier. Silently picking one would lose data the user can see, so the flow stops and names
both amounts as they appear on the list. There is no unit conversion anywhere; the user resolves
the disagreement.

### Keep an unquantified line unquantified at any count

```ts
quantity: item.quantity === null ? null : round3(item.quantity * count),
```

D4 as code. Salz at ×3 is still Salz — never `count × 1`. Treating `null` as 1 would invent “3 Salz”
and make “just add it” indistinguishable from “one of it”. Rounding uses Slice 17's `round3` so the
stored value and the value the UI prints agree.

### Leave the non-recipe create path untouched

```ts
await db.list.delete({ where: { id: list.id } }).catch(() => undefined);
```

`createListWithRecipes` duplicates the compensating-delete pattern of `createListWithArticles`
on purpose (ruling R3). The recipe path has a different order of business; wrapping both in a flag
would make every project pay for de-duplication. A project that never enables recipes still runs
the exact function it runs today.

## 5. Architecture contribution

Slice 19 is where recipes meet lists without becoming lists. The operations funnel, the merge
ledger, catalog identity, and polling stay exactly as Slices 3, 7, 17 and 18 left them: applying
emits ordinary entry operations the poller already understands, and the recipe itself is never an
operation, never a delta, never last-writer-wins against a collaborator's edit of the same line.

The new mechanism later work inherits is **ruling R1**: derived operation ids. Any future surface
that applies a recipe (a packing list, a “again” action, an offline queue) must post an apply token
so retries stay idempotent. It must not invent a second write path around `applyOperationDetailed`.

This was the first slice that needed **Slice 17 and Slice 18 at the same time**. The branch was not
a fresh merge of the two: `slice-18-recipes-core` had already merged `main` (Slice 17) at `358bec2`,
and `slice-19-recipes-apply-derive` was cut from that merged state.

With this slice the recipes feature is complete. The only remaining open slice is **Slice 16** (the
optional 1.4 s flash on rows a remote member changed). Nothing in recipes waits on it; it remains
comfort, not a functional gap.
