# Slice 18 final review fixes

## Important findings

- Recipe rename collisions now return the German `ApiError` message from the Server Action,
  retain it in `RecipeTitle`, and render it through `InlineEdit.error`.
- `RecipeItemSheet` now uses a column form with a dedicated Menge/Einheit field row. Validation and
  actions are row siblings, removal has an explicit layout class, and copied category CSS is gone.
- Recipe line updates and removals now close the sheet only after successful action results.
  Removal action state is retained and failed removals render a `FieldError`.

## Cheap fixes

- `ProjectShell.test.tsx` supplies `recipesEnabled`, `recipeLabelPlural`, and `isOwner`.
- `deleteCatalogArticle` documentation now explains both list and recipe delete blockers.

## Regression coverage and verification

- Added `RecipeTitle.test.tsx` for duplicate-name errors.
- Added sheet-close coverage for successful “Fertig” and inline error coverage for failed removal.
- Targeted recipe, catalog, and project-shell run: 8 files, 100 tests passed.
- Full suite: 96 files, 754 tests passed. The first attempt hit a transient Prisma advisory-lock
  timeout (`P1002`); the immediate isolated retry completed successfully.
- ESLint: 0 errors (14 pre-existing warnings in `ListBody.test.tsx`).
- `npx tsc --noEmit`: the requested `ProjectShell.test.tsx` error is fixed; the command still reports
  pre-existing incomplete mock/call-tuple types in five unrelated test files, including existing
  recipe test helpers.
