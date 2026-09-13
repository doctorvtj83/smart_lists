# Slice 18 — Recipes: core, management, settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project can turn on „Rezepte" (under a name it chooses), define recipes as sets of catalog articles with a quantity each, and manage them on their own screen — everything needed before a recipe can be *applied* (Slice 19).

**Architecture:** Two new tables (`Recipe`, `RecipeItem`) hang off the project and the catalog, mirroring `List`/`ListItem` — a recipe line has **no name column**, the name lives on the catalog article, so a catalog rename updates every recipe for free. Recipes are **configuration, not list content**: they never enter the operations funnel and never enter the delta sync, so the cores are plain Prisma reads and writes with `ApiError`s, and the screens are Server Components with Server Actions, exactly like the Katalog screen. Every user-facing string is composed by one `recipeLabels()` helper from the project's own singular/plural pair, so renaming the feature is a settings edit and not a migration.

**Tech Stack:** Next.js App Router (Server Components + Server Actions + `useActionState`), TypeScript, Prisma / Neon Postgres, Vitest (+ jsdom & Testing Library for the component tasks), CSS Modules, `lucide-react` through `Icon`. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-13-smart-lists-recipes-design.md](../specs/2026-09-13-smart-lists-recipes-design.md) — §2 (data model), §4 (settings + labels), §5 (recipe management), §8 (suggestion default), §9 (error handling), §10 (tests), §11 (slice cut). This plan implements **slice 2 of the three**. Applying a recipe, `expandRecipe`, the two-step new-list sheet and „Rezept aus Liste anlegen" are **Slice 19** and are deliberately absent here.

## Global Constraints

- **Implementation docs, code identifiers and code comments: English. In-app user-facing strings stay German.** (CLAUDE.md § Language convention.)
- **Meticulous inline comments are mandatory.** Every function gets a comment saying what it does *and why it exists*; every non-obvious block gets a *why* comment. Do not remove or thin out existing comments when editing a file. (CLAUDE.md § Code documentation standard.)
- **No German string anywhere in the codebase may hardcode „Rezept" or „Rezepte" outside `src/lib/recipes/labels.ts`'s defaults.** (Spec §4.) Every label is composed from `recipeLabels(project)`. This is a review gate, not a preference.
- **Permissions, verbatim from the spec:** `/projects/[id]/einstellungen` is **owner-only** (`requireOwner`); `/projects/[id]/rezepte` and every recipe mutation are **member-level** (`requireMembership`). Both answer 404 for non-members.
- **The route is the gate, the nav is a convenience.** `/rezepte` re-checks `recipesEnabled` and calls `notFound()` when the feature is off — including on submit (spec §9).
- **Recipes are NOT part of the operations funnel and NOT part of the delta sync.** No `applyOperation`, no REST endpoints, no cursor. Concurrent recipe edits get plain last-writer-wins on whole fields, like project rename. (Spec §5.)
- **A `RecipeItem` has no name and no category.** The name comes from `catalogItem.name`; the category is inherited from the article at apply time (Slice 19).
- **`@@unique([recipeId, catalogItemId])` — one line per article per recipe.** `addRecipeItem` on an article already in the recipe **updates** that line rather than failing (spec §5).
- **`suggestionRuleN` default goes 2 → 3, and the migration must also update existing projects** whose value is still 2 (spec §8, D8). Per-project tuning of N/M stays out of scope — the columns exist, no UI.
- **Styling: CSS Modules only. Icons: `lucide-react`, always through `Icon` (stroke 1.75).** Build screens out of the existing primitives in `src/components/ui/` — do not restyle from scratch.
- **Component tests** start with `// @vitest-environment jsdom`, use Testing Library, and assert roles and text — **never CSS-Module class names**.
- **Tests run against the Neon `test` branch via `.env.test`.** Never copy `.env`'s `DATABASE_URL` into `.env.test`.
- **German decimal comma** everywhere the user sees a number (`0,5`) — `formatGermanNumber` / `parseGermanDecimal` already own both directions.
- Commit after every task with a Conventional-Commits message ending in the attribution line from CLAUDE.md's environment reminder.

---

## Decisions this plan locks (beyond the spec)

The spec settles the product rules. Seven implementation questions it leaves open are answered here so no task has to invent an answer:

| # | Question | Ruling |
|---|----------|--------|
| R1 | Spec §5 says a recipe line „opens the existing `EntrySheet` with the category field removed". Add a prop to `EntrySheet` or build a second sheet? | **A new `RecipeItemSheet`** in `src/app/projects/[projectId]/rezepte/[recipeId]/`. `EntrySheet` is typed against `ListEntry` and emits `EntryChanges` including `category`; half of its body is the category chip row. A `showCategory` flag would leave a component with two mutually exclusive halves. What IS reused: `Sheet`, `TextField`, `Button`, `parseGermanDecimal`, `formatGermanNumber` — i.e. every primitive `EntrySheet` is built from, so the two look identical. |
| R2 | Spec §4 introduces `/einstellungen` but never says how a user reaches it. | **A „Einstellungen" nav entry at the end of the PROJEKT group in `ProjectNavPanel`, rendered only for owners.** Without it the screen is unreachable. It sits next to Mitglieder, which is where „this project's configuration" already lives in the user's head. |
| R3 | The catalog-delete guard's message („… wird in 2 Rezepten verwendet") is label-dependent, but `deleteCatalogArticle`'s signature has no labels. | **`deleteCatalogArticle` reads the project row inside its existing transaction** and composes the message from it. No signature change, no caller churn, and the read is free — it is already in a transaction. The guard counts recipe lines **regardless of `recipesEnabled`**: a disabled feature's recipes still reference the article, and the FK cascade would still destroy them. |
| R4 | Which recipe cores take the project's labels? | **Every recipe core that can produce user-facing text takes `labels: RecipeLabels` as its LAST parameter.** Reads (`listRecipes`, `getRecipeWithItems`) return `null`/`[]` instead of throwing and therefore take none — the screen calls `notFound()`. Uniform, explicit, and it keeps the cores free of a second DB read for a message. |
| R5 | Does the recipe trailing row flow its parsed unit back into the catalog default, the way `addEntryFromRow` does? | **No.** Flow-back is „the project learned this from real use" (Slice 4). A recipe is configuration someone typed once; letting it rewrite catalog memory would mean a hypothetical dish silently re-units an article on every real list. The parser still runs — only the write-back is cut. |
| R6 | Transport for recipe management: REST route handlers or Server Actions? | **Server Actions only**, mirroring the Katalog screen (Slice 10). Recipes are never polled and never merged offline, so the reason lists have an operations API does not apply. `src/lib/recipes/recipes.ts` stays the seam if a transport is ever needed. |
| R7 | German grammatical gender of a user-chosen label („Neues Set" vs. „Neue Vorlage"). | **Fixed as neuter, exactly as the spec writes it** („Neues Rezept", „Ein Rezept mit diesem Namen…"). Gender cannot be derived from free text, and the default label is neuter. Note it once in `labels.ts` and move on — do not build a gender field. |
| R8 | Spec §5 draws the detail screen's ⋮ as „Umbenennen / Löschen", but `InlineEdit` has no external trigger — a menu item cannot start it. | **Renaming is tapping the title; the ⋮ holds only „Löschen".** This is exactly what the list screen already does (`ListTitle` + `ListMenu`), so the gesture is one the user has learned, and it avoids inventing an imperative API on a primitive four screens share. The spec's sketch is a wireframe, not a contract about the affordance. |

**Two things that look like omissions and are not:**

- **Turning the feature off does not delete recipes.** `recipesEnabled` is a separate column from the labels precisely so that off → on restores everything, wording included (spec §2, §9).
- **`getRecipeWithItems` returns `null` for a foreign project's recipe id**, not a 403. Same existence-hiding rule as `requireMembership` and `updateCatalogArticle`.

**Slice 17 interaction:** none. Slice 18 touches neither `applyOperation` nor `AbsorbedEntry`. If Slice 17 landed first, `src/test/reset-db.ts` already lists `"absorbed_entries"` — add the two new tables alongside it rather than replacing the list.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| **Modify** `prisma/schema.prisma` | `Recipe` + `RecipeItem` models, four new `Project` columns (three new + the `suggestionRuleN` default), back-relations on `Project` and `CatalogItem`. | 1 |
| **Generated** `prisma/migrations/<ts>_add_recipes/migration.sql` | The two tables, the three columns, the default change, and the hand-written backfill `UPDATE`. | 1 |
| **Modify** `src/test/reset-db.ts` | Extend the TRUNCATE list with `"recipes"`, `"recipe_items"`. | 1 |
| **Modify** `src/lib/projects/projects.test.ts` | The schema default assertions (2 → 3, plus the three recipe columns). | 1 |
| **Create** `src/lib/recipes/labels.ts` | `recipeLabels()` — the ONE place German recipe wording is composed. Pure, no I/O. | 2 |
| **Create** `src/lib/recipes/labels.test.ts` | Composition from a custom pair; blank-label fallback. Node env, no DB. | 2 |
| **Create** `src/lib/recipes/recipes.ts` | Recipe CRUD (Task 3), line CRUD (Task 4) and the typed-text line add (Task 5). Injectable `PrismaClient`, German `ApiError`s, no auth inside — the established core shape. | 3, 4, 5 |
| **Create** `src/lib/recipes/recipes.test.ts` | The DB-level behaviour of all three groups. | 3, 4, 5 |
| **Modify** `src/lib/format/plural.ts` | `formatRecipeCount`, `formatUsedInRecipes`, `formatRecipeArticleCount`. | 3, 6 |
| **Modify** `src/lib/format/plural.test.ts` | Their singular/plural rules. | 3, 6 |
| **Modify** `src/lib/catalog/manage.ts` | `countRecipesUsingArticle`, `usedInRecipeCount` on the read model, the extended delete guard. | 6 |
| **Modify** `src/lib/catalog/manage.test.ts` | The recipe half of the delete guard. | 6 |
| **Modify** `src/app/projects/[projectId]/katalog/CatalogEditPanel.tsx` + `.test.tsx` | „Löschen" also blocked by recipe usage; the reason line. | 6 |
| **Modify** `src/app/projects/[projectId]/katalog/CatalogBrowser.tsx` + `page.tsx` | Pass `recipeLabels` down to the panel. | 6 |
| **Create** `src/lib/projects/settings.ts` + `settings.test.ts` | `updateRecipeSettings` — validation + write of the toggle and the label pair. | 7 |
| **Create** `src/app/projects/[projectId]/einstellungen/page.tsx`, `RecipeSettingsForm.tsx`, `RecipeSettingsForm.module.css`, `RecipeSettingsForm.test.tsx`, `page.module.css`, `formState.ts` | The owner-only settings screen. | 8 |
| **Modify** `src/lib/projects/nav.ts` + `nav.test.ts` | `ProjectNavData` carries `recipesEnabled` + the composed labels. | 9 |
| **Modify** `src/components/nav/ProjectShell.tsx`, `ProjectNavPanel.tsx`, `ProjectNavPanel.test.tsx` | The conditional „Rezepte" entry and the owner-only „Einstellungen" entry. | 9 |
| **Modify** `src/app/projects/[projectId]/layout.tsx` | Forward the new nav fields. | 9 |
| **Create** `src/app/projects/[projectId]/rezepte/page.tsx`, `RecipeIndex.tsx`, `RecipeIndex.module.css`, `RecipeIndex.test.tsx`, `page.module.css`, `formState.ts` | The recipe index: rows + „Neues Rezept". | 10 |
| **Create** `src/app/projects/[projectId]/rezepte/[recipeId]/page.tsx`, `RecipeDetail.tsx`, `RecipeDetail.module.css`, `RecipeDetail.test.tsx`, `RecipeTitle.tsx`, `RecipeTitle.module.css`, `RecipeMenu.tsx`, `RecipeMenu.module.css`, `page.module.css` | The recipe detail: lines, the trailing „Artikel hinzufügen" row, the inline-editable title, ⋮ Löschen. | 11 |
| **Create** `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.tsx`, `.module.css`, `.test.tsx` | Menge/Einheit for one line; „Entfernen". | 12 |
| **Create** `docs/implementation-reviews/slice-18-recipes-core.md` | Definition of Done (CLAUDE.md § Implementation review). | 13 |
| **Modify** `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` | Status row + progress-log entry. | 13 |

---

### Task 1: Schema — `Recipe`, `RecipeItem`, project columns, and the `suggestionRuleN` backfill

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/test/reset-db.ts`
- Modify: `src/lib/projects/projects.test.ts:31-32`
- Generated: `prisma/migrations/<timestamp>_add_recipes/migration.sql`

**Interfaces:**
- Consumes: the existing `Project` and `CatalogItem` models, and `normalizeName` from `src/lib/catalog/normalize.ts` (used by Task 3, not here).
- Produces: Prisma models `Recipe` (accessor `db.recipe`) and `RecipeItem` (accessor `db.recipeItem`); `Project.recipesEnabled: boolean`, `Project.recipeLabelSingular: string`, `Project.recipeLabelPlural: string`, and `Project.suggestionRuleN` defaulting to **3**.

- [ ] **Step 1: Write the failing test for the new project defaults**

In `src/lib/projects/projects.test.ts`, find the two assertions on lines 31–32 and replace that block with:

```ts
    expect(project.suggestionRuleN).toBe(3); // raised 2 -> 3 in Slice 18 (spec D8)
    expect(project.suggestionRuleM).toBe(4); // default from the schema
    // A project starts with recipes OFF and the default German wording, so the
    // settings form has something to pre-fill before anyone enables anything.
    expect(project.recipesEnabled).toBe(false);
    expect(project.recipeLabelSingular).toBe("Rezept");
    expect(project.recipeLabelPlural).toBe("Rezepte");
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/projects/projects.test.ts`
Expected: FAIL — `expected 2 to be 3`, and TypeScript errors that `recipesEnabled` does not exist on type `Project`.

- [ ] **Step 3: Add the three columns and the default change to `Project`**

In `prisma/schema.prisma`, the `Project` model currently reads:

```prisma
  suggestionRuleN Int @default(2) @map("suggestion_rule_n")
  suggestionRuleM Int @default(4) @map("suggestion_rule_m")
```

Replace those two lines with:

```prisma
  // Raised 2 -> 3 in Slice 18 (recipes design, D8): an article is suggested when it appeared in
  // >= 3 of the last 4 completed lists. The old threshold of 2 crowded the pre-fill, and the
  // migration that introduces this default also updates existing projects still sitting on 2 —
  // otherwise the change is invisible exactly where it matters. Per-project tuning stays out of
  // scope: the columns exist, there is no UI.
  suggestionRuleN Int @default(3) @map("suggestion_rule_n")
  suggestionRuleM Int @default(4) @map("suggestion_rule_m")

  // --- Recipes (Slice 18) ---------------------------------------------------
  // Opt-in per project. Kept SEPARATE from the two label columns on purpose: turning the feature
  // off must not destroy the wording the project chose, so off -> on restores everything.
  recipesEnabled Boolean @default(false) @map("recipes_enabled")
  // The project NAMES the feature: "Rezept/Rezepte" is only the default. A packing project calls
  // them "Sets". Every user-facing string is composed from this pair by recipeLabels() — which is
  // why renaming the feature needs no migration and touches no stored string.
  recipeLabelSingular String @default("Rezept") @map("recipe_label_singular")
  recipeLabelPlural   String @default("Rezepte") @map("recipe_label_plural")
```

Then add the back-relation next to `favorites` at the end of the model:

```prisma
  // Back-relation added in Slice 18 (Recipes). Cascade lives on Recipe.project.
  recipes Recipe[]
```

- [ ] **Step 4: Add the `recipeItems` back-relation to `CatalogItem`**

In `prisma/schema.prisma`, the `CatalogItem` model has:

```prisma
  // Back-relation added in Slice 5: which favorites point at this article (0 or 1 per project).
  favorites Favorite[]
```

Add directly below it:

```prisma
  // Back-relation added in Slice 18: which recipe lines reference this article. A recipe line has
  // NO name column — the name lives here — so renaming an article updates every recipe for free.
  // This relation is also what the extended catalog-delete guard counts (Task 6).
  recipeItems RecipeItem[]
```

- [ ] **Step 5: Append the two new models**

At the end of `prisma/schema.prisma`, after the `Favorite` model, append:

```prisma
// A named set of catalog articles describing what ONE unit (one portion, one dish, one trip)
// needs — the feature the project may call "Rezept", "Set" or "Paket" (Slice 18).
//
// Modelled on List/ListItem rather than on a document: the articles ARE the recipe. There is no
// instruction text, no image and no servings metadata (spec §1 "Out of scope") — a recipe is a set
// of articles, and everything else would be a second content model to maintain.
model Recipe {
  id        String  @id @default(uuid()) @db.Uuid // stable, client-generatable UUID (offline-prep convention)
  projectId String  @db.Uuid @map("project_id")
  // onDelete: Cascade -> deleting a project removes its recipes (project-scoped configuration,
  // exactly like the catalog and the favorites).
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Display name exactly as typed (trimmed, inner whitespace collapsed).
  name String
  // Identity key, produced by the SAME normalizeName the catalog uses (lowercase + trim + collapse
  // spaces). Reusing that rule is what makes "Lasagne" and " lasagne " one recipe rather than two.
  normalizedName String @map("normalized_name")

  createdAt DateTime     @default(now()) @map("created_at")
  items     RecipeItem[]

  // One recipe per name identity per project — the collision the UI reports as a 409.
  // Prisma exposes this as the compound selector `projectId_normalizedName`.
  @@unique([projectId, normalizedName])
  @@map("recipes")
}

