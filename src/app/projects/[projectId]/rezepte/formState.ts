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
