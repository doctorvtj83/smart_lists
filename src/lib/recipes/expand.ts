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