// One line of a recipe: an article, how much of it ONE unit of the recipe needs, and in which unit.
model RecipeItem {
  id       String @id @default(uuid()) @db.Uuid
  recipeId String @db.Uuid @map("recipe_id")
  // onDelete: Cascade -> deleting a recipe removes its lines.
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  // The article. NO name column, exactly like ListItem — article identity lives on the catalog row
  // (MVP design §3.1). onDelete: Cascade is referential hygiene only: the catalog-delete guard
  // (Task 6) refuses to delete an article any recipe uses, so this cascade only ever fires via a
  // project delete, which is taking the recipes with it anyway.
  catalogItemId String      @db.Uuid @map("catalog_item_id")
  catalogItem   CatalogItem @relation(fields: [catalogItemId], references: [id], onDelete: Cascade)

  // Per ONE unit of the recipe. null = "just add it" (Salz), which stays one entry at any count
  // (spec D4) — that is why it is nullable rather than defaulting to 1.
  quantity Float?
  // null inherits the article's catalog default at apply time (Slice 19), so a recipe written
  // before the project settled on a unit still produces the right entry later.
  unit String?

  // Manual ordering within the recipe, server-assigned max+1 on add — the same contract as
  // ListItem.sortIndex, so a recipe built from a well-ordered list reads in that order.
  sortIndex Int @map("sort_index")

  // One line per article per recipe. Two lines for the same article would be ambiguous under the
  // apply multiplier and would merge on apply anyway — so addRecipeItem UPDATES instead of failing.
  @@unique([recipeId, catalogItemId])
  @@map("recipe_items")
}
```

- [ ] **Step 6: Generate the migration WITHOUT applying it**

Run: `npx prisma migrate dev --create-only --name add_recipes`

`--create-only` is load-bearing: the generated SQL has to be hand-extended with the backfill in the next step, and a migration that has already been applied would never run that backfill on the dev database.

- [ ] **Step 7: Append the backfill to the generated SQL**

Open `prisma/migrations/<timestamp>_add_recipes/migration.sql`. It will contain `ALTER TABLE "projects" ALTER COLUMN "suggestion_rule_n" SET DEFAULT 3;`, the three `ADD COLUMN` statements and the two `CREATE TABLE`s. Append at the very end:

```sql
-- Slice 18 (spec D8): the raised default only governs NEW projects. Existing projects keep
-- whatever value their row holds, so the change would be invisible on exactly the projects that
-- have enough history for the statistic to matter. Only rows still on the OLD default are moved:
-- a project that was deliberately tuned to some other value is left alone (no UI sets it today,
-- but the migration must not become the thing that overwrites a future manual setting).
UPDATE "projects" SET "suggestion_rule_n" = 3 WHERE "suggestion_rule_n" = 2;
```

- [ ] **Step 8: Apply the migration and regenerate the client**

Run: `npx prisma migrate dev`
Expected: the migration applies; `prisma generate` runs automatically and `db.recipe` / `db.recipeItem` appear on the client.

- [ ] **Step 9: Extend the test-DB reset**

In `src/test/reset-db.ts`, extend the TRUNCATE list. If Slice 17 already added `"absorbed_entries"`, keep it and add the two new names alongside:

```ts
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "allowlist_entries", "projects", "memberships", "catalog_items", "lists", "list_items", "favorites", "recipes", "recipe_items" RESTART IDENTITY CASCADE;'
  );
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm test -- src/lib/projects/projects.test.ts`
Expected: PASS.

- [ ] **Step 11: Run the suggestion tests, which must be unaffected**

Run: `npm test -- src/lib/suggestions/suggestions.test.ts`
Expected: PASS — every fixture there pins `suggestionRuleN` explicitly (`suggestions.test.ts:16`, `:120`, `:147`, `:162`), which is exactly why the default change cannot move them.

- [ ] **Step 12: Verify the backfill actually ran on the dev database**

Run: `npx prisma db execute --url "$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')" --stdin <<< 'SELECT count(*) FROM "projects" WHERE "suggestion_rule_n" = 2;'`

Expected: `0`. If it is not 0, the migration was applied before Step 7's edit — re-run the `UPDATE` by hand against the dev branch and note it in the review doc.

- [ ] **Step 13: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/test/reset-db.ts src/lib/projects/projects.test.ts
git commit -m "feat(db): add Recipe/RecipeItem and project recipe settings

Raises the suggestionRuleN default 2 -> 3 and backfills existing projects
(recipes design D8).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `recipeLabels` — the one place German recipe wording is composed

**Files:**
- Create: `src/lib/recipes/labels.ts`
- Create: `src/lib/recipes/labels.test.ts`

**Interfaces:**
- Consumes: nothing (pure). Structurally accepts any `Project` row.
- Produces: `RecipeLabelSource`, `RecipeLabels`, `DEFAULT_RECIPE_LABEL_SINGULAR`, `DEFAULT_RECIPE_LABEL_PLURAL`, `recipeLabels(source: RecipeLabelSource): RecipeLabels`. Every later task imports `recipeLabels` and reads `.singular` / `.plural` / `.newOne` / `.navEntry` / `.addToList` / `.fromList` / `.renameOne` / `.deleteOne` off the result.

- [ ] **Step 1: Write the failing test**

Create `src/lib/recipes/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recipeLabels } from "./labels";

