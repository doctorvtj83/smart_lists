import type { CatalogItem, PrismaClient, Recipe, RecipeItem } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { normalizeName } from "@/lib/catalog/normalize";
import { compareArticleNames } from "@/lib/catalog/sort";
import { ApiError } from "@/lib/http/errors";
import { buildUnitLookup, parseEntryInput } from "@/lib/lists/parseEntryInput";
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
 * pre-fill ("Milch, Eier und Butter come from the chosen recipes already…") and show a DE-DUPLICATED
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
