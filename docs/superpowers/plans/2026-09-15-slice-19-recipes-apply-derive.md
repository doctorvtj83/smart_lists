# Slice 19 — Recipes: applying + deriving — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recipe can finally be *used*: applied with a count to an open list, applied as the second step of the „Neue Liste“ sheet (recipes first, pre-fill de-duplicated against them), and **derived** from a completed list so what a household already bought becomes reusable.

**Architecture:** Two pure functions carry the feature's arithmetic — `expandRecipe` (count × quantity, `null` stays `null`) and `buildRecipeFromEntries` (list rows → recipe draft) — and both are provable without a database. Everything that writes goes through machinery that already exists: applying is **one `add_item` per planned entry through `applyOperationDetailed`**, so Slice 17's merge, the `AbsorbedEntry` ledger, catalog resolution and unit inheritance all apply with no second code path; deriving is `createRecipe` + `addRecipeItem` from Slice 18. The one genuinely new mechanism is **deterministic operation ids**: the client sends an *apply token* and the server derives each entry's UUID from `(token, recipeId, catalogItemId)`, which is what makes a half-applied recipe safe to retry without double-counting.

**Tech Stack:** Next.js App Router (Server Components + Server Actions + `useActionState`), TypeScript, Prisma / Neon Postgres, Vitest (+ jsdom & Testing Library for the component tasks), CSS Modules, `lucide-react` through `Icon`, `node:crypto` (already a dependency of the runtime). **No new npm dependencies.**

**Spec:** [docs/superpowers/specs/2026-09-13-smart-lists-recipes-design.md](../specs/2026-09-13-smart-lists-recipes-design.md) — §3 (merge semantics, already shipped by Slice 17), §6 (applying), §7 (deriving from a completed list), §9 (error handling), §10 (tests), §11 (slice cut). This plan implements **slice 3 of the three** and completes the feature.

**Predecessors:** [Slice 17 — entry merging](2026-09-13-slice-17-entry-merging.md) (merged to `main`) and [Slice 18 — recipes core](2026-09-13-slice-18-recipes-core.md) (branch `slice-18-recipes-core`, reviewed in [docs/implementation-reviews/slice-18-recipes-core.md](../../implementation-reviews/slice-18-recipes-core.md)).

---

## Starting point: the branch this slice is built on

**Slice 19 is the first slice that needs Slice 17 *and* Slice 18 at the same time — and that prerequisite is already satisfied.** Work in the worktree `/workspaces/smart_lists/.worktrees/slice-18-recipes-core` (branch `slice-18-recipes-core`), which merged `main` in commit `358bec2` (2026-09-18). It therefore carries Slice 17's `AbsorbedEntry`, `src/lib/lists/merge.ts` and the merge-aware `add_item` **next to** Slice 18's recipe core. Do **not** cut a fresh branch from either side alone.

The four mechanical conflicts that merge produced are already resolved. Confirm you are on the right branch by checking the merged state rather than re-doing the merge:

| File | Expected merged state |
|---|---|
| `prisma/schema.prisma` | `model AbsorbedEntry` (Slice 17) **and** `model Recipe` + `model RecipeItem` (Slice 18) all present, plus the `Project` columns `recipesEnabled`, `recipeLabelSingular`, `recipeLabelPlural` and `suggestionRuleN @default(3)`. |
| `src/test/reset-db.ts` | The TRUNCATE list ends `…, "favorites", "absorbed_entries", "recipes", "recipe_items"` — all three of the new tables. |
| `prisma/migrations/` | Six folders, ending `20260913160600_add_absorbed_entries` then `20260913163142_add_recipes`. `npx prisma migrate dev` must report **no pending migrations** and generate no drift migration. |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` | Both slices' status rows and both progress-log entries present, newest first. |

Verify the baseline before writing a line of Slice 19 code:

```bash
npm run lint && npm test
```

**Verified baseline on `358bec2` (2026-09-18):** `npm test` → **97 test files / 809 tests, all passing** (216 s); `npm run lint` → **0 errors, 14 warnings** (all pre-existing `_prev` / `_formData` unused-parameter warnings in Server Action signatures — do not "fix" them, the `useActionState` signature requires the parameters). If the suite is red here, the branch is wrong — fix that first; do **not** start Task 1 on a red suite.

One file is worth opening before Task 4: `src/app/lists/[listId]/formState.ts` now carries Slice 17's `merge: MergeOutcome | null` on `EntryFormState`, and `ENTRY_FORM_IDLE` sets it to `null`. Tasks 4 and 9 add **sibling** state types (`ApplyFormState`, `DeriveFormState`) to that same file — they do not extend `EntryFormState`, and they must not disturb its `merge` field or any test that mocks it.

---

## Global Constraints

- **Implementation docs, code identifiers and code comments: English. In-app user-facing strings stay German.** (CLAUDE.md § Language convention.)
- **Meticulous inline comments are mandatory.** Every function gets a comment saying what it does *and why it exists*; every non-obvious block gets a *why* comment. Do not remove or thin out existing comments when editing a file. (CLAUDE.md § Code documentation standard.)
- **No German string anywhere in the codebase may hardcode „Rezept“ or „Rezepte“ outside `src/lib/recipes/labels.ts`'s two defaults.** (Spec §4.) Every label is composed from `recipeLabels(project)`. This is a **standing review gate** carried over from Slice 18: `grep -rn "Rezept" src/` must show hits only in `src/lib/recipes/labels.ts` and in test fixtures that deliberately pass the default pair.
- **Permissions, verbatim from the spec:** applying a recipe and deriving one are **member-level** (`requireListAccess`, which already resolves membership). The settings screen stays owner-only and is untouched by this slice. Non-members get a 404, never a 403.
- **The route is the gate, the menu is a convenience.** Every Server Action added here re-checks membership **and** `recipesEnabled` and calls `notFound()` when the feature is off — including on submit, so disabling the feature while a sheet is open turns its next submit into a 404 (spec §9).
- **Applying is `add_item` through the funnel, never a direct `listItem.create`.** `applyOperationDetailed` is the only write path for list entries (MVP design §4.5). This is what gives applying the merge rule, the ledger, catalog get-or-create, unit inheritance and category inheritance for free.
- **`count` is an integer 1–99** and `expandRecipe` rejects anything else with „Anzahl muss zwischen 1 und 99 liegen“ (spec §6, §9). The *picker* ranges 0–99, where **0 means „not chosen“** and the recipe never reaches `expandRecipe`.
- **A `null` recipe quantity stays `null` at any count** (D4). Salz at ×3 is still Salz — never `count × 1`.
- **Recipes are applied BEFORE the suggestion pre-fill, and the pre-fill then skips articles already on the list** (spec §6). The sheet's button must show the **de-duplicated** count.
- **Recipes are NOT part of the operations funnel as *entities* and NOT part of the delta sync.** Applying a recipe produces ordinary `add_item` operations; the recipe itself is never an operation, never polled, never merged.
- **Styling: CSS Modules only. Icons: `lucide-react`, always through `Icon` (stroke 1.75).** Build screens out of the existing primitives in `src/components/ui/` — do not restyle from scratch.
- **Component tests** start with `// @vitest-environment jsdom`, use Testing Library, and assert **roles and text — never CSS-Module class names**.
- **Every new interactive control smaller than 44px must be registered in `src/test/touch-targets.test.ts`'s `CONTROLS` list** and satisfy the ≥44px rule (handoff § PWA/Mobil).
- **Tests run against the Neon `test` branch via `.env.test`.** Never copy `.env`'s `DATABASE_URL` into `.env.test` — every DB test truncates all core tables.
- **German decimal comma** everywhere the user sees a number (`0,5`) — `formatGermanNumber` / `parseGermanDecimal` own both directions.
- Commit after every task with a Conventional-Commits message ending in:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

---

## Decisions this plan locks (beyond the spec)

The spec settles the product rules. Ten implementation questions it leaves open are answered here so no task has to invent an answer.

| # | Question | Ruling |
|---|----------|--------|
| R1 | Spec §6 says „Operation UUIDs are generated once, before the first write“, so a retry reuses them. Who holds them between attempts? | **Nobody holds a list of ids — they are derived.** The client generates one **apply token** (a UUID) per attempt and posts it with the form; the server computes each entry's id as an RFC-4122 **v5 UUID over `(token, recipeId, catalogItemId)`**. A retry posts the same token and therefore produces byte-identical ids, so landed lines replay as no-ops through Slice 17's ledger. Alternatives rejected: echoing an id array back to the client (breaks the moment a recipe line is edited between attempts) and re-randomising (silently double-counts every merged line). |
| R2 | What if the apply token field is missing or blank (an old cached page, a hand-made POST)? | **The server generates one.** The apply then works but is not retry-safe — which is strictly better than a 400 the user cannot act on. Never crash on a missing token. |
| R3 | Where does the „create a list, apply recipes, then pre-fill“ orchestration live? | **`createListWithRecipes` in `src/lib/recipes/apply.ts`.** It is a sibling of `createListWithArticles` (`src/lib/suggestions/suggestions.ts`), not a flag on it: the recipe path has a different *order of business* (recipes first) and a de-duplication step the article-only path must not pay for. `createListWithArticles` stays byte-identical, so **a project that never enables recipes runs the exact code path it runs today**. The ~8 duplicated lines of compensating delete carry a comment naming their twin. |
| R4 | How is the pre-fill de-duplicated against the recipes server-side, when the sheet posts article **names** and the recipes yield **catalog ids**? | **By normalized name.** After the recipes are applied, the core reads the list's entries with `catalogItem.normalizedName` into a `Set`, and skips every `articleName` whose `normalizeName()` is already in it (adding each accepted name to the set as it goes). This needs no transport change and reuses the catalog's own identity rule. |
| R5 | The new-list sheet's button count — articles or rows? | **Articles.** „15 Artikel“ counts distinct `catalogItemId`s across the chosen recipes ∪ the surviving suggestions. Two recipes asking for Milch in *different units* legitimately produce two rows but are one article — do not "fix" the count to match the row count; the noun on the button is `Artikel` precisely because that is what is being counted. |
| R6 | Where does the apply **result** („… 4 neue Einträge, 2 zusammengeführt“) appear? | **Inside the sheet**, which switches to a confirmation state with a „Fertig“ button. The ⋮ menu lives in the `PageHeader` of a Server Component, so a banner "on the screen" would need client state above both the header and the body — a provider for one sentence. The sheet is already open, already client, and the list behind it is already revalidated when „Fertig“ closes it. Same shape as the derive flow's step ③, which the spec draws that way. |
| R7 | Which component owns the two new sheets? | **`ListMenu`**, which already owns `ConfirmSheet` for the delete decision. The menu item and the sheet it opens stay in one file, and `page.tsx` keeps handing down Server Actions rather than growing view state. |
| R8 | The ⋮ entries' visibility. | **„Rezept hinzufügen“ only when `recipesEnabled && recipes.length > 0 && !isCompleted`** — a picker with nothing to pick is a dead end. **„Rezept aus Liste anlegen“ only when `recipesEnabled && isCompleted`** — no `recipes.length` condition, because deriving is how the first recipe gets created. |
| R9 | Deriving from a list that was **reopened** while the sheet was open. | **409 „Die Liste ist nicht abgeschlossen“.** Spec §7's rule is that an open list is still being shopped, so its quantities are not settled; the render-time check is not authorization for a Server Action, exactly as with `recipesEnabled`. |
| R10 | Transport for the derive sheet's per-line edits. | **Keyed field names — `quantity:<entryId>` and `unit:<entryId>`** alongside repeated `entryId` fields. Three parallel `getAll()` arrays that only align because of DOM order is the kind of coupling that breaks silently the first time a row is conditionally rendered. |

**Three things that look like omissions and are not:**

- **Applying does not run in a transaction.** Spec §6 is explicit: the idempotency the operations model already guarantees does the work, and a failed retry with the same token is cheaper and safer than a rollback. A half-applied recipe is a *recoverable* state, not a corrupt one.
- **A replayed line counts as „zusammengeführt“ in the result banner.** The banner describes the state the list is in after the apply, not the number of rows this particular HTTP request happened to write. A retry that says „4 neue Einträge, 2 zusammengeführt“ a second time is telling the truth.
- **Which entries a derive loop has already consumed is client state only** (spec §7). An article may legitimately belong to two recipes, so consumed rows are greyed but still selectable, and closing the sheet forgets everything. No column, no server round-trip.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| **Create** `src/lib/recipes/expand.ts` | `expandRecipe`, `assertValidRecipeCount`, `MIN/MAX_RECIPE_COUNT`, the `PlannedEntry` shape. Pure, no I/O, no Prisma. | 1 |
| **Create** `src/lib/recipes/expand.test.ts` | Multiplier arithmetic, `null` stays `null`, rounding, ordering, count bounds. Node env, no DB. | 1 |
| **Create** `src/lib/recipes/operationIds.ts` | `deriveOperationId(token, recipeId, catalogItemId)` — the RFC-4122 v5 derivation that makes a retry idempotent. | 2 |
| **Create** `src/lib/recipes/operationIds.test.ts` | Determinism, distinctness, UUID shape, version nibble. Node env, no DB. | 2 |
| **Create** `src/lib/recipes/apply.ts` | `applyRecipesToList` (Task 2) and `createListWithRecipes` (Task 5). The only module that turns recipes into list entries. | 2, 5 |
| **Create** `src/lib/recipes/apply.test.ts` | Both against the test DB. | 2, 5 |
| **Create** `src/components/ui/Stepper.tsx`, `.module.css`, `.test.tsx` | The `[− N +]` control both pickers use. | 3 |
| **Modify** `src/app/dev/ui/Gallery.tsx` | A Stepper demo row. | 3 |
| **Modify** `src/test/touch-targets.test.ts` | Register the Stepper's two buttons in `CONTROLS`. | 3 |
| **Modify** `src/lib/format/plural.ts` + `plural.test.ts` | `formatApplyResult` (Task 4), `formatArticleEnumeration` + `formatRecipeOverlapNote` + `formatNewListWithRecipesLabel` (Task 6). | 4, 6 |
| **Modify** `src/app/lists/[listId]/formState.ts` | `ApplyFormState` + `APPLY_FORM_IDLE` (Task 4), `DeriveFormState` + `DERIVE_FORM_IDLE` (Task 9). | 4, 9 |
| **Create** `src/app/lists/[listId]/ApplyRecipeSheet.tsx`, `.module.css`, `.test.tsx` | The picker, the result state, the retry. | 4 |
| **Modify** `src/app/lists/[listId]/ListMenu.tsx` + `.test.tsx` | The two new menu entries and the sheets they open. | 4, 9 |
| **Modify** `src/app/lists/[listId]/page.tsx` | Read the feature flag, labels and recipes; add `applyRecipesAction` (Task 4) and `createRecipeFromListAction` (Task 9). | 4, 9 |
| **Modify** `src/lib/recipes/recipes.ts` + `recipes.test.ts` | `listRecipesForApply` — id, name and article names, for the new-list sheet's overlap note. | 6 |
| **Modify** `src/app/projects/[projectId]/NewListSheet.tsx`, `.module.css`, `.test.tsx` | The second pane: steppers, overlap note, de-duplicated count. | 6 |
| **Modify** `src/app/projects/[projectId]/page.tsx` | Read recipes + labels, extend `createFromSheetAction`. | 6 |
| **Create** `src/lib/recipes/build.ts` + `build.test.ts` | `buildRecipeFromEntries` — the pure list-row → recipe-draft builder. | 7 |
| **Create** `src/lib/recipes/derive.ts` + `derive.test.ts` | `createRecipeFromList` — create the recipe and its lines, compensating on failure. | 8 |
| **Create** `src/app/lists/[listId]/DeriveRecipeSheet.tsx`, `.module.css`, `.test.tsx` | The three-step flow with the build-another loop. | 9 |
| **Create** `docs/implementation-reviews/slice-19-recipes-apply-derive.md` | Definition of Done (CLAUDE.md § Implementation review). | 10 |
| **Modify** `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` | Status row + progress-log entry. | 10 |

---

### Task 1: `expandRecipe` — the multiplier, as a pure function

**Files:**
- Create: `src/lib/recipes/expand.ts`
- Test: `src/lib/recipes/expand.test.ts`

**Interfaces:**
- Consumes: `round3` from `src/lib/lists/merge.ts` (Slice 17), `ApiError` from `src/lib/http/errors.ts`.
- Produces:
  - `MIN_RECIPE_COUNT = 1`, `MAX_RECIPE_COUNT = 99`
  - `assertValidRecipeCount(count: number): void`
  - `interface PlannedEntry { catalogItemId: string; name: string; quantity: number | null; unit: string | null }`
  - `interface ExpandableRecipe { items: { catalogItemId: string; catalogItem: { name: string }; quantity: number | null; unit: string | null; sortIndex: number }[] }`
  - `expandRecipe(recipe: ExpandableRecipe, count: number): PlannedEntry[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recipes/expand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { expandRecipe, assertValidRecipeCount, type ExpandableRecipe } from "./expand";

/**
 * Builds a recipe literal. `ExpandableRecipe` is STRUCTURAL on purpose (it is a subset of
 * Slice 18's `RecipeWithItems`), which is exactly what lets this test hand it plain objects.
 */
function recipe(
  items: { name: string; quantity: number | null; unit: string | null; sortIndex: number }[],
): ExpandableRecipe {
  return {
    items: items.map((item, index) => ({
      catalogItemId: `article-${index}`,
      catalogItem: { name: item.name },
      quantity: item.quantity,
      unit: item.unit,
      sortIndex: item.sortIndex,
    })),
  };
}

describe("expandRecipe", () => {
  it("multiplies every quantity by the count", () => {
    const planned = expandRecipe(
      recipe([{ name: "Milch", quantity: 0.5, unit: "l", sortIndex: 0 }]),
      3,
    );

    expect(planned).toEqual([
      { catalogItemId: "article-0", name: "Milch", quantity: 1.5, unit: "l" },
    ]);
  });

  it("leaves a null quantity null at any count (D4: Salz stays Salz)", () => {
    const planned = expandRecipe(
      recipe([{ name: "Salz", quantity: null, unit: null, sortIndex: 0 }]),
      7,
    );

    expect(planned[0].quantity).toBeNull();
  });

  it("rounds away float drift at the precision the UI formats at", () => {
    // 0.1 * 3 is 0.30000000000000004 in IEEE 754. The row label would hide it; the entry
    // sheet's MENGE field would not.
    const planned = expandRecipe(
      recipe([{ name: "Öl", quantity: 0.1, unit: "l", sortIndex: 0 }]),
      3,
    );

    expect(planned[0].quantity).toBe(0.3);
  });

  it("keeps a null unit null — inheritance happens at apply time, not here", () => {
    const planned = expandRecipe(
      recipe([{ name: "Zwiebeln", quantity: 2, unit: null, sortIndex: 0 }]),
      2,
    );

    expect(planned[0].unit).toBeNull();
    expect(planned[0].quantity).toBe(4);
  });

  it("emits lines in sortIndex order regardless of the input order", () => {
    const unordered = recipe([
      { name: "Zweitens", quantity: 1, unit: null, sortIndex: 5 },
      { name: "Erstens", quantity: 1, unit: null, sortIndex: 1 },
    ]);

    expect(expandRecipe(unordered, 1).map((line) => line.name)).toEqual(["Erstens", "Zweitens"]);
  });

  it("accepts both bounds", () => {
    const one = recipe([{ name: "Milch", quantity: 1, unit: "l", sortIndex: 0 }]);
    expect(expandRecipe(one, 1)[0].quantity).toBe(1);
    expect(expandRecipe(one, 99)[0].quantity).toBe(99);
  });

  it.each([0, -1, 100, 2.5, Number.NaN])("rejects the count %s", (count) => {
    const one = recipe([{ name: "Milch", quantity: 1, unit: "l", sortIndex: 0 }]);

    expect(() => expandRecipe(one, count)).toThrow(ApiError);
    expect(() => expandRecipe(one, count)).toThrow("Anzahl muss zwischen 1 und 99 liegen");
  });
});

describe("assertValidRecipeCount", () => {
  it("answers with a 400, not a 500 — it validates a form field", () => {
    try {
      assertValidRecipeCount(0);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(400);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/recipes/expand.test.ts`
