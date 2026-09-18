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
