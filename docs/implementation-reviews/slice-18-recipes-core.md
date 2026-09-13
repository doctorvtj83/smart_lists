# Slice 18 — Recipes: Core, Management, and Settings

## 1. What was achieved

Slice 18 establishes recipes as opt-in project configuration and project content. Each project can
enable the feature and choose its own singular/plural wording; enabled projects gain member-level
recipe index and detail screens, while only owners can change the settings. The data layer adds
`Recipe` and `RecipeItem`, recipe lines reuse catalog article identity and quantity parsing, and the
catalog delete guard now protects articles used by recipes as well as lists.

The implemented slice is covered by the complete automated suite: `npm test` passed with **95 test
files / 751 tests**, `npm run lint` exited successfully with **0 errors / 14 inherited warnings**, and
`npm run build` completed successfully. The signed-in browser walkthrough was not executable in this
environment: the Cursor browser remained on `about:blank`, and the Playwright browser could not start
because its Chrome distribution is absent. None of the eleven UAT checks is claimed as passed; an
owner and a plain member should still perform the brief's full checklist.

This slice does **not** apply a recipe to a list. Applying, multiplying, de-duplicating, and deriving a
recipe from a completed list are Slice 19; nothing built here can put a recipe onto a list.

## 2. Steps taken

1. **Schema and migration.** Added project enablement and label columns, the `Recipe`/`RecipeItem`
   tables, their compound uniqueness rules and cascades, and changed `suggestionRuleN` from 2 to 3 for
   both new and existing projects. The branch was cut before Slice 17 landed; an accidentally generated
   Slice 17 `absorbed_entries` migration was removed immediately so this independent slice did not
   claim another slice's schema.
2. **Central wording.** Added `recipeLabels` as the single composition point for the project's chosen
   noun and every current or planned recipe phrase. Its local helper was renamed from `useLabel` to
   `resolveLabel` after ESLint correctly treated the `use*` spelling as a potential React Hook.
3. **Recipe CRUD core.** Added project-scoped list/get/create/rename/delete operations with stable UUID
   support, normalized-name uniqueness, race-safe duplicate handling, German label-aware errors, and
   `formatRecipeArticleCount`.
4. **Recipe-line core.** Added add/update/remove operations with positive nullable quantities,
   nullable units, stable ordering, project/recipe/article scoping, and an upsert that corrects a
   duplicate article's quantity rather than creating a second line.
5. **Trailing-row parser integration.** Added `addRecipeItemFromRow`, reusing Slice 15 parsing and the
   implicit catalog get-or-create path while deliberately suppressing catalog unit flow-back.
6. **Catalog delete guard.** Extended catalog read models, panel copy, and the serializable delete
   transaction with recipe-use counts plus the project's chosen feature wording; added
   `formatUsedInRecipes`.
7. **Settings core.** Added one validated atomic write for enablement and both labels, preserving the
   stored wording while the feature is disabled.
8. **Owner-only settings screen.** Added `/einstellungen`, its toggle/label form, inline validation,
   layout revalidation, and fresh owner checks inside the Server Action.
9. **Navigation.** Added the owner-only settings entry and the opt-in recipe entry to the shared
   drawer/sidebar data path; the recipe entry uses the project's plural label.
10. **Recipe index.** Added `/rezepte` with member and feature-flag guards, empty and populated states,
    recipe article counts, create-sheet flow, duplicate-name feedback, and label-composed UI.
11. **Recipe detail.** Added the member-level detail route with ordered lines, parsed trailing-row
    creation, inline rename, deletion, and fresh membership/feature checks in every Server Action.
12. **Recipe item sheet.** Added a dedicated quantity/unit sheet with removal, no category field, German
    decimal round-tripping, and component tests.

No product deviation was found by browser observation because no authenticated browser session could
be started. Automated domain and component tests cover the planned permissions, feature gates, label
composition, duplicate names, parsing/upsert behavior, edit-sheet field set, and catalog delete guard;
the integrated navigation, persistence, and 404 transitions remain human UAT.

## 3. Core components built

- **`src/lib/recipes/labels.ts`** — defines the defaults and composes every feature phrase from the
  project's singular/plural pair, so renaming is data rather than a migration.
- **`src/lib/recipes/recipes.ts`** — owns project-scoped recipe CRUD, recipe-line CRUD, parsing from the
  trailing row, ordering, uniqueness, and the deliberate boundary outside list operations.
- **`src/lib/projects/settings.ts`** — validates and atomically stores recipe enablement and both labels.
- **`src/app/projects/[projectId]/einstellungen/page.tsx` and `RecipeSettingsForm.tsx`** — provide the
  owner-only settings surface and revalidate the shared project navigation after saving.