Expected: FAIL — `Failed to resolve import "./expand"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/recipes/expand.ts`:

```ts
import { ApiError } from "@/lib/http/errors";
import { round3 } from "@/lib/lists/merge";

/**
 * The recipe multiplier, as a pure function (spec §6).
 *
 * Why it is pure and why it lives in its own module: applying a recipe is one arithmetic rule
 * („one unit needs this much, so n units need n times as much“) wrapped in a loop over a funnel
 * that is already tested to death. Separating the rule from the loop is what makes the rule a
 * table test with no database, and it is the same split Slice 17 used for `merge.ts` next to
 * `operations.ts`.
 */

/**
 * The picker's *operational* range. 0 is deliberately NOT valid here: the stepper's 0 means
 * „not chosen“ and that recipe never reaches this function (spec §6). Keeping the two ranges
 * distinct is what stops „apply zero units of Lasagne“ from reporting a successful apply that
 * wrote nothing.
 */
export const MIN_RECIPE_COUNT = 1;
/**
 * 99 rather than unbounded: there is no meaning to 2.5 × Lasagne, and an open-ended field is a
 * way to create ten thousand entries with one typo.
 */
export const MAX_RECIPE_COUNT = 99;

/**
 * One entry the apply loop will create, already multiplied.
 *
 * It carries the article NAME rather than only the id because `add_item` resolves articles by
 * name through `getOrCreateCatalogItem` — the single catalog path (MVP design §4.5). The
 * `catalogItemId` travels alongside it because the caller needs a stable, name-independent key
 * for the operation id (see operationIds.ts) and for de-duplicating against the pre-fill.
 */
export interface PlannedEntry {
  catalogItemId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

/**
 * What this function needs off a recipe — structurally a subset of Slice 18's `RecipeWithItems`,
 * so a loaded recipe passes straight in with no mapping step and a test can pass a literal.
 */
export interface ExpandableRecipe {
  items: {
    catalogItemId: string;
    catalogItem: { name: string };
    /** Per ONE unit of the recipe; null = „just add it“ (D4). */
    quantity: number | null;
    /** null inherits the article's catalog default at apply time — NOT here. */
    unit: string | null;
    sortIndex: number;
  }[];
}

/**
 * Rejects a count outside 1–99 with the spec's exact German sentence (§9).
 *
 * Exported separately from `expandRecipe` because the apply core validates the WHOLE selection
 * before it writes anything: a 100 in the third of three recipes must not leave the first two
 * applied.
 */
export function assertValidRecipeCount(count: number): void {
  if (!Number.isInteger(count) || count < MIN_RECIPE_COUNT || count > MAX_RECIPE_COUNT) {
    // 400, not 500: this is a form field the user can correct.
    throw new ApiError(400, "Anzahl muss zwischen 1 und 99 liegen");
  }
}

/**
 * Turns one recipe plus a count into the entries that should land on the list.
 *
 * Two rules the arithmetic must not blur:
 *  - a `null` quantity stays `null` at ANY count (D4). „Salz“ three times over is still „Salz“;
 *    treating null as 1 would invent „3 Salz“.
 *  - a `null` unit stays `null`. Unit inheritance from the catalog default is `add_item`'s step 5,
 *    and doing it here as well would give two places that decide what „Becher“ means.
 *
 * Sorting by `sortIndex` (rather than trusting the caller's query order) keeps the entries landing
 * on the list in the order the recipe was written — and makes the function's output a function of
 * its input alone, which is what the table test relies on.
 */
export function expandRecipe(recipe: ExpandableRecipe, count: number): PlannedEntry[] {
  assertValidRecipeCount(count);

  return [...recipe.items]
    // Copy before sorting: sorting the caller's array in place would mutate a loaded Prisma
    // result that the caller may still be reading.
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((item) => ({
      catalogItemId: item.catalogItemId,
      name: item.catalogItem.name,
      // round3 is Slice 17's, shared on purpose: the stored value and the value the UI prints
      // must round at the same precision, or the entry sheet eventually shows 1.5000000000000002.
      quantity: item.quantity === null ? null : round3(item.quantity * count),
      unit: item.unit,
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/recipes/expand.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipes/expand.ts src/lib/recipes/expand.test.ts
git commit -m "$(cat <<'EOF'
feat(recipes): add the recipe multiplier

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Applying a recipe to a list — deterministic ids and the apply core

**Files:**
- Create: `src/lib/recipes/operationIds.ts`
- Test: `src/lib/recipes/operationIds.test.ts`
- Create: `src/lib/recipes/apply.ts`
- Test: `src/lib/recipes/apply.test.ts`

**Interfaces:**
- Consumes: `expandRecipe` / `assertValidRecipeCount` (Task 1); `getRecipeWithItems` and `RecipeLabels` (Slice 18); `applyOperationDetailed` from `src/lib/lists/operations.ts` (Slice 17 shape: returns `{ item, merge }`); `ApiError`; `isUuid`.
- Produces:
  - `deriveOperationId(token: string, recipeId: string, catalogItemId: string): string`
  - `interface RecipeSelection { recipeId: string; count: number }`
  - `interface AppliedRecipe { recipeId: string; name: string; count: number }`
  - `interface ApplyResult { applied: AppliedRecipe[]; added: number; merged: number }`
  - `applyRecipesToList(db, list, selections, token, labels): Promise<ApplyResult>`

- [ ] **Step 1: Write the failing test for the id derivation**

Create `src/lib/recipes/operationIds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/validate";
import { deriveOperationId } from "./operationIds";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const RECIPE = "22222222-2222-4222-8222-222222222222";
const ARTICLE = "33333333-3333-4333-8333-333333333333";

