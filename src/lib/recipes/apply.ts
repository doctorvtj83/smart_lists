import { randomUUID } from "node:crypto";
import type { List, PrismaClient } from "@prisma/client";
import { normalizeName } from "@/lib/catalog/normalize";
import { ApiError } from "@/lib/http/errors";
import { createList, type CreateListInput } from "@/lib/lists/lists";
import { applyOperation, applyOperationDetailed } from "@/lib/lists/operations";
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
 * still refuses to merge that mixed pair into a quantified recipe row. Pre-filling first would
 * therefore leave the recipe's „3 l Milch“ and the pre-fill's bare „Milch“ side by side forever.
 * A recipe satisfies the wish more precisely, so the suggestion has nothing left to contribute.
 *
 * WHY THE SUBTRACTION HAPPENS HERE AND NOT IN THE FUNNEL: the mixed case (unquantified wish vs.
 * quantified row) is still two rows under D1. Skipping the suggestion here is a caller holding
 * both sets and choosing what to send. Unquantified+unquantified now merges in the funnel
 * (presence merge) — that is Check 5's Salz, a different pair.
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