- **`src/app/projects/[projectId]/rezepte/page.tsx` and `RecipeIndex.tsx`** — provide the guarded
  member-level recipe index, create flow, empty state, and article-count rows.
- **`src/app/projects/[projectId]/rezepte/[recipeId]/page.tsx` and `RecipeDetail.tsx`** — provide the
  guarded recipe management screen, ordered lines, trailing input, rename, and delete actions.
- **`src/app/projects/[projectId]/rezepte/[recipeId]/RecipeItemSheet.tsx`** — edits only quantity and
  unit in its own component, preserving the list sheet's different category/merge contract.
- **`formatUsedInRecipes` (`src/lib/format/plural.ts`)** — produces the label-aware catalog-delete
  reason, including the best-possible dative plural heuristic for project-chosen nouns.
- **`formatRecipeArticleCount` (`src/lib/format/plural.ts`)** — renders normal article counts while
  giving an empty recipe the intentional “Noch keine Artikel” state.

## 4. Most important lines of code

### Enforce one article line per recipe

```prisma
@@unique([recipeId, catalogItemId])
```

This database invariant removes ambiguity under multiplication and is the race-safe identity used by
the recipe-line upsert.

### Correct a duplicate article instead of failing

```ts
return db.recipeItem.upsert({
  where: { recipeId_catalogItemId: { recipeId, catalogItemId } },
  create: { recipeId, catalogItemId, quantity, unit, sortIndex },
  update: { quantity, unit },
});
```

Re-entering “Milch” means correcting its amount. The upsert keeps one line, preserves its position,
and handles concurrent additions without a pre-check race.

### Compose project-specific wording in one place

```ts
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
```

Every surface derives from two project columns. Changing “Rezept/Rezepte” to “Set/Sets” therefore
requires no migration and automatically supplies Slice 19's apply-sheet wording.

### Make the raised suggestion threshold visible on existing projects

```sql
UPDATE "projects" SET "suggestion_rule_n" = 3 WHERE "suggestion_rule_n" = 2;
```

A schema default affects only future rows. Updating rows still on the old default is what gives
existing, history-bearing projects the intended sparser pre-fill without overwriting another value.

### Protect recipe contents from catalog deletion

```ts
const recipeUses = await tx.recipeItem.count({
  where: { catalogItemId, recipe: { projectId } },
});
if (recipeUses > 0) {
  // throw the project-label-aware 409
}
```

The second guard runs inside the same serializable transaction as the list-use guard and deletion.
Without it, the foreign-key cascade would silently remove the article from every recipe.

### Preserve number-leading article identities

```ts
const parsed = rawArticle
  ? { quantity: null, unit: null, name: input.text }
  : parseEntryInput(input.text, buildUnitLookup(catalogUnits.map((row) => row.defaultUnit)));
```

The raw catalog read is the escape hatch for names such as “7 Zwerge Bier”; an established article
identity outranks the quantity heuristic.

### Keep recipe edits from changing catalog defaults

```ts
const article = await getOrCreateCatalogItem(db, { projectId, name: parsed.name });
return addRecipeItem(
  db,
  { projectId, recipeId, catalogItemId: article.id, quantity: parsed.quantity, unit: parsed.unit },
  labels,
);
```

Ruling R5 is embodied by what is absent: this path never calls `flowBackCatalogDefaults`. A
hypothetical recipe line may create/resolve an article, but it must not teach project memory a new
default unit.

### Re-check the feature for individually addressable actions

```ts
await requireMembership(prisma, projectId, s!.user.id);
const settings = await prisma.project.findUnique({
  where: { id: projectId },
  select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
});
if (!settings?.recipesEnabled) notFound();
```

The render-time guard is not authorization for a Server Action. Re-checking membership and enablement
means disabling the feature while an old sheet is open turns its later submit into a 404.

## 5. Architecture contribution

Recipes are the first project content deliberately kept **outside** the entry-operations funnel and
the cursor-based delta sync. Lists need granular, idempotent operations for collaborative editing and
future offline replay; recipes are low-frequency project configuration with ordinary database writes
and last-writer-wins fields. Establishing this boundary now prevents Slice 19 from pretending a recipe
is a hidden list or polluting list sync with configuration events.

Slice 19 consumes three explicit seams: `getRecipeWithItems` is the read that `expandRecipe` will use;
`RecipeItem.quantity === null` is the invariant that multiplication must preserve as null (“add once”,
not `count × 1`); and `recipeLabels` already supplies every apply/derive string. Slice 19 must also keep
ruling R5 (no catalog flow-back from recipe lines) and ruling R1 (`RecipeItemSheet` remains its own
component) rather than reopening those decisions.

Slice 17 was independent and had **not landed on this branch when Slice 18 was built**; it has since
landed on `main`. Slice 19 is the next open slice and is the integration point that requires both.