describe("deriveOperationId", () => {
  it("returns the same id for the same inputs — this is what makes a retry a no-op", () => {
    expect(deriveOperationId(TOKEN, RECIPE, ARTICLE)).toBe(
      deriveOperationId(TOKEN, RECIPE, ARTICLE),
    );
  });

  it("produces a well-formed UUID the uuid columns accept", () => {
    expect(isUuid(deriveOperationId(TOKEN, RECIPE, ARTICLE))).toBe(true);
  });

  it("stamps UUID version 5, so the value is a name-based id and not mistaken for random", () => {
    // The version nibble is the first character of the third group.
    expect(deriveOperationId(TOKEN, RECIPE, ARTICLE).split("-")[2][0]).toBe("5");
  });

  it("separates a different token — a NEW attempt applies again instead of replaying", () => {
    const other = "44444444-4444-4444-8444-444444444444";
    expect(deriveOperationId(other, RECIPE, ARTICLE)).not.toBe(
      deriveOperationId(TOKEN, RECIPE, ARTICLE),
    );
  });

  it("separates the same article in two different recipes", () => {
    const otherRecipe = "55555555-5555-4555-8555-555555555555";
    expect(deriveOperationId(TOKEN, otherRecipe, ARTICLE)).not.toBe(
      deriveOperationId(TOKEN, RECIPE, ARTICLE),
    );
  });

  it("separates two articles of the same recipe", () => {
    const otherArticle = "66666666-6666-4666-8666-666666666666";
    expect(deriveOperationId(TOKEN, RECIPE, otherArticle)).not.toBe(
      deriveOperationId(TOKEN, RECIPE, ARTICLE),
    );
  });

  it("cannot be confused by a separator planted inside a field", () => {
    // Without length-prefixed or escaped joining, ("a:b", "c") and ("a", "b:c") would hash the
    // same string. The implementation must keep them apart.
    expect(deriveOperationId(TOKEN, `${RECIPE}:x`, ARTICLE)).not.toBe(
      deriveOperationId(TOKEN, RECIPE, `x:${ARTICLE}`),
    );
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/recipes/operationIds.test.ts`
Expected: FAIL — `Failed to resolve import "./operationIds"`.

- [ ] **Step 3: Write the id derivation**

Create `src/lib/recipes/operationIds.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * Deterministic operation ids for applying a recipe (spec §6, ruling R1).
 *
 * THE PROBLEM THIS SOLVES: applying a recipe is n separate `add_item` operations with no
 * transaction around them, and since Slice 17 a merged add does not create a row — it adds a
 * number to an existing one. A naive retry after a half-applied recipe would therefore add the
 * landed quantities a SECOND time, and nothing on screen would reveal it (there is no duplicate
 * row to notice). The operations model already has the cure: an `add_item` whose id has been seen
 * before replays as a no-op, via the row itself or via the `AbsorbedEntry` ledger. All that is
 * missing is a way to produce the SAME ids on the retry.
 *
 * THE PATTERN: name-based (v5) UUIDs. Instead of remembering a list of random ids somewhere
 * between two HTTP requests, the id is COMPUTED from three values the retry already carries: the
 * client's apply token, the recipe and the article. Same inputs, same ids, no state to store —
 * which also means a recipe line edited between two attempts cannot shift the mapping the way an
 * echoed id array would.
 */

/**
 * A fixed namespace, as RFC 4122 §4.3 requires. It is an arbitrary constant, generated once and
 * never changed: changing it would make every future retry of an in-flight apply derive fresh ids
 * and double-count. It is not a secret — nothing here is a security boundary.
 */
const APPLY_NAMESPACE = "9f2b1a54-6c7d-4a3e-9c21-5f0b3d8e7a10";

/** The 16 raw bytes of a canonical UUID string. */
function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

/**
 * Derives the `add_item` id for ONE planned entry.
 *
 * The three inputs are joined length-prefixed rather than with a plain separator: a recipe id
 * containing a colon would otherwise be able to collide with a different (recipe, article) pair,
 * and while our ids are UUIDs today, an id format that only works because of what callers happen
 * to pass is a trap for the next reader.
 */
export function deriveOperationId(
  token: string,
  recipeId: string,
  catalogItemId: string,
): string {
  const name = [token, recipeId, catalogItemId].map((part) => `${part.length}:${part}`).join("");

  // SHA-1 is what RFC 4122 v5 prescribes. It is used here as a deterministic spreading function,
  // never as a security primitive, so its collision weakness against a deliberate attacker is not
  // in play — and an attacker who could choose these inputs could simply send the ids directly.
  const hash = createHash("sha1").update(uuidToBytes(APPLY_NAMESPACE)).update(name, "utf8").digest();

  // Take the first 16 bytes and stamp the version/variant bits the format requires. Buffer.from
  // copies, so the digest is not mutated under anyone else's feet.
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 (name-based, SHA-1)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
```

- [ ] **Step 4: Run the id test to verify it passes**

Run: `npm test -- src/lib/recipes/operationIds.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Write the failing test for the apply core**

Create `src/lib/recipes/apply.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { ApiError } from "@/lib/http/errors";
import { recipeLabels } from "./labels";
import { addRecipeItem, createRecipe } from "./recipes";
import { applyRecipesToList } from "./apply";

const db = new PrismaClient();
const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

/** A catalog article, optionally with a default unit (to prove apply-time inheritance). */
async function makeArticle(name: string, defaultUnit: string | null = null) {
  return db.catalogItem.create({
    data: { projectId, name, normalizedName: name.trim().toLowerCase(), defaultUnit },
  });
}

/** An empty active list. */
async function makeList(name = "Samstag") {
  return db.list.create({ data: { projectId, name } });
}

/** A recipe with lines, in the order given. */
async function makeRecipe(
  name: string,
  lines: { catalogItemId: string; quantity: number | null; unit: string | null }[],
) {
  const recipe = await createRecipe(db, { projectId, name }, labels);
  for (const line of lines) {
    await addRecipeItem(db, { projectId, recipeId: recipe.id, ...line }, labels);
  }
  return recipe;
}

/** The list's entries with their article names, in list order — what the assertions read. */
async function entriesOf(listId: string) {
  const items = await db.listItem.findMany({
    where: { listId },
    orderBy: { sortIndex: "asc" },
    include: { catalogItem: true },
  });
  return items.map((item) => ({
    name: item.catalogItem.name,
    quantity: item.quantity,
    unit: item.unit,
  }));
}

describe("applyRecipesToList", () => {
  it("multiplies the quantities onto the list", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 0.5, unit: "l" },
    ]);
    const list = await makeList();

    const result = await applyRecipesToList(
      db,
      list,
      [{ recipeId: recipe.id, count: 3 }],
      randomUUID(),
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 1.5, unit: "l" }]);
    expect(result).toEqual({
      applied: [{ recipeId: recipe.id, name: "Lasagne", count: 3 }],
      added: 1,
      merged: 0,
    });
  });

  it("adds an unquantified line once, whatever the count (D4)", async () => {
    const salt = await makeArticle("Salz");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: salt.id, quantity: null, unit: null },
    ]);
    const list = await makeList();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 5 }], randomUUID(), labels);

    expect(await entriesOf(list.id)).toEqual([{ name: "Salz", quantity: null, unit: null }]);
  });

  it("inherits the catalog default unit for a line that has none", async () => {
    const yoghurt = await makeArticle("Joghurt", "Becher");
    const recipe = await makeRecipe("Frühstück", [
      { catalogItemId: yoghurt.id, quantity: 2, unit: null },
    ]);
    const list = await makeList();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], randomUUID(), labels);

    // The inheritance is add_item's step 5 — apply must NOT have its own copy of that rule.
    expect(await entriesOf(list.id)).toEqual([
      { name: "Joghurt", quantity: 4, unit: "Becher" },
    ]);
  });

  it("merges two recipes that need the same article in the same unit", async () => {
    const milk = await makeArticle("Milch");
    const lasagne = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 1, unit: "l" },
    ]);
    const chili = await makeRecipe("Chili", [{ catalogItemId: milk.id, quantity: 0.5, unit: "l" }]);
    const list = await makeList();

    const result = await applyRecipesToList(
      db,
      list,
      [
        { recipeId: lasagne.id, count: 2 },
        { recipeId: chili.id, count: 1 },
      ],
      randomUUID(),
      labels,
    );

    // ONE row: Slice 17's merge did the work, because both sides carry a quantity and the unit.
    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 2.5, unit: "l" }]);
    expect(result.added).toBe(1);
    expect(result.merged).toBe(1);
  });

  it("is a no-op when the SAME token is applied twice (the retry case)", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const list = await makeList();
    const token = randomUUID();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], token, labels);
    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], token, labels);

    // The sum must NOT have moved. This is the whole point of the derived ids.
    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 2, unit: "l" }]);
  });

  it("applies again under a NEW token — a second deliberate apply is not a replay", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const list = await makeList();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], randomUUID(), labels);
    const second = await applyRecipesToList(
      db,
      list,
      [{ recipeId: recipe.id, count: 2 }],
      randomUUID(),
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 4, unit: "l" }]);
    expect(second.merged).toBe(1);
    expect(second.added).toBe(0);
  });

  it("skips a selection with count 0 — the picker's „not chosen“", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const list = await makeList();

    const result = await applyRecipesToList(
      db,
      list,
      [{ recipeId: recipe.id, count: 0 }],
      randomUUID(),
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([]);
    expect(result).toEqual({ applied: [], added: 0, merged: 0 });
  });

  it("refuses a count above 99 and writes NOTHING, not even the valid recipe before it", async () => {
    const milk = await makeArticle("Milch");
    const salt = await makeArticle("Salz");
    const good = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const bad = await makeRecipe("Chili", [{ catalogItemId: salt.id, quantity: 1, unit: null }]);
    const list = await makeList();

    await expect(
      applyRecipesToList(
        db,
        list,
        [
          { recipeId: good.id, count: 1 },
          { recipeId: bad.id, count: 100 },
        ],
        randomUUID(),
        labels,
      ),
    ).rejects.toThrow("Anzahl muss zwischen 1 und 99 liegen");

    expect(await entriesOf(list.id)).toEqual([]);
  });

  it("refuses a completed list with the spec's 409", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const list = await db.list.create({
      data: { projectId, name: "Erledigt", status: "completed", completedAt: new Date() },
    });

    await expect(
      applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 1 }], randomUUID(), labels),
    ).rejects.toThrow("Die Liste ist bereits abgeschlossen");
    expect(await entriesOf(list.id)).toEqual([]);
  });

  it("404s on a recipe from another project, writing nothing", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Fremd", ownerId: otherUser.id } });
    const foreignArticle = await db.catalogItem.create({
      data: { projectId: otherProject.id, name: "Milch", normalizedName: "milch" },
    });
    const foreign = await createRecipe(db, { projectId: otherProject.id, name: "Fremd" }, labels);
    await addRecipeItem(
      db,
      { projectId: otherProject.id, recipeId: foreign.id, catalogItemId: foreignArticle.id },
      labels,
    );
    const list = await makeList();

    await expect(
      applyRecipesToList(db, list, [{ recipeId: foreign.id, count: 1 }], randomUUID(), labels),
    ).rejects.toThrow("Dieses Rezept gibt es nicht mehr");
    expect(await entriesOf(list.id)).toEqual([]);
  });

  it("answers a malformed recipe id with a 404, not a driver error", async () => {
    const list = await makeList();

    try {
      await applyRecipesToList(db, list, [{ recipeId: "not-a-uuid", count: 1 }], randomUUID(), labels);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(404);
    }
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npm test -- src/lib/recipes/apply.test.ts`
Expected: FAIL — `Failed to resolve import "./apply"`.

- [ ] **Step 7: Write the apply core**

Create `src/lib/recipes/apply.ts` (Task 5 appends `createListWithRecipes` to this same file):

```ts
import type { List, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { applyOperationDetailed } from "@/lib/lists/operations";
import { expandRecipe, assertValidRecipeCount } from "./expand";
import { deriveOperationId } from "./operationIds";
import type { RecipeLabels } from "./labels";
import { getRecipeWithItems } from "./recipes";

/**
 * Turning recipes into list entries (spec §6) — the point where the two halves of the feature
 * finally meet.
 *
 * The whole module is a LOOP OVER AN EXISTING FUNNEL, deliberately: every planned entry is an
 * ordinary `add_item`, so Slice 17's merge rule, the AbsorbedEntry ledger, `getOrCreateCatalogItem`,
 * unit inheritance and category inheritance all apply with no second implementation. If you ever
 * feel tempted to write `db.listItem.create` here, that is the bug.
 */

/** One row of the picker: which recipe, and how many units of it. 0 = not chosen. */
export interface RecipeSelection {
  recipeId: string;
  count: number;
}

/** What was actually applied — the banner says „Lasagne ×2 hinzugefügt“. */
export interface AppliedRecipe {
  recipeId: string;
  name: string;
  count: number;
}

/**
 * The result the banner is composed from.
 *
 * `added` + `merged` describe the STATE the list is now in, not the number of rows this particular
 * request happened to write: on a retry the landed lines replay as no-ops but are still counted,
 * because „4 neue Einträge, 2 zusammengeführt“ is what the user is looking at either way.
 */
export interface ApplyResult {
  applied: AppliedRecipe[];
  added: number;
  merged: number;
}

/**
 * Applies a selection of recipes to an OPEN list.
 *
 * The caller has already authorized access to `list` (requireListAccess) and re-checked
 * `recipesEnabled`; this core never reads the session — the established core shape in this
 * codebase.
 *
 * `token` is the client's apply token: every operation id is derived from it, so posting the same
 * form twice (a retry after a half-applied recipe, a double-tapped button, a flaky connection) is
 * idempotent. See operationIds.ts for why the ids are derived rather than remembered.
 *
 * NO TRANSACTION, on purpose (spec §6). A half-applied recipe is recoverable by retrying with the
 * same token, and wrapping n operations in an interactive transaction would also mean widening
 * every `PrismaClient` parameter down the funnel to the transaction client type.
 */
export async function applyRecipesToList(
  db: PrismaClient,
  list: List,
  selections: RecipeSelection[],
  token: string,
  labels: RecipeLabels,
): Promise<ApplyResult> {
  // A completed list is settled (spec §9). Checked FIRST, so a 409 never leaves half a recipe on
  // a list the user considers finished.
  if (list.status === "completed") {
    throw new ApiError(409, "Die Liste ist bereits abgeschlossen");
  }

  // 0 means „not chosen“ in the picker and must never reach expandRecipe, which would reject it.
  // Filtering here rather than at the call site keeps the core's contract „a selection list
  // straight from the picker“.
  const chosen = selections.filter((selection) => selection.count !== 0);

  // VALIDATE EVERYTHING BEFORE WRITING ANYTHING. Two loops instead of one: a bad count in the
  // third recipe must not leave the first two applied — the same „check meaning before mutating“
  // rule the entry sheet's multi-field save follows.
  for (const selection of chosen) assertValidRecipeCount(selection.count);

  // Load every recipe up front, for the same reason: a recipe deleted in another tab must fail
  // the whole apply, not half of it.
  const loaded = [];
  for (const selection of chosen) {
    // Project-scoped read: a recipe id from a foreign project is indistinguishable from a missing
    // one, which is the existence-hiding rule this codebase applies everywhere.
    const recipe = await getRecipeWithItems(db, list.projectId, selection.recipeId);
    // getRecipeWithItems answers null (ruling R4 of Slice 18) because its usual caller is a
    // screen; here the caller is an action, so the null becomes the shared 404 sentence.
    if (!recipe) throw new ApiError(404, `Dieses ${labels.singular} gibt es nicht mehr`);
    loaded.push({ recipe, count: selection.count });
  }

  let added = 0;
  let merged = 0;

  for (const { recipe, count } of loaded) {
    // Sequential, not Promise.all: each add_item derives the next sortIndex from the current
    // maximum AND may merge into a row a previous add just created, so the writes must not race.
    for (const planned of expandRecipe(recipe, count)) {
      const { merge } = await applyOperationDetailed(db, list, {
        op: "add_item",
        // The derived id is what makes this operation replay-safe.
        itemId: deriveOperationId(token, recipe.id, planned.catalogItemId),
        // Only the NAME reaches the funnel: getOrCreateCatalogItem is the single article-identity
        // path, and it resolves back to exactly the article this line came from.
        name: planned.name,
        // `undefined` means „not supplied“ to add_item. For the quantity that means „no number“
        // (D4's Salz); for the unit it means „inherit the catalog default“ (spec §2). Passing
        // null instead would EXPLICITLY clear the unit and defeat the inheritance.
        quantity: planned.quantity ?? undefined,
        unit: planned.unit ?? undefined,
        // category is deliberately absent: the entry inherits the article's default.
      });
      if (merge) merged += 1;
      else added += 1;
    }
  }

  return {
    applied: loaded.map(({ recipe, count }) => ({
      recipeId: recipe.id,
      name: recipe.name,
      count,
    })),
    added,
    merged,
  };
}
```

- [ ] **Step 8: Run the apply test to verify it passes**

Run: `npm test -- src/lib/recipes/apply.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 9: Run the whole suite, so a change to a shared funnel cannot hide**

Run: `npm test`
Expected: PASS — everything green.

- [ ] **Step 10: Commit**

```bash
git add src/lib/recipes/operationIds.ts src/lib/recipes/operationIds.test.ts src/lib/recipes/apply.ts src/lib/recipes/apply.test.ts
git commit -m "$(cat <<'EOF'
feat(recipes): apply a recipe to a list with retry-safe operation ids

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The `Stepper` primitive

**Files:**
- Create: `src/components/ui/Stepper.tsx`
- Create: `src/components/ui/Stepper.module.css`
- Test: `src/components/ui/Stepper.test.tsx`
- Modify: `src/app/dev/ui/Gallery.tsx`
- Modify: `src/test/touch-targets.test.ts`

**Interfaces:**
- Consumes: nothing but React and the design tokens in `src/app/globals.css`.
- Produces: `<Stepper value={number} onChange={(next: number) => void} label={string} min?={number} max?={number} />` — `min` defaults to 0, `max` to 99. Used by Task 4's `ApplyRecipeSheet` and Task 6's `NewListSheet`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Stepper.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("exposes the current value to assistive technology", () => {
    render(<Stepper value={2} onChange={vi.fn()} label="Anzahl Lasagne" />);

    const spin = screen.getByRole("spinbutton", { name: "Anzahl Lasagne" });
    expect(spin).toHaveAttribute("aria-valuenow", "2");
    expect(spin).toHaveAttribute("aria-valuemin", "0");
    expect(spin).toHaveAttribute("aria-valuemax", "99");
    expect(spin).toHaveTextContent("2");
  });

  it("reports the NEXT value when + is tapped", async () => {
    const onChange = vi.fn();
    render(<Stepper value={2} onChange={onChange} label="Anzahl Lasagne" />);

    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("reports the NEXT value when − is tapped", async () => {
    const onChange = vi.fn();
    render(<Stepper value={2} onChange={onChange} label="Anzahl Lasagne" />);

    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne verringern" }));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("disables − at the minimum, so 0 can never become -1", () => {
    render(<Stepper value={0} onChange={vi.fn()} label="Anzahl Lasagne" />);

    expect(screen.getByRole("button", { name: "Anzahl Lasagne verringern" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" })).toBeEnabled();
  });

  it("disables + at the maximum", () => {
    render(<Stepper value={99} onChange={vi.fn()} label="Anzahl Lasagne" />);

    expect(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" })).toBeDisabled();
  });

  it("honours a caller-supplied range", () => {
    render(<Stepper value={1} onChange={vi.fn()} label="Anzahl" min={1} max={5} />);

    const spin = screen.getByRole("spinbutton", { name: "Anzahl" });
    expect(spin).toHaveAttribute("aria-valuemin", "1");
    expect(spin).toHaveAttribute("aria-valuemax", "5");
    expect(screen.getByRole("button", { name: "Anzahl verringern" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/components/ui/Stepper.test.tsx`
Expected: FAIL — `Failed to resolve import "./Stepper"`.

- [ ] **Step 3: Write the component**

Create `src/components/ui/Stepper.tsx`:

```tsx
"use client";

import { Minus, Plus } from "lucide-react";
import { Icon } from "./Icon";
import styles from "./Stepper.module.css";

type StepperProps = {
  value: number;
  /** Receives the NEXT value, not a direction — the same contract as `Toggle`'s onChange. */
  onChange: (next: number) => void;
  /**
   * German accessible name of the thing being counted, e.g. „Anzahl Lasagne“. The two buttons
   * derive their own names from it („… erhöhen“ / „… verringern“), so a screen reader never
   * announces a bare „plus“ with no idea what it increments.
   */
  label: string;
  /** 0 by default: in both pickers 0 means „not chosen“, which is a legal state. */
  min?: number;
  /** 99 by default — MAX_RECIPE_COUNT, mirrored here so the UI cannot offer an invalid count. */
  max?: number;
};

/**
 * The `[− N +]` counter (spec §6: the recipe picker's stepper).
 *
 * Why a primitive rather than two buttons inside each sheet: both the list's „Rezept hinzufügen“
 * sheet and the „Neue Liste“ sheet's second pane need it, and a control this small is exactly the
 * kind that drifts into two slightly different versions.
 *
 * Why `role="spinbutton"` on the read-only value instead of a number `<input>`: a numeric input on
 * iOS opens the keypad and invites free text the picker would then have to validate, while the
 * design draws a value that is only ever changed by the two buttons. `spinbutton` + aria-valuenow
 * is precisely the semantic for "a value you step through", and it keeps the component a
 * controlled, keyboard-reachable display. It is `tabIndex={-1}` because the two buttons already
 * carry the interaction; a third stop would only cost keyboard users a press.
 *
 * Bounds are enforced twice on purpose — the buttons are disabled AND the callback clamps. The
 * disabled state is the affordance; the clamp is what holds if a caller ever drives this
 * programmatically.
 */
export function Stepper({ value, onChange, label, min = 0, max = 99 }: StepperProps) {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.button}
        aria-label={`${label} verringern`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon icon={Minus} size={16} />
      </button>
      <span
        className={styles.value}
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={-1}
      >
        {value}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label={`${label} erhöhen`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon icon={Plus} size={16} />
      </button>
    </div>
  );
}
```

Create `src/components/ui/Stepper.module.css`:

```css
/* The pill the three parts sit in — same border/radius language as Chip and TextField. */
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
}

/*
 * 44px square: the handoff's tap-target rule, declared directly rather than via the ::after
 * expander, because two expanders 2px apart would overlap and swallow each other's taps.
 */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.button:disabled {
  color: var(--color-text-muted);
  cursor: default;
}

/* Fixed width so stepping 9 -> 10 does not shift the two buttons sideways. */
.value {
  min-width: 2.5ch;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
```

> **Token check:** use the custom-property names that actually exist in `src/app/globals.css`. Open it and substitute the real names for `--color-border`, `--color-surface`, `--color-text`, `--color-text-muted` and `--radius-pill` if they differ. `src/test/design-tokens.test.ts` pins the palette — do **not** add new tokens for this control.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/ui/Stepper.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Register the new control's tap targets**

In `src/test/touch-targets.test.ts`, add one entry to the `CONTROLS` array (keep the existing entries):

```ts
  { file: "src/components/ui/Stepper.module.css", selector: ".button" },
```

Run: `npm test -- src/test/touch-targets.test.ts`
Expected: PASS — the new row included.

- [ ] **Step 6: Add the Stepper to the dev gallery**

In `src/app/dev/ui/Gallery.tsx`:

1. Add the import next to the other primitives:

```tsx
import { Stepper } from "@/components/ui/Stepper";
```

2. Add local state next to the existing `prefill` state:

```tsx
  // Stepper demo — the recipe picker's counter, including its 0 = „nicht gewählt“ state.
  const [count, setCount] = useState(2);
```

3. Add a demo block next to the Toggle row:

```tsx
      <SectionLabel>Stepper</SectionLabel>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Stepper value={count} onChange={setCount} label="Anzahl Lasagne" />
        <Stepper value={0} onChange={() => {}} label="Anzahl Chili" />
        <Stepper value={99} onChange={() => {}} label="Anzahl Maximal" />
      </div>
```

- [ ] **Step 7: Verify lint and the full suite**

Run: `npm run lint && npm test`
Expected: lint 0 errors; suite green.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/Stepper.tsx src/components/ui/Stepper.module.css src/components/ui/Stepper.test.tsx src/test/touch-targets.test.ts src/app/dev/ui/Gallery.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add the Stepper primitive

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: „Rezept hinzufügen“ — applying into an open list

**Files:**
- Modify: `src/lib/format/plural.ts`
- Modify: `src/lib/format/plural.test.ts`
- Modify: `src/app/lists/[listId]/formState.ts`
- Create: `src/app/lists/[listId]/ApplyRecipeSheet.tsx`
- Create: `src/app/lists/[listId]/ApplyRecipeSheet.module.css`
- Test: `src/app/lists/[listId]/ApplyRecipeSheet.test.tsx`
- Modify: `src/app/lists/[listId]/ListMenu.tsx`
- Modify: `src/app/lists/[listId]/ListMenu.test.tsx`
- Modify: `src/app/lists/[listId]/page.tsx`

**Interfaces:**
- Consumes: `applyRecipesToList`, `ApplyResult` (Task 2); `Stepper` (Task 3); `listRecipes` + `RecipeSummary` and `recipeLabels` + `RecipeLabels` (Slice 18); `requireListAccess`.
- Produces:
  - `formatApplyResult(applied: { name: string; count: number }[], added: number, merged: number): string`
  - `type ApplyFormState = { error: string | null; ok: boolean; message: string | null }` and `APPLY_FORM_IDLE`
  - `<ApplyRecipeSheet recipes labels applyAction onClose initialState? />`
  - `ListMenu` gains an optional `recipeApply?: { labels: RecipeLabels; recipes: RecipeSummary[]; applyAction: ApplyAction }` prop.

- [ ] **Step 1: Write the failing test for the result sentence**

Append to `src/lib/format/plural.test.ts`:

```ts
describe("formatApplyResult", () => {
  it("names the recipes with their counts and both totals", () => {
    expect(formatApplyResult([{ name: "Lasagne", count: 2 }], 4, 2)).toBe(
      "Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt",
    );
  });

  it("lists several recipes in the order they were applied", () => {
    expect(
      formatApplyResult(
        [
          { name: "Lasagne", count: 2 },
          { name: "Chili", count: 1 },
        ],
        5,
        0,
      ),
    ).toBe("Lasagne ×2, Chili ×1 hinzugefügt · 5 neue Einträge");
  });

  it("uses the singular for exactly one new entry", () => {
    expect(formatApplyResult([{ name: "Chili", count: 1 }], 1, 0)).toBe(
      "Chili ×1 hinzugefügt · 1 neuer Eintrag",
    );
  });

  it("drops the „neue Einträge“ half when everything merged", () => {
    expect(formatApplyResult([{ name: "Chili", count: 1 }], 0, 3)).toBe(
      "Chili ×1 hinzugefügt · 3 zusammengeführt",
    );
  });

  it("says so when an empty recipe produced nothing at all", () => {
    expect(formatApplyResult([{ name: "Leer", count: 1 }], 0, 0)).toBe(
      "Leer ×1 hinzugefügt · keine neuen Einträge",
    );
  });
});
```

Add `formatApplyResult` to the existing import at the top of the file.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/format/plural.test.ts`
Expected: FAIL — `formatApplyResult is not a function`.

- [ ] **Step 3: Write the helper**

Append to `src/lib/format/plural.ts`:

```ts
/**
 * The sentence the apply sheet reports: „Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt“.
 *
 * Why the copy lives here rather than in the sheet: it carries two independent German plural rules
 * („Eintrag“/„Einträge“) and three shapes (both halves, one half, neither), which is exactly the
 * kind of thing that is cheap to test without a DOM and expensive to eyeball inside JSX. It is the
 * same reasoning that put `formatMergeMessage` next to the merge rule in Slice 17.
 *
 * Note what `merged` counts: a line that REPLAYED on a retry is reported as merged, because the
 * sentence describes the state of the list, not the number of rows this request wrote.
 */
export function formatApplyResult(
  applied: { name: string; count: number }[],
  added: number,
  merged: number,
): string {
  // „Lasagne ×2, Chili ×1“ — the multiplication sign U+00D7, not the letter x.
  const recipes = applied.map((entry) => `${entry.name} ×${entry.count}`).join(", ");

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} ${added === 1 ? "neuer Eintrag" : "neue Einträge"}`);
  if (merged > 0) parts.push(`${merged} zusammengeführt`);
  // Both zero is reachable: an empty recipe, or a retry of an apply whose every line had already
  // landed as a new row. Saying nothing at all would read as a failure.
  if (parts.length === 0) parts.push("keine neuen Einträge");

  return `${recipes} hinzugefügt · ${parts.join(", ")}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/format/plural.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the form state**

Append to `src/app/lists/[listId]/formState.ts` (leave `EntryFormState` untouched):

```ts
/**
 * The result shape the „Rezept hinzufügen“ Server Action returns.
 *
 * A third shape next to `EntryFormState` rather than more optional fields on it: applying has no
 * entry id, no sheet to open and no merge cue — it has one German sentence describing what
 * happened to n rows at once (ruling R6, the sheet shows it in place).
 */
export type ApplyFormState = {
  /** German inline error from the last attempt, or null. Drives the „Erneut versuchen“ state. */
  error: string | null;
  /** True after an apply SUCCEEDED — the sheet switches to its confirmation. */
  ok: boolean;
  /** The composed result sentence, or null when nothing has been applied yet. */
  message: string | null;
};

/** The initial value the apply sheet's useActionState starts from. */
export const APPLY_FORM_IDLE: ApplyFormState = { error: null, ok: false, message: null };
```

- [ ] **Step 6: Write the failing component test**

Create `src/app/lists/[listId]/ApplyRecipeSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import { ApplyRecipeSheet } from "./ApplyRecipeSheet";
import { APPLY_FORM_IDLE, type ApplyFormState } from "./formState";

const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });
const custom = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });

const RECIPES = [
  { id: "r1", name: "Lasagne", itemCount: 6 },
  { id: "r2", name: "Chili", itemCount: 4 },
];

function renderSheet(overrides: Partial<Parameters<typeof ApplyRecipeSheet>[0]> = {}) {
  const props = {
    recipes: RECIPES,
    labels,
    onClose: vi.fn(),
    applyAction: vi.fn(async () => APPLY_FORM_IDLE),
    ...overrides,
  };
  return { ...render(<ApplyRecipeSheet {...props} />), props };
}

describe("ApplyRecipeSheet", () => {
  it("lists every recipe with a stepper starting at 0", () => {
    renderSheet();

    expect(screen.getByRole("spinbutton", { name: "Anzahl Lasagne" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByRole("spinbutton", { name: "Anzahl Chili" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("keeps „Hinzufügen“ disabled until something is actually chosen", async () => {
    renderSheet();

    const submit = screen.getByRole("button", { name: "Hinzufügen" });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));

    expect(screen.getByRole("button", { name: "Hinzufügen" })).toBeEnabled();
  });

  it("posts one selection field per chosen recipe, and none for the others", async () => {
    let received: FormData | null = null;
    const applyAction = vi.fn(async (_prev: ApplyFormState, formData: FormData) => {
      received = formData;
      return APPLY_FORM_IDLE;
    });
    renderSheet({ applyAction });

    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));
    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));
    await userEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(received!.getAll("selection")).toEqual(["r1:2"]);
    // Every attempt carries a token, so a retry can be recognised as the same apply.
    expect(String(received!.get("applyToken"))).not.toBe("");
  });

  it("shows the result sentence and a „Fertig“ button after a successful apply", () => {
    renderSheet({
      initialState: {
        error: null,
        ok: true,
        message: "Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt",
      },
    });

    expect(
      screen.getByText("Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fertig" })).toBeInTheDocument();
    // The picker is gone — the decision has been made.
    expect(screen.queryByRole("spinbutton", { name: "Anzahl Lasagne" })).not.toBeInTheDocument();
  });

  it("offers a retry on failure and keeps the picker's choices", () => {
    renderSheet({
      initialState: { error: "Die Liste ist bereits abgeschlossen", ok: false, message: null },
    });

    expect(screen.getByText("Die Liste ist bereits abgeschlossen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("uses the project's own wording everywhere", () => {
    renderSheet({ labels: custom });

    expect(screen.getByRole("dialog", { name: "Set hinzufügen" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run it to make sure it fails**

Run: `npm test -- src/app/lists/[listId]/ApplyRecipeSheet.test.tsx`
Expected: FAIL — `Failed to resolve import "./ApplyRecipeSheet"`.

- [ ] **Step 8: Write the sheet**

Create `src/app/lists/[listId]/ApplyRecipeSheet.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { formatRecipeArticleCount } from "@/lib/format/plural";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { RecipeSummary } from "@/lib/recipes/recipes";
import { APPLY_FORM_IDLE, type ApplyFormState } from "./formState";
import styles from "./ApplyRecipeSheet.module.css";

type ApplyAction = (prev: ApplyFormState, formData: FormData) => Promise<ApplyFormState>;

type ApplyRecipeSheetProps = {
  recipes: RecipeSummary[];
  /** Composed by the page from the project — never re-derived here (spec §4). */
  labels: RecipeLabels;
  onClose: () => void;
  applyAction: ApplyAction;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: ApplyFormState;
};

/**
 * The „Rezept hinzufügen“ sheet (spec §6, „Into an existing list“).
 *
 * Three states in one component, because they are three views of one decision:
 *  1. the PICKER — one stepper per recipe,
 *  2. the RESULT — the German sentence plus „Fertig“ (ruling R6: the sheet reports in place, since
 *     the ⋮ menu lives in a Server Component's header and a banner „on the screen“ would need a
 *     provider for one line of text),
 *  3. the FAILURE — the error plus „Erneut versuchen“, which simply submits the same form again.
 *
 * WHY THE RETRY IS JUST A SECOND SUBMIT: the apply token below is generated once and kept until an
 * apply succeeds, so re-submitting produces byte-identical operation ids; lines that already landed
 * replay as no-ops through Slice 17's ledger and the rest apply (spec §6, ruling R1). There is no
 * compensating delete and no transaction — the idempotency does the work.
 */
export function ApplyRecipeSheet({
  recipes,
  labels,
  onClose,
  applyAction,
  initialState = APPLY_FORM_IDLE,
}: ApplyRecipeSheetProps) {
  // One count per recipe, all starting at 0 = „not chosen“ (spec §6). A Record rather than an
  // array keeps the lookup by id, which is what the render and the hidden inputs both need.
  const [counts, setCounts] = useState<Record<string, number>>({});
  /**
   * The apply token: ONE per attempt, generated lazily so it is created in the browser and never
   * during a server render. It survives a failure on purpose — that is what makes „Erneut
   * versuchen" idempotent — and is regenerated after a success, because applying the same recipe a
   * second time is a new intent, not a replay.
   */
  const [token, setToken] = useState(() => crypto.randomUUID());

  const [state, formAction, pending] = useActionState(async (prev: ApplyFormState, formData: FormData) => {
    const next = await applyAction(prev, formData);
    // A fresh token for the next apply, so re-opening the picker after a success can add more.
    if (next.ok) setToken(crypto.randomUUID());
    return next;
  }, initialState);

  const chosen = recipes
    .map((recipe) => ({ recipe, count: counts[recipe.id] ?? 0 }))
    .filter((entry) => entry.count > 0);

  // The confirmation view. `state.message` is the composed sentence from formatApplyResult.
  if (state.ok && state.message) {
    return (
      <Sheet open onClose={onClose} title={labels.addToList}>
        <div className={styles.result}>
          <Banner tone="success">{state.message}</Banner>
          <Button type="button" fullWidth onClick={onClose}>
            Fertig
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={labels.addToList}>
      <form action={formAction} className={styles.form}>
        {/* The token travels with every attempt; the server derives each entry's id from it. */}
        <input type="hidden" name="applyToken" value={token} />

        <ul className={styles.rows}>
          {recipes.map((recipe) => (
            <li key={recipe.id} className={styles.row}>
              <span className={styles.name}>
                {recipe.name}
                <span className={styles.meta}>{formatRecipeArticleCount(recipe.itemCount)}</span>
              </span>
              <Stepper
                // „Anzahl Lasagne“ — the counted thing is named, so the two buttons' derived
                // labels are unambiguous when several steppers sit in one sheet.
                label={`Anzahl ${recipe.name}`}
                value={counts[recipe.id] ?? 0}
                onChange={(next) => setCounts((current) => ({ ...current, [recipe.id]: next }))}
              />
            </li>
          ))}
        </ul>

        {/* One field per CHOSEN recipe. „id:count“ rather than two parallel arrays: a UUID
            contains no colon, so the split is unambiguous, and a recipe with count 0 simply has
            no field — the server never has to interpret a zero. */}
        {chosen.map(({ recipe, count }) => (
          <input key={recipe.id} type="hidden" name="selection" value={`${recipe.id}:${count}`} />
        ))}

        {state.error ? <FieldError>{state.error}</FieldError> : null}

        <Button type="submit" fullWidth disabled={pending || chosen.length === 0}>
          {/* A failed attempt renames the button rather than adding a second one: it is the same
              form, the same token and the same intent. */}
          {state.error ? "Erneut versuchen" : "Hinzufügen"}
        </Button>
      </form>
    </Sheet>
  );
}
```

Create `src/app/lists/[listId]/ApplyRecipeSheet.module.css`:

```css
.form,
.result {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Name on the left, stepper hard right — the shape the spec sketches. */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.name {
  display: flex;
  flex-direction: column;
  font-weight: 600;
}

.meta {
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-muted);
}
```

- [ ] **Step 9: Run the component test to verify it passes**

Run: `npm test -- src/app/lists/[listId]/ApplyRecipeSheet.test.tsx`
Expected: PASS — 6 tests.

> If `crypto.randomUUID` is undefined under jsdom in this environment, do **not** reach for a polyfill inside the component. Add it once in `src/test/setup.ts` next to the existing globals, with a comment saying it stands in for the browser API.

- [ ] **Step 10: Write the failing ListMenu test**

Append to `src/app/lists/[listId]/ListMenu.test.tsx` (and extend `renderMenu`'s defaults so existing tests keep passing — `recipeApply` defaults to `undefined`):

```tsx
const applyProps = {
  labels: recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" }),
  recipes: [{ id: "r1", name: "Lasagne", itemCount: 6 }],
  applyAction: vi.fn(async () => APPLY_FORM_IDLE),
};

describe("ListMenu — Rezept hinzufügen", () => {
  it("does not offer the entry when the feature is off", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(screen.queryByRole("menuitem", { name: "Rezept hinzufügen" })).not.toBeInTheDocument();
  });

  it("does not offer the entry when the project has no recipes yet", async () => {
    renderMenu({ recipeApply: { ...applyProps, recipes: [] } });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(screen.queryByRole("menuitem", { name: "Rezept hinzufügen" })).not.toBeInTheDocument();
  });

  it("does not offer the entry on a completed list", async () => {
    renderMenu({ isCompleted: true, recipeApply: applyProps });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(screen.queryByRole("menuitem", { name: "Rezept hinzufügen" })).not.toBeInTheDocument();
  });

  it("opens the picker from the menu, using the project's wording", async () => {
    renderMenu({
      recipeApply: {
        ...applyProps,
        labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }),
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set hinzufügen" }));

    expect(screen.getByRole("dialog", { name: "Set hinzufügen" })).toBeInTheDocument();
    // The menu closed behind it — two overlays must not fight (the ConfirmSheet precedent).
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});
```

Add the imports this needs at the top of the file:

```tsx
import { recipeLabels } from "@/lib/recipes/labels";
import { APPLY_FORM_IDLE } from "./formState";
```

- [ ] **Step 11: Run it to make sure it fails**

Run: `npm test -- src/app/lists/[listId]/ListMenu.test.tsx`
Expected: FAIL — the „Rezept hinzufügen“ menu item is never found.

- [ ] **Step 12: Extend `ListMenu`**

In `src/app/lists/[listId]/ListMenu.tsx`:

1. Add the imports:

```tsx
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { RecipeSummary } from "@/lib/recipes/recipes";
import { ApplyRecipeSheet } from "./ApplyRecipeSheet";
import type { ApplyFormState } from "./formState";
```

2. Extend the props type (keep every existing prop and its comment):

```tsx
  /**
   * Present only when the project has recipes ON and at least one recipe exists (ruling R8) —
   * a picker with nothing to pick is a dead end. `undefined` means „no entry at all“.
   */
  recipeApply?: {
    labels: RecipeLabels;
    recipes: RecipeSummary[];
    applyAction: (prev: ApplyFormState, formData: FormData) => Promise<ApplyFormState>;
  };
```

3. Add the state next to `confirmOpen`:

```tsx
  const [applyOpen, setApplyOpen] = useState(false);
```

4. Add the menu item as the FIRST entry inside `<div className={styles.menu} role="menu">`, before „Liste abschließen“:

```tsx
            {/* Applying is a change to the list's contents, so it is hidden on a completed list
                exactly as „Liste abschließen“ is (ruling R8). */}
            {recipeApply && !isCompleted && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  // Close the menu first: the sheet is the surface the user should now be
                  // looking at, and two overlays would fight (the ConfirmSheet precedent).
                  setOpen(false);
                  setApplyOpen(true);
                }}
              >
                {recipeApply.labels.addToList}
              </button>
            )}
```

5. Render the sheet next to the existing `<ConfirmSheet …>`:

```tsx
      {recipeApply && applyOpen && (
        <ApplyRecipeSheet
          recipes={recipeApply.recipes}
          labels={recipeApply.labels}
          applyAction={recipeApply.applyAction}
          onClose={() => setApplyOpen(false)}
        />
      )}
```

- [ ] **Step 13: Run the ListMenu test to verify it passes**

Run: `npm test -- src/app/lists/[listId]/ListMenu.test.tsx`
Expected: PASS — the four new tests plus every pre-existing one.

- [ ] **Step 14: Wire the page**

In `src/app/lists/[listId]/page.tsx`:

1. Add the imports:

```tsx
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { applyRecipesToList, type RecipeSelection } from "@/lib/recipes/apply";
import { recipeLabels } from "@/lib/recipes/labels";
import { listRecipes } from "@/lib/recipes/recipes";
import { formatApplyResult } from "@/lib/format/plural";
import { APPLY_FORM_IDLE, type ApplyFormState } from "./formState";
```

(`redirect` is already imported from `next/navigation`; add `notFound` to that same import.)

2. After the existing `Promise.all` that loads `list` and `vocabulary`, add the recipe read:

```tsx
  // The recipes feature is opt-in per project (spec §4), and this route sits OUTSIDE the project
  // layout, so it reads the two settings columns itself rather than through getProjectNav.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
  });
  const recipesEnabled = project?.recipesEnabled ?? false;
  const labels = project ? recipeLabels(project) : null;
  // Only read the recipes when there is a menu entry that could use them — an off project pays
  // nothing for a feature it never enabled.
  const recipes = recipesEnabled ? await listRecipes(prisma, projectId) : [];
```

3. Add the shared guard and the action next to the existing Server Actions:

```tsx
  /**
   * The guard the recipe actions share: identity, list access (which resolves membership) and the
   * feature flag. A Server Action is an individually addressable POST endpoint that this page's
   * render never gated, so disabling recipes while a sheet is open must turn its next submit into
   * a 404 (spec §9).
   */
  async function requireRecipeAccess() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    const settings = await prisma.project.findUnique({
      where: { id: l.projectId },
      select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
    });
    if (!settings?.recipesEnabled) notFound();
    return { list: l, labels: recipeLabels(settings) };
  }

  /** „Rezept hinzufügen“: applies the picker's selection. Member-level. */
  async function applyRecipesAction(
    _prev: ApplyFormState,
    formData: FormData,
  ): Promise<ApplyFormState> {
    "use server";
    const { list: l, labels: actionLabels } = await requireRecipeAccess();

    // Ruling R2: a missing token still applies, it is just not retry-safe. Never a 400 the user
    // cannot act on.
    const token = String(formData.get("applyToken") ?? "") || randomUUID();

    // „<recipeId>:<count>“ — a UUID contains no colon, so the first one is the separator.
    const selections: RecipeSelection[] = formData.getAll("selection").map((raw) => {
      const value = String(raw);
      const separator = value.indexOf(":");
      return {
        recipeId: value.slice(0, separator),
        // NaN survives deliberately: assertValidRecipeCount answers with the German
        // „Anzahl muss zwischen 1 und 99 liegen“ rather than a second, drifting rule here.
        count: Number(value.slice(separator + 1)),
      };
    });
    // Empty submission: silent no-op, the convention every form in this app uses.
    if (selections.length === 0) return APPLY_FORM_IDLE;

    try {
      const result = await applyRecipesToList(prisma, l, selections, token, actionLabels);
      revalidatePath(`/lists/${listId}`);
      // The project screen prints „N offen“ per list — it lives above this route.
      revalidatePath(`/projects/${l.projectId}`, "layout");
      return {
        error: null,
        ok: true,
        message: formatApplyResult(result.applied, result.added, result.merged),
      };
    } catch (error) {
      // Only ApiError carries user-facing German copy; anything else is a real bug and must not be
      // disguised as a validation message (the same rule as toEntryFormState above).
      if (error instanceof ApiError) return { error: error.message, ok: false, message: null };
      throw error;
    }
  }
```

4. Pass the new prop where `ListMenu` is rendered:

```tsx
          <ListMenu
            listName={list.name}
            isCompleted={isCompleted}
            completeAction={completeListAction}
            deleteAction={deleteListAction}
            // Ruling R8: no entry at all unless the feature is on AND there is something to pick.
            recipeApply={
              recipesEnabled && labels && recipes.length > 0
                ? { labels, recipes, applyAction: applyRecipesAction }
                : undefined
            }
          />
```

- [ ] **Step 15: Verify the whole suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: all green. The build matters here: `page.tsx` is the file most likely to trip a Server-Action serialization rule.

- [ ] **Step 16: Commit**

```bash
git add src/lib/format/plural.ts src/lib/format/plural.test.ts "src/app/lists/[listId]"
git commit -m "$(cat <<'EOF'
feat(recipes): apply a recipe from the list menu

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `createListWithRecipes` — recipes first, pre-fill de-duplicated

**Files:**
- Modify: `src/lib/recipes/apply.ts`
- Modify: `src/lib/recipes/apply.test.ts`

**Interfaces:**
- Consumes: `applyRecipesToList` (Task 2); `createList` + `CreateListInput` from `src/lib/lists/lists.ts`; `applyOperation` from `src/lib/lists/operations.ts`; `normalizeName` from `src/lib/catalog/normalize.ts`.
- Produces: `createListWithRecipes(db, input: CreateListInput & { articleNames: string[]; selections: RecipeSelection[]; token: string }, labels): Promise<List>`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/recipes/apply.test.ts` (and add `createListWithRecipes` to the `./apply` import):

```ts
describe("createListWithRecipes", () => {
  it("applies the recipes BEFORE the pre-fill, so the recipe rows come first", async () => {
    const milk = await makeArticle("Milch");
    const bread = await makeArticle("Brot");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 1, unit: "l" },
    ]);

    const list = await createListWithRecipes(
      db,
      {
        projectId,
        name: "Samstag",
        articleNames: ["Brot"],
        selections: [{ recipeId: recipe.id, count: 1 }],
        token: randomUUID(),
      },
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([
      { name: "Milch", quantity: 1, unit: "l" },
      { name: "Brot", quantity: null, unit: null },
    ]);
    expect(bread.id).toBeDefined(); // the article existed before the list did
  });

  it("skips a suggestion the recipes already put on the list (spec §6's ordering rule)", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 3, unit: "l" },
    ]);

    const list = await createListWithRecipes(
      db,
      {
        projectId,
        name: "Samstag",
        // The pre-fill would add a bare, quantity-less „Milch“ — which D1 would never merge into
        // the recipe's 3 l. Skipping it is what keeps the list from showing Milch twice.
        articleNames: ["Milch"],
        selections: [{ recipeId: recipe.id, count: 1 }],
        token: randomUUID(),
      },
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 3, unit: "l" }]);
  });

  it("matches the skip by NORMALIZED name, not by exact spelling", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 1, unit: "l" },
    ]);

    const list = await createListWithRecipes(
      db,
      {
        projectId,
        name: "Samstag",
        articleNames: ["  milch  "],
        selections: [{ recipeId: recipe.id, count: 1 }],
        token: randomUUID(),
      },
      labels,
    );

    expect(await entriesOf(list.id)).toHaveLength(1);
  });

  it("drops a duplicate inside the pre-fill itself", async () => {
    await makeArticle("Brot");

    const list = await createListWithRecipes(
      db,
      {
        projectId,
        name: "Samstag",
        articleNames: ["Brot", "Brot"],
        selections: [],
        token: randomUUID(),
      },
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Brot", quantity: null, unit: null }]);
  });

  it("behaves exactly like a plain pre-fill when no recipe is chosen", async () => {
    await makeArticle("Brot");

    const list = await createListWithRecipes(
      db,
      { projectId, name: "Samstag", articleNames: ["Brot"], selections: [], token: randomUUID() },
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Brot", quantity: null, unit: null }]);
  });

  it("deletes the half-built list when the apply fails (compensating action)", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 1, unit: "l" },
    ]);

    await expect(
      createListWithRecipes(
        db,
        {
          projectId,
          name: "Samstag",
          articleNames: ["Brot"],
          // 100 is out of range: the apply throws before it writes anything.
          selections: [{ recipeId: recipe.id, count: 100 }],
          token: randomUUID(),
        },
        labels,
      ),
    ).rejects.toThrow("Anzahl muss zwischen 1 und 99 liegen");

    // A list named „Samstag“ holding an arbitrary subset would appear under AKTIVE LISTEN with no
    // sign that anything went wrong.
    expect(await db.list.count({ where: { projectId } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/recipes/apply.test.ts`
Expected: FAIL — `createListWithRecipes is not exported`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/recipes/apply.ts` (add the imports at the top of the file):

```ts
import { randomUUID } from "node:crypto";
import { normalizeName } from "@/lib/catalog/normalize";
import { createList, type CreateListInput } from "@/lib/lists/lists";
import { applyOperation } from "@/lib/lists/operations";
```

```ts
export interface CreateListWithRecipesInput extends CreateListInput {
  /** The suggestion chips that survived the sheet's de-selection, by article NAME. */
  articleNames: string[];
  /** The second pane's picker result. An empty array is the „no recipes chosen“ case. */
  selections: RecipeSelection[];
  /** The client's apply token, so a retried creation cannot double-count (ruling R1). */
  token: string;
}

/**
 * Creates a list, applies the chosen recipes, and THEN pre-fills with the suggestions that are not
 * already on it (spec §6, „Into a new list“).
 *
 * WHY THE ORDER IS NOT NEGOTIABLE: a suggestion is an article-level wish with no quantity, and D1
 * refuses to merge an entry that carries no number. Pre-filling first would therefore leave the
 * recipe's „3 l Milch“ and the pre-fill's bare „Milch“ side by side forever. A recipe satisfies the
 * wish more precisely, so the suggestion has nothing left to contribute.
 *
 * WHY THE SUBTRACTION HAPPENS HERE AND NOT IN THE FUNNEL: D1 stays exactly as it is written — this
 * is a caller holding both sets and choosing what to send, not a new merge rule.
 *
 * Twin of `createListWithArticles` in src/lib/suggestions/suggestions.ts, deliberately NOT a flag
 * on it (ruling R3): a project that never enables recipes keeps running that function unchanged.
 * The compensating delete below is the same pattern, for the same reason — see its comment there
 * for why this is not a db.$transaction.
 */
export async function createListWithRecipes(
  db: PrismaClient,
  input: CreateListWithRecipesInput,
  labels: RecipeLabels,
): Promise<List> {
  // createList enforces the name rules and the optional client-supplied UUID, so an invalid
  // request fails BEFORE anything is written.
  const list = await createList(db, input);

  try {
    await applyRecipesToList(db, list, input.selections, input.token, labels);

    // What the recipes just put on the list, by the catalog's OWN identity rule (ruling R4). One
    // read, after the apply, so a merged line counts once and a line that inherited its article
    // through get-or-create is included.
    const present = await db.listItem.findMany({
      where: { listId: list.id },
      select: { catalogItem: { select: { normalizedName: true } } },
    });
    const seen = new Set(present.map((item) => item.catalogItem.normalizedName));

    for (const name of input.articleNames) {
      const normalized = normalizeName(name);
      // Already on the list — from a recipe, or from an earlier duplicate in this very loop.
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      // Only the NAME is passed: add_item resolves it to the project's catalog row and inherits
      // its category/unit defaults, so the inheritance logic is never duplicated.
      await applyOperation(db, list, {
        op: "add_item",
        itemId: randomUUID(), // stable entry identity, generated caller-side by convention
        name,
      });
    }
  } catch (error) {
    // Pattern: COMPENSATING ACTION. A half-filled list is an artifact the user never asked for.
    // .catch(): the cleanup is best-effort — if the delete ALSO fails, the caller must still see
    // the ORIGINAL cause, not a secondary rollback error.
    await db.list.delete({ where: { id: list.id } }).catch(() => undefined);
    throw error;
  }

  return list;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/recipes/apply.test.ts`
Expected: PASS — 17 tests (11 from Task 2 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipes/apply.ts src/lib/recipes/apply.test.ts
git commit -m "$(cat <<'EOF'
feat(recipes): create a list from recipes and a de-duplicated pre-fill

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The two-step „Neue Liste“ sheet

**Files:**
- Modify: `src/lib/recipes/recipes.ts`
- Modify: `src/lib/recipes/recipes.test.ts`
- Modify: `src/lib/format/plural.ts`
- Modify: `src/lib/format/plural.test.ts`
- Modify: `src/app/projects/[projectId]/NewListSheet.tsx`
- Modify: `src/app/projects/[projectId]/NewListSheet.module.css`
- Modify: `src/app/projects/[projectId]/NewListSheet.test.tsx`
- Modify: `src/app/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `Stepper` (Task 3); `createListWithRecipes` (Task 5); `SuggestedArticle` (Slice 5); `recipeLabels` (Slice 18).
- Produces:
  - `listRecipesForApply(db, projectId): Promise<RecipeForPicker[]>` where `interface RecipeForPicker { id: string; name: string; articles: { catalogItemId: string; name: string }[] }`
  - `formatArticleEnumeration(names: string[]): string`
  - `formatRecipeOverlapNote(names: string[], labels: RecipeLabels): string`
  - `formatNewListWithRecipesLabel(count: number): string`
  - `NewListSheet` gains `recipes?: RecipeForPicker[]` and `labels?: RecipeLabels | null`.

- [ ] **Step 1: Write the failing test for the picker read**

Append to `src/lib/recipes/recipes.test.ts` (add `listRecipesForApply` to the `./recipes` import):

```ts
describe("listRecipesForApply", () => {
  it("returns each recipe with its article names, alphabetically", async () => {
    const milk = await makeArticle("Milch");
    const salt = await makeArticle("Salz");
    const zucchini = await createRecipe(db, { projectId, name: "Zucchinisuppe" }, labels);
    const lasagne = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    await addRecipeItem(
      db,
      { projectId, recipeId: lasagne.id, catalogItemId: milk.id, quantity: 1, unit: "l" },
      labels,
    );
    await addRecipeItem(db, { projectId, recipeId: lasagne.id, catalogItemId: salt.id }, labels);
    await addRecipeItem(db, { projectId, recipeId: zucchini.id, catalogItemId: salt.id }, labels);

    const recipes = await listRecipesForApply(db, projectId);

    expect(recipes).toEqual([
      {
        id: lasagne.id,
        name: "Lasagne",
        articles: [
          { catalogItemId: milk.id, name: "Milch" },
          { catalogItemId: salt.id, name: "Salz" },
        ],
      },
      { id: zucchini.id, name: "Zucchinisuppe", articles: [{ catalogItemId: salt.id, name: "Salz" }] },
    ]);
  });

  it("never reaches into another project", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Fremd", ownerId: otherUser.id } });
    await createRecipe(db, { projectId: other.id, name: "Fremdrezept" }, labels);

    expect(await listRecipesForApply(db, projectId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/recipes/recipes.test.ts`
Expected: FAIL — `listRecipesForApply is not exported`.

- [ ] **Step 3: Write the read**

Append to the "Reads" section of `src/lib/recipes/recipes.ts`:

```ts
/** One recipe as the „Neue Liste“ picker needs it: a name to show and the articles it would add. */
export interface RecipeForPicker {
  id: string;
  name: string;
  articles: { catalogItemId: string; name: string }[];
}

/**
 * Every recipe of a project WITH its article identities — the read behind the new-list sheet's
 * second pane.
 *
 * Why the article names travel to the client at all: step 2 has to name the overlap with the
 * pre-fill („Milch, Eier und Butter kommen schon aus den Rezepten…“) and show a DE-DUPLICATED
 * count on the button. Both sets are already client-side at that moment, so this is a local
 * computation — and the alternative, asking the server after every stepper tap, would put a
 * round-trip inside a control the user presses repeatedly.
 *
 * Why quantities are deliberately absent: the button counts ARTICLES (ruling R5), and nothing in
 * the sheet renders an amount. Shipping quantities would invite a second, client-side copy of the
 * multiplier.
 *
 * Deliberately separate from `listRecipes`, which the index screen and the list's apply sheet use:
 * those need a line COUNT, not a list of names.
 */
export async function listRecipesForApply(
  db: PrismaClient,
  projectId: string,
): Promise<RecipeForPicker[]> {
  const rows = await db.recipe.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      items: {
        // sortIndex is the recipe's own order — the same ordering getRecipeWithItems uses.
        orderBy: { sortIndex: "asc" },
        select: { catalogItemId: true, catalogItem: { select: { name: true } } },
      },
    },
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      articles: row.items.map((item) => ({
        catalogItemId: item.catalogItemId,
        name: item.catalogItem.name,
      })),
    }))
    // Sort AFTER the projection, on plain names, under the shared German comparator — the same
    // order of operations (and the same reason) as listRecipes and listCatalog.
    .sort((a, b) => compareArticleNames(a.name, b.name));
}
```

- [ ] **Step 4: Run the read test to verify it passes**

Run: `npm test -- src/lib/recipes/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the three German helpers**

Append to `src/lib/format/plural.test.ts` (extend the import):

```ts
describe("formatArticleEnumeration", () => {
  it("joins three names the way German writes a list", () => {
    expect(formatArticleEnumeration(["Milch", "Eier", "Butter"])).toBe("Milch, Eier und Butter");
  });

  it("joins two names with „und“", () => {
    expect(formatArticleEnumeration(["Milch", "Eier"])).toBe("Milch und Eier");
  });

  it("returns a single name unchanged", () => {
    expect(formatArticleEnumeration(["Milch"])).toBe("Milch");
  });

  it("returns an empty string for an empty list", () => {
    expect(formatArticleEnumeration([])).toBe("");
  });
});

describe("formatRecipeOverlapNote", () => {
  const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

  it("explains an overlap of several articles", () => {
    expect(formatRecipeOverlapNote(["Milch", "Eier", "Butter"], labels)).toBe(
      "Milch, Eier und Butter kommen schon aus den Rezepten und werden nicht doppelt hinzugefügt.",
    );
  });

  it("uses the singular verb for one article", () => {
    expect(formatRecipeOverlapNote(["Milch"], labels)).toBe(
      "Milch kommt schon aus den Rezepten und wird nicht doppelt hinzugefügt.",
    );
  });

  it("uses the project's own plural label", () => {
    const sets = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });
    expect(formatRecipeOverlapNote(["Milch"], sets)).toContain("aus den Sets");
  });

  it("returns an empty string when nothing overlaps, so the caller can render it unconditionally", () => {
    expect(formatRecipeOverlapNote([], labels)).toBe("");
  });
});

describe("formatNewListWithRecipesLabel", () => {
  it("shows the de-duplicated article total", () => {
    expect(formatNewListWithRecipesLabel(15)).toBe("Liste anlegen · 15 Artikel");
  });

  it("keeps the singular", () => {
    expect(formatNewListWithRecipesLabel(1)).toBe("Liste anlegen · 1 Artikel");
  });

  it("falls back to the empty-list wording at zero, exactly like formatNewListLabel", () => {
    expect(formatNewListWithRecipesLabel(0)).toBe("Leere Liste anlegen");
  });
});
```

Add `import { recipeLabels } from "@/lib/recipes/labels";` at the top of the test file.

- [ ] **Step 6: Run it to make sure it fails**

Run: `npm test -- src/lib/format/plural.test.ts`
Expected: FAIL — the three functions do not exist.

- [ ] **Step 7: Write the three helpers**

Append to `src/lib/format/plural.ts`:

```ts
/**
 * „Milch, Eier und Butter“ — a German enumeration.
 *
 * Why not names.join(", "): German (like English) replaces the last separator with „und“, and a
 * note that reads „Milch, Eier, Butter kommen schon…“ is the kind of small wrongness that makes an
 * app feel machine-written. Deliberately no Oxford comma — German does not use one.
 */
export function formatArticleEnumeration(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  const head = names.slice(0, -1);
  const last = names[names.length - 1];
  return `${head.join(", ")} und ${last}`;
}

/**
 * The new-list sheet's step-2 note: „Milch, Eier und Butter kommen schon aus den Rezepten und
 * werden nicht doppelt hinzugefügt." (spec §6).
 *
 * Why the note is ADDITIVE rather than striking the chips in step 1: rewriting step 1's UI from
 * step 2 reads as the app undoing choices the user just made. The design is explicit about this.
 *
 * DELIBERATE WORDING DEVIATION from the spec's sketch, which reads „… — sie werden nicht
 * doppelt hinzugefügt.“ That works for a plural overlap and breaks for a single article
 * („Milch … sie wird“), whose gender is unknowable. „… und werden/wird nicht doppelt
 * hinzugefügt“ says the same thing in both numbers with no pronoun at all. The sketch is a
 * wireframe, not a copy contract.
 *
 * Why the sentence avoids pronouns entirely („und wird“ instead of „er/sie/es wird“): the article
 * names are free text with unknowable gender, and the recipe label is user-chosen too (ruling R7
 * of Slice 18 fixed the label as neuter, but articles have no such fallback). A construction with
 * no pronoun is correct for every noun.
 *
 * Returns "" for an empty overlap so the caller can render it unconditionally.
 */
export function formatRecipeOverlapNote(names: string[], labels: RecipeLabels): string {
  if (names.length === 0) return "";
  const verb = names.length === 1 ? "kommt" : "kommen";
  const added = names.length === 1 ? "wird" : "werden";
  return `${formatArticleEnumeration(names)} ${verb} schon aus den ${labels.plural} und ${added} nicht doppelt hinzugefügt.`;
}

/**
 * „Liste anlegen · 15 Artikel“ — the second pane's commit button (spec §6).
 *
 * Why a second label function next to formatNewListLabel rather than a parameter: the one-pane
 * button promises „Liste mit 15 Einträgen anlegen“ (dative, counting ENTRIES), while this one
 * counts distinct ARTICLES across recipes and pre-fill (ruling R5) — two different nouns making
 * two different promises. Zero collapses to the same „Leere Liste anlegen“, because an empty list
 * is an empty list either way.
 */
export function formatNewListWithRecipesLabel(count: number): string {
  if (count === 0) return "Leere Liste anlegen";
  return `Liste anlegen · ${count} Artikel`;
}
```

`RecipeLabels` is already imported in `plural.ts` (Slice 18's `formatUsedInRecipes` uses it).

- [ ] **Step 8: Run the helper tests to verify they pass**

Run: `npm test -- src/lib/format/plural.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing sheet tests**

Append to `src/app/projects/[projectId]/NewListSheet.test.tsx`. Extend the existing render helper so `recipes` defaults to `[]` and `labels` to `null` — every pre-existing test then keeps asserting the one-pane behaviour, which is the point of the „step 2 is skipped“ rule.

```tsx
const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

const RECIPES = [
  {
    id: "r1",
    name: "Lasagne",
    articles: [
      { catalogItemId: "c-milch", name: "Milch" },
      { catalogItemId: "c-hack", name: "Hackfleisch" },
    ],
  },
  { id: "r2", name: "Chili", articles: [{ catalogItemId: "c-bohnen", name: "Bohnen" }] },
];

describe("NewListSheet — Schritt 2", () => {
  it("stays a one-pane sheet when the project has no recipes", async () => {
    renderSheet();

    await openSheet();

    // The step-1 button is still the commit button — there is nothing to step to.
    expect(screen.queryByRole("button", { name: "Weiter" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Liste mit/ })).toBeInTheDocument();
  });

  it("stays a one-pane sheet when the feature is off, even if recipes exist", async () => {
    renderSheet({ recipes: RECIPES, labels: null });

    await openSheet();

    expect(screen.queryByRole("button", { name: "Weiter" })).not.toBeInTheDocument();
  });

  it("offers „Weiter“ into the recipe pane when the feature is on", async () => {
    renderSheet({ recipes: RECIPES, labels });

    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByRole("spinbutton", { name: "Anzahl Lasagne" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Anzahl Chili" })).toBeInTheDocument();
  });

  it("returns to step 1 and keeps what was typed", async () => {
    renderSheet({ recipes: RECIPES, labels });

    await openSheet();
    await userEvent.type(screen.getByRole("textbox", { name: "Listenname" }), "Samstag");
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));

    expect(screen.getByRole("textbox", { name: "Listenname" })).toHaveValue("Samstag");
  });

  it("counts articles de-duplicated across recipes and pre-fill", async () => {
    // The suggestion set contains Milch, which Lasagne also brings. 2 recipe articles + 2
    // suggestions − 1 overlap = 3.
    renderSheet({
      recipes: RECIPES,
      labels,
      suggestions: [
        { catalogItemId: "c-milch", name: "Milch", defaultCategory: null, defaultUnit: null },
        { catalogItemId: "c-brot", name: "Brot", defaultCategory: null, defaultUnit: null },
      ],
    });

    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));

    expect(screen.getByRole("button", { name: "Liste anlegen · 3 Artikel" })).toBeInTheDocument();
  });

  it("names the overlap instead of striking the step-1 chips", async () => {
    renderSheet({
      recipes: RECIPES,
      labels,
      suggestions: [
        { catalogItemId: "c-milch", name: "Milch", defaultCategory: null, defaultUnit: null },
      ],
    });

    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));

    expect(
      screen.getByText(
        "Milch kommt schon aus den Rezepten und wird nicht doppelt hinzugefügt.",
      ),
    ).toBeInTheDocument();
  });

  it("posts the chosen recipes, the surviving suggestions and an apply token", async () => {
    let received: FormData | null = null;
    const createAction = vi.fn((formData: FormData) => {
      received = formData;
    });
    renderSheet({
      recipes: RECIPES,
      labels,
      createAction,
      suggestions: [
        { catalogItemId: "c-brot", name: "Brot", defaultCategory: null, defaultUnit: null },
      ],
    });

    await openSheet();
    await userEvent.type(screen.getByRole("textbox", { name: "Listenname" }), "Samstag");
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Anzahl Chili erhöhen" }));
    await userEvent.click(screen.getByRole("button", { name: /^Liste anlegen · / }));

    expect(received!.get("name")).toBe("Samstag");
    expect(received!.getAll("articleName")).toEqual(["Brot"]);
    expect(received!.getAll("selection")).toEqual(["r2:1"]);
    expect(String(received!.get("applyToken"))).not.toBe("");
  });
});
```

Add at the top of the file:

```tsx
import { recipeLabels } from "@/lib/recipes/labels";
```

and a small helper next to `renderSheet`. It targets the HERO title the existing helper sets
(„Vorbefüllte Liste anlegen"), because the submit button inside the sheet also ends in
„… anlegen" and a looser matcher would find two buttons:

```tsx
/** Opens the hero card's sheet — every step-2 test starts here. */
async function openSheet() {
  await userEvent.click(screen.getByRole("button", { name: "Vorbefüllte Liste anlegen" }));
}
```

- [ ] **Step 10: Run it to make sure it fails**

Run: `npm test -- src/app/projects/[projectId]/NewListSheet.test.tsx`
Expected: FAIL — no „Weiter“ button exists.

- [ ] **Step 11: Extend `NewListSheet`**

In `src/app/projects/[projectId]/NewListSheet.tsx`:

1. Add the imports:

```tsx
import { Stepper } from "@/components/ui/Stepper";
import {
  formatNewListLabel,
  formatNewListWithRecipesLabel,
  formatRecipeOverlapNote,
} from "@/lib/format/plural";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { RecipeForPicker } from "@/lib/recipes/recipes";
```

2. Extend the props (keep every existing prop and its comment):

```tsx
  /**
   * The project's recipes with their article identities. Empty when the feature is off or the
   * project has none — in both cases the sheet stays exactly the one-pane sheet it was, which is
   * the spec's „nothing changes for a project that never turns this on“.
   */
  recipes?: RecipeForPicker[];
  /** The project's own wording, or null when the feature is off. */
  labels?: RecipeLabels | null;
```

3. Give the two new props defaults in the destructuring, so every existing call site keeps
   working unchanged:

```tsx
export function NewListSheet({
  suggestions,
  favoriteIds,
  recipes = [],
  labels = null,
  heroTitle,
  heroSubtitle,
  createAction,
}: NewListSheetProps) {
```

4. Inside the component, **after the existing `const selected = …` line** (the derived values below
   read it), add the second pane's state and sets:

```tsx
  // Which pane is showing. There is no route change and no history entry: closing the sheet must
  // abandon the whole flow, not walk back through it.
  const [step, setStep] = useState<1 | 2>(1);
  // One count per recipe, 0 = „not chosen“ (spec §6).
  const [counts, setCounts] = useState<Record<string, number>>({});
  // One apply token for this creation attempt, generated lazily in the browser (ruling R1).
  const [token] = useState(() => crypto.randomUUID());

  // Step 2 exists only when there is something to pick. A project with the feature off, or with no
  // recipes yet, keeps the untouched one-pane sheet. Narrowing into a const (rather than a
  // non-null assertion at the render site) is what lets `recipeStepLabels` be used without `!`.
  const recipeStepLabels = recipes.length > 0 ? (labels ?? null) : null;
  const hasRecipeStep = recipeStepLabels !== null;

  const chosenRecipes = recipes.filter((recipe) => (counts[recipe.id] ?? 0) > 0);
  // Distinct articles the chosen recipes would add. A Set because two recipes asking for Milch is
  // ONE article — the number on the button counts articles, not rows (ruling R5).
  const recipeArticleIds = new Set(
    chosenRecipes.flatMap((recipe) => recipe.articles.map((article) => article.catalogItemId)),
  );
  // The suggestions the recipes already cover. Named in the note, never struck in step 1.
  const overlap = selected.filter((article) => recipeArticleIds.has(article.catalogItemId));
  const totalArticles = recipeArticleIds.size + selected.length - overlap.length;
```

5. Reset the new state in `openSheet` alongside `setPrefill` / `setExcluded`:

```tsx
    setStep(1);
    setCounts({});
```

6. Wrap the existing pane-1 content so it is hidden — not unmounted — on step 2, and add pane 2.
   **Hidden, not conditionally rendered:** the name field and the chip selection are `<input>`s inside this one `<form>`, and unmounting them would drop their values out of the submitted FormData. Use the `hidden` attribute on a wrapper `<div>`:

```tsx
        <div hidden={step === 2}>
          {/* Everything pane 1 already renders, moved inside this wrapper unchanged: the
              „Listenname" TextField, the „Vorbefüllen" toggle row, the suggestion chips and the
              ★-legend paragraph. Do not edit any of it. */}
        </div>

        {recipeStepLabels && step === 2 && (
          <div className={styles.recipeStep}>
            <ul className={styles.recipeRows}>
              {recipes.map((recipe) => (
                <li key={recipe.id} className={styles.recipeRow}>
                  <span className={styles.recipeName}>{recipe.name}</span>
                  <Stepper
                    label={`Anzahl ${recipe.name}`}
                    value={counts[recipe.id] ?? 0}
                    onChange={(next) =>
                      setCounts((current) => ({ ...current, [recipe.id]: next }))
                    }
                  />
                </li>
              ))}
            </ul>

            {/* Renders nothing when nothing overlaps — the helper returns "". */}
            {overlap.length > 0 && (
              <p className={styles.overlapNote}>
                {formatRecipeOverlapNote(
                  overlap.map((article) => article.name),
                  recipeStepLabels,
                )}
              </p>
            )}
          </div>
        )}
```

7. The hidden inputs. The `articleName` fields stay exactly as they are; add the selections and the token, rendered in both steps so a submit from either pane is complete:

```tsx
          {hasRecipeStep && <input type="hidden" name="applyToken" value={token} />}
          {chosenRecipes.map((recipe) => (
            <input
              key={recipe.id}
              type="hidden"
              name="selection"
              value={`${recipe.id}:${counts[recipe.id]}`}
            />
          ))}
```

8. The footer. Step 1 commits directly when there is no second pane, and otherwise moves on:

```tsx
          <div className={styles.submit}>
            {hasRecipeStep && step === 1 ? (
              // „Weiter“, not a submit: a click must not post the form.
              <Button type="button" fullWidth onClick={() => setStep(2)}>
                Weiter
              </Button>
            ) : hasRecipeStep ? (
              <>
                <Button type="button" variant="text" onClick={() => setStep(1)}>
                  Zurück
                </Button>
                <Button type="submit" fullWidth>
                  {formatNewListWithRecipesLabel(totalArticles)}
                </Button>
              </>
            ) : (
              // The untouched one-pane path: same label, same promise, same dative plural.
              <Button type="submit" fullWidth>
                {formatNewListLabel(selected.length)}
              </Button>
            )}
          </div>
```

9. Add the new class names to `NewListSheet.module.css`:

```css
.recipeStep {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recipeRows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recipeRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.recipeName {
  font-weight: 600;
}

/* The additive note, quiet enough that it reads as an explanation and not as a warning. */
.overlapNote {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-text-muted);
}
```

- [ ] **Step 12: Run the sheet tests to verify they pass**

Run: `npm test -- src/app/projects/[projectId]/NewListSheet.test.tsx`
Expected: PASS — the new tests **and** every pre-existing one, unchanged.

- [ ] **Step 13: Wire the project page**

In `src/app/projects/[projectId]/page.tsx`:

1. Add the imports:

```tsx
import { createListWithRecipes, type RecipeSelection } from "@/lib/recipes/apply";
import { recipeLabels } from "@/lib/recipes/labels";
import { listRecipesForApply } from "@/lib/recipes/recipes";
```

2. After the existing `Promise.all`, read the recipe settings and the recipes:

```tsx
  // The nav already carries `recipesEnabled` (Slice 18), but the sheet also needs the SINGULAR —
  // and the recipes themselves — so the two label columns are read here.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
  });
  const recipesEnabled = project?.recipesEnabled ?? false;
  const recipeSheetLabels = recipesEnabled && project ? recipeLabels(project) : null;
  // Off projects pay nothing for a feature they never enabled.
  const recipes = recipesEnabled ? await listRecipesForApply(prisma, projectId) : [];
```

3. Extend `createFromSheetAction`, keeping every existing line:

```tsx
    const articleNames = formData.getAll("articleName").map((value) => String(value));

    // „<recipeId>:<count>“ — see the list screen's applyRecipesAction for the same parse.
    const selections: RecipeSelection[] = formData.getAll("selection").map((raw) => {
      const value = String(raw);
      const separator = value.indexOf(":");
      return { recipeId: value.slice(0, separator), count: Number(value.slice(separator + 1)) };
    });

    // No recipes chosen -> the untouched Slice 11 path. This is what keeps a project that never
    // enables the feature on exactly the code it runs today (ruling R3).
    if (selections.length === 0) {
      const list = await createListWithArticles(prisma, { projectId, name, articleNames });
      redirect(`/lists/${list.id}`);
    }

    // The feature is re-checked on submit: a Server Action is an individually addressable POST
    // endpoint, so disabling recipes while the sheet was open must not apply anything (spec §9).
    const settings = await prisma.project.findUnique({
      where: { id: projectId },
      select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
    });
    if (!settings?.recipesEnabled) notFound();

    const token = String(formData.get("applyToken") ?? "") || randomUUID();
    const list = await createListWithRecipes(
      prisma,
      { projectId, name, articleNames, selections, token },
      recipeLabels(settings),
    );
    // redirect() throws a special Next.js error internally — it must not be wrapped in try/catch,
    // and nothing may run after it.
    redirect(`/lists/${list.id}`);
```

Add `notFound` to the `next/navigation` import and `randomUUID` from `node:crypto`.

4. Pass the new props where `NewListSheet` is rendered:

```tsx
    <NewListSheet
      suggestions={suggestions}
      favoriteIds={favoriteIds}
      recipes={recipes}
      labels={recipeSheetLabels}
      heroTitle={…}
      heroSubtitle={…}
      createAction={createFromSheetAction}
    />
```

- [ ] **Step 14: Verify the whole suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 15: Commit**

```bash
git add src/lib/recipes/recipes.ts src/lib/recipes/recipes.test.ts src/lib/format/plural.ts src/lib/format/plural.test.ts "src/app/projects/[projectId]/NewListSheet.tsx" "src/app/projects/[projectId]/NewListSheet.module.css" "src/app/projects/[projectId]/NewListSheet.test.tsx" "src/app/projects/[projectId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(recipes): add recipes as the second step of the new-list sheet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `buildRecipeFromEntries` — list rows into a recipe draft, as a pure function

**Files:**
- Create: `src/lib/recipes/build.ts`
- Test: `src/lib/recipes/build.test.ts`

**Interfaces:**
- Consumes: `ApiError`; `formatQuantityLabel` from `src/lib/format/quantity.ts`.
- Produces:
  - `interface DerivableEntry { id: string; catalogItemId: string; name: string; quantity: number | null; unit: string | null }`
  - `interface DerivedLineInput { entryId: string; quantity: number | null; unit: string | null }`
  - `interface RecipeDraftLine { catalogItemId: string; name: string; quantity: number | null; unit: string | null }`
  - `buildRecipeFromEntries(entries: DerivableEntry[], selections: DerivedLineInput[]): RecipeDraftLine[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recipes/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { buildRecipeFromEntries, type DerivableEntry } from "./build";

/** The completed list, in the order the list screen shows it. */
const ENTRIES: DerivableEntry[] = [
  { id: "e1", catalogItemId: "c-hack", name: "Hackfleisch", quantity: 500, unit: "g" },
  { id: "e2", catalogItemId: "c-milch", name: "Milch", quantity: 1, unit: "l" },
  { id: "e3", catalogItemId: "c-zwiebel", name: "Zwiebeln", quantity: 2, unit: null },
  { id: "e4", catalogItemId: "c-salz", name: "Salz", quantity: null, unit: null },
  // A second Milch row in a different unit — legal on a list (D1 keeps them apart).
  { id: "e5", catalogItemId: "c-milch", name: "Milch", quantity: 500, unit: "ml" },
];

describe("buildRecipeFromEntries", () => {
  it("keeps the edited per-unit quantities", () => {
    const lines = buildRecipeFromEntries(ENTRIES, [
      { entryId: "e1", quantity: 250, unit: "g" },
      { entryId: "e2", quantity: 0.5, unit: "l" },
    ]);

    expect(lines).toEqual([
      { catalogItemId: "c-hack", name: "Hackfleisch", quantity: 250, unit: "g" },
      { catalogItemId: "c-milch", name: "Milch", quantity: 0.5, unit: "l" },
    ]);
  });

  it("follows the LIST's order, not the order the rows were ticked", () => {
    const lines = buildRecipeFromEntries(ENTRIES, [
      { entryId: "e3", quantity: 1, unit: null },
      { entryId: "e1", quantity: 250, unit: "g" },
    ]);

    expect(lines.map((line) => line.name)).toEqual(["Hackfleisch", "Zwiebeln"]);
  });

  it("keeps a cleared quantity as null — that is how an unquantified line is produced", () => {
    const lines = buildRecipeFromEntries(ENTRIES, [{ entryId: "e4", quantity: null, unit: null }]);

    expect(lines[0]).toEqual({
      catalogItemId: "c-salz",
      name: "Salz",
      quantity: null,
      unit: null,
    });
  });

  it("stores a blank unit as null rather than an empty string", () => {
    const lines = buildRecipeFromEntries(ENTRIES, [{ entryId: "e3", quantity: 1, unit: "  " }]);

    expect(lines[0].unit).toBeNull();
  });

  it("refuses the same article twice and names both amounts", () => {
    expect(() =>
      buildRecipeFromEntries(ENTRIES, [
        { entryId: "e2", quantity: 1, unit: "l" },
        { entryId: "e5", quantity: 500, unit: "ml" },
      ]),
    ).toThrow(
      "Milch ist zweimal ausgewählt (1 l und 500 ml) — bitte nur eine Zeile wählen",
    );
  });

  it("drops the amounts from the duplicate message when one row has none", () => {
    const entries: DerivableEntry[] = [
      { id: "a", catalogItemId: "c-milch", name: "Milch", quantity: null, unit: null },
      { id: "b", catalogItemId: "c-milch", name: "Milch", quantity: 1, unit: "l" },
    ];

    expect(() =>
      buildRecipeFromEntries(entries, [
        { entryId: "a", quantity: null, unit: null },
        { entryId: "b", quantity: 1, unit: "l" },
      ]),
    ).toThrow("Milch ist zweimal ausgewählt — bitte nur eine Zeile wählen");
  });

  it("refuses an empty selection", () => {
    expect(() => buildRecipeFromEntries(ENTRIES, [])).toThrow("Wähle mindestens einen Artikel");
  });

  it("refuses a selection that names an entry this list does not have", () => {
    try {
      buildRecipeFromEntries(ENTRIES, [{ entryId: "nope", quantity: 1, unit: null }]);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).message).toBe("Eintrag nicht gefunden");
    }
  });

  it.each([0, -1, Number.NaN])("refuses the quantity %s", (quantity) => {
    expect(() =>
      buildRecipeFromEntries(ENTRIES, [{ entryId: "e1", quantity, unit: "g" }]),
    ).toThrow("Menge muss eine positive Zahl sein");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/recipes/build.test.ts`
Expected: FAIL — `Failed to resolve import "./build"`.

- [ ] **Step 3: Write the builder**

Create `src/lib/recipes/build.ts`:

```ts
import { ApiError } from "@/lib/http/errors";
import { formatQuantityLabel } from "@/lib/format/quantity";

/**
 * Turning a completed list into a recipe draft (spec §7), as a pure function.
 *
 * Why pure: the flow it serves is a three-step sheet whose middle step is fully editable, and the
 * rules that can reject it — a duplicate article, an empty selection, a nonsense amount — are
 * exactly the ones a user hits repeatedly. Proving them without a database is what makes them
 * cheap to get right, and it is the same seam discipline `expandRecipe` follows on the way in.
 */

/** One row of the completed list, as the sheet presents it. */
export interface DerivableEntry {
  id: string;
  catalogItemId: string;
  /** The ARTICLE's display name — a ListItem has no name column (MVP design §3.1). */
  name: string;
  quantity: number | null;
  unit: string | null;
}

/** One ticked row, carrying the amount the user edited in step ② (D6). */
export interface DerivedLineInput {
  entryId: string;
  /** Already parsed with parseGermanDecimal; null = cleared = „just add it“ (D4). */
  quantity: number | null;
  unit: string | null;
}

/** One line of the recipe about to be created. `sortIndex` is implied by the array position. */
export interface RecipeDraftLine {
  catalogItemId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

/**
 * Validates a selection of list entries and orders it into recipe lines.
 *
 * THE RULE THAT NEEDS EXPLAINING — the duplicate refusal. A list may legitimately hold „1 l Milch“
 * and „500 ml Milch“ as two rows, because D1 refuses to merge across units. A recipe cannot:
 * `@@unique([recipeId, catalogItemId])` allows one line per article, and two lines would be
 * ambiguous under the multiplier anyway. Silently picking one of them would LOSE data the user can
 * see on screen, so the flow stops and says which article and which two amounts (spec §7).
 *
 * Ordering follows the ENTRIES, not the selection: a recipe built from a well-ordered list should
 * read in that order, and the order rows happened to be ticked in carries no meaning.
 */
export function buildRecipeFromEntries(
  entries: DerivableEntry[],
  selections: DerivedLineInput[],
): RecipeDraftLine[] {
  // An empty selection is the one case with no useful partial answer (spec §7).
  if (selections.length === 0) throw new ApiError(400, "Wähle mindestens einen Artikel");

  // Index the edits by entry id so the ordering loop below can stay a single pass over `entries`.
  const edits = new Map(selections.map((selection) => [selection.entryId, selection]));

  // Every selected id must belong to this list. A crafted form field naming a foreign entry is a
  // 404 for the same existence-hiding reason a foreign recipe id is.
  const known = new Set(entries.map((entry) => entry.id));
  for (const entryId of edits.keys()) {
    if (!known.has(entryId)) throw new ApiError(404, "Eintrag nicht gefunden");
  }

  const lines: RecipeDraftLine[] = [];
  // Remembers the FIRST selected row per article, so the duplicate message can quote both amounts.
  const byArticle = new Map<string, DerivableEntry>();

  for (const entry of entries) {
    const edit = edits.get(entry.id);
    if (!edit) continue; // not ticked

    const previous = byArticle.get(entry.catalogItemId);
    if (previous) {
      // Quote the amounts as they appear ON THE LIST, not as edited: those are what the user is
      // looking at while deciding which row to drop.
      const a = formatQuantityLabel(previous.quantity, previous.unit);
      const b = formatQuantityLabel(entry.quantity, entry.unit);
      // A row with neither quantity nor unit formats to "" — „(  und 500 ml)“ would read as a
      // rendering bug, so the parenthetical is dropped whenever it cannot be complete.
      const amounts = a && b ? ` (${a} und ${b})` : "";
      throw new ApiError(
        409,
        `${entry.name} ist zweimal ausgewählt${amounts} — bitte nur eine Zeile wählen`,
      );
    }
    byArticle.set(entry.catalogItemId, entry);

    // The same rule and the same sentence `addRecipeItem` uses, applied before anything is written
    // so the sheet can show it next to the field. NaN reaches here from parseGermanDecimal on
    // purpose — see quantity.ts.
    if (edit.quantity !== null && (!Number.isFinite(edit.quantity) || edit.quantity <= 0)) {
      throw new ApiError(400, "Menge muss eine positive Zahl sein");
    }

    const unit = edit.unit?.trim();
    lines.push({
      catalogItemId: entry.catalogItemId,
      name: entry.name,
      quantity: edit.quantity,
      // "" would be a unit the recipe row would then try to render.
      unit: unit ? unit : null,
    });
  }

  return lines;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/recipes/build.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipes/build.ts src/lib/recipes/build.test.ts
git commit -m "$(cat <<'EOF'
feat(recipes): build a recipe draft from list entries

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `createRecipeFromList` — writing the derived recipe

**Files:**
- Create: `src/lib/recipes/derive.ts`
- Test: `src/lib/recipes/derive.test.ts`

**Interfaces:**
- Consumes: `createRecipe`, `deleteRecipe`, `addRecipeItem` and `RecipeLabels` (Slice 18); `RecipeDraftLine` (Task 7).
- Produces: `createRecipeFromList(db, input: { projectId: string; name: string; id?: string; lines: RecipeDraftLine[] }, labels): Promise<Recipe>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/recipes/derive.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { ApiError } from "@/lib/http/errors";
import { recipeLabels } from "./labels";
import { createRecipe, getRecipeWithItems } from "./recipes";
import { createRecipeFromList } from "./derive";

const db = new PrismaClient();
const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

async function makeArticle(name: string) {
  return db.catalogItem.create({
    data: { projectId, name, normalizedName: name.trim().toLowerCase() },
  });
}

describe("createRecipeFromList", () => {
  it("creates the recipe with its lines in the given order", async () => {
    const hack = await makeArticle("Hackfleisch");
    const milk = await makeArticle("Milch");

    const recipe = await createRecipeFromList(
      db,
      {
        projectId,
        name: "Lasagne",
        lines: [
          { catalogItemId: hack.id, name: "Hackfleisch", quantity: 250, unit: "g" },
          { catalogItemId: milk.id, name: "Milch", quantity: 0.5, unit: "l" },
        ],
      },
      labels,
    );

    const stored = await getRecipeWithItems(db, projectId, recipe.id);
    expect(stored!.name).toBe("Lasagne");
    expect(
      stored!.items.map((item) => ({
        name: item.catalogItem.name,
        quantity: item.quantity,
        unit: item.unit,
        sortIndex: item.sortIndex,
      })),
    ).toEqual([
      { name: "Hackfleisch", quantity: 250, unit: "g", sortIndex: 0 },
      { name: "Milch", quantity: 0.5, unit: "l", sortIndex: 1 },
    ]);
  });

  it("stores an unquantified line as null/null", async () => {
    const salt = await makeArticle("Salz");

    const recipe = await createRecipeFromList(
      db,
      { projectId, name: "Lasagne", lines: [{ catalogItemId: salt.id, name: "Salz", quantity: null, unit: null }] },
      labels,
    );

    const stored = await getRecipeWithItems(db, projectId, recipe.id);
    expect(stored!.items[0].quantity).toBeNull();
    expect(stored!.items[0].unit).toBeNull();
  });

  it("surfaces a duplicate name as the 409 the name field renders", async () => {
    const salt = await makeArticle("Salz");
    await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    try {
      await createRecipeFromList(
        db,
        { projectId, name: "  lasagne ", lines: [{ catalogItemId: salt.id, name: "Salz", quantity: null, unit: null }] },
        labels,
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).message).toBe("Ein Rezept mit diesem Namen existiert bereits");
    }
  });

  it("leaves no half-built recipe behind when a line fails", async () => {
    const salt = await makeArticle("Salz");
    // An article from another project: addRecipeItem 404s on it (Slice 18's scoping rule).
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Fremd", ownerId: otherUser.id } });
    const foreign = await db.catalogItem.create({
      data: { projectId: other.id, name: "Fremd", normalizedName: "fremd" },
    });

    await expect(
      createRecipeFromList(
        db,
        {
          projectId,
          name: "Lasagne",
          lines: [
            { catalogItemId: salt.id, name: "Salz", quantity: null, unit: null },
            { catalogItemId: foreign.id, name: "Fremd", quantity: 1, unit: null },
          ],
        },
        labels,
      ),
    ).rejects.toThrow("Artikel nicht gefunden");

    // A recipe named „Lasagne“ holding only Salz would silently occupy the name the user wanted.
    expect(await db.recipe.count({ where: { projectId } })).toBe(0);
  });

  it("accepts a client-generated id, like every other entity here", async () => {
    const salt = await makeArticle("Salz");
    const id = "77777777-7777-4777-8777-777777777777";

    const recipe = await createRecipeFromList(
      db,
      { projectId, id, name: "Lasagne", lines: [{ catalogItemId: salt.id, name: "Salz", quantity: null, unit: null }] },
      labels,
    );

    expect(recipe.id).toBe(id);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/recipes/derive.test.ts`
Expected: FAIL — `Failed to resolve import "./derive"`.

- [ ] **Step 3: Write the core**

Create `src/lib/recipes/derive.ts`:

```ts
import type { PrismaClient, Recipe } from "@prisma/client";
import type { RecipeDraftLine } from "./build";
import type { RecipeLabels } from "./labels";
import { addRecipeItem, createRecipe, deleteRecipe } from "./recipes";

/**
 * Writing a recipe derived from a completed list (spec §7).
 *
 * Deliberately thin: every rule it needs already exists. `createRecipe` owns the name rules and the
 * duplicate 409, `addRecipeItem` owns the article scoping, the quantity rule and the sortIndex
 * sequence. What this module adds is the ONE thing neither of them can know — that these n writes
 * are a single user intent, so a failure half way through must not leave a partly-built recipe
 * sitting on the name the user wanted.
 *
 * The pure half of the flow (which rows, in which order, with which amounts) is
 * `buildRecipeFromEntries` in build.ts; this function never sees a list.
 */

export interface CreateRecipeFromListInput {
  projectId: string;
  name: string;
  /** The client MAY generate the UUID — the offline-prep convention every entity here follows. */
  id?: string;
  /**
   * Already validated and ordered by `buildRecipeFromEntries`. Passing an empty array creates an
   * empty recipe; the „at least one article“ rule lives in the builder, where the user's selection
   * actually is, rather than being duplicated here.
   */
  lines: RecipeDraftLine[];
}

/**
 * Creates the recipe and its lines, compensating on failure.
 *
 * Pattern: COMPENSATING ACTION, the same one `createListWithArticles` uses and for the same reason
 * — the funnel functions all declare `PrismaClient`, while an interactive transaction hands back
 * `Omit<PrismaClient, ITXClientDenyList>`, so wrapping this would mean widening every signature it
 * touches. A failed derive is rare, the cleanup is one delete, and the user retries from a sheet
 * that still holds their selection.
 */
export async function createRecipeFromList(
  db: PrismaClient,
  input: CreateRecipeFromListInput,
  labels: RecipeLabels,
): Promise<Recipe> {
  // Name rules, normalized-name uniqueness and the client id check all happen here — and BEFORE
  // any line is written, so a duplicate name costs nothing.
  const recipe = await createRecipe(
    db,
    { projectId: input.projectId, id: input.id, name: input.name },
    labels,
  );

  try {
    for (const line of input.lines) {
      // Sequential, not Promise.all: addRecipeItem derives each sortIndex from the current maximum,
      // so concurrent writes would scramble the order this flow exists to preserve.
      await addRecipeItem(
        db,
        {
          projectId: input.projectId,
          recipeId: recipe.id,
          catalogItemId: line.catalogItemId,
          quantity: line.quantity,
          unit: line.unit,
        },
        labels,
      );
    }
  } catch (error) {
    // Best-effort cleanup: if the delete ALSO fails the caller must still see the original cause.
    // deleteRecipe cascades to the lines that did land (schema §2).
    await deleteRecipe(db, { projectId: input.projectId, recipeId: recipe.id }, labels).catch(
      () => undefined,
    );
    throw error;
  }

  return recipe;
}
```

> **Signature note:** Slice 18 declares `deleteRecipe(db, input: DeleteRecipeInput, labels)` with `DeleteRecipeInput = { projectId: string; recipeId: string }`, and it is unguarded on purpose (nothing depends on a recipe). The call above matches it exactly — do not change `deleteRecipe`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/recipes/derive.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipes/derive.ts src/lib/recipes/derive.test.ts
git commit -m "$(cat <<'EOF'
feat(recipes): create a recipe from a completed list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: „Rezept aus Liste anlegen“ — the three-step derive sheet

**Files:**
- Modify: `src/app/lists/[listId]/formState.ts`
- Create: `src/app/lists/[listId]/DeriveRecipeSheet.tsx`
- Create: `src/app/lists/[listId]/DeriveRecipeSheet.module.css`
- Test: `src/app/lists/[listId]/DeriveRecipeSheet.test.tsx`
- Modify: `src/app/lists/[listId]/ListMenu.tsx`
- Modify: `src/app/lists/[listId]/ListMenu.test.tsx`
- Modify: `src/app/lists/[listId]/page.tsx`

**Interfaces:**
- Consumes: `buildRecipeFromEntries` + `DerivableEntry` (Task 7); `createRecipeFromList` (Task 8); `parseGermanDecimal` / `formatGermanNumber` / `formatQuantityLabel`; `formatRecipeArticleCount` (Slice 18); `requireRecipeAccess` (Task 4).
- Produces:
  - `type DeriveFormState = { error: string | null; ok: boolean; createdName: string | null; lineCount: number }` and `DERIVE_FORM_IDLE`
  - `<DeriveRecipeSheet entries labels units onClose createAction initialState? />`
  - `ListMenu` gains an optional `recipeDerive?: { labels: RecipeLabels; entries: DerivableEntry[]; units: string[]; createAction: DeriveAction }` prop.

- [ ] **Step 1: Add the form state**

Append to `src/app/lists/[listId]/formState.ts`:

```ts
/**
 * The result shape the „Rezept aus Liste anlegen“ Server Action returns.
 *
 * It carries the created recipe's NAME and line count rather than its id, because step ③ renders
 * „„Lasagne“ angelegt · 4 Artikel" and never links anywhere: the flow loops back into the same
 * list (spec §7), it does not navigate to the new recipe.
 */
export type DeriveFormState = {
  /** German inline error from the last attempt — a duplicate name, a duplicate article, or null. */
  error: string | null;
  /** True after a create SUCCEEDED — the sheet advances to its „noch eins?“ step. */
  ok: boolean;
  /** The name as stored (trimmed), for the confirmation sentence. */
  createdName: string | null;
  /** How many lines the new recipe got. */
  lineCount: number;
};

/** The initial value the derive sheet's useActionState starts from. */
export const DERIVE_FORM_IDLE: DeriveFormState = {
  error: null,
  ok: false,
  createdName: null,
  lineCount: 0,
};
```

- [ ] **Step 2: Write the failing component test**

Create `src/app/lists/[listId]/DeriveRecipeSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import { DeriveRecipeSheet } from "./DeriveRecipeSheet";
import { DERIVE_FORM_IDLE, type DeriveFormState } from "./formState";

const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

const ENTRIES = [
  { id: "e1", catalogItemId: "c-hack", name: "Hackfleisch", quantity: 500, unit: "g" },
  { id: "e2", catalogItemId: "c-milch", name: "Milch", quantity: 1, unit: "l" },
  { id: "e3", catalogItemId: "c-salz", name: "Salz", quantity: null, unit: null },
];

function renderSheet(overrides: Partial<Parameters<typeof DeriveRecipeSheet>[0]> = {}) {
  const props = {
    entries: ENTRIES,
    labels,
    units: ["g", "l"],
    onClose: vi.fn(),
    createAction: vi.fn(async () => DERIVE_FORM_IDLE),
    ...overrides,
  };
  return { ...render(<DeriveRecipeSheet {...props} />), props };
}

describe("DeriveRecipeSheet", () => {
  it("offers every entry with its amount, nothing pre-selected", () => {
    renderSheet();

    expect(screen.getByRole("checkbox", { name: "500 g Hackfleisch" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "1 l Milch" })).not.toBeChecked();
    // An unquantified row shows the bare name — formatQuantityLabel returns "".
    expect(screen.getByRole("checkbox", { name: "Salz" })).not.toBeChecked();
  });

  it("keeps „Weiter“ disabled until something is ticked", async () => {
    renderSheet();

    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));

    expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();
  });

  it("carries the list's amounts into step ② as editable fields", async () => {
    renderSheet();

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByRole("textbox", { name: "Menge Milch" })).toHaveValue("1");
    expect(screen.getByRole("textbox", { name: "Einheit Milch" })).toHaveValue("l");
    // The name field sits next to the button that commits it (spec §7).
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });

  it("shows a German decimal in the quantity field", async () => {
    renderSheet({
      entries: [{ id: "e9", catalogItemId: "c-x", name: "Öl", quantity: 0.5, unit: "l" }],
    });

    await userEvent.click(screen.getByRole("checkbox", { name: "0,5 l Öl" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByRole("textbox", { name: "Menge Öl" })).toHaveValue("0,5");
  });

  it("posts the name, the ticked entries and their edited amounts", async () => {
    let received: FormData | null = null;
    const createAction = vi.fn(async (_prev: DeriveFormState, formData: FormData) => {
      received = formData;
      return DERIVE_FORM_IDLE;
    });
    renderSheet({ createAction });

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Menge Milch" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Menge Milch" }), "0,5");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Lasagne");
    await userEvent.click(screen.getByRole("button", { name: "Rezept anlegen" }));

    expect(received!.get("name")).toBe("Lasagne");
    expect(received!.getAll("entryId")).toEqual(["e2"]);
    expect(received!.get("quantity:e2")).toBe("0,5");
    expect(received!.get("unit:e2")).toBe("l");
  });

  it("goes back to step ① without losing the selection", async () => {
    renderSheet();

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));

    expect(screen.getByRole("checkbox", { name: "1 l Milch" })).toBeChecked();
  });

  it("confirms the result and offers the loop", () => {
    renderSheet({
      initialState: { error: null, ok: true, createdName: "Lasagne", lineCount: 4 },
    });

    expect(screen.getByText("„Lasagne“ angelegt · 4 Artikel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fertig" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weiteres Rezept" })).toBeInTheDocument();
  });

  it("loops back to a clean step ① instead of closing", async () => {
    renderSheet({
      initialState: { error: null, ok: true, createdName: "Lasagne", lineCount: 1 },
    });

    await userEvent.click(screen.getByRole("button", { name: "Weiteres Rezept" }));

    // Back on the selection pane with nothing carried over — the sheet stays open so several
    // recipes can be built from one list (spec §7, step ③).
    expect(screen.getByRole("checkbox", { name: "1 l Milch" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Fertig" })).not.toBeInTheDocument();
  });

  it("greys a row consumed by the previous pass but leaves it selectable", async () => {
    // A full pass: tick Milch, advance, save (the stub returns ok), then loop.
    const createAction = vi.fn(async () => ({
      error: null,
      ok: true,
      createdName: "Lasagne",
      lineCount: 1,
    }));
    renderSheet({ createAction });

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Lasagne");
    await userEvent.click(screen.getByRole("button", { name: "Rezept anlegen" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiteres Rezept" }));

    // An article may legitimately belong to two recipes, so the hint must not disable anything.
    const milk = screen.getByRole("checkbox", { name: "1 l Milch" });
    expect(milk).toBeEnabled();
    await userEvent.click(milk);
    expect(milk).toBeChecked();
  });

  it("renders an inline error and stays on step ②", () => {
    renderSheet({
      initialState: {
        error: "Milch ist zweimal ausgewählt (1 l und 500 ml) — bitte nur eine Zeile wählen",
        ok: false,
        createdName: null,
        lineCount: 0,
      },
    });

    expect(
      screen.getByText("Milch ist zweimal ausgewählt (1 l und 500 ml) — bitte nur eine Zeile wählen"),
    ).toBeInTheDocument();
  });

  it("uses the project's own wording", () => {
    renderSheet({ labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }) });

    expect(screen.getByRole("dialog", { name: "Set aus Liste anlegen" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npm test -- src/app/lists/[listId]/DeriveRecipeSheet.test.tsx`
Expected: FAIL — `Failed to resolve import "./DeriveRecipeSheet"`.

- [ ] **Step 4: Write the sheet**

Create `src/app/lists/[listId]/DeriveRecipeSheet.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { formatGermanNumber } from "@/lib/format/date";
import { formatQuantityLabel } from "@/lib/format/quantity";
import { formatRecipeArticleCount } from "@/lib/format/plural";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { DerivableEntry } from "@/lib/recipes/build";
import { DERIVE_FORM_IDLE, type DeriveFormState } from "./formState";
import styles from "./DeriveRecipeSheet.module.css";

type DeriveAction = (prev: DeriveFormState, formData: FormData) => Promise<DeriveFormState>;

type DeriveRecipeSheetProps = {
  /** Every entry of the completed list, checked and unchecked alike (spec §7). */
  entries: DerivableEntry[];
  labels: RecipeLabels;
  /** The project's unit vocabulary, offered as a datalist on the unit fields. */
  units: string[];
  onClose: () => void;
  createAction: DeriveAction;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: DeriveFormState;
};

/**
 * „Rezept aus Liste anlegen“ — the three-step flow of spec §7.
 *
 *  ① pick the rows that belong to this dish,
 *  ② name it and set the amounts for ONE unit,
 *  ③ confirm, and offer to build another from the same list.
 *
 * WHY EVERYTHING IS ONE SHEET AND ONE FORM: the three steps are one decision, and the amounts in
 * step ② are meaningless without the selection from step ①. Unmounting step ① would also drop its
 * checkboxes out of the submitted FormData, which is why the steps are HIDDEN rather than removed.
 *
 * WHY „consumed“ IS LOCAL STATE: an article may legitimately belong to two recipes (Zwiebeln in
 * the Lasagne and in the Chili), so this is a hint, not a rule — the rows are greyed and stay
 * selectable, and closing the sheet forgets everything (spec §7). That is exactly why it needs no
 * column and no server round-trip.
 *
 * WHY NOTHING IS PRE-SELECTED: a shopping list is mostly not one dish.
 */
export function DeriveRecipeSheet({
  entries,
  labels,
  units,
  onClose,
  createAction,
  initialState = DERIVE_FORM_IDLE,
}: DeriveRecipeSheetProps) {
  /**
   * Which of the three panes is showing.
   *
   * A phase, not a step NUMBER, because the third pane is not reachable by counting: it is entered
   * by the server confirming a create and left by the user choosing to loop. Deriving it from
   * `state.ok` alone would strand the sheet on the confirmation forever, since a resolved action
   * state never goes back to „not ok".
   *
   * The initial phase follows a restored state: an error belongs on „edit", next to the name and
   * the amounts that caused it; a success belongs on „done".
   */
  const [phase, setPhase] = useState<"select" | "edit" | "done">(
    initialState.ok ? "done" : initialState.error !== null ? "edit" : "select",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Entry ids already used by a recipe built in THIS sheet session. Greyed, still selectable.
  const [consumed, setConsumed] = useState<Set<string>>(new Set());

  /**
   * Wrapping the passed Server Action advances the phase inside the submitting interaction rather
   * than synchronously setting state from an Effect — the pattern RecipeIndex established, and the
   * one React's lint rules accept. A rejected create leaves the editor and its values in place.
   */
  const [state, formAction, pending] = useActionState(
    async (prev: DeriveFormState, formData: FormData) => {
      const next = await createAction(prev, formData);
      if (next.ok) setPhase("done");
      return next;
    },
    initialState,
  );

  const chosen = entries.filter((entry) => selected.has(entry.id));

  const toggle = (id: string) => {
    setSelected((current) => {
      // A new Set on every change: mutating state in place would not re-render.
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** The loop (step ③): remember what this pass used, then start over with a clean selection. */
  const startAnother = () => {
    setConsumed((current) => new Set([...current, ...selected]));
    setSelected(new Set());
    setPhase("select");
  };

  // STEP ③ — the confirmation, which is also the loop.
  if (phase === "done" && state.createdName) {
    return (
      <Sheet open onClose={onClose} title={labels.fromList}>
        <div className={styles.result}>
          <Banner tone="success">
            {`„${state.createdName}“ angelegt · ${formatRecipeArticleCount(state.lineCount)}`}
          </Banner>
          <p className={styles.again}>{`Noch ein ${labels.singular} aus dieser Liste?`}</p>
          <div className={styles.buttons}>
            <Button type="button" variant="text" onClick={onClose}>
              Fertig
            </Button>
            <Button type="button" onClick={startAnother}>
              {`Weiteres ${labels.singular}`}
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={labels.fromList}>
      <form action={formAction} className={styles.form}>
        {/* STEP ① — the selection. Hidden, not unmounted: these checkboxes ARE the payload. */}
        <div hidden={phase === "edit"}>
          <ul className={styles.rows}>
            {entries.map((entry) => {
              // „500 g Hackfleisch“, or just „Salz“ when the row carries no amount.
              const amount = formatQuantityLabel(entry.quantity, entry.unit);
              const label = amount ? `${amount} ${entry.name}` : entry.name;
              return (
                <li key={entry.id} className={styles.row}>
                  <label
                    className={styles.rowLabel}
                    // A data attribute rather than a second class: the CSS Module styles the
                    // greyed state from one selector, and the test asserts roles and text only.
                    data-consumed={consumed.has(entry.id) ? "true" : "false"}
                  >
                    <input
                      type="checkbox"
                      name="entryId"
                      value={entry.id}
                      checked={selected.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                    />
                    {label}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className={styles.buttons}>
            <Button type="button" variant="text" onClick={onClose}>
              Abbrechen
            </Button>
            {/* type="button": step ① must advance, never submit. */}
            <Button type="button" disabled={selected.size === 0} onClick={() => setPhase("edit")}>
              Weiter
            </Button>
          </div>
        </div>

        {/* STEP ② — name and per-unit amounts. Only the CHOSEN rows render fields, so a
            deselected row cannot leave a stray quantity behind in the FormData. */}
        {phase === "edit" && (
          <div className={styles.editor}>
            <TextField label="Name" aria-label="Name" name="name" placeholder={labels.singular} autoFocus />

            <ul className={styles.lines}>
              {chosen.map((entry) => (
                <li key={entry.id} className={styles.line}>
                  <span className={styles.lineName}>{entry.name}</span>
                  <div className={styles.lineFields}>
                    <TextField
                      // Keyed field names (ruling R10): three parallel getAll() arrays that only
                      // line up because of DOM order break silently the first time a row is
                      // conditionally rendered.
                      name={`quantity:${entry.id}`}
                      aria-label={`Menge ${entry.name}`}
                      fieldSize="sm"
                      inputMode="decimal"
                      // German comma in, German comma out — parseGermanDecimal reads it back.
                      // An empty field is a real value: it stores null („just add it“, D4).
                      defaultValue={entry.quantity === null ? "" : formatGermanNumber(entry.quantity)}
                    />
                    <TextField
                      name={`unit:${entry.id}`}
                      aria-label={`Einheit ${entry.name}`}
                      fieldSize="sm"
                      list="derive-units"
                      defaultValue={entry.unit ?? ""}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* The project's own unit vocabulary, the same list the entry sheet offers. */}
            <datalist id="derive-units">
              {units.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>

            {state.error ? <FieldError>{state.error}</FieldError> : null}

            <div className={styles.buttons}>
              <Button type="button" variant="text" onClick={() => setPhase("select")}>
                Zurück
              </Button>
              <Button type="submit" disabled={pending}>
                {`${labels.singular} anlegen`}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
```

Create `src/app/lists/[listId]/DeriveRecipeSheet.module.css`:

```css
.form,
.result,
.editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rows,
.lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 44px so the whole row is a tap target — the label wraps the checkbox, so tapping text works. */
.rowLabel {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  cursor: pointer;
}

/* A consumed row is a hint, not a rule: dimmed, never disabled (spec §7). */
.rowLabel[data-consumed="true"] {
  color: var(--color-text-muted);
}

.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
}

.lineName {
  font-weight: 600;
}

.lineFields {
  display: flex;
  gap: 8px;
}

.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.again {
  margin: 0;
  color: var(--color-text-muted);
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npm test -- src/app/lists/[listId]/DeriveRecipeSheet.test.tsx`
Expected: PASS — 10 tests.

- [ ] **Step 6: Register the new tap target**

In `src/test/touch-targets.test.ts`, add to `CONTROLS`:

```ts
  { file: "src/app/lists/[listId]/DeriveRecipeSheet.module.css", selector: ".rowLabel" },
```

Run: `npm test -- src/test/touch-targets.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing ListMenu test**

Append to `src/app/lists/[listId]/ListMenu.test.tsx`:

```tsx
const deriveProps = {
  labels: recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" }),
  entries: [{ id: "e1", catalogItemId: "c1", name: "Milch", quantity: 1, unit: "l" }],
  units: ["l"],
  createAction: vi.fn(async () => DERIVE_FORM_IDLE),
};

describe("ListMenu — Rezept aus Liste anlegen", () => {
  it("does not offer the entry on an OPEN list — its quantities are not settled yet", async () => {
    renderMenu({ recipeDerive: deriveProps });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(
      screen.queryByRole("menuitem", { name: "Rezept aus Liste anlegen" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer the entry when the feature is off", async () => {
    renderMenu({ isCompleted: true });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(
      screen.queryByRole("menuitem", { name: "Rezept aus Liste anlegen" }),
    ).not.toBeInTheDocument();
  });

  it("offers it on a completed list even when the project has no recipes yet", async () => {
    renderMenu({ isCompleted: true, recipeDerive: deriveProps });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rezept aus Liste anlegen" }));

    expect(screen.getByRole("dialog", { name: "Rezept aus Liste anlegen" })).toBeInTheDocument();
  });
});
```

Add `DERIVE_FORM_IDLE` to the `./formState` import.

- [ ] **Step 8: Run it to make sure it fails**

Run: `npm test -- src/app/lists/[listId]/ListMenu.test.tsx`
Expected: FAIL — the menu item does not exist.

- [ ] **Step 9: Extend `ListMenu` again**

In `src/app/lists/[listId]/ListMenu.tsx`:

1. Add the imports:

```tsx
import type { DerivableEntry } from "@/lib/recipes/build";
import { DeriveRecipeSheet } from "./DeriveRecipeSheet";
import type { DeriveFormState } from "./formState";
```

2. Add the prop:

```tsx
  /**
   * Present only when the project has recipes ON (ruling R8). Unlike `recipeApply` there is no
   * „at least one recipe“ condition — deriving is how the FIRST recipe gets created.
   */
  recipeDerive?: {
    labels: RecipeLabels;
    entries: DerivableEntry[];
    units: string[];
    createAction: (prev: DeriveFormState, formData: FormData) => Promise<DeriveFormState>;
  };
```

3. Add the state:

```tsx
  const [deriveOpen, setDeriveOpen] = useState(false);
```

4. Add the menu item after „Liste abschließen“ and before „Liste löschen“:

```tsx
            {/* Only on a COMPLETED list: an open list is still being shopped, so its quantities
                are not settled (spec §7). */}
            {recipeDerive && isCompleted && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  setOpen(false);
                  setDeriveOpen(true);
                }}
              >
                {recipeDerive.labels.fromList}
              </button>
            )}
```

5. Render the sheet next to the apply sheet:

```tsx
      {recipeDerive && deriveOpen && (
        <DeriveRecipeSheet
          entries={recipeDerive.entries}
          labels={recipeDerive.labels}
          units={recipeDerive.units}
          createAction={recipeDerive.createAction}
          onClose={() => setDeriveOpen(false)}
        />
      )}
```

- [ ] **Step 10: Run the ListMenu test to verify it passes**

Run: `npm test -- src/app/lists/[listId]/ListMenu.test.tsx`
Expected: PASS — all of it.

- [ ] **Step 11: Wire the page**

In `src/app/lists/[listId]/page.tsx`:

1. Add the imports:

```tsx
import { buildRecipeFromEntries, type DerivableEntry } from "@/lib/recipes/build";
import { createRecipeFromList } from "@/lib/recipes/derive";
import { DERIVE_FORM_IDLE, type DeriveFormState } from "./formState";
```

2. Build the derive shape next to the existing `entries` mapping (`ListEntry` has no
   `catalogItemId`, and adding one there would change a prop every row already receives):

```tsx
  // What the derive sheet needs: the article IDENTITY as well as the display name, because a
  // recipe line references the article, not the text (spec §2).
  const derivableEntries: DerivableEntry[] = list.items.map((item) => ({
    id: item.id,
    catalogItemId: item.catalogItemId,
    name: item.catalogItem.name,
    quantity: item.quantity,
    unit: item.unit,
  }));
```

3. Add the action next to `applyRecipesAction`:

```tsx
  /** „Rezept aus Liste anlegen“: turns the ticked rows into a new recipe. Member-level. */
  async function createRecipeFromListAction(
    _prev: DeriveFormState,
    formData: FormData,
  ): Promise<DeriveFormState> {
    "use server";
    const { list: l, labels: actionLabels } = await requireRecipeAccess();

    // The render-time check is not authorization for a Server Action: a list reopened in another
    // tab must not produce a recipe from quantities that are being shopped again (ruling R9).
    if (l.status !== "completed") {
      return { error: "Die Liste ist nicht abgeschlossen", ok: false, createdName: null, lineCount: 0 };
    }

    const name = String(formData.get("name") ?? "").trim();
    // Empty submission: silent no-op, the convention every form in this app uses.
    if (!name) return DERIVE_FORM_IDLE;

    const entryIds = formData.getAll("entryId").map((value) => String(value));

    try {
      // Read the entries FRESH: the ones rendered into the sheet may be minutes old, and the
      // builder's duplicate check has to run against what the list actually holds.
      const fresh = await getListWithItems(prisma, l.id);
      if (!fresh) return DERIVE_FORM_IDLE;

      const lines = buildRecipeFromEntries(
        fresh.items.map((item) => ({
          id: item.id,
          catalogItemId: item.catalogItemId,
          name: item.catalogItem.name,
          quantity: item.quantity,
          unit: item.unit,
        })),
        entryIds.map((entryId) => ({
          entryId,
          // NaN travels on purpose: the builder answers with the German „Menge muss eine positive
          // Zahl sein" rather than a second validation rule here (see quantity.ts).
          quantity: parseGermanDecimal(String(formData.get(`quantity:${entryId}`) ?? "")),
          unit: String(formData.get(`unit:${entryId}`) ?? "") || null,
        })),
      );

      const recipe = await createRecipeFromList(
        prisma,
        { projectId: l.projectId, name, lines },
        actionLabels,
      );
      // The recipe index lives under the project layout and now has one row more.
      revalidatePath(`/projects/${l.projectId}/rezepte`);
      return { error: null, ok: true, createdName: recipe.name, lineCount: lines.length };
    } catch (error) {
      if (error instanceof ApiError) {
        return { error: error.message, ok: false, createdName: null, lineCount: 0 };
      }
      throw error;
    }
  }
```

4. Extend the `ListMenu` call:

```tsx
            recipeDerive={
              recipesEnabled && labels
                ? {
                    labels,
                    entries: derivableEntries,
                    units: vocabulary.units,
                    createAction: createRecipeFromListAction,
                  }
                : undefined
            }
```

- [ ] **Step 12: Verify the whole suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git add "src/app/lists/[listId]" src/test/touch-targets.test.ts
git commit -m "$(cat <<'EOF'
feat(recipes): derive a recipe from a completed list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Verification, the implementation review, and the meta plan

**Files:**
- Create: `docs/implementation-reviews/slice-19-recipes-apply-derive.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–9.
- Produces: the slice's Definition of Done artifacts. No code.

- [ ] **Step 1: Run the wording audit — the standing review gate from Slice 18**

```bash
grep -rn "Rezept" src/ | grep -v "\.test\." | grep -v "src/lib/recipes/labels.ts"
```

Expected: **no output.** Every production string must come from `recipeLabels(project)`. A hit here is a bug, not a style issue: it is a project that renamed the feature to „Sets“ seeing „Rezept“ on one screen.

- [ ] **Step 2: Run the full verification**

```bash
npm test && npm run lint && npm run build
```

Record the real numbers (test files / tests, lint errors / warnings) — the review quotes them, and „passing“ without them is not evidence.

- [ ] **Step 3: Walk the product by hand**

The automated suite cannot see navigation, persistence or a 404 transition. Do these as a signed-in **owner** and, where marked, also as a plain **member**:

1. Owner, recipes OFF: the list ⋮ shows neither recipe entry; the „Neue Liste“ sheet has no second step.
2. Owner: enable recipes under `/projects/<id>/einstellungen` with the default wording.
3. Create a recipe with three lines, one of them unquantified (Salz).
4. Open list ⋮ → „Rezept hinzufügen“, set the recipe to ×2, apply. The quantified lines are doubled, Salz appears once, and the banner names the counts.
5. Apply the same recipe again at ×1: the quantities grow, one row per article, no duplicates.
6. Apply a recipe whose article is already on the list in a DIFFERENT unit: two rows, as D1 requires. This is correct, not a bug.
7. New list: step 1 pre-fill with an article a recipe also carries → step 2 names it in the overlap note, the button's count is de-duplicated, and the created list has that article ONCE with the recipe's quantity.
8. Complete a list → ⋮ → „Rezept aus Liste anlegen“: tick rows, edit an amount to a German decimal, name it, save; the confirmation appears and „Weiteres Rezept“ loops with the used rows greyed but still selectable.
9. Tick two rows of the SAME article (e.g. „1 l Milch“ and „500 ml Milch“) → the inline refusal names both amounts.
10. Try a name that already exists → the 409 appears inline next to the name field.
11. Member (not owner): both recipe entries work; `/projects/<id>/einstellungen` is still a 404.
12. Rename the feature to „Set/Sets“ in the settings and re-check every surface from 4–10 — no „Rezept“ anywhere.

Record honestly which of these were actually performed. If the environment cannot run a signed-in browser, say so and list all twelve as outstanding UAT — do **not** claim them.

- [ ] **Step 4: Write the implementation review**

Create `docs/implementation-reviews/slice-19-recipes-apply-derive.md` covering the five required sections (CLAUDE.md § Implementation review): what was achieved; steps taken; core components built; the 5–10 most important lines with why each carries weight; and the architecture contribution. Strong candidates for section 4:

- `deriveOperationId(token, recipe.id, planned.catalogItemId)` — why a retry is safe without a transaction.
- `quantity: planned.quantity ?? undefined, unit: planned.unit ?? undefined` — why `undefined` (inherit) and not `null` (clear).
- `if (seen.has(normalized)) continue;` in `createListWithRecipes` — the ordering rule, as one line.
- The duplicate-article refusal in `buildRecipeFromEntries` — the one place the list's model and the recipe's model genuinely disagree.
- `item.quantity === null ? null : round3(item.quantity * count)` — D4 as code.

State plainly that Slice 19 completes the recipes feature and that Slice 16 (the optional per-row flash) is the only unbuilt slice left.

- [ ] **Step 5: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

1. Set row 19 to ✅ and fill in this plan's filename:

```markdown
| 19 | **Recipes: applying + deriving** | … | [2026-09-15-slice-19-recipes-apply-derive.md](2026-09-15-slice-19-recipes-apply-derive.md) | ✅ Done / verified |
```

2. Add a progress-log entry at the top of the log, following the template used by the Slice 17 and 18 entries: date, slice, result (what works now, what is tested, with the real numbers), **deviations** from this plan and why, **follow-up decisions** affecting later work, inherited open items, and the **next open slice**. Required content for this one:

   - The build-order fact: this was the first slice needing 17 **and** 18, and how the merge went.
   - Ruling R1 (derived operation ids) as a decision later work inherits — anything that ever applies a recipe from another surface must send a token.
   - That `createListWithArticles` was deliberately left untouched, so the non-recipe path is unchanged.
   - Whether the twelve UAT checks were performed or remain outstanding.
   - **Next open slice: Slice 16 (per-row remote-change flash, optional)** — the recipes feature is complete, and Slice 16 is the only thing left, still only if real use asks for it.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs: add the Slice 19 implementation review and update the meta plan

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes (for the executor)

Three things this plan deliberately does **not** do, so nobody adds them thinking they were forgotten:

- **No „remove Lasagne again“.** The design explicitly does not remember which recipes a list was built from (§1 Out of scope). Applying is a one-way write of ordinary entries.
- **No unit conversion, anywhere.** 1 l and 500 ml stay apart on a list (D1) and cannot share a recipe line (`@@unique([recipeId, catalogItemId])`). Task 7's duplicate refusal exists precisely because those two facts disagree, and the user — not a heuristic — resolves it.
- **No recipe in the delta sync.** Applying produces entry operations, which the poller already sees. The recipe itself is configuration.
