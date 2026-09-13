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
