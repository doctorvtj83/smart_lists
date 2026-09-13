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