describe("recipeLabels", () => {
  it("composes every string from the project's default pair", () => {
    const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

    expect(labels.singular).toBe("Rezept");
    expect(labels.plural).toBe("Rezepte");
    expect(labels.navEntry).toBe("Rezepte");
    expect(labels.newOne).toBe("Neues Rezept");
    expect(labels.addToList).toBe("Rezept hinzufügen");
    expect(labels.fromList).toBe("Rezept aus Liste anlegen");
    expect(labels.renameOne).toBe("Rezept umbenennen");
    expect(labels.deleteOne).toBe("Rezept löschen");
  });

  it("composes every string from a project's own wording", () => {
    const labels = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });

    expect(labels.singular).toBe("Set");
    expect(labels.navEntry).toBe("Sets");
    expect(labels.newOne).toBe("Neues Set");
    expect(labels.addToList).toBe("Set hinzufügen");
    expect(labels.fromList).toBe("Set aus Liste anlegen");
    expect(labels.renameOne).toBe("Set umbenennen");
    expect(labels.deleteOne).toBe("Set löschen");
  });

  it("falls back to the defaults for blank or whitespace-only labels", () => {
    // A blank column would otherwise render "Neues " — a label the settings form
    // is supposed to prevent, but the column is free text and a seed or an import
    // can still produce it.
    const labels = recipeLabels({ recipeLabelSingular: "   ", recipeLabelPlural: "" });

    expect(labels.singular).toBe("Rezept");
    expect(labels.plural).toBe("Rezepte");
  });

  it("trims stored labels rather than rendering the padding", () => {
    const labels = recipeLabels({ recipeLabelSingular: " Set ", recipeLabelPlural: " Sets " });

    expect(labels.newOne).toBe("Neues Set");
    expect(labels.plural).toBe("Sets");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/recipes/labels.test.ts`
Expected: FAIL — `Failed to resolve import "./labels"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/recipes/labels.ts`:

```ts
/**
 * The ONE place the recipes feature's German wording is composed (spec §4).
 *
 * Why a helper and not string literals at the call sites: the feature is NAMED BY THE PROJECT.
 * "Rezept/Rezepte" is only the default — a packing project calls them "Sets", a workshop project
 * "Pakete". Every screen therefore has to ask the project what to call it, and the rule that makes
 * that survive review is absolute: NO German string anywhere in the codebase hardcodes "Rezept"
 * outside this module's two defaults.
 *
 * Why the labels are stored as a pair rather than derived: German plurals are not derivable
 * ("Set" -> "Sets", "Paket" -> "Pakete", "Rezept" -> "Rezepte"), so the project supplies both.
 *
 * Known limitation, accepted by the design (ruling R7): the composed phrases fix the grammatical
 * gender as NEUTER ("Neues Rezept", "Ein Rezept ..."). Gender cannot be derived from free text and
 * the default label is neuter; a project that picks a feminine noun gets "Neues Vorlage". Building
 * a gender field for a wording nobody has asked for would be worse than the flaw.
 */

/** The default wording, also what the settings form pre-fills. */
export const DEFAULT_RECIPE_LABEL_SINGULAR = "Rezept";
export const DEFAULT_RECIPE_LABEL_PLURAL = "Rezepte";

/**
 * The two columns this needs off a project row.
 *
 * Structural, not `Project`: any row with these two fields satisfies it, so the tests can pass a
 * literal and a `select`ed subset works without a cast.
 */
export interface RecipeLabelSource {
  recipeLabelSingular: string;
  recipeLabelPlural: string;
}

/** Every phrase the feature renders, already composed. */
export interface RecipeLabels {
  /** "Rezept" — the bare singular, for a sheet title or a composed sentence. */
  singular: string;
  /** "Rezepte" — the bare plural. */
  plural: string;
  /** "Rezepte" — the drawer/sidebar entry (Task 9). */
  navEntry: string;
  /** "Neues Rezept" — the index screen's create button (Task 10). */
  newOne: string;
  /** "Rezept hinzufügen" — a list's ⋮ entry (Slice 19). */
  addToList: string;
  /** "Rezept aus Liste anlegen" — a completed list's ⋮ entry (Slice 19). */
  fromList: string;
  /** "Rezept umbenennen" — the detail screen's ⋮ entry (Task 11). */
  renameOne: string;
  /** "Rezept löschen" — the detail screen's ⋮ entry (Task 11). */
  deleteOne: string;
}

/**
 * Reads one stored label, falling back to the default when the column is blank.
 *
 * The columns are free text with a NOT NULL default, so a blank can only arrive via a seed, an
 * import or a future bug — but "Neues " on a button is the kind of breakage nobody reports, so the
 * cheapest possible guard is worth having here rather than in each of eight phrases.
 */
function useLabel(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  return trimmed === "" ? fallback : trimmed;
}

/**
 * Composes every user-facing recipe phrase from the project's own singular/plural pair.
 *
 * Pure by design: it takes the two columns and returns strings, so the settings screen, the nav,
 * both recipe screens and (in Slice 19) the list menus all read from one tested source. The
 * consequence the design cares about: renaming the feature is a settings edit, never a migration.
 */
export function recipeLabels(source: RecipeLabelSource): RecipeLabels {
  const singular = useLabel(source.recipeLabelSingular, DEFAULT_RECIPE_LABEL_SINGULAR);
  const plural = useLabel(source.recipeLabelPlural, DEFAULT_RECIPE_LABEL_PLURAL);

  return {
    singular,
    plural,
    navEntry: plural,
    newOne: `Neues ${singular}`,
    addToList: `${singular} hinzufügen`,
    fromList: `${singular} aus Liste anlegen`,
    renameOne: `${singular} umbenennen`,
    deleteOne: `${singular} löschen`,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/recipes/labels.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipes/labels.ts src/lib/recipes/labels.test.ts
git commit -m "feat(recipes): add the recipeLabels wording helper

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Recipe CRUD core — create, list, read, rename, delete

**Files:**
- Create: `src/lib/recipes/recipes.ts`
- Create: `src/lib/recipes/recipes.test.ts`
- Modify: `src/lib/format/plural.ts`
- Modify: `src/lib/format/plural.test.ts`

**Interfaces:**
- Consumes: `recipeLabels`/`RecipeLabels` (Task 2), `normalizeName` (`src/lib/catalog/normalize.ts`), `compareArticleNames` (`src/lib/catalog/sort.ts`), `ApiError` (`src/lib/http/errors.ts`), `isUuid` (`src/lib/validate.ts`).
- Produces:
  - `MAX_RECIPE_NAME_LENGTH = 200`
  - `interface RecipeSummary { id: string; name: string; itemCount: number }`
  - `type RecipeWithItems = Recipe & { items: (RecipeItem & { catalogItem: CatalogItem })[] }`
  - `listRecipes(db, projectId): Promise<RecipeSummary[]>`
  - `getRecipeWithItems(db, projectId, recipeId): Promise<RecipeWithItems | null>`
  - `createRecipe(db, { projectId, name, id? }, labels): Promise<Recipe>`
  - `renameRecipe(db, { projectId, recipeId, name }, labels): Promise<Recipe>`
  - `deleteRecipe(db, { projectId, recipeId }, labels): Promise<void>`
  - `formatRecipeArticleCount(count: number): string` in `plural.ts`

- [ ] **Step 1: Write the failing test for the plural helper**

Append to `src/lib/format/plural.test.ts`:

```ts
describe("formatRecipeArticleCount", () => {
  it("uses the same noun for singular and plural", () => {
    // "Artikel" is one of the German nouns whose plural equals its singular.
    expect(formatRecipeArticleCount(1)).toBe("1 Artikel");
    expect(formatRecipeArticleCount(6)).toBe("6 Artikel");
    expect(formatRecipeArticleCount(0)).toBe("Noch keine Artikel");
  });
});
```

Add `formatRecipeArticleCount` to the existing import from `./plural` at the top of the file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/format/plural.test.ts`
Expected: FAIL — `formatRecipeArticleCount is not a function`.

- [ ] **Step 3: Add the helper**

Append to `src/lib/format/plural.ts`:

```ts
/**
 * "6 Artikel" — the meta line of a recipe row on the index screen (spec §5).
 *
 * Why not formatArticleCount, which produces the same string: a recipe with no lines yet must not
 * read "0 Artikel". An empty recipe is a normal intermediate state (you create it, then fill it),
 * so the zero case says so in words instead of printing a count that looks like a failure.
 */
export function formatRecipeArticleCount(count: number): string {
  if (count === 0) return "Noch keine Artikel";
  return `${count} Artikel`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/format/plural.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the recipe CRUD core**

Create `src/lib/recipes/recipes.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { ApiError } from "@/lib/http/errors";
import { recipeLabels } from "./labels";
import {
  createRecipe,
  deleteRecipe,
  getRecipeWithItems,
  listRecipes,
  renameRecipe,
} from "./recipes";

const db = new PrismaClient();
let projectId: string;

// The default wording. Passing it explicitly on every call is the point of ruling R4: the cores
// never read the project just to phrase an error.
const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

/** Fixtures are built directly, so a failure here points at THIS module. */
async function makeArticle(name: string) {
  return db.catalogItem.create({
    data: { projectId, name, normalizedName: name.trim().toLowerCase() },
  });
}

describe("createRecipe", () => {
  it("creates a recipe with the normalized identity key", async () => {
    const recipe = await createRecipe(db, { projectId, name: "  Lasagne  " }, labels);

    expect(recipe.name).toBe("Lasagne"); // display name: trimmed, spaces collapsed
    expect(recipe.normalizedName).toBe("lasagne"); // identity key: the catalog's rule
    expect(recipe.projectId).toBe(projectId);
  });

  it("accepts a client-generated id", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const recipe = await createRecipe(db, { projectId, id, name: "Chili" }, labels);
    expect(recipe.id).toBe(id);
  });

  it("rejects a second recipe with the same normalized name", async () => {
    await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    await expect(createRecipe(db, { projectId, name: " lasagne " }, labels)).rejects.toMatchObject({
      status: 409,
      message: "Ein Rezept mit diesem Namen existiert bereits",
    });
  });

  it("phrases the collision with the project's own label", async () => {
    const sets = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });
    await createRecipe(db, { projectId, name: "Lasagne" }, sets);

    await expect(createRecipe(db, { projectId, name: "Lasagne" }, sets)).rejects.toMatchObject({
      message: "Ein Set mit diesem Namen existiert bereits",
    });
  });

  it("rejects an empty name", async () => {
    await expect(createRecipe(db, { projectId, name: "   " }, labels)).rejects.toMatchObject({
      status: 400,
      message: "Name darf nicht leer sein",
    });
  });

  it("rejects a name over the length limit", async () => {
    await expect(
      createRecipe(db, { projectId, name: "x".repeat(201) }, labels),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("lets two projects hold a recipe of the same name", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });

    await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    // Uniqueness is (project, normalizedName) — recipes are project memory, not global.
    await expect(
      createRecipe(db, { projectId: other.id, name: "Lasagne" }, labels),
    ).resolves.toMatchObject({ name: "Lasagne" });
  });
});

describe("listRecipes", () => {
  it("returns recipes sorted with the German collator, each with its line count", async () => {
    const zwiebeln = await makeArticle("Zwiebeln");
    const milch = await makeArticle("Milch");
    const chili = await createRecipe(db, { projectId, name: "Chili" }, labels);
    await createRecipe(db, { projectId, name: "Älplermagronen" }, labels);
    await db.recipeItem.createMany({
      data: [
        { recipeId: chili.id, catalogItemId: zwiebeln.id, sortIndex: 0 },
        { recipeId: chili.id, catalogItemId: milch.id, sortIndex: 1 },
      ],
    });

    const summaries = await listRecipes(db, projectId);

    // "Ä" sorts next to "A" under the German collator, not after "Z".
    expect(summaries.map((summary) => summary.name)).toEqual(["Älplermagronen", "Chili"]);
    expect(summaries.map((summary) => summary.itemCount)).toEqual([0, 2]);
  });

  it("never returns another project's recipes", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);

    expect(await listRecipes(db, projectId)).toEqual([]);
  });
});

describe("getRecipeWithItems", () => {
  it("returns the lines by sortIndex, each with its catalog article", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");
    const hack = await makeArticle("Hackfleisch");
    await db.recipeItem.createMany({
      data: [
        { recipeId: recipe.id, catalogItemId: milch.id, quantity: 1, unit: "l", sortIndex: 1 },
        { recipeId: recipe.id, catalogItemId: hack.id, quantity: 500, unit: "g", sortIndex: 0 },
      ],
    });

    const loaded = await getRecipeWithItems(db, projectId, recipe.id);

    expect(loaded!.items.map((item) => item.catalogItem.name)).toEqual(["Hackfleisch", "Milch"]);
    expect(loaded!.items[0].quantity).toBe(500);
  });

  it("returns null for another project's recipe and for a malformed id", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    const foreign = await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);

    // Existence hiding: a foreign id must be indistinguishable from a missing one.
    expect(await getRecipeWithItems(db, projectId, foreign.id)).toBeNull();
    // A malformed id must never reach the uuid column (Prisma P2023 -> a fake 500).
    expect(await getRecipeWithItems(db, projectId, "nope")).toBeNull();
  });
});

describe("renameRecipe", () => {
  it("renames and re-derives the identity key", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasange" }, labels);

    const renamed = await renameRecipe(db, { projectId, recipeId: recipe.id, name: "Lasagne" }, labels);

    expect(renamed.name).toBe("Lasagne");
    expect(renamed.normalizedName).toBe("lasagne");
  });

  it("allows a pure display-name fix that keeps the same identity", async () => {
    const recipe = await createRecipe(db, { projectId, name: "lasagne" }, labels);

    // "lasagne" -> "Lasagne" normalizes to the SAME key, so it must not 409 against itself.
    await expect(
      renameRecipe(db, { projectId, recipeId: recipe.id, name: "Lasagne" }, labels),
    ).resolves.toMatchObject({ name: "Lasagne" });
  });

  it("rejects renaming onto another recipe's name", async () => {
    await createRecipe(db, { projectId, name: "Chili" }, labels);
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    await expect(
      renameRecipe(db, { projectId, recipeId: recipe.id, name: "chili" }, labels),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("404s for another project's recipe", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    const foreign = await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);

    await expect(
      renameRecipe(db, { projectId, recipeId: foreign.id, name: "Neu" }, labels),
    ).rejects.toMatchObject({ status: 404, message: "Dieses Rezept gibt es nicht mehr" });
  });
});

describe("deleteRecipe", () => {
  it("deletes the recipe and its lines, and nothing else", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");
    await db.recipeItem.create({
      data: { recipeId: recipe.id, catalogItemId: milch.id, sortIndex: 0 },
    });

    await deleteRecipe(db, { projectId, recipeId: recipe.id }, labels);

    expect(await db.recipe.count()).toBe(0);
    // The lines go with it via the FK cascade...
    expect(await db.recipeItem.count()).toBe(0);
    // ...but the ARTICLE stays. A recipe is a reference to catalog memory, not its owner.
    expect(await db.catalogItem.count()).toBe(1);
  });

  it("404s for another project's recipe", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    const foreign = await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);

    await expect(
      deleteRecipe(db, { projectId, recipeId: foreign.id }, labels),
    ).rejects.toMatchObject({ status: 404 });
    expect(await db.recipe.count()).toBe(1);
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npm test -- src/lib/recipes/recipes.test.ts`
Expected: FAIL — `Failed to resolve import "./recipes"`.

- [ ] **Step 7: Write the implementation**

Create `src/lib/recipes/recipes.ts`:

```ts
import type { CatalogItem, PrismaClient, Recipe, RecipeItem } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { normalizeName } from "@/lib/catalog/normalize";
import { compareArticleNames } from "@/lib/catalog/sort";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";
import type { RecipeLabels } from "./labels";

/**
 * The recipes core (spec §5) — CRUD over a project's recipes and their lines.
 *
 * Shape, following every other core in this codebase: an INJECTED PrismaClient (the project-wide
 * test seam), German ApiErrors, and NO auth inside — membership is the caller's job, exactly like
 * catalog/manage.ts and lists/lists.ts.
 *
 * What this module deliberately is NOT: part of the operations funnel. Recipes are low-frequency
 * configuration edited by one person at a time, while the entry-granular idempotent machinery in
 * lists/operations.ts exists for the list screen's high-frequency collaborative editing. Concurrent
 * recipe edits therefore get plain last-writer-wins on whole fields, like a project rename, and
 * recipes never appear in the delta sync (spec §5).
 *
 * Ruling R4: every write takes the project's `labels` as its LAST parameter, because the German
 * messages name the feature and the feature is named by the project. Reads take none — they return
 * null/[] and let the screen call notFound().
 */

// Upper bound for recipe names — same value and rationale as MAX_LIST_NAME_LENGTH: an unbounded
// TEXT column means the core has to cap human input.
export const MAX_RECIPE_NAME_LENGTH = 200;

/**
 * Validates a recipe name and returns its identity key.
 *
 * Returns the normalized name rather than just asserting, so no caller can compute it with a
 * different rule than the one that was validated — the same shape assertValidArticleName uses.
 */
function assertValidRecipeName(name: string): string {
  const normalizedName = normalizeName(name);
  if (!normalizedName) throw new ApiError(400, "Name darf nicht leer sein");
  if (name.length > MAX_RECIPE_NAME_LENGTH) {
    throw new ApiError(400, `Name darf höchstens ${MAX_RECIPE_NAME_LENGTH} Zeichen lang sein`);
  }
  return normalizedName;
}

/** Display name as stored: the user's casing, trimmed, inner whitespace collapsed. */
function toDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** The 409 sentence for a name collision, composed from the project's own wording (spec §9). */
function duplicateMessage(labels: RecipeLabels): string {
  return `Ein ${labels.singular} mit diesem Namen existiert bereits`;
}

/** The 404 sentence for a recipe that is gone — spec §9's exact wording, label-composed. */
function missingMessage(labels: RecipeLabels): string {
  return `Dieses ${labels.singular} gibt es nicht mehr`;
}

/**
 * Turns Prisma's unique-constraint violation into the same 409 the pre-check throws.
 *
 * Why both: the pre-check gives the nice error in the normal case, but two members creating the
 * same recipe in the same second would slip past it — the DB constraint is the real guarantee, and
 * P2002 is how it announces itself. (Same pattern as catalog/manage.ts's rethrowAsDuplicate.)
 */
function rethrowAsDuplicate(error: unknown, labels: RecipeLabels): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError(409, duplicateMessage(labels));
  }
  throw error;
}

/**
 * Loads a recipe, scoped to its project, or throws the 404 every write shares.
 *
 * Project-scoped findFirst is the enforcement point: a recipe id from another project must be
 * indistinguishable from a non-existent one (the existence-hiding rule this codebase applies
 * everywhere). The uuid shape check comes first so a malformed id is a clean 404 rather than
 * Prisma's P2023 surfacing as a 500.
 */
async function requireRecipe(
  db: PrismaClient,
  projectId: string,
  recipeId: string,
  labels: RecipeLabels,
): Promise<Recipe> {
  if (!isUuid(recipeId)) throw new ApiError(404, missingMessage(labels));
  const recipe = await db.recipe.findFirst({ where: { id: recipeId, projectId } });
  if (!recipe) throw new ApiError(404, missingMessage(labels));
  return recipe;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One row of the recipe index screen: the name plus how many lines it holds. */
export interface RecipeSummary {
  id: string;
  name: string;
  itemCount: number;
}

/**
 * Every recipe of a project, alphabetically, with its line count.
 *
 * Uncapped, like listCatalog: this is a management screen, and a recipe silently cut off the end of
 * the list would be one nobody could ever open. A project holds a handful to a few dozen recipes.
 *
 * `_count` does the counting in the database, so no RecipeItem rows travel over the wire. Sorting
 * happens in JS with the shared German comparator for the reason sort.ts documents — Postgres would
 * order under its own collation and put "Älplermagronen" after "Zwiebelkuchen".
 */
export async function listRecipes(db: PrismaClient, projectId: string): Promise<RecipeSummary[]> {
  const rows = await db.recipe.findMany({
    where: { projectId },
    select: { id: true, name: true, _count: { select: { items: true } } },
  });

  return rows
    .map((row) => ({ id: row.id, name: row.name, itemCount: row._count.items }))
    // Sort AFTER the projection so the comparator works on plain names — the contract
    // compareArticleNames declares (same order of operations as listCatalog).
    .sort((a, b) => compareArticleNames(a.name, b.name));
}

/** A recipe with its lines, each carrying the article the line's name comes from. */
export type RecipeWithItems = Recipe & {
  items: (RecipeItem & { catalogItem: CatalogItem })[];
};

/**
 * One recipe with its lines, or null when it does not exist FOR THIS PROJECT.
 *
 * Returns null rather than throwing (ruling R4): the only caller is a screen, and a screen answers
 * a missing recipe with notFound(), not with a German sentence. The project scoping is inside the
 * `where`, so a foreign id and a missing id are the same answer.
 */
export async function getRecipeWithItems(
  db: PrismaClient,
  projectId: string,
  recipeId: string,
): Promise<RecipeWithItems | null> {
  // Shape check first: a malformed id can never match a uuid column (see validate.ts).
  if (!isUuid(recipeId)) return null;
  return db.recipe.findFirst({
    where: { id: recipeId, projectId },
    include: {
      items: {
        // sortIndex is the single source of ordering truth, exactly as on a list.
        orderBy: { sortIndex: "asc" },
        include: { catalogItem: true },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateRecipeInput {
  projectId: string;
  name: string;
  /** The client MAY generate the UUID (the offline-prep convention every entity here follows). */
  id?: string;
}

/**
 * Creates an empty recipe. The lines are added afterwards on the detail screen — an empty recipe is
 * a normal intermediate state, which is why nothing here requires at least one article.
 */
export async function createRecipe(
  db: PrismaClient,
  input: CreateRecipeInput,
  labels: RecipeLabels,
): Promise<Recipe> {
  const normalizedName = assertValidRecipeName(input.name);
  // A client-supplied id must be a well-formed UUID, or Postgres rejects it with a driver error
  // (Prisma P2023 -> a fake 500). Reject it as a clean 400 instead.
  if (input.id !== undefined && !isUuid(input.id)) {
    throw new ApiError(400, "Ungültige ID");
  }

  // Pre-check for the friendly error; the compound unique is the real guarantee (see
  // rethrowAsDuplicate for the concurrent case).
  const existing = await db.recipe.findUnique({
    where: { projectId_normalizedName: { projectId: input.projectId, normalizedName } },
  });
  if (existing) throw new ApiError(409, duplicateMessage(labels));

  try {
    return await db.recipe.create({
      // `id: undefined` lets the schema's @default(uuid()) generate one server-side.
      data: {
        id: input.id,
        projectId: input.projectId,
        name: toDisplayName(input.name),
        normalizedName,
      },
    });
  } catch (error) {
    rethrowAsDuplicate(error, labels);
  }
}

export interface RenameRecipeInput {
  projectId: string;
  recipeId: string;
  name: string;
}

/**
 * Renames a recipe. Same name rules as createRecipe — otherwise the length limit and the
 * uniqueness rule could both be bypassed via rename.
 */
export async function renameRecipe(
  db: PrismaClient,
  input: RenameRecipeInput,
  labels: RecipeLabels,
): Promise<Recipe> {
  const { projectId, recipeId } = input;
  const normalizedName = assertValidRecipeName(input.name);
  const recipe = await requireRecipe(db, projectId, recipeId, labels);

  // Only a name that resolves to a DIFFERENT identity can collide. Skipping the query when the key
  // is unchanged is what makes "lasagne" -> "Lasagne" (a pure display fix) work instead of 409-ing
  // against itself — the same rule updateCatalogArticle follows.
  if (normalizedName !== recipe.normalizedName) {
    const collision = await db.recipe.findUnique({
      where: { projectId_normalizedName: { projectId, normalizedName } },
    });
    if (collision) throw new ApiError(409, duplicateMessage(labels));
  }

  try {
    return await db.recipe.update({
      where: { id: recipeId },
      data: { name: toDisplayName(input.name), normalizedName },
    });
  } catch (error) {
    // Concurrent rename onto the same target name — the unique index catches it.
    rethrowAsDuplicate(error, labels);
  }
}

export interface DeleteRecipeInput {
  projectId: string;
  recipeId: string;
}

/**
 * Deletes a recipe and, via the FK cascade, its lines.
 *
 * UNGUARDED on purpose (spec §5): nothing depends on a recipe. A list that a recipe was applied to
 * holds ordinary entries afterwards — the design deliberately does not remember which recipes built
 * a list ("no 'remove Lasagne again'"), so there is no reference to leave dangling. Contrast with
 * deleteCatalogArticle, which IS guarded because completed lists feed the suggestion statistic.
 */
export async function deleteRecipe(
  db: PrismaClient,
  input: DeleteRecipeInput,
  labels: RecipeLabels,
): Promise<void> {
  // The scoped read is what turns a foreign or malformed id into a 404 instead of deleting another
  // project's recipe or throwing P2025 at the caller.
  await requireRecipe(db, input.projectId, input.recipeId, labels);
  await db.recipe.delete({ where: { id: input.recipeId } });
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- src/lib/recipes/recipes.test.ts`
Expected: PASS (all 15 tests in the five describes).

- [ ] **Step 9: Commit**

```bash
git add src/lib/recipes/recipes.ts src/lib/recipes/recipes.test.ts src/lib/format/plural.ts src/lib/format/plural.test.ts
git commit -m "feat(recipes): add the recipe CRUD core

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Recipe line operations — add, update, remove

**Files:**
- Modify: `src/lib/recipes/recipes.ts`
- Modify: `src/lib/recipes/recipes.test.ts`

**Interfaces:**
- Consumes: `requireRecipe`, `missingMessage`, `RecipeLabels` (Task 3).
- Produces:
  - `addRecipeItem(db, { projectId, recipeId, catalogItemId, quantity?, unit? }, labels): Promise<RecipeItem>` — **upserts** on `(recipeId, catalogItemId)`
  - `updateRecipeItem(db, { projectId, recipeId, recipeItemId, quantity, unit }, labels): Promise<RecipeItem>`
  - `removeRecipeItem(db, { projectId, recipeId, recipeItemId }, labels): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/recipes/recipes.test.ts` (and extend the import from `./recipes` with `addRecipeItem`, `removeRecipeItem`, `updateRecipeItem`):

```ts
describe("addRecipeItem", () => {
  it("appends a line with the next sortIndex", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const hack = await makeArticle("Hackfleisch");
    const milch = await makeArticle("Milch");

    const first = await addRecipeItem(
      db,
      { projectId, recipeId: recipe.id, catalogItemId: hack.id, quantity: 500, unit: "g" },
      labels,
    );
    const second = await addRecipeItem(
      db,
      { projectId, recipeId: recipe.id, catalogItemId: milch.id, quantity: 1, unit: "l" },
      labels,
    );

    expect(first.sortIndex).toBe(0);
    expect(second.sortIndex).toBe(1);
    expect(first.quantity).toBe(500);
  });

  it("stores a line without a quantity (the Salz case)", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const salz = await makeArticle("Salz");

    const line = await addRecipeItem(
      db,
      { projectId, recipeId: recipe.id, catalogItemId: salz.id },
      labels,
    );

    // null is a real value here: "just add it", added once regardless of the count (spec D4).
    expect(line.quantity).toBeNull();
    expect(line.unit).toBeNull();
  });

  it("UPDATES the existing line when the article is already in the recipe", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");
    const first = await addRecipeItem(
      db,
      { projectId, recipeId: recipe.id, catalogItemId: milch.id, quantity: 1, unit: "l" },
      labels,
    );

    const again = await addRecipeItem(
      db,
      { projectId, recipeId: recipe.id, catalogItemId: milch.id, quantity: 2, unit: "l" },
      labels,
    );

    // The @@unique would otherwise surface as an error the user cannot act on (spec §5).
    expect(again.id).toBe(first.id);
    expect(again.quantity).toBe(2);
    expect(await db.recipeItem.count({ where: { recipeId: recipe.id } })).toBe(1);
  });

  it("rejects a non-positive quantity", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");

    await expect(
      addRecipeItem(
        db,
        { projectId, recipeId: recipe.id, catalogItemId: milch.id, quantity: 0 },
        labels,
      ),
    ).rejects.toMatchObject({ status: 400, message: "Menge muss eine positive Zahl sein" });
  });

  it("404s when the article belongs to another project", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    const foreign = await db.catalogItem.create({
      data: { projectId: other.id, name: "Fremd", normalizedName: "fremd" },
    });
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    // Without this check a foreign article would silently become part of this project's recipe,
    // and the apply loop in Slice 19 would then put an article on a list that the project's own
    // catalog has never heard of.
    await expect(
      addRecipeItem(db, { projectId, recipeId: recipe.id, catalogItemId: foreign.id }, labels),
    ).rejects.toMatchObject({ status: 404, message: "Artikel nicht gefunden" });
  });

  it("404s for another project's recipe", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    const foreign = await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);
    const milch = await makeArticle("Milch");

    await expect(
      addRecipeItem(db, { projectId, recipeId: foreign.id, catalogItemId: milch.id }, labels),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("updateRecipeItem", () => {
  it("writes both fields and can clear them", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");
    const line = await addRecipeItem(
      db,
      { projectId, recipeId: recipe.id, catalogItemId: milch.id, quantity: 1, unit: "l" },
      labels,
    );

    const cleared = await updateRecipeItem(
      db,
      { projectId, recipeId: recipe.id, recipeItemId: line.id, quantity: null, unit: null },
      labels,
    );

    // Clearing the quantity is how an unquantified line (Salz) is produced with no special UI.
    expect(cleared.quantity).toBeNull();
    expect(cleared.unit).toBeNull();
  });

  it("trims a unit and stores a blank one as null", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");
    const line = await addRecipeItem(
      db,
      { projectId, recipeId: recipe.id, catalogItemId: milch.id },
      labels,
    );

    const updated = await updateRecipeItem(
      db,
      { projectId, recipeId: recipe.id, recipeItemId: line.id, quantity: 0.5, unit: "  l  " },
      labels,
    );

    expect(updated.unit).toBe("l");
  });

  it("404s for a line of another recipe", async () => {
    const lasagne = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const chili = await createRecipe(db, { projectId, name: "Chili" }, labels);
    const milch = await makeArticle("Milch");
    const line = await addRecipeItem(
      db,
      { projectId, recipeId: chili.id, catalogItemId: milch.id },
      labels,
    );

    // The line exists and belongs to this project — but not to THIS recipe. Scoping by both is
    // what stops a crafted Server Action request from editing a neighbouring recipe.
    await expect(
      updateRecipeItem(
        db,
        { projectId, recipeId: lasagne.id, recipeItemId: line.id, quantity: 9, unit: null },
        labels,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("removeRecipeItem", () => {
  it("removes only that line", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");
    const salz = await makeArticle("Salz");
    const line = await addRecipeItem(
      db,
      { projectId, recipeId: recipe.id, catalogItemId: milch.id },
      labels,
    );
    await addRecipeItem(db, { projectId, recipeId: recipe.id, catalogItemId: salz.id }, labels);

    await removeRecipeItem(db, { projectId, recipeId: recipe.id, recipeItemId: line.id }, labels);

    const rest = await db.recipeItem.findMany({ where: { recipeId: recipe.id } });
    expect(rest).toHaveLength(1);
    // Removing a line never touches the catalog article it referenced.
    expect(await db.catalogItem.count()).toBe(2);
  });

  it("404s for a line that does not exist", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    await expect(
      removeRecipeItem(
        db,
        { projectId, recipeId: recipe.id, recipeItemId: "44444444-4444-4444-8444-444444444444" },
        labels,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/lib/recipes/recipes.test.ts`
Expected: FAIL — `addRecipeItem is not exported by ./recipes`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/recipes/recipes.ts`:

```ts
// ---------------------------------------------------------------------------
// Recipe lines
// ---------------------------------------------------------------------------

/**
 * Validates a recipe line's quantity: a finite number > 0, or null to clear it.
 *
 * Deliberately the SAME rule and the SAME German sentence as lists/operations.ts's
 * assertValidQuantity. It is duplicated rather than imported because that one is private to the
 * operations funnel and recipes are explicitly not part of that funnel (spec §5) — importing it
 * would create the coupling this slice is built to avoid. If the wording ever changes, both change.
 */
function assertValidRecipeQuantity(value: number | null | undefined): void {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApiError(400, "Menge muss eine positive Zahl sein");
  }
}

/** A blank unit is stored as null — "" would be a unit the row would then try to render. */
function toStoredUnit(unit: string | null | undefined): string | null {
  const trimmed = unit?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Loads a line, scoped to BOTH its project and its recipe, or throws the shared 404.
 *
 * Scoping by recipe as well as project is the enforcement point a Server Action needs: the line id
 * arrives in a form field, and a crafted request must not be able to edit a neighbouring recipe's
 * line just because it belongs to the same project.
 */
async function requireRecipeItem(
  db: PrismaClient,
  projectId: string,
  recipeId: string,
  recipeItemId: string,
  labels: RecipeLabels,
): Promise<RecipeItem> {
  await requireRecipe(db, projectId, recipeId, labels);
  if (!isUuid(recipeItemId)) throw new ApiError(404, "Artikel nicht gefunden");
  const item = await db.recipeItem.findFirst({ where: { id: recipeItemId, recipeId } });
  if (!item) throw new ApiError(404, "Artikel nicht gefunden");
  return item;
}

export interface AddRecipeItemInput {
  projectId: string;
  recipeId: string;
  catalogItemId: string;
  /** Per ONE unit of the recipe. Omitted or null = "just add it" (spec D4). */
  quantity?: number | null;
  /** Omitted or null inherits the article's catalog default at apply time. */
  unit?: string | null;
}

/**
 * Adds an article to a recipe — or UPDATES the line that article already has.
 *
 * The upsert behaviour is required by the spec (§5), not a convenience: @@unique([recipeId,
 * catalogItemId]) would otherwise surface as a P2002 the user cannot act on ("you already have
 * Milch in this recipe, now what?"). Two lines for the same article are meaningless anyway — they
 * would be ambiguous under the apply multiplier and would merge on apply.
 */
export async function addRecipeItem(
  db: PrismaClient,
  input: AddRecipeItemInput,
  labels: RecipeLabels,
): Promise<RecipeItem> {
  const { projectId, recipeId, catalogItemId } = input;
  assertValidRecipeQuantity(input.quantity);
  await requireRecipe(db, projectId, recipeId, labels);

  // The article must belong to THIS project. Without this check a foreign article id would end up
  // in the recipe, and Slice 19's apply loop would put an article on a list that this project's own
  // catalog has never heard of.
  if (!isUuid(catalogItemId)) throw new ApiError(404, "Artikel nicht gefunden");
  const article = await db.catalogItem.findFirst({ where: { id: catalogItemId, projectId } });
  if (!article) throw new ApiError(404, "Artikel nicht gefunden");

  const quantity = input.quantity ?? null;
  const unit = toStoredUnit(input.unit);

  // Server-assigned max+1, the same contract as ListItem.sortIndex. `_max` returns null for an
  // empty recipe, which is why the nullish coalescing produces the first index of 0.
  const highest = await db.recipeItem.aggregate({
    where: { recipeId },
    _max: { sortIndex: true },
  });
  const sortIndex = (highest._max.sortIndex ?? -1) + 1;

  // upsert on the compound unique: one round-trip, and it is race-safe in a way a
  // findFirst-then-create never is — two members adding Milch at the same moment cannot produce
  // two rows. sortIndex is only in `create`: an existing line keeps its position, because the user
  // re-typing an article is correcting its quantity, not re-ordering the recipe.
  return db.recipeItem.upsert({
    where: { recipeId_catalogItemId: { recipeId, catalogItemId } },
    create: { recipeId, catalogItemId, quantity, unit, sortIndex },
    update: { quantity, unit },
  });
}

export interface UpdateRecipeItemInput {
  projectId: string;
  recipeId: string;
  recipeItemId: string;
  /** null CLEARS the quantity — that is how an unquantified line is produced (spec §7). */
  quantity: number | null;
  /** null clears the unit, so the article's catalog default applies at apply time. */
  unit: string | null;
}

/**
 * Writes a line's Menge and Einheit — the two fields RecipeItemSheet edits (Task 12).
 *
 * Both fields are written every time, unlike the list's update_item: the sheet shows both, the
 * recipe is not collaboratively edited, and last-writer-wins on a whole line is the agreed conflict
 * behaviour for configuration (spec §5). There is nothing to merge field-granularly here.
 */
export async function updateRecipeItem(
  db: PrismaClient,
  input: UpdateRecipeItemInput,
  labels: RecipeLabels,
): Promise<RecipeItem> {
  assertValidRecipeQuantity(input.quantity);
  const item = await requireRecipeItem(
    db,
    input.projectId,
    input.recipeId,
    input.recipeItemId,
    labels,
  );

  return db.recipeItem.update({
    where: { id: item.id },
    data: { quantity: input.quantity, unit: toStoredUnit(input.unit) },
  });
}

export interface RemoveRecipeItemInput {
  projectId: string;
  recipeId: string;
  recipeItemId: string;
}

/**
 * Removes one line from a recipe. The catalog article it referenced is untouched — the recipe
 * points at project memory, it does not own it.
 */
export async function removeRecipeItem(
  db: PrismaClient,
  input: RemoveRecipeItemInput,
  labels: RecipeLabels,
): Promise<void> {
  const item = await requireRecipeItem(
    db,
    input.projectId,
    input.recipeId,
    input.recipeItemId,
    labels,
  );
  await db.recipeItem.delete({ where: { id: item.id } });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/recipes/recipes.test.ts`
Expected: PASS (all describes, including Task 3's).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipes/recipes.ts src/lib/recipes/recipes.test.ts
git commit -m "feat(recipes): add recipe line operations

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `addRecipeItemFromRow` — the trailing row's server-side meaning

**Files:**
- Modify: `src/lib/recipes/recipes.ts`
- Modify: `src/lib/recipes/recipes.test.ts`

**Interfaces:**
- Consumes: `addRecipeItem` (Task 4), `getOrCreateCatalogItem` (`src/lib/catalog/catalog.ts`), `buildUnitLookup` + `parseEntryInput` (`src/lib/lists/parseEntryInput.ts`), `normalizeName`.
- Produces: `addRecipeItemFromRow(db, { projectId, recipeId, text }, labels): Promise<RecipeItem>`.

The recipe detail screen's „Artikel hinzufügen…" row is the list screen's trailing row minus the category chips (spec §5), so typing „500 g Hackfleisch" must split exactly as it does on a list. This function is the recipe-side twin of `addEntryFromRow` — same parse path, **minus the category rule, minus `needsCategory`, and minus the catalog flow-back** (ruling R5).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/recipes/recipes.test.ts` (extend the import with `addRecipeItemFromRow`):

```ts
describe("addRecipeItemFromRow", () => {
  it("splits a leading quantity and known unit off the typed text", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    const line = await addRecipeItemFromRow(
      db,
      { projectId, recipeId: recipe.id, text: "500 g Hackfleisch" },
      labels,
    );

    expect(line.quantity).toBe(500);
    expect(line.unit).toBe("g");
    // ONLY the article name reaches the catalog — the rule Slice 15 exists to preserve.
    const article = await db.catalogItem.findUnique({ where: { id: line.catalogItemId } });
    expect(article!.name).toBe("Hackfleisch");
  });

  it("creates the article when nobody has used the name before", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    await addRecipeItemFromRow(db, { projectId, recipeId: recipe.id, text: "Béchamel" }, labels);

    expect(await db.catalogItem.count({ where: { projectId } })).toBe(1);
  });

  it("does not parse when the raw text already names an article", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Grillen" }, labels);
    await makeArticle("7 Zwerge Bier");

    const line = await addRecipeItemFromRow(
      db,
      { projectId, recipeId: recipe.id, text: "7 Zwerge Bier" },
      labels,
    );

    // The escape hatch: parsing would shred this into 7 x "Zwerge Bier" and split the catalog.
    expect(line.quantity).toBeNull();
    const article = await db.catalogItem.findUnique({ where: { id: line.catalogItemId } });
    expect(article!.name).toBe("7 Zwerge Bier");
  });

  it("stores a bare name as a line without a quantity", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    const line = await addRecipeItemFromRow(db, { projectId, recipeId: recipe.id, text: "Salz" }, labels);

    expect(line.quantity).toBeNull();
    expect(line.unit).toBeNull();
  });

  it("does NOT flow the parsed unit back into the catalog default", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch"); // defaultUnit is null

    await addRecipeItemFromRow(db, { projectId, recipeId: recipe.id, text: "1 l Milch" }, labels);

    // Ruling R5: flow-back means "the project learned this from real use". A recipe is a plan
    // somebody typed once and must not rewrite shared catalog memory.
    const after = await db.catalogItem.findUnique({ where: { id: milch.id } });
    expect(after!.defaultUnit).toBeNull();
  });

  it("updates the existing line when the same article is typed twice", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    await addRecipeItemFromRow(db, { projectId, recipeId: recipe.id, text: "1 l Milch" }, labels);
    const again = await addRecipeItemFromRow(
      db,
      { projectId, recipeId: recipe.id, text: "2 l Milch" },
      labels,
    );

    expect(again.quantity).toBe(2);
    expect(await db.recipeItem.count({ where: { recipeId: recipe.id } })).toBe(1);
  });

  it("rejects an empty text", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    await expect(
      addRecipeItemFromRow(db, { projectId, recipeId: recipe.id, text: "   " }, labels),
    ).rejects.toMatchObject({ status: 400, message: "Name darf nicht leer sein" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/lib/recipes/recipes.test.ts`
Expected: FAIL — `addRecipeItemFromRow is not exported by ./recipes`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/recipes/recipes.ts`, and extend the imports at the top of the file with:

```ts
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { buildUnitLookup, parseEntryInput } from "@/lib/lists/parseEntryInput";
```

Then append:

```ts
export interface AddRecipeItemFromRowInput {
  projectId: string;
  recipeId: string;
  /** Exactly what the user typed into "Artikel hinzufügen…", quantity and unit included. */
  text: string;
}

/**
 * The recipe detail screen's trailing row, server-side — the twin of lists/addEntry.ts's
 * addEntryFromRow.
 *
 * Why it exists at all: spec §5 makes reuse the point. The recipe row IS the list's trailing row
 * minus the category chips, so "500 g Hackfleisch" has to split exactly as it does on a list, and
 * an unknown article has to become a catalog row the same way. Re-implementing the split on the
 * client would guarantee the two drift.
 *
 * Three things it deliberately does NOT inherit from addEntryFromRow:
 *  1. The CATEGORY rule. A recipe line has no category of its own — it inherits the article's at
 *     apply time (spec §2), so there is no active chip to honour and no `needsCategory` cue.
 *  2. The CATALOG FLOW-BACK (ruling R5). addEntryFromRow passes its parsed unit as an explicit
 *     unit so the project LEARNS that Milch comes in litres. That inference is earned by real
 *     shopping; a hypothetical dish must not silently re-unit an article for every future list.
 *  3. `applyOperation`. Recipes are not part of the operations funnel (spec §5).
 */
export async function addRecipeItemFromRow(
  db: PrismaClient,
  input: AddRecipeItemFromRowInput,
  labels: RecipeLabels,
): Promise<RecipeItem> {
  const { projectId, recipeId } = input;
  // Fail before any catalog write if the row was submitted empty. getOrCreateCatalogItem owns this
  // message; checking here keeps an empty submit from creating nothing and 500-ing later.
  if (!normalizeName(input.text)) throw new ApiError(400, "Name darf nicht leer sein");
  await requireRecipe(db, projectId, recipeId, labels);

  const rawNormalized = normalizeName(input.text);

  // Two independent reads -> Promise.all: this runs on a phone, so it pays one round-trip of
  // latency rather than two sequential ones (the same shape addEntryFromRow uses).
  const [rawArticle, catalogUnits] = await Promise.all([
    // The RAW text may itself name an article ("7 Zwerge Bier"). Reading it first is the parser's
    // escape hatch — without it the parser shreds that name and splits the project's catalog in two.
    db.catalogItem.findUnique({
      where: { projectId_normalizedName: { projectId, normalizedName: rawNormalized } },
    }),
    // The project's own unit vocabulary (Slice 15 ruling 2). `distinct` keeps this proportional to
    // the number of DIFFERENT units, not to catalog size.
    db.catalogItem.findMany({
      where: { projectId, defaultUnit: { not: null } },
      select: { defaultUnit: true },
      distinct: ["defaultUnit"],
    }),
  ]);

  const parsed = rawArticle
    ? { quantity: null, unit: null, name: input.text }
    : parseEntryInput(input.text, buildUnitLookup(catalogUnits.map((row) => row.defaultUnit)));

  // ONLY the article name reaches the catalog. getOrCreateCatalogItem resolves a known name to its
  // existing row and creates one for a name nobody has used — the implicit catalog path (Slice 4),
  // which is exactly right here: the user is naming an article, not managing the catalog.
  const article = await getOrCreateCatalogItem(db, { projectId, name: parsed.name });

  // addRecipeItem's upsert does the rest, so typing the same article twice corrects its quantity
  // instead of failing on the @@unique.
  return addRecipeItem(
    db,
    {
      projectId,
      recipeId,
      catalogItemId: article.id,
      quantity: parsed.quantity,
      unit: parsed.unit,
    },
    labels,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/recipes/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Run lint and the full suite**

Run: `npm run lint && npm test`
Expected: lint clean; every existing test still passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/recipes/recipes.ts src/lib/recipes/recipes.test.ts
git commit -m "feat(recipes): parse typed text into a recipe line

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Extend the catalog-delete guard to recipe usage

**Files:**
- Modify: `src/lib/format/plural.ts` and `src/lib/format/plural.test.ts`
- Modify: `src/lib/catalog/manage.ts` (`CatalogArticle`, `listCatalog`, `deleteCatalogArticle`; add `countRecipesUsingArticle`)
- Modify: `src/lib/catalog/manage.test.ts`
- Modify: `src/app/projects/[projectId]/katalog/CatalogEditPanel.tsx` and `CatalogEditPanel.test.tsx`
- Modify: `src/app/projects/[projectId]/katalog/CatalogBrowser.tsx` and `CatalogBrowser.test.tsx`
- Modify: `src/app/projects/[projectId]/katalog/page.tsx`

**Interfaces:**
- Consumes: `recipeLabels` / `RecipeLabels` (Task 2).
- Produces:
  - `formatUsedInRecipes(count: number, labels: RecipeLabels): string` in `plural.ts`
  - `countRecipesUsingArticle(db, projectId, catalogItemId): Promise<number>` in `manage.ts`
  - `CatalogArticle.usedInRecipeCount: number`
  - `CatalogEditPanel` prop `labels: RecipeLabels`, forwarded through `CatalogBrowser`

- [ ] **Step 1: Write the failing test for the plural helper**

Append to `src/lib/format/plural.test.ts` (import `formatUsedInRecipes` and `recipeLabels`):

```ts
describe("formatUsedInRecipes", () => {
  const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

  it("uses the singular only for exactly one", () => {
    expect(formatUsedInRecipes(1, labels)).toBe("wird in 1 Rezept verwendet");
    expect(formatUsedInRecipes(2, labels)).toBe("wird in 2 Rezepten verwendet");
  });

  it("uses the project's own wording", () => {
    const sets = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });
    expect(formatUsedInRecipes(3, sets)).toBe("wird in 3 Sets verwendet");
  });
});
```

Note the dative „Rezepten": „in" + dative takes the `-n` plural ending for this noun class. That is why the helper takes the labels and does **not** just concatenate `labels.plural`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/format/plural.test.ts`
Expected: FAIL — `formatUsedInRecipes is not a function`.

- [ ] **Step 3: Add the helper**

Append to `src/lib/format/plural.ts` (and add `import type { RecipeLabels } from "@/lib/recipes/labels";` at the top):

```ts
/**
 * "wird in 2 Rezepten verwendet" — the second reason a catalog article cannot be deleted (Slice 18).
 *
 * Twin of formatUsedInLists, and shared for the same reason: the sentence is printed twice, once as
 * a note in the Katalog edit panel and once inside the ApiError the delete guard throws when a
 * recipe was created in the meantime. They must read identically.
 *
 * The dative "-n" is why this cannot just concatenate labels.plural: "in" governs the dative, and
 * German weak plurals take an extra -n there ("in 2 Rezepten", "in 2 Paketen"). A plural that
 * already ends in -n or -s takes nothing ("in 3 Sets"), which is what the suffix check below does.
 * It is a heuristic over a user-chosen noun, which is the best that is possible here — and it is
 * right for the default wording, which is what almost every project will use.
 */
export function formatUsedInRecipes(count: number, labels: RecipeLabels): string {
  const noun =
    count === 1
      ? labels.singular
      : /[ns]$/i.test(labels.plural)
        ? labels.plural
        : `${labels.plural}n`;
  return `wird in ${count} ${noun} verwendet`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/format/plural.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the guard**

Append to `src/lib/catalog/manage.test.ts` (extend the import from `./manage` with `countRecipesUsingArticle`):

```ts
describe("recipe usage guard", () => {
  async function makeRecipe(name: string, catalogItemId: string) {
    const recipe = await db.recipe.create({
      data: { projectId, name, normalizedName: name.toLowerCase() },
    });
    await db.recipeItem.create({ data: { recipeId: recipe.id, catalogItemId, sortIndex: 0 } });
    return recipe;
  }

  it("counts the recipes using an article", async () => {
    const milch = await makeArticle("Milch");
    await makeRecipe("Lasagne", milch.id);
    await makeRecipe("Milchreis", milch.id);

    expect(await countRecipesUsingArticle(db, projectId, milch.id)).toBe(2);
  });

  it("reports the recipe count on the read model", async () => {
    const milch = await makeArticle("Milch");
    await makeRecipe("Lasagne", milch.id);

    const [article] = await listCatalog(db, projectId);
    expect(article.usedInRecipeCount).toBe(1);
    expect(article.usedInListCount).toBe(0);
  });

  it("refuses to delete an article a recipe uses, even with no list using it", async () => {
    const milch = await makeArticle("Milch");
    await makeRecipe("Lasagne", milch.id);

    // Without this guard the RecipeItem.catalogItemId cascade would silently strip Milch out of
    // every recipe that needs it — the recipe would still exist, quietly one article short.
    await expect(deleteCatalogArticle(db, { projectId, catalogItemId: milch.id })).rejects.toMatchObject({
      status: 409,
      message: "Löschen nicht möglich — wird in 1 Rezept verwendet.",
    });
    expect(await db.catalogItem.count()).toBe(1);
  });

  it("phrases the refusal with the project's own wording", async () => {
    await db.project.update({
      where: { id: projectId },
      data: { recipeLabelSingular: "Set", recipeLabelPlural: "Sets" },
    });
    const milch = await makeArticle("Milch");
    await makeRecipe("Lasagne", milch.id);
    await makeRecipe("Milchreis", milch.id);

    await expect(deleteCatalogArticle(db, { projectId, catalogItemId: milch.id })).rejects.toMatchObject({
      message: "Löschen nicht möglich — wird in 2 Sets verwendet.",
    });
  });

  it("still refuses when recipes are switched off", async () => {
    // recipesEnabled is false by default. The recipes still EXIST and still reference the article,
    // and turning the feature back on must restore them intact (spec §9) — so the guard is not
    // conditional on the flag.
    const milch = await makeArticle("Milch");
    await makeRecipe("Lasagne", milch.id);

    await expect(deleteCatalogArticle(db, { projectId, catalogItemId: milch.id })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("still deletes an article no list and no recipe uses", async () => {
    const milch = await makeArticle("Milch");
    await makeRecipe("Lasagne", milch.id);
    await db.recipeItem.deleteMany({});

    await deleteCatalogArticle(db, { projectId, catalogItemId: milch.id });
    expect(await db.catalogItem.count()).toBe(0);
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npm test -- src/lib/catalog/manage.test.ts`
Expected: FAIL — `countRecipesUsingArticle is not exported`, and the delete tests resolve instead of rejecting.

- [ ] **Step 7: Extend the read model and add the counter**

In `src/lib/catalog/manage.ts`, add to the `CatalogArticle` interface, right after `usedInListCount`:

```ts
  /**
   * Recipes of the project holding this article (Slice 18). The SECOND delete blocker: the panel
   * must not offer "Löschen" for an article a recipe needs, or the button 409s on tap.
   */
  usedInRecipeCount: number;
```

In `listCatalog`, extend the `include` with `recipeItems: { select: { id: true } }` — one line per recipe by the `@@unique`, so the array length IS the recipe count — and extend the projection with `usedInRecipeCount: item.recipeItems.length,` directly after `usedInListCount`.

Then add the counter next to `countListsUsingArticle`:

```ts
/**
 * How many recipes of the project hold this article (Slice 18).
 *
 * No `distinct` needed, unlike countListsUsingArticle: @@unique([recipeId, catalogItemId]) already
 * guarantees at most one line per recipe, so the row count IS the recipe count.
 *
 * The nested `recipe: { projectId }` filter keeps the count project-scoped even if an id from
 * elsewhere ever reached this function — the same defence countListsUsingArticle applies.
 */
export async function countRecipesUsingArticle(
  db: PrismaClient,
  projectId: string,
  catalogItemId: string,
): Promise<number> {
  return db.recipeItem.count({ where: { catalogItemId, recipe: { projectId } } });
}
```

- [ ] **Step 8: Extend the delete guard**

In `deleteCatalogArticle`'s transaction callback, directly after the existing `if (rows.length > 0)` block, insert:

```ts
        // SECOND blocker (Slice 18): recipe lines. Read against the SAME snapshot as the delete, so
        // a recipe created concurrently either lands before this read (and blocks) or aborts the
        // transaction at commit — the same mechanism the list guard above relies on.
        const recipeUses = await tx.recipeItem.count({
          where: { catalogItemId, recipe: { projectId } },
        });
        if (recipeUses > 0) {
          // The message names the feature the way THIS project names it, so a project that calls
          // them "Sets" never sees the word "Rezept". Reading the project here rather than taking
          // labels as a parameter keeps deleteCatalogArticle's signature — and its four call
          // sites — unchanged (ruling R3); it is one extra row inside a transaction that is
          // already open.
          const project = await tx.project.findUnique({
            where: { id: projectId },
            select: { recipeLabelSingular: true, recipeLabelPlural: true },
          });
          throw new ApiError(
            409,
            `Löschen nicht möglich — ${formatUsedInRecipes(
              recipeUses,
              recipeLabels(
                project ?? {
                  // The project cannot actually be missing here (the article was just read through
                  // it), but a `null` must not become a crash inside an error path.
                  recipeLabelSingular: DEFAULT_RECIPE_LABEL_SINGULAR,
                  recipeLabelPlural: DEFAULT_RECIPE_LABEL_PLURAL,
                },
              ),
            )}.`,
          );
        }
```

Extend the imports at the top of `manage.ts`:

```ts
import { formatUsedInLists, formatUsedInRecipes } from "@/lib/format/plural";
import {
  DEFAULT_RECIPE_LABEL_PLURAL,
  DEFAULT_RECIPE_LABEL_SINGULAR,
  recipeLabels,
} from "@/lib/recipes/labels";
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test -- src/lib/catalog/manage.test.ts`
Expected: PASS — including every pre-existing test in that file.

- [ ] **Step 10: Write the failing component test for the panel**

In `src/app/projects/[projectId]/katalog/CatalogEditPanel.test.tsx`, add `usedInRecipeCount: 0` to every existing article fixture (TypeScript will demand it), and append a new test:

```ts
  it("blocks deletion and names the reason when a recipe uses the article", () => {
    renderPanel({
      article: { ...milch, usedInListCount: 0, usedInRecipeCount: 2 },
    });

    expect(screen.queryByRole("button", { name: "Löschen" })).not.toBeInTheDocument();
    expect(screen.getByText("Löschen nicht möglich — wird in 2 Rezepten verwendet.")).toBeInTheDocument();
  });
```

Adjust `renderPanel` to supply the new required prop `labels={recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" })}`.

- [ ] **Step 11: Run it to verify it fails**

Run: `npm test -- src/app/projects/[projectId]/katalog/CatalogEditPanel.test.tsx`
Expected: FAIL — the Löschen button is still rendered.

- [ ] **Step 12: Update the panel**

In `CatalogEditPanel.tsx`:

- add the prop `labels: RecipeLabels` to its props type (import the TYPE only, from `@/lib/recipes/labels` — naming the prop `labels` rather than `recipeLabels` keeps it consistent with `RecipeIndex` and `RecipeDetail`, and avoids shadowing the helper function of that name),
- change line 45 to:

```tsx
  // BOTH usages block deletion: a list, because the N-of-M suggestion statistic reads past lists
  // (Slice 10), and a recipe, because the cascade would quietly leave the recipe an article short.
  const deletable = article.usedInListCount === 0 && article.usedInRecipeCount === 0;
```

- and replace the single reason line (currently `Löschen nicht möglich — {formatUsedInLists(article.usedInListCount)}.`) with a version that names whichever blocker applies. Lists take precedence when both apply, because that is the one the user can do least about:

```tsx
        <p className={styles.note}>
          Löschen nicht möglich —{" "}
          {article.usedInListCount > 0
            ? formatUsedInLists(article.usedInListCount)
            : formatUsedInRecipes(article.usedInRecipeCount, labels)}
          .
        </p>
```

- [ ] **Step 13: Forward the prop from browser and page**

In `CatalogBrowser.tsx`, add `labels: RecipeLabels` to the props type and pass it straight through to every `<CatalogEditPanel …>`. In `src/app/projects/[projectId]/katalog/page.tsx`, read the project's labels and pass them down:

```tsx
  // The delete guard's reason line names the feature the way this project names it, so the screen
  // needs the labels even when recipes are switched off — a disabled feature's recipes still block.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipeLabelSingular: true, recipeLabelPlural: true },
  });
```

and `labels={recipeLabels(project!)}` on `<CatalogBrowser>` (here `recipeLabels` IS the helper function, imported from `@/lib/recipes/labels`). Add `usedInRecipeCount: 0` to the fixtures in `CatalogBrowser.test.tsx` and pass the same prop in its `renderBrowser` helper.

- [ ] **Step 14: Run the catalog tests and the full suite**

Run: `npm test -- src/app/projects/[projectId]/katalog src/lib/catalog && npm run lint`
Expected: PASS, lint clean.

- [ ] **Step 15: Commit**

```bash
git add src/lib/format src/lib/catalog "src/app/projects/[projectId]/katalog"
git commit -m "feat(catalog): block deleting an article a recipe uses

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `updateRecipeSettings` — the settings core

**Files:**
- Create: `src/lib/projects/settings.ts`
- Create: `src/lib/projects/settings.test.ts`

**Interfaces:**
- Consumes: `ApiError`, `DEFAULT_RECIPE_LABEL_SINGULAR` / `DEFAULT_RECIPE_LABEL_PLURAL` (Task 2).
- Produces: `MAX_RECIPE_LABEL_LENGTH = 40`, `interface RecipeSettingsInput { recipesEnabled: boolean; recipeLabelSingular: string; recipeLabelPlural: string }`, `updateRecipeSettings(db, projectId, input): Promise<Project>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/projects/settings.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { updateRecipeSettings } from "./settings";

const db = new PrismaClient();
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

describe("updateRecipeSettings", () => {
  it("enables the feature and stores the project's own wording", async () => {
    const project = await updateRecipeSettings(db, projectId, {
      recipesEnabled: true,
      recipeLabelSingular: "  Set  ",
      recipeLabelPlural: " Sets ",
    });

    expect(project.recipesEnabled).toBe(true);
    expect(project.recipeLabelSingular).toBe("Set"); // trimmed on the way in
    expect(project.recipeLabelPlural).toBe("Sets");
  });

  it("keeps the labels when the feature is switched off", async () => {
    await updateRecipeSettings(db, projectId, {
      recipesEnabled: true,
      recipeLabelSingular: "Set",
      recipeLabelPlural: "Sets",
    });

    const off = await updateRecipeSettings(db, projectId, {
      recipesEnabled: false,
      recipeLabelSingular: "Set",
      recipeLabelPlural: "Sets",
    });

    // Off must be reversible without re-typing the wording (spec §2).
    expect(off.recipesEnabled).toBe(false);
    expect(off.recipeLabelSingular).toBe("Set");
  });

  it("falls back to the defaults for a blank label", async () => {
    const project = await updateRecipeSettings(db, projectId, {
      recipesEnabled: true,
      recipeLabelSingular: "   ",
      recipeLabelPlural: "",
    });

    // An empty field means "I don't want to rename it", not "call it nothing".
    expect(project.recipeLabelSingular).toBe("Rezept");
    expect(project.recipeLabelPlural).toBe("Rezepte");
  });

  it("rejects a label over the length limit", async () => {
    await expect(
      updateRecipeSettings(db, projectId, {
        recipesEnabled: true,
        recipeLabelSingular: "x".repeat(41),
        recipeLabelPlural: "Sets",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Bezeichnung darf höchstens 40 Zeichen lang sein",
    });
  });

  it("404s for an unknown or malformed project id", async () => {
    await expect(
      updateRecipeSettings(db, "nope", {
        recipesEnabled: true,
        recipeLabelSingular: "Set",
        recipeLabelPlural: "Sets",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/lib/projects/settings.test.ts`
Expected: FAIL — `Failed to resolve import "./settings"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/projects/settings.ts`:

```ts
import type { PrismaClient, Project } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";
import {
  DEFAULT_RECIPE_LABEL_PLURAL,
  DEFAULT_RECIPE_LABEL_SINGULAR,
} from "@/lib/recipes/labels";

/**
 * Project-level configuration (Slice 18) — today that is exactly the recipes feature: whether it is
 * on, and what this project calls it.
 *
 * Why its own module next to projects.ts: that file owns the project's IDENTITY and lifecycle
 * (create, rename, delete, list). This owns its SETTINGS, which is a different contract — the
 * settings screen writes all of these fields together from one form, and more of them will arrive
 * the next time the app grows a per-project switch. Keeping them apart stops projects.ts from
 * becoming the place everything lands.
 *
 * Owner-only, enforced by the CALLER via requireOwner — the same gate as renaming the project,
 * because this configures the project rather than its content (spec §4). The core stays
 * transport- and auth-agnostic, like every other core here.
 */

// Upper bound for a label. 40 is generous for a noun and small enough that no nav entry, button or
// sentence composed from it can blow out a phone layout — which is the actual failure mode, since
// recipeLabels() drops these strings into eight different phrases.
export const MAX_RECIPE_LABEL_LENGTH = 40;

export interface RecipeSettingsInput {
  recipesEnabled: boolean;
  recipeLabelSingular: string;
  recipeLabelPlural: string;
}

/**
 * Normalizes one label field coming off the form.
 *
 * An emptied field means "I don't want to rename it" and falls back to the default — NOT "call it
 * nothing". This is the opposite of updateCatalogArticle's toDefaultValue, where an emptied field
 * clears a value; both are right, because there a null is a legitimate stored state and here it
 * would leave every button reading "Neues ".
 */
function toLabel(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (raw.length > MAX_RECIPE_LABEL_LENGTH) {
    throw new ApiError(400, `Bezeichnung darf höchstens ${MAX_RECIPE_LABEL_LENGTH} Zeichen lang sein`);
  }
  return trimmed === "" ? fallback : trimmed;
}

/**
 * Writes the recipe toggle and the label pair in ONE update.
 *
 * One write, not three: the settings form has a single "Speichern", and separate writes would let
 * the toggle land while a too-long label bounces off validation — leaving the user with a feature
 * half-enabled under the wrong name. Validating first and writing once makes that impossible (the
 * same reasoning as updateCatalogArticle's single write).
 *
 * The labels are stored even when `recipesEnabled` is false, which is the point of keeping the two
 * concerns in separate columns: turning the feature off and on again restores the wording (spec §2).
 */
export async function updateRecipeSettings(
  db: PrismaClient,
  projectId: string,
  input: RecipeSettingsInput,
): Promise<Project> {
  // Shape check first: a malformed id can never match a uuid column, and Prisma would throw P2023
  // (a fake 500) instead of returning null. 404 = "not yours" (existence hiding).
  if (!isUuid(projectId)) throw new ApiError(404, "Projekt nicht gefunden");

  const recipeLabelSingular = toLabel(input.recipeLabelSingular, DEFAULT_RECIPE_LABEL_SINGULAR);
  const recipeLabelPlural = toLabel(input.recipeLabelPlural, DEFAULT_RECIPE_LABEL_PLURAL);

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError(404, "Projekt nicht gefunden");

  return db.project.update({
    where: { id: projectId },
    data: { recipesEnabled: input.recipesEnabled, recipeLabelSingular, recipeLabelPlural },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/projects/settings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/settings.ts src/lib/projects/settings.test.ts
git commit -m "feat(projects): add the recipe settings core

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The owner-only `/einstellungen` screen

**Files:**
- Create: `src/app/projects/[projectId]/einstellungen/page.tsx`
- Create: `src/app/projects/[projectId]/einstellungen/page.module.css`
- Create: `src/app/projects/[projectId]/einstellungen/formState.ts`
- Create: `src/app/projects/[projectId]/einstellungen/RecipeSettingsForm.tsx`
- Create: `src/app/projects/[projectId]/einstellungen/RecipeSettingsForm.module.css`
- Create: `src/app/projects/[projectId]/einstellungen/RecipeSettingsForm.test.tsx`

**Interfaces:**
- Consumes: `updateRecipeSettings` (Task 7), `recipeLabels` (Task 2), `requireOwner` / `getProjectNav`, and the primitives `PageHeader`, `DrawerTrigger`, `Toggle`, `TextField`, `Button`, `FieldError`, `SectionLabel`.
- Produces: `SettingsFormState` + `SETTINGS_FORM_IDLE` in `formState.ts`; the route `/projects/[projectId]/einstellungen`.

- [ ] **Step 1: Write the failing component test**

Create `src/app/projects/[projectId]/einstellungen/RecipeSettingsForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeSettingsForm } from "./RecipeSettingsForm";
import { SETTINGS_FORM_IDLE, type SettingsFormState } from "./formState";

const idle = async (): Promise<SettingsFormState> => SETTINGS_FORM_IDLE;

function renderForm(overrides: Partial<Parameters<typeof RecipeSettingsForm>[0]> = {}) {
  const props = {
    recipesEnabled: false,
    recipeLabelSingular: "Rezept",
    recipeLabelPlural: "Rezepte",
    saveAction: idle,
    ...overrides,
  };
  return { ...render(<RecipeSettingsForm {...props} />), props };
}

describe("RecipeSettingsForm", () => {
  it("shows the switch off and the default wording pre-filled", () => {
    renderForm();

    expect(screen.getByRole("switch", { name: "Rezepte aktivieren" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByLabelText("Einzahl")).toHaveValue("Rezept");
    expect(screen.getByLabelText("Mehrzahl")).toHaveValue("Rezepte");
  });

  it("reflects a project that already renamed the feature", () => {
    renderForm({ recipesEnabled: true, recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });

    expect(screen.getByRole("switch", { name: "Sets aktivieren" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Einzahl")).toHaveValue("Set");
  });

  it("toggles the switch and keeps the label fields editable while off", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("switch", { name: "Rezepte aktivieren" }));
    expect(screen.getByRole("switch", { name: "Rezepte aktivieren" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // The wording survives switching off, so the fields must never be disabled by the toggle.
    await user.click(screen.getByRole("switch", { name: "Rezepte aktivieren" }));
    await user.clear(screen.getByLabelText("Einzahl"));
    await user.type(screen.getByLabelText("Einzahl"), "Set");
    expect(screen.getByLabelText("Einzahl")).toHaveValue("Set");
  });

  it("surfaces a failed save inline", () => {
    renderForm({
      initialState: { error: "Bezeichnung darf höchstens 40 Zeichen lang sein", ok: false },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bezeichnung darf höchstens 40 Zeichen lang sein",
    );
  });

  it("confirms a successful save", () => {
    renderForm({ initialState: { error: null, ok: true } });

    expect(screen.getByRole("status")).toHaveTextContent("Gespeichert");
  });
});
```

Note the `initialState` prop: it exists purely so the two result states are testable without driving a real Server Action round-trip. It defaults to `SETTINGS_FORM_IDLE` and the page never passes it.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- "src/app/projects/[projectId]/einstellungen"`
Expected: FAIL — `Failed to resolve import "./RecipeSettingsForm"`.

- [ ] **Step 3: Write the form state**

Create `src/app/projects/[projectId]/einstellungen/formState.ts`:

```ts
/**
 * The result shape the settings Server Action returns.
 *
 * Why the action returns state instead of throwing: a validation message („Bezeichnung darf
 * höchstens 40 Zeichen lang sein") has to land inline next to the field, and a thrown error on a
 * Server Action produces Next.js's error overlay instead. Returning state is what React 19's
 * useActionState consumes — the same convention the Katalog screen established.
 */
export type SettingsFormState = {
  /** German inline error from the last attempt, or null. */
  error: string | null;
  /** True after a save SUCCEEDED — drives the „Gespeichert" confirmation. Distinct from
   *  `error === null`, because the idle state has no error either. */
  ok: boolean;
};

/** The initial value useActionState starts from. */
export const SETTINGS_FORM_IDLE: SettingsFormState = { error: null, ok: false };
```

- [ ] **Step 4: Write the form component**

Create `src/app/projects/[projectId]/einstellungen/RecipeSettingsForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { TextField } from "@/components/ui/TextField";
import { Toggle } from "@/components/ui/Toggle";
import { recipeLabels } from "@/lib/recipes/labels";
import { SETTINGS_FORM_IDLE, type SettingsFormState } from "./formState";
import styles from "./RecipeSettingsForm.module.css";

type RecipeSettingsFormProps = {
  recipesEnabled: boolean;
  recipeLabelSingular: string;
  recipeLabelPlural: string;
  /** Server Action, bound by the page. Owner-only — the page re-checks. */
  saveAction: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: SettingsFormState;
};

/**
 * The recipes section of the project settings screen (spec §4): the opt-in switch and the two
 * label fields that name the feature.
 *
 * Why the toggle is a CLIENT state rather than a plain checkbox posted with the form: the switch's
 * accessible name is composed from the label the user is editing right now („Sets aktivieren"), so
 * the two controls have to see each other. The value still reaches the server as a hidden input, so
 * the form works as one submission.
 *
 * Why the label fields are never disabled while the switch is off: the wording is kept when the
 * feature is switched off (spec §2), and a project may well want to set its wording first. The
 * columns are independent precisely so this works.
 */
export function RecipeSettingsForm({
  recipesEnabled,
  recipeLabelSingular,
  recipeLabelPlural,
  saveAction,
  initialState = SETTINGS_FORM_IDLE,
}: RecipeSettingsFormProps) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  // Drafts, so the switch's accessible name updates as the user renames the feature. Seeded from
  // the server values once — the page re-renders with fresh props after revalidatePath.
  const [enabled, setEnabled] = useState(recipesEnabled);
  const [singular, setSingular] = useState(recipeLabelSingular);
  const [plural, setPlural] = useState(recipeLabelPlural);

  // The live wording, so every string on this screen already obeys the no-hardcoded-"Rezept" rule
  // while the user is still typing the new name.
  const labels = recipeLabels({ recipeLabelSingular: singular, recipeLabelPlural: plural });

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.switchRow}>
        <div className={styles.switchText}>
          <span className={styles.switchLabel}>{labels.plural}</span>
          <span className={styles.switchHint}>
            Sets aus Artikeln, die du mit einer Anzahl auf eine Liste legen kannst.
          </span>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label={`${labels.plural} aktivieren`} />
      </div>
      {/* The switch is client state; this is what actually travels with the form. */}
      <input type="hidden" name="recipesEnabled" value={enabled ? "on" : "off"} />

      <div className={styles.labelFields}>
        <TextField
          label="Einzahl"
          aria-label="Einzahl"
          name="recipeLabelSingular"
          fieldSize="sm"
          value={singular}
          onChange={(event) => setSingular(event.target.value)}
        />
        <TextField
          label="Mehrzahl"
          aria-label="Mehrzahl"
          name="recipeLabelPlural"
          fieldSize="sm"
          value={plural}
          onChange={(event) => setPlural(event.target.value)}
        />
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {/* role="status" (polite) rather than an alert: a save confirmation must not interrupt. */}
      {state.ok ? (
        <p role="status" className={styles.saved}>
          Gespeichert
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        Speichern
      </Button>
    </form>
  );
}
```

`FieldError` already renders `role="alert"` (see `src/components/ui/FieldError.tsx`), which is what the test queries — do not add a second alert wrapper around it.

Create `RecipeSettingsForm.module.css` with a column flex layout (`display: flex; flex-direction: column; gap: var(--space-4)`), `.switchRow` as a space-between row, `.labelFields` as a two-column grid that collapses to one column below 420px, and `.saved` in the success colour token. Take the exact token names from `src/app/globals.css`.

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npm test -- "src/app/projects/[projectId]/einstellungen"`
Expected: PASS.

- [ ] **Step 6: Write the page**

Create `src/app/projects/[projectId]/einstellungen/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { requireOwner } from "@/lib/projects/guard";
import { getProjectNav } from "@/lib/projects/nav";
import { updateRecipeSettings } from "@/lib/projects/settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { RecipeSettingsForm } from "./RecipeSettingsForm";
import { SETTINGS_FORM_IDLE, type SettingsFormState } from "./formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The project settings screen (spec §4) — OWNER-ONLY, unlike every other project screen.
 *
 * Why owner-only: this configures the project itself (which features it has, what they are called),
 * which is the same class of decision as renaming or deleting it. Members configure CONTENT —
 * lists, catalog, favourites, recipes — and that stays member-level.
 *
 * A member who reaches this URL is redirected to the project rather than shown a 403 screen: they
 * are allowed to know the project exists, they just have nothing to do here.
 */
export default async function ProjectSettingsPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects"); // non-member / unknown / malformed alike
  if (nav.role !== "owner") redirect(`/projects/${projectId}`);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
  });
  if (!project) redirect("/projects");

  /**
   * Saves the whole recipes section in one action.
   *
   * It re-derives identity and re-checks OWNERSHIP: a Server Action is an individually addressable
   * POST endpoint, so a member could reach it without this page ever rendering for them. The guard
   * on the render is not a guard on the action (the defense-in-depth rule this codebase applies
   * everywhere).
   */
  async function saveAction(
    _prev: SettingsFormState,
    formData: FormData,
  ): Promise<SettingsFormState> {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);

    try {
      await updateRecipeSettings(prisma, projectId, {
        // The hidden input carries the client-side switch; anything but "on" is off.
        recipesEnabled: formData.get("recipesEnabled") === "on",
        recipeLabelSingular: String(formData.get("recipeLabelSingular") ?? ""),
        recipeLabelPlural: String(formData.get("recipeLabelPlural") ?? ""),
      });
      // The nav entry appears or disappears with the flag, and it is rendered by the LAYOUT — so
      // the whole project subtree has to revalidate, not just this page.
      revalidatePath(`/projects/${projectId}`, "layout");
      return { error: null, ok: true };
    } catch (error) {
      // Only ApiError carries user-facing German copy. Anything else is a real bug and is
      // re-thrown on purpose — a crash disguised as a validation message is the worst of both.
      if (error instanceof ApiError) return { error: error.message, ok: false };
      throw error;
    }
  }

  return (
    <>
      <PageHeader title="Einstellungen" leading={<DrawerTrigger />} />
      <main className={styles.content}>
        <SectionLabel>Funktionen</SectionLabel>
        <RecipeSettingsForm
          recipesEnabled={project.recipesEnabled}
          recipeLabelSingular={project.recipeLabelSingular}
          recipeLabelPlural={project.recipeLabelPlural}
          saveAction={saveAction}
        />
      </main>
    </>
  );
}
```

Create `page.module.css` mirroring `src/app/projects/[projectId]/katalog/page.module.css`'s `.content` rule.

- [ ] **Step 7: Verify the build type-checks**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean. (If `tsc` is not wired up as a script, `npm run build` covers it.)

- [ ] **Step 8: Commit**

```bash
git add "src/app/projects/[projectId]/einstellungen"
git commit -m "feat(projects): add the owner-only settings screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Navigation — the conditional „Rezepte" entry and the owner's „Einstellungen" entry

**Files:**
- Modify: `src/lib/projects/nav.ts`, `src/lib/projects/nav.test.ts`
- Modify: `src/components/nav/ProjectShell.tsx`
- Modify: `src/components/nav/ProjectNavPanel.tsx`, `ProjectNavPanel.test.tsx`
- Modify: `src/app/projects/[projectId]/layout.tsx`

**Interfaces:**
- Consumes: `recipeLabels` (Task 2), the existing `getProjectNav` / `ProjectNavData` / `ProjectNavPanelData`.
- Produces: `ProjectNavData.recipesEnabled: boolean` and `ProjectNavData.recipeLabelPlural: string`; the same two fields on `ProjectNavPanelData`; `ProjectNavPanel` props `recipesEnabled`, `recipeLabelPlural`, `isOwner`.

- [ ] **Step 1: Write the failing test for the nav read**

Append to `src/lib/projects/nav.test.ts`:

```ts
  it("carries the project's recipe settings for the nav entry", async () => {
    await db.project.update({
      where: { id: projectId },
      data: { recipesEnabled: true, recipeLabelPlural: "Sets" },
    });

    const nav = await getProjectNav(db, projectId, userId);

    // The panel needs BOTH: the flag decides whether the entry is rendered, the plural is its label.
    expect(nav!.recipesEnabled).toBe(true);
    expect(nav!.recipeLabelPlural).toBe("Sets");
  });

  it("reports recipes as off by default", async () => {
    const nav = await getProjectNav(db, projectId, userId);
    expect(nav!.recipesEnabled).toBe(false);
    expect(nav!.recipeLabelPlural).toBe("Rezepte");
  });
```

(Reuse whatever fixture names `nav.test.ts` already sets up for `projectId` / `userId`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/projects/nav.test.ts`
Expected: FAIL — `recipesEnabled` does not exist on `ProjectNavData`.

- [ ] **Step 3: Extend the nav read**

`listProjectSummaries` does not select these columns and must not start to: it is the read behind Home and Projekte, where the recipe wording is dead weight on every row. Add a second, narrow read in `getProjectNav` instead.

In `src/lib/projects/nav.ts`, add to `ProjectNavData`:

```ts
  /** Whether the recipes feature is on — decides whether the nav shows its entry at all. */
  recipesEnabled: boolean;
  /** The project's own plural, e.g. "Sets" — the nav entry's label (spec §4, §5). */
  recipeLabelPlural: string;
```

and in the function body, after the `if (!current) return null;` guard:

```ts
  // A second, deliberately narrow read rather than widening listProjectSummaries: that read backs
  // Home and Projekte, where these two columns would ride along on every project row for nothing.
  // Two columns of one row is cheaper than that, and it keeps the summary shape honest.
  const settings = await db.project.findUnique({
    where: { id: projectId },
    select: { recipesEnabled: true, recipeLabelPlural: true },
  });
```

Then add to the returned object:

```ts
    // `settings` cannot be null here — the summary above proves the project exists — but falling
    // back keeps a concurrent delete from turning the nav into a crash.
    recipesEnabled: settings?.recipesEnabled ?? false,
    recipeLabelPlural: settings?.recipeLabelPlural ?? DEFAULT_RECIPE_LABEL_PLURAL,
```

with `import { DEFAULT_RECIPE_LABEL_PLURAL } from "@/lib/recipes/labels";` at the top.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/projects/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component tests for the panel**

Append to `src/components/nav/ProjectNavPanel.test.tsx`. The tests below call a helper `renderPanel(overrides)`; read the file first and use whatever its existing helper is actually called, adding the three new props to it with the defaults `recipesEnabled: false`, `recipeLabelPlural: "Rezepte"`, `isOwner: false`:

```tsx
  it("hides the recipes entry when the feature is off", () => {
    renderPanel({ recipesEnabled: false });

    expect(screen.queryByRole("link", { name: "Rezepte" })).not.toBeInTheDocument();
  });

  it("shows the recipes entry under the project's own name when enabled", () => {
    renderPanel({ recipesEnabled: true, recipeLabelPlural: "Sets" });

    expect(screen.getByRole("link", { name: "Sets" })).toHaveAttribute(
      "href",
      "/projects/p1/rezepte",
    );
  });

  it("shows the settings entry only to the owner", () => {
    renderPanel({ isOwner: false });
    expect(screen.queryByRole("link", { name: "Einstellungen" })).not.toBeInTheDocument();

    renderPanel({ isOwner: true });
    expect(screen.getByRole("link", { name: "Einstellungen" })).toHaveAttribute(
      "href",
      "/projects/p1/einstellungen",
    );
  });
```

(Use whatever `projectId` the existing helper passes instead of `p1` if it differs.)

- [ ] **Step 6: Run them to verify they fail**

Run: `npm test -- src/components/nav/ProjectNavPanel.test.tsx`
Expected: FAIL — the entries are not rendered.

- [ ] **Step 7: Extend the panel**

In `ProjectNavPanel.tsx`, add `BookOpen` and `Settings` to the `lucide-react` import, add three props to `ProjectNavPanelProps`:

```ts
  /** Drives whether the recipes entry exists at all. The ROUTE re-checks — this is convenience. */
  recipesEnabled: boolean;
  /** The project's own plural, e.g. "Sets". Never hardcode "Rezepte" here (spec §4). */
  recipeLabelPlural: string;
  /** Owner-only entries (Einstellungen). Visibility only — the route re-checks with requireOwner. */
  isOwner: boolean;
```

and build the PROJEKT group conditionally:

```tsx
  const projectEntries: NavEntry[] = [
    { label: "Favoriten", href: `/projects/${projectId}/favoriten`, glyph: Star },
    // Slice 18: recipes are opt-in per project, so the entry only exists when the feature is on —
    // and it is labelled with the project's OWN plural, because the project names the feature.
    // The route re-checks the flag and 404s: the nav is a convenience, the route is the gate.
    ...(recipesEnabled
      ? [{ label: recipeLabelPlural, href: `/projects/${projectId}/rezepte`, glyph: BookOpen }]
      : []),
    { label: "Katalog", href: `/projects/${projectId}/katalog`, glyph: Library },
    { label: "Mitglieder", href: `/projects/${projectId}/mitglieder`, glyph: Users, count: memberCount },
    // Ruling R2: the settings screen is otherwise unreachable. Owner-only visibility mirrors its
    // requireOwner guard — a member sees no entry, and the route redirects them if they guess it.
    ...(isOwner
      ? [{ label: "Einstellungen", href: `/projects/${projectId}/einstellungen`, glyph: Settings }]
      : []),
  ];
```

- [ ] **Step 8: Thread the props through the shell and the layout**

In `ProjectShell.tsx`, add `recipesEnabled: boolean`, `recipeLabelPlural: string` and `isOwner: boolean` to `ProjectNavPanelData`, and forward all three to `<ProjectNavPanel …>`.

In `src/app/projects/[projectId]/layout.tsx`, extend the `nav={{ … }}` object:

```tsx
        recipesEnabled: nav.recipesEnabled,
        recipeLabelPlural: nav.recipeLabelPlural,
        // The role comes from the same membership read that guarded this render, so it is live —
        // unlike the session's isAdmin flag above, which is only a visibility hint.
        isOwner: nav.role === "owner",
```

- [ ] **Step 9: Run the nav tests and the full suite**

Run: `npm test -- src/components/nav && npm run lint`
Expected: PASS, lint clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/projects/nav.ts src/lib/projects/nav.test.ts src/components/nav "src/app/projects/[projectId]/layout.tsx"
git commit -m "feat(nav): add the recipes and settings entries

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: The recipe index screen `/rezepte`

**Files:**
- Create: `src/app/projects/[projectId]/rezepte/page.tsx`
- Create: `src/app/projects/[projectId]/rezepte/page.module.css`
- Create: `src/app/projects/[projectId]/rezepte/formState.ts`
- Create: `src/app/projects/[projectId]/rezepte/RecipeIndex.tsx`
- Create: `src/app/projects/[projectId]/rezepte/RecipeIndex.module.css`
- Create: `src/app/projects/[projectId]/rezepte/RecipeIndex.test.tsx`

**Interfaces:**
- Consumes: `listRecipes` / `createRecipe` / `RecipeSummary` (Task 3), `recipeLabels` (Task 2), `formatRecipeArticleCount` (Task 3), `requireMembership`, `getProjectNav`, and the primitives `PageHeader`, `DrawerTrigger`, `RowLink`, `EmptyState`, `TextField`, `Button`, `FieldError`, `Icon`.
- Produces: `RecipeFormState` + `RECIPE_FORM_IDLE` in `formState.ts` — **also used by Task 11's detail screen**; the route `/projects/[projectId]/rezepte`.

- [ ] **Step 1: Write the failing component test**

Create `src/app/projects/[projectId]/rezepte/RecipeIndex.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import type { RecipeSummary } from "@/lib/recipes/recipes";
import { RecipeIndex } from "./RecipeIndex";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "./formState";

const lasagne: RecipeSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Lasagne",
  itemCount: 6,
};
const chili: RecipeSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Chili sin Carne",
  itemCount: 0,
};

const idle = async (): Promise<RecipeFormState> => RECIPE_FORM_IDLE;
const defaultLabels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

function renderIndex(overrides: Partial<Parameters<typeof RecipeIndex>[0]> = {}) {
  const props = {
    projectId: "p1",
    recipes: [lasagne, chili],
    labels: defaultLabels,
    createAction: idle,
    ...overrides,
  };
  return { ...render(<RecipeIndex {...props} />), props };
}

describe("RecipeIndex", () => {
  it("lists every recipe with its article count and a link to its detail screen", () => {
    renderIndex();

    const row = screen.getByRole("link", { name: /Lasagne/ });
    expect(row).toHaveAttribute(
      "href",
      "/projects/p1/rezepte/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getByText("6 Artikel")).toBeInTheDocument();
    // An empty recipe is a normal intermediate state, so it says so instead of "0 Artikel".
    expect(screen.getByText("Noch keine Artikel")).toBeInTheDocument();
  });

  it("names the create control with the project's own wording", () => {
    renderIndex({
      labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }),
    });

    expect(screen.getByRole("button", { name: "Neues Set" })).toBeInTheDocument();
  });

  it("opens a name field when the create control is used", async () => {
    const user = userEvent.setup();
    renderIndex();

    await user.click(screen.getByRole("button", { name: "Neues Rezept" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeInTheDocument();
  });

  it("shows the empty state, named by the project, when there are no recipes", () => {
    renderIndex({
      recipes: [],
      labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }),
    });

    expect(screen.getByText("Noch keine Sets")).toBeInTheDocument();
  });

  it("renders the duplicate-name error inline", () => {
    renderIndex({
      initialState: {
        error: "Ein Rezept mit diesem Namen existiert bereits",
        ok: false,
        recipeId: null,
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ein Rezept mit diesem Namen existiert bereits",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- "src/app/projects/[projectId]/rezepte"`
Expected: FAIL — `Failed to resolve import "./RecipeIndex"`.

- [ ] **Step 3: Write the shared form state**

Create `src/app/projects/[projectId]/rezepte/formState.ts`:

```ts
/**
 * The result shape EVERY recipe Server Action returns — the index screen's create, and (Task 11)
 * the detail screen's rename, line-add, line-edit and line-remove.
 *
 * Why the actions return state instead of throwing: the collision error („Ein Rezept mit diesem
 * Namen existiert bereits") has to land inline on the field that caused it, and a thrown error on a
 * Server Action produces Next.js's error overlay. Returning state is what React 19's useActionState
 * consumes — the convention the Katalog screen established (see katalog/formState.ts).
 *
 * One shared shape across both screens keeps every useActionState hook identically typed; each
 * action simply leaves the fields it has no answer for at their idle values.
 */
export type RecipeFormState = {
  /** German inline error from the last attempt, or null. */
  error: string | null;
  /** True after an action SUCCEEDED — the create field closes on it. Distinct from `error === null`,
   *  because the idle state has no error either. */
  ok: boolean;
  /** Id of the recipe the result belongs to, so a stale error can never be painted onto a different
   *  recipe after the user navigates. Also carries a freshly created recipe's id. */
  recipeId: string | null;
};

/** The initial value every useActionState hook starts from. */
export const RECIPE_FORM_IDLE: RecipeFormState = { error: null, ok: false, recipeId: null };
```

- [ ] **Step 4: Write the index component**

Create `src/app/projects/[projectId]/rezepte/RecipeIndex.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldError } from "@/components/ui/FieldError";
import { Icon } from "@/components/ui/Icon";
import { RowLink } from "@/components/ui/RowLink";
import { TextField } from "@/components/ui/TextField";
import { formatRecipeArticleCount } from "@/lib/format/plural";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { RecipeSummary } from "@/lib/recipes/recipes";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "./formState";
import styles from "./RecipeIndex.module.css";

type RecipeIndexProps = {
  projectId: string;
  recipes: RecipeSummary[];
  /** Composed by the page from the project — never re-derived here (spec §4). */
  labels: RecipeLabels;
  createAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: RecipeFormState;
};

/**
 * The recipe index (spec §5): one row per recipe, plus the create control.
 *
 * Why the create control is a button that REVEALS a field rather than a permanently visible form:
 * the screen's job is browsing, and a name field sitting above the list every time you open it is
 * the kind of clutter the design's empty-state-first approach avoids. The same shape the Katalog
 * screen uses for „Neuen Artikel anlegen…".
 *
 * Client component only because of that open/closed state and useActionState — the DATA is
 * server-owned and arrives as props, so a rename elsewhere shows up through revalidation.
 */
export function RecipeIndex({
  projectId,
  recipes,
  labels,
  createAction,
  initialState = RECIPE_FORM_IDLE,
}: RecipeIndexProps) {
  const [state, formAction, pending] = useActionState(createAction, initialState);
  const [creating, setCreating] = useState(false);

  // Close the field once the server confirms. Doing it on `ok` rather than on submit means a
  // rejected name (a duplicate) keeps the field open with the text still in it.
  useEffect(() => {
    if (state.ok) setCreating(false);
  }, [state.ok]);

  return (
    <div className={styles.screen}>
      {recipes.length === 0 && !creating ? (
        <EmptyState
          icon={<Icon icon={BookOpen} size={28} />}
          title={`Noch keine ${labels.plural}`}
          description={`Lege ${labels.plural} aus Artikeln an, die du später mit einer Anzahl auf eine Liste legst.`}
        />
      ) : (
        <ul className={styles.rows}>
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <RowLink
                href={`/projects/${projectId}/rezepte/${recipe.id}`}
                title={recipe.name}
                meta={formatRecipeArticleCount(recipe.itemCount)}
              />
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <form action={formAction} className={styles.createForm}>
          <TextField
            label="Name"
            aria-label="Name"
            name="name"
            fieldSize="sm"
            placeholder={labels.singular}
            autoFocus
          />
          {state.error ? <FieldError>{state.error}</FieldError> : null}
          <div className={styles.createButtons}>
            <Button type="submit" disabled={pending}>
              Anlegen
            </Button>
            {/* "text" is this project's lightest button weight; there is no "ghost" variant. */}
            <Button type="button" variant="text" onClick={() => setCreating(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" onClick={() => setCreating(true)}>
          {/* Button takes no icon slot — it spreads native button props and renders children, so
              the glyph simply goes inside. labels.newOne is „Neues Rezept" / „Neues Set":
              composed, never hardcoded (spec §4). */}
          <Icon icon={Plus} size={16} />
          {labels.newOne}
        </Button>
      )}
    </div>
  );
}
```

`Button` spreads native button props and has the variants `primary | secondary | text | danger` — no icon slot, no `ghost`. `EmptyState` REQUIRES an `icon` and takes `title` + `description` as plain strings. Both are used correctly above; do not invent props.

Create `RecipeIndex.module.css`: `.screen` a column flex with `gap: var(--space-4)`, `.rows` a reset list (`list-style:none; margin:0; padding:0`) with `gap: var(--space-2)`, `.createForm` a column flex, `.createButtons` a row with `gap: var(--space-2)`.

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npm test -- "src/app/projects/[projectId]/rezepte"`
Expected: PASS.

- [ ] **Step 6: Write the page**

Create `src/app/projects/[projectId]/rezepte/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { getProjectNav } from "@/lib/projects/nav";
import { recipeLabels } from "@/lib/recipes/labels";
import { createRecipe, listRecipes } from "@/lib/recipes/recipes";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { RecipeIndex } from "./RecipeIndex";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "./formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The recipes index screen (spec §5). MEMBER-LEVEL: recipes are project content like lists,
 * favourites and the catalog — every member cooks. Only the SETTINGS that turn the feature on are
 * owner-only.
 *
 * Two different "no" answers on purpose:
 *  - not a member -> redirect to /projects, because they must not learn the project exists;
 *  - feature off  -> notFound(), because the project exists and this screen does not. The nav is a
 *    convenience; the ROUTE is the gate (spec §5), and it re-checks on every render and every
 *    action — which is what makes "someone switched it off while your sheet was open" safe (§9).
 */
export default async function RecipesPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");
  if (!nav.recipesEnabled) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipeLabelSingular: true, recipeLabelPlural: true },
  });
  if (!project) redirect("/projects");
  const labels = recipeLabels(project);

  const recipes = await listRecipes(prisma, projectId);

  /**
   * Creates an empty recipe. Re-derives identity and re-checks BOTH membership and the feature
   * flag: a Server Action is an individually addressable POST endpoint, so a crafted request could
   * reach it without this page ever rendering — including after someone switched the feature off.
   */
  async function createRecipeAction(
    _prev: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const settings = await prisma.project.findUnique({
      where: { id: projectId },
      select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
    });
    if (!settings?.recipesEnabled) notFound();

    const name = String(formData.get("name") ?? "").trim();
    // Empty submission: silent no-op, the convention every other form here uses.
    if (!name) return RECIPE_FORM_IDLE;

    try {
      const created = await createRecipe(prisma, { projectId, name }, recipeLabels(settings));
      revalidatePath(`/projects/${projectId}/rezepte`);
      return { error: null, ok: true, recipeId: created.id };
    } catch (error) {
      // Only ApiError carries user-facing German copy; anything else is a real bug (re-thrown).
      if (error instanceof ApiError) return { error: error.message, ok: false, recipeId: null };
      throw error;
    }
  }

  return (
    <>
      <PageHeader title={labels.plural} leading={<DrawerTrigger />} />
      <main className={styles.content}>
        <RecipeIndex
          projectId={projectId}
          recipes={recipes}
          labels={labels}
          createAction={createRecipeAction}
        />
      </main>
    </>
  );
}
```

Create `page.module.css` mirroring the Katalog screen's `.content` rule.

- [ ] **Step 7: Verify types and lint**

Run: `npm run lint && npm run build`
Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add "src/app/projects/[projectId]/rezepte"
git commit -m "feat(recipes): add the recipes index screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: The recipe detail screen `/rezepte/[recipeId]`

**Files:**
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/page.tsx`
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/page.module.css`
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeDetail.tsx`
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeDetail.module.css`
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeDetail.test.tsx`
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeMenu.tsx`
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeMenu.module.css`

**Interfaces:**
- Consumes: `getRecipeWithItems`, `renameRecipe`, `deleteRecipe`, `addRecipeItemFromRow` (Tasks 3–5), `recipeLabels`, `RecipeFormState` (Task 10), `formatQuantityLabel` (`src/lib/format/quantity.ts`), `buildAutocomplete` + `useCatalogSearch` + `Autocomplete`, `ConfirmSheet`, `InlineEdit`, `Icon`.
- Produces: `interface RecipeLine { id: string; name: string; quantity: number | null; unit: string | null }` exported from `RecipeDetail.tsx` — **Task 12's sheet takes this shape**; `RecipeTitle({ name, renameAction, labels })` with `renameAction: (name: string) => Promise<void>`; the route `/projects/[projectId]/rezepte/[recipeId]`.

- [ ] **Step 1: Write the failing component test**

Create `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeDetail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import { RecipeDetail, type RecipeLine } from "./RecipeDetail";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";

const lines: RecipeLine[] = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Hackfleisch", quantity: 500, unit: "g" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Milch", quantity: 1.5, unit: "l" },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Salz", quantity: null, unit: null },
];

const idle = async (): Promise<RecipeFormState> => RECIPE_FORM_IDLE;
const defaultLabels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

function renderDetail(overrides: Partial<Parameters<typeof RecipeDetail>[0]> = {}) {
  const props = {
    projectId: "p1",
    recipeId: "11111111-1111-4111-8111-111111111111",
    lines,
    labels: defaultLabels,
    addLineAction: idle,
    updateLineAction: idle,
    removeLineAction: idle,
    ...overrides,
  };
  return { ...render(<RecipeDetail {...props} />), props };
}

// The dropdown fetches per keystroke; jsdom has no fetch worth exercising here.
vi.mock("@/components/ui/useCatalogSearch", () => ({ useCatalogSearch: () => [] }));

describe("RecipeDetail", () => {
  it("renders each line with its German quantity label", () => {
    renderDetail();

    expect(screen.getByText("Hackfleisch")).toBeInTheDocument();
    expect(screen.getByText("500 g")).toBeInTheDocument();
    // German decimal comma (handoff §2), via formatQuantityLabel.
    expect(screen.getByText("1,5 l")).toBeInTheDocument();
  });

  it("marks an unquantified line instead of printing an empty label", () => {
    renderDetail();

    // Salz has no quantity — the design's "—" placeholder, so the column still lines up.
    const salzRow = screen.getByRole("button", { name: /Salz/ });
    expect(salzRow).toHaveTextContent("—");
  });

  it("offers the trailing add row", () => {
    renderDetail();

    expect(screen.getByLabelText("Artikel hinzufügen")).toBeInTheDocument();
  });

  it("submits the typed text to the add action", async () => {
    const user = userEvent.setup();
    const addLineAction = vi.fn(idle);
    renderDetail({ addLineAction });

    await user.type(screen.getByLabelText("Artikel hinzufügen"), "500 g Hackfleisch");
    await user.keyboard("{Enter}");

    // The SERVER parses the quantity (addRecipeItemFromRow) — the row only sends the raw text.
    expect(addLineAction).toHaveBeenCalled();
    const formData = addLineAction.mock.calls[0][1] as FormData;
    expect(formData.get("text")).toBe("500 g Hackfleisch");
  });

  it("opens the line sheet when a line is tapped", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: /Hackfleisch/ }));

    expect(screen.getByRole("dialog", { name: "Hackfleisch" })).toBeInTheDocument();
    expect(screen.getByLabelText("Menge")).toHaveValue("500");
  });

  it("shows an empty state naming the project's own wording", () => {
    renderDetail({
      lines: [],
      labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }),
    });

    expect(screen.getByText("Noch keine Artikel in diesem Set")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- "src/app/projects/[projectId]/rezepte/[recipeId]"`
Expected: FAIL — `Failed to resolve import "./RecipeDetail"`.

- [ ] **Step 3: Write the `RecipeMenu` component**

Create `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeMenu.tsx`. It is `ListMenu` (`src/app/lists/[listId]/ListMenu.tsx`) with ONE entry instead of two, so copy that file's structure verbatim — the hand-rolled dropdown, the `data-testid="menu-backdrop"` div, the `ConfirmSheet` for the destructive act — and change only what follows:

```tsx
type RecipeMenuProps = {
  /** Named in the confirmation so the user sees WHICH recipe is at stake. */
  recipeName: string;
  /** The project's own wording — „Set löschen", never a hardcoded „Rezept" (spec §4). */
  labels: RecipeLabels;
  /** Server Action, bound by the page. Member-level. */
  deleteAction: () => void | Promise<void>;
};
```

Ruling R8: there is **no „Umbenennen" entry**. `InlineEdit` has no external trigger, and the list screen already renames by tapping the title — `ListMenu` has no rename entry either, for exactly this reason. The menu holds `labels.deleteOne` only, the trigger's `aria-label` is composed as `` `${labels.singular}menü` ``, and the confirm sheet is:

```tsx
      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`${labels.deleteOne}: ${recipeName}`}
        options={[
          {
            label: `${labels.singular} endgültig löschen`,
            // Deleting a recipe is deliberately unguarded (spec §5) — nothing references it, and a
            // list it was applied to keeps its entries. Say so, so the confirm is not scarier than
            // the act: the ONLY thing lost is the recipe itself.
            description:
              "Bereits angelegte Listen bleiben unverändert. Das lässt sich nicht rückgängig machen.",
            tone: "danger",
            onSelect: () => {
              void deleteAction();
              setConfirmOpen(false);
            },
          },
        ]}
      />
```

Copy `ListMenu.module.css` to `RecipeMenu.module.css` unchanged.

- [ ] **Step 4: Write the detail component**

Create `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeDetail.tsx`:

```tsx
"use client";

import { useActionState, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldError } from "@/components/ui/FieldError";
import { Icon } from "@/components/ui/Icon";
import { useCatalogSearch } from "@/components/ui/useCatalogSearch";
import { buildAutocomplete } from "@/lib/catalog/autocomplete";
import { formatQuantityLabel } from "@/lib/format/quantity";
import type { RecipeLabels } from "@/lib/recipes/labels";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";
import { RecipeItemSheet } from "./RecipeItemSheet";
import styles from "./RecipeDetail.module.css";

/**
 * One recipe line as this screen renders it — the article's name flattened onto the line, because
 * a RecipeItem has no name of its own (the name lives on the catalog article).
 *
 * Exported because RecipeItemSheet takes exactly this shape: the sheet edits a line, and inventing
 * a second near-identical type for it is how the two drift apart.
 */
export interface RecipeLine {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

type RecipeDetailProps = {
  projectId: string;
  recipeId: string;
  lines: RecipeLine[];
  labels: RecipeLabels;
  /** All three are Server Actions bound by the page; all three are member-level. */
  addLineAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  updateLineAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  removeLineAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  initialState?: RecipeFormState;
};

/**
 * The recipe's lines plus the trailing „Artikel hinzufügen…" row (spec §5).
 *
 * REUSE IS THE POINT, and it is literal: the trailing row is the list screen's row minus the
 * category chips — the same `Autocomplete`, the same `/api/projects/[id]/catalog` endpoint through
 * `useCatalogSearch`, the same `buildAutocomplete`. The quantity split is NOT done here: the row
 * posts the raw text and `addRecipeItemFromRow` (Task 5) parses it server-side, which is what keeps
 * "500 g Hackfleisch" splitting identically on a list and in a recipe.
 *
 * What is deliberately absent compared with the list screen: category chips (a recipe line has no
 * category — it inherits the article's at apply time), checkboxes (nothing is "done" in a recipe),
 * swipe-to-delete (removal lives in the line sheet, where the line is already open) and the sync
 * poller (recipes are configuration and are not in the delta sync, spec §5).
 */
export function RecipeDetail({
  projectId,
  recipeId,
  lines,
  labels,
  addLineAction,
  updateLineAction,
  removeLineAction,
  initialState = RECIPE_FORM_IDLE,
}: RecipeDetailProps) {
  const [addState, addFormAction] = useActionState(addLineAction, initialState);
  const [draft, setDraft] = useState("");
  // Which line's sheet is open, by id — not the line object, so a revalidated render shows fresh
  // values in an open sheet instead of the snapshot that was captured when it opened.
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  // Keeps the cursor in the trailing row after a submit ("Enter legt an und bleibt im Feld").
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const articles = useCatalogSearch(projectId, draft);
  const { options, createName } = buildAutocomplete(articles, draft);

  const openLine = lines.find((line) => line.id === openLineId) ?? null;

  /** Submits the trailing row's text and clears it, leaving focus where it was. */
  const submitDraft = (name: string) => {
    const text = name.trim();
    if (!text) return;
    const formData = new FormData();
    formData.set("text", text);
    // requestSubmit would re-read the input, which we are about to clear — so the action is
    // invoked directly with the text that was actually typed.
    void addFormAction(formData);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className={styles.screen}>
      {lines.length === 0 ? (
        <EmptyState
          // `icon` is REQUIRED by the primitive — there is no iconless variant.
          icon={<Icon icon={BookOpen} size={28} />}
          title={`Noch keine Artikel in diesem ${labels.singular}`}
          description="Tippe unten einen Artikel ein — „500 g Hackfleisch" wird direkt in Menge und Einheit zerlegt."
        />
      ) : (
        <ul className={styles.lines}>
          {lines.map((line) => (
            <li key={line.id}>
              {/* A button, not a link: tapping a line opens a sheet on this screen. */}
              <button
                type="button"
                className={styles.line}
                data-line-id={line.id}
                onClick={() => setOpenLineId(line.id)}
              >
                <span className={styles.quantity}>
                  {/* "—" rather than "": an unquantified line (Salz) must still occupy the column,
                      or the names stop lining up down the list. */}
                  {formatQuantityLabel(line.quantity, line.unit) || "—"}
                </span>
                <span className={styles.name}>{line.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {addState.error ? <FieldError>{addState.error}</FieldError> : null}

      <form ref={formRef} action={addFormAction} className={styles.addRow}>
        <Autocomplete
          value={draft}
          onChange={setDraft}
          onSubmit={submitDraft}
          options={options}
          createName={createName}
          placeholder="Artikel hinzufügen…"
          inputLabel="Artikel hinzufügen"
          inputRef={inputRef}
        />
      </form>

      {openLine ? (
        <RecipeItemSheet
          // key={line.id} is the React idiom for "re-seed state from props on identity change" —
          // the same contract EntrySheet documents.
          key={openLine.id}
          line={openLine}
          recipeId={recipeId}
          onClose={() => setOpenLineId(null)}
          updateAction={updateLineAction}
          removeAction={removeLineAction}
        />
      ) : null}
    </div>
  );
}
```

Create `RecipeDetail.module.css`: `.screen` a column flex, `.lines` a reset list, `.line` a full-width row button (`display:grid; grid-template-columns: 72px 1fr; gap: var(--space-3); text-align:left; min-height:44px`) using the same surface and border tokens as `EntryRow.module.css`, `.quantity` in the muted token, `.addRow` with top spacing.

**Note for the implementer:** `Autocomplete` is controlled and calls `onSubmit` on Enter and on a dropdown tap; it is not a native form control. The `<form action={…}>` wrapper exists only so `useActionState`'s pending state is available — the actual submit goes through `submitDraft`. If invoking `addFormAction(formData)` directly is rejected by the installed React version, replace it with a `<input type="hidden" name="text">` kept in sync with `draft` plus `formRef.current?.requestSubmit()`, and clear the draft in a `useEffect` on `addState.ok`. Verify which one the project's React accepts before writing the test expectations.

- [ ] **Step 5: Run the component test (it will still fail on the missing sheet)**

Run: `npm test -- "src/app/projects/[projectId]/rezepte/[recipeId]"`
Expected: FAIL — `Failed to resolve import "./RecipeItemSheet"`. That import is Task 12; stop here and write the page first, then come back after Task 12 to see this test pass.

- [ ] **Step 6: Write the page**

Create `src/app/projects/[projectId]/rezepte/[recipeId]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { getProjectNav } from "@/lib/projects/nav";
import { recipeLabels, type RecipeLabels } from "@/lib/recipes/labels";
import {
  addRecipeItemFromRow,
  deleteRecipe,
  getRecipeWithItems,
  removeRecipeItem,
  renameRecipe,
  updateRecipeItem,
} from "@/lib/recipes/recipes";
import { parseGermanDecimal } from "@/lib/format/quantity";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackLink } from "@/components/ui/BackLink";
import { RecipeDetail, type RecipeLine } from "./RecipeDetail";
import { RecipeTitle } from "./RecipeTitle";
import { RecipeMenu } from "./RecipeMenu";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string; recipeId: string }> };

/**
 * One recipe: its lines, the trailing add row, and ⋮ Umbenennen / Löschen (spec §5).
 *
 * Member-level, like the index. The feature flag is re-checked here AND inside every action, which
 * is what makes spec §9's "feature turned off while a sheet is open" a clean 404 rather than a
 * write into a feature nobody can see any more.
 */
export default async function RecipeDetailPage({ params }: Props) {
  const { projectId, recipeId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");
  if (!nav.recipesEnabled) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipeLabelSingular: true, recipeLabelPlural: true },
  });
  if (!project) redirect("/projects");
  const labels = recipeLabels(project);

  const recipe = await getRecipeWithItems(prisma, projectId, recipeId);
  // getRecipeWithItems already scopes by project, so a foreign id is indistinguishable from a
  // missing one — which is exactly the existence-hiding this 404 wants.
  if (!recipe) notFound();

  // Flatten the article name onto each line: a RecipeItem has no name column (spec §2).
  const lines: RecipeLine[] = recipe.items.map((item) => ({
    id: item.id,
    name: item.catalogItem.name,
    quantity: item.quantity,
    unit: item.unit,
  }));

  /**
   * The guard every action below shares: identity, membership, and the feature flag — because a
   * Server Action is an individually addressable POST endpoint that this page's render never gated.
   * Returns the project's labels so the cores can phrase their errors (ruling R4).
   */
  async function guard(): Promise<RecipeLabels> {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const settings = await prisma.project.findUnique({
      where: { id: projectId },
      select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
    });
    if (!settings?.recipesEnabled) notFound();
    return recipeLabels(settings);
  }

  /** Maps a thrown domain error onto the inline form state; a non-ApiError is a real bug. */
  function toFormState(error: unknown): RecipeFormState {
    if (error instanceof ApiError) return { error: error.message, ok: false, recipeId };
    throw error;
  }

  async function addLineAction(
    _prev: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    "use server";
    const actionLabels = await guard();
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return RECIPE_FORM_IDLE; // empty submission: silent no-op

    try {
      // The SERVER parses "500 g Hackfleisch" — the row only ever sends raw text, so the split
      // rule lives in exactly one place (Task 5).
      await addRecipeItemFromRow(prisma, { projectId, recipeId, text }, actionLabels);
      revalidatePath(`/projects/${projectId}/rezepte/${recipeId}`);
      return { error: null, ok: true, recipeId };
    } catch (error) {
      return toFormState(error);
    }
  }

  async function updateLineAction(
    _prev: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    "use server";
    const actionLabels = await guard();
    const recipeItemId = String(formData.get("recipeItemId") ?? "");
    if (!recipeItemId) return RECIPE_FORM_IDLE;

    try {
      await updateRecipeItem(
        prisma,
        {
          projectId,
          recipeId,
          recipeItemId,
          // parseGermanDecimal reads "0,5" and returns null for an empty field — which is how an
          // unquantified line (Salz) is produced with no special UI (spec §7). NaN travels on
          // purpose: the core answers with the German validation message.
          quantity: parseGermanDecimal(String(formData.get("quantity") ?? "")),
          unit: String(formData.get("unit") ?? "") || null,
        },
        actionLabels,
      );
      revalidatePath(`/projects/${projectId}/rezepte/${recipeId}`);
      return { error: null, ok: true, recipeId };
    } catch (error) {
      return toFormState(error);
    }
  }

  async function removeLineAction(
    _prev: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    "use server";
    const actionLabels = await guard();
    const recipeItemId = String(formData.get("recipeItemId") ?? "");
    if (!recipeItemId) return RECIPE_FORM_IDLE;

    try {
      await removeRecipeItem(prisma, { projectId, recipeId, recipeItemId }, actionLabels);
      revalidatePath(`/projects/${projectId}/rezepte/${recipeId}`);
      return { error: null, ok: true, recipeId };
    } catch (error) {
      return toFormState(error);
    }
  }

  /**
   * Rename takes a plain name and returns nothing — the shape InlineEdit expects, and the same
   * contract renameListAction uses on the list screen. It is NOT a useActionState action: the
   * inline editor has no form state to render, and a duplicate name surfaces through InlineEdit's
   * own `error` prop on the next render.
   */
  async function renameAction(name: string) {
    "use server";
    const actionLabels = await guard();
    const trimmed = name.trim();
    if (!trimmed) return; // InlineEdit already refuses an empty value; belt and braces.

    await renameRecipe(prisma, { projectId, recipeId, name: trimmed }, actionLabels);
    // The index lists this name too, so the whole subtree revalidates.
    revalidatePath(`/projects/${projectId}/rezepte`, "layout");
  }

  async function deleteAction() {
    "use server";
    const actionLabels = await guard();
    await deleteRecipe(prisma, { projectId, recipeId }, actionLabels);
    revalidatePath(`/projects/${projectId}/rezepte`, "layout");
    // There is nothing left to render here, so the user goes back to the index.
    redirect(`/projects/${projectId}/rezepte`);
  }

  return (
    <>
      <PageHeader
        // Empty title, exactly like the list screen (page.tsx:347): PageHeader's `title` is a
        // STRING, so an editable name cannot go there. The empty <h1> acts as a flex spacer and
        // the real, inline-editable name rides in `leading` next to the back arrow.
        title=""
        // A BackLink, not the drawer trigger: this screen is one level below /rezepte, and the
        // drawer is reachable from there.
        leading={
          <>
            <BackLink
              href={`/projects/${projectId}/rezepte`}
              // BackLink REQUIRES a German accessible name — composed, never hardcoded (spec §4).
              label={`Zu den ${labels.plural}`}
            />
            <RecipeTitle name={recipe.name} renameAction={renameAction} labels={labels} />
          </>
        }
        trailing={
          <RecipeMenu recipeName={recipe.name} labels={labels} deleteAction={deleteAction} />
        }
      />
      <main className={styles.content}>
        <RecipeDetail
          projectId={projectId}
          recipeId={recipeId}
          lines={lines}
          labels={labels}
          addLineAction={addLineAction}
          updateLineAction={updateLineAction}
          removeLineAction={removeLineAction}
        />
      </main>
    </>
  );
}
```

- [ ] **Step 7: Write `RecipeTitle`**

Create `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeTitle.tsx`, the direct twin of `src/app/lists/[listId]/ListTitle.tsx`:

```tsx
"use client";

import { InlineEdit } from "@/components/ui/InlineEdit";
import type { RecipeLabels } from "@/lib/recipes/labels";
import styles from "./RecipeTitle.module.css";

type RecipeTitleProps = {
  name: string;
  labels: RecipeLabels;
  /** Server Action; receives the trimmed, actually-changed name. */
  renameAction: (name: string) => Promise<void>;
};

/**
 * The recipe name in the screen header, inline-editable — the twin of ListTitle.
 *
 * Member-level like the list's name, and for the same reason: recipes are project CONTENT, and
 * every member who can reach this screen may edit it. Only the project's own name is owner-only.
 *
 * Same boundary reasoning as ListTitle: the page is a Server Component and InlineEdit needs a
 * client callback, so this thin wrapper is where "use client" starts.
 *
 * Ruling R8: tapping the title IS the rename affordance. InlineEdit exposes no way to be opened
 * from elsewhere, and ListMenu has no rename entry either — so RecipeMenu does not pretend to.
 */
export function RecipeTitle({ name, labels, renameAction }: RecipeTitleProps) {
  return (
    <span className={styles.title}>
      {/* The accessible name is composed, so a project that calls them "Sets" hears "Setname". */}
      <InlineEdit
        value={name}
        label={`${labels.singular}name`}
        onSave={(next) => renameAction(next)}
      />
    </span>
  );
}
```

Copy `src/app/lists/[listId]/ListTitle.module.css` to `RecipeTitle.module.css` unchanged.

- [ ] **Step 8: Commit (the detail test still fails until Task 12)**

```bash
git add "src/app/projects/[projectId]/rezepte/[recipeId]"
git commit -m "feat(recipes): add the recipe detail screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: `RecipeItemSheet` — Menge, Einheit and „Entfernen" for one line

**Files:**
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.tsx`
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.module.css`
- Create: `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.test.tsx`

**Interfaces:**
- Consumes: `RecipeLine` (Task 11), `RecipeFormState` (Task 10), `Sheet`, `TextField`, `Button`, `FieldError`, `formatGermanNumber`.
- Produces: the `RecipeItemSheet` component `RecipeDetail` already imports.

Ruling R1: this is a NEW component, not a flag on `EntrySheet`. It is built from the same primitives, so the two look identical, but it edits two fields instead of three and it has no category chips.

- [ ] **Step 1: Write the failing test**

Create `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeItemSheet } from "./RecipeItemSheet";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";
import type { RecipeLine } from "./RecipeDetail";

const milch: RecipeLine = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Milch",
  quantity: 1.5,
  unit: "l",
};

const idle = async (): Promise<RecipeFormState> => RECIPE_FORM_IDLE;

function renderSheet(overrides: Partial<Parameters<typeof RecipeItemSheet>[0]> = {}) {
  const props = {
    line: milch,
    recipeId: "11111111-1111-4111-8111-111111111111",
    onClose: vi.fn(),
    updateAction: idle,
    removeAction: idle,
    ...overrides,
  };
  return { ...render(<RecipeItemSheet {...props} />), props };
}

describe("RecipeItemSheet", () => {
  it("is titled with the article and seeded with the line's values", () => {
    renderSheet();

    expect(screen.getByRole("dialog", { name: "Milch" })).toBeInTheDocument();
    // German decimal comma in the field, because that is what the user will type back.
    expect(screen.getByLabelText("Menge")).toHaveValue("1,5");
    expect(screen.getByLabelText("Einheit")).toHaveValue("l");
  });

  it("has NO category field — a recipe line inherits the article's category at apply time", () => {
    renderSheet();

    expect(screen.queryByLabelText("Kategorie")).not.toBeInTheDocument();
  });

  it("seeds an unquantified line with empty fields", () => {
    renderSheet({ line: { ...milch, name: "Salz", quantity: null, unit: null } });

    expect(screen.getByLabelText("Menge")).toHaveValue("");
    expect(screen.getByLabelText("Einheit")).toHaveValue("");
  });

  it("sends the edited values, including the line id, on Fertig", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn(idle);
    renderSheet({ updateAction });

    await user.clear(screen.getByLabelText("Menge"));
    await user.type(screen.getByLabelText("Menge"), "0,5");
    await user.click(screen.getByRole("button", { name: "Fertig" }));

    const formData = updateAction.mock.calls[0][1] as FormData;
    // The raw German string travels; the SERVER calls parseGermanDecimal, so there is one parser.
    expect(formData.get("quantity")).toBe("0,5");
    expect(formData.get("recipeItemId")).toBe(milch.id);
  });

  it("clearing the quantity is how an unquantified line is produced", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn(idle);
    renderSheet({ updateAction });

    await user.clear(screen.getByLabelText("Menge"));
    await user.click(screen.getByRole("button", { name: "Fertig" }));

    const formData = updateAction.mock.calls[0][1] as FormData;
    expect(formData.get("quantity")).toBe("");
  });

  it("removes the line", async () => {
    const user = userEvent.setup();
    const removeAction = vi.fn(idle);
    renderSheet({ removeAction });

    await user.click(screen.getByRole("button", { name: "Entfernen" }));

    const formData = removeAction.mock.calls[0][1] as FormData;
    expect(formData.get("recipeItemId")).toBe(milch.id);
  });

  it("renders a German validation error inline", () => {
    renderSheet({
      initialState: { error: "Menge muss eine positive Zahl sein", ok: false, recipeId: null },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Menge muss eine positive Zahl sein");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- "src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.test.tsx"`
Expected: FAIL — `Failed to resolve import "./RecipeItemSheet"`.

- [ ] **Step 3: Write the component**

Create `src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { formatGermanNumber } from "@/lib/format/date";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";
import type { RecipeLine } from "./RecipeDetail";
import styles from "./RecipeItemSheet.module.css";

type RecipeItemSheetProps = {
  /** The line being edited. The sheet is only rendered when there is one. */
  line: RecipeLine;
  recipeId: string;
  onClose: () => void;
  /** Server Actions, bound by the page. Both are member-level. */
  updateAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  removeAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: RecipeFormState;
};

/**
 * The recipe line's detail sheet (spec §5: "the existing EntrySheet with the category field
 * removed").
 *
 * Why a separate component rather than a flag on EntrySheet (ruling R1): EntrySheet is typed
 * against `ListEntry`, emits `EntryChanges` including a category, and half its body is the category
 * chip row. A `showCategory` prop would leave one component with two mutually exclusive halves.
 * What IS shared is everything that makes them look and feel identical — `Sheet`, `TextField`,
 * `Button`, and the same German number round-trip.
 *
 * Why there is no category field at all: a recipe line has no category of its own. It inherits the
 * ARTICLE's at apply time (spec §2), so offering one here would store a value nothing ever reads.
 *
 * Why both fields are sent every time, unlike EntrySheet's careful field diff: that diff exists
 * because list entries are edited concurrently and merge per field (MVP design §4.5). A recipe is
 * configuration edited by one person at a time, with plain last-writer-wins (spec §5) — there is
 * nothing to preserve by sending less.
 */
export function RecipeItemSheet({
  line,
  recipeId,
  onClose,
  updateAction,
  removeAction,
  initialState = RECIPE_FORM_IDLE,
}: RecipeItemSheetProps) {
  const [state, saveFormAction, saving] = useActionState(updateAction, initialState);
  const [, removeFormAction, removing] = useActionState(removeAction, initialState);

  // Drafts are strings, because that is what a text input holds. Converting only on the server
  // keeps "1," mid-typing from being interpreted as a number.
  const [quantity, setQuantity] = useState(
    line.quantity === null ? "" : formatGermanNumber(line.quantity),
  );
  const [unit, setUnit] = useState(line.unit ?? "");

  // The article name is the title, exactly as on a list entry — it is what the user tapped.
  return (
    <Sheet open onClose={onClose} title={line.name}>
      <form action={saveFormAction} className={styles.fields}>
        {/* Hidden rather than a prop on the action: a Server Action reached directly must still
            say WHICH line it edits, and the page's guard scopes it to this recipe. */}
        <input type="hidden" name="recipeItemId" value={line.id} />
        <input type="hidden" name="recipeId" value={recipeId} />

        <div className={styles.quantityField}>
          <TextField
            label="Menge"
            aria-label="Menge"
            name="quantity"
            placeholder="1,5"
            // Brings up the numeric keypad on iPhone; the comma still arrives as text.
            inputMode="decimal"
            fieldSize="sm"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
        <div className={styles.unitField}>
          <TextField
            label="Einheit"
            aria-label="Einheit"
            name="unit"
            placeholder="l"
            fieldSize="sm"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          />
        </div>

        {state.error ? <FieldError>{state.error}</FieldError> : null}

        <div className={styles.actions}>
          <Button type="submit" disabled={saving}>
            Fertig
          </Button>
        </div>
      </form>

      {/* Its own form: a second submit button inside the first would post the edit as well.
          No ConfirmSheet — removing one line from a recipe is trivially redone by typing it again,
          and the list screen's entry delete has no second confirm either (Slice 12 ruling). */}
      <form action={removeFormAction} className={styles.removeForm}>
        <input type="hidden" name="recipeItemId" value={line.id} />
        <Button type="submit" variant="danger" disabled={removing}>
          Entfernen
        </Button>
      </form>
    </Sheet>
  );
}
```

Create `RecipeItemSheet.module.css` by copying `src/app/lists/[listId]/EntrySheet.module.css` and dropping the `.categoryField` rule — the two sheets must line up visually. Check `Button`'s real variant names (`danger` / `destructive` / `ghost`) in `src/components/ui/Button.tsx` and use whatever exists.

- [ ] **Step 4: Run the sheet test to verify it passes**

Run: `npm test -- "src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Run the detail test, which was blocked on this import**

Run: `npm test -- "src/app/projects/[projectId]/rezepte"`
Expected: PASS — including Task 11's `RecipeDetail.test.tsx`.

- [ ] **Step 6: Run the whole suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: everything green.

- [ ] **Step 7: Grep for hardcoded recipe wording — the review gate of this slice**

Run: `grep -rn "Rezept" src/ --include="*.ts" --include="*.tsx" | grep -v "src/lib/recipes/labels.ts" | grep -v ".test."`

Expected: **no hits.** Every German recipe string must come from `recipeLabels()`. Test files may quote the default wording as an expected value; source files may not produce it except in `labels.ts`. Fix any hit before committing.

- [ ] **Step 8: Commit**

```bash
git add "src/app/projects/[projectId]/rezepte"
git commit -m "feat(recipes): add the recipe line sheet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Manual verification, implementation review, meta-plan update

**Files:**
- Create: `docs/implementation-reviews/slice-18-recipes-core.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:**
- Consumes: everything Tasks 1–12 built.
- Produces: the slice's Definition of Done (CLAUDE.md § Implementation review) and a correct status table for the next agent.

- [ ] **Step 1: Walk the feature in the running app**

Run: `npm run dev`, then in the browser:

1. Open a project you OWN → the drawer shows „Einstellungen" and **no** recipes entry.
2. Open a project where you are a plain member → **no** „Einstellungen" entry.
3. Einstellungen → switch „Rezepte" on → Speichern → the drawer now shows „Rezepte".
4. Rename the feature to „Set" / „Sets" → Speichern → the drawer entry reads „Sets", the screen's header reads „Sets", the create button reads „Neues Set".
5. „Neues Set" → „Lasagne" → Anlegen. Create it a second time → the inline error reads „Ein Set mit diesem Namen existiert bereits".
6. Open Lasagne → type „500 g Hackfleisch" → Enter. The line reads **500 g · Hackfleisch**. Type „Salz" → the line reads **— · Salz**.
7. Type „2 l Milch", then „3 l Milch" → still ONE Milch line, now 3 l.
8. Tap a line → the sheet has Menge and Einheit and **no** Kategorie → clear Menge → Fertig → the line reads „—".
9. ⋮ → Umbenennen → „Lasagne al forno" → the index row updates too.
10. Katalog → try to delete Hackfleisch → refused with „Löschen nicht möglich — wird in 1 Set verwendet."
11. Einstellungen → switch the feature off → the drawer entry disappears; navigating to `/projects/<id>/rezepte` gives a 404. Switch it back on → Lasagne al forno is still there, wording intact.

Record anything that deviates; a deviation is a finding for the review doc, not something to paper over.

- [ ] **Step 2: Confirm the whole suite is green**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. Paste the real test count into the review doc — do not claim a number you did not see.

- [ ] **Step 3: Write the implementation review**

Create `docs/implementation-reviews/slice-18-recipes-core.md`, in English, covering the five required sections (CLAUDE.md § Implementation review):

1. **What was achieved** — recipes exist as project configuration: a per-project opt-in with the project's own wording, two new tables, a management screen, and the catalog-delete guard extended. State plainly that **applying** a recipe is Slice 19 and nothing in this slice can put a recipe on a list.
2. **Steps taken** — one short paragraph per task, with the real deviations.
3. **Core components built** — one sentence per new file: `labels.ts`, `recipes.ts`, `settings.ts`, the two screens, `RecipeItemSheet`, the `formatUsedInRecipes` / `formatRecipeArticleCount` helpers.
4. **Most important lines of code** — quote 5–10 small blocks and say why each carries weight. Strong candidates: the `@@unique([recipeId, catalogItemId])` line and `addRecipeItem`'s `upsert` (why a duplicate article corrects instead of failing); `recipeLabels`'s composition (why renaming needs no migration); the migration's `UPDATE … WHERE suggestion_rule_n = 2` (why a default change is invisible without it); the delete guard's second `count` (what the cascade would otherwise destroy); `addRecipeItemFromRow`'s escape-hatch `rawArticle` read (why „7 Zwerge Bier" must not be parsed); and the deliberate absence of catalog flow-back (ruling R5).
5. **Architecture contribution** — recipes are the first piece of project state that is deliberately OUTSIDE the operations funnel and the delta sync, and this slice is what establishes that boundary. Name the seams Slice 19 will consume: `getRecipeWithItems` (what `expandRecipe` reads), `RecipeItem.quantity === null` (the ×n invariant), and `recipeLabels` (every string the apply sheets will need).

- [ ] **Step 4: Update the meta plan's status table**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`, set the Slice 18 row to ✅ and fill in the plan filename:

```
| 18 | **Recipes: core, management, settings** | … | [2026-09-13-slice-18-recipes-core.md](2026-09-13-slice-18-recipes-core.md) | ✅ Done / verified |
```

- [ ] **Step 5: Add the progress-log entry**

Append a log entry in the maintenance section's established format. Required content: date, slice, what works and what is tested; **deviations** from this plan and why; **follow-up decisions affecting later slices**; open debt. At minimum record:

- `suggestionRuleN` is now 3 for new **and** existing projects — Slice 19's new-list sheet inherits a sparser pre-fill, which is the whole point of raising it.
- The label rule (`grep -rn "Rezept" src/` outside `labels.ts`) is a **standing** review gate for Slice 19, which adds four more surfaces that name the feature.
- Ruling R5 (no catalog flow-back from a recipe line) and ruling R1 (`RecipeItemSheet` is its own component) are decisions Slice 19 should follow, not re-open.
- Whether Slice 17 had landed when this slice was built, since the two are independent and the build order is only a preference.

- [ ] **Step 6: Prepare the next slice**

Per the maintenance guide, Slice 19 has no plan yet. Note in the log that it is the next open slice and that its plan should be created with `superpowers:writing-plans` from the same spec (§6, §7 and the ordering rule in §6 „Into a new list").

- [ ] **Step 7: Commit**

```bash
git add docs/implementation-reviews/slice-18-recipes-core.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: add the slice 18 implementation review

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Spec coverage

Checked against the recipes design with fresh eyes:

| Spec section | Covered by |
|---|---|
| §2 `Project` columns, `Recipe`, `RecipeItem` | Task 1 |
| §2 `AbsorbedEntry` | **Slice 17** — deliberately not here |
| §4 settings screen, owner-only, `recipeLabels` | Tasks 2, 7, 8 |
| §5 `/rezepte`, member-level, route re-checks the flag | Tasks 10, 11 |
| §5 drawer entry only when enabled, project's plural | Task 9 |
| §5 trailing row reuse, `parseEntryInput`, `getOrCreateCatalogItem` | Task 5, Task 11 |
| §5 `EntrySheet` minus the category field | Task 12 (ruling R1) |
| §5 `createRecipe` / `listRecipes` / `getRecipeWithItems` / rename / delete | Task 3 |
| §5 `addRecipeItem` updates instead of failing | Task 4 |
| §5 recipes outside the operations funnel and the delta sync | Global Constraints; ruling R6 |
| §5 catalog-delete guard extended to recipes | Task 6 |
| §8 `suggestionRuleN` 2 → 3 **and** the backfill | Task 1 (Steps 3, 7, 12) |
| §9 duplicate name inline | Tasks 3, 10 |
| §9 recipe gone → 404 | Task 3 (`missingMessage`), Task 11 |
| §9 feature off while a sheet is open → 404 on submit | Task 11's shared `guard()` |
| §9 catalog article used by a recipe | Task 6 |
| §10 `recipeLabels` string composition | Task 2 |
| §10 recipe CRUD incl. unique collision and the upsert | Tasks 3, 4 |
| §10 settings owner-only, recipes member-level, 404 for non-members | Tasks 8, 10, 11 |
| §10 settings form; drawer entry only when enabled | Tasks 8, 9 |

**Deliberately deferred to Slice 19** (spec §6, §7, and §10's apply/dedup/create-from-list rows): `expandRecipe`, the count stepper and its 1–99 bound, „Rezept hinzufügen" into a list, the two-step new-list sheet and its de-duplicated count, `buildRecipeFromEntries`, and the „Rezept aus Liste anlegen" loop. `recipeLabels` already exposes `addToList` and `fromList` so those surfaces inherit the wording rule for free.
