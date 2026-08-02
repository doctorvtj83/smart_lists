import type { CatalogItem, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";
import { MAX_ITEM_NAME_LENGTH } from "./catalog";
import { normalizeName } from "./normalize";
import { compareArticleNames } from "./sort";

/**
 * Catalog MANAGEMENT (Slice 10) — the explicit path.
 *
 * Why this is a second module next to catalog.ts: that file owns the *implicit*
 * catalog, where typing an entry name resolves to an article and a name nobody
 * has used before quietly becomes a row (get-or-create), and where an entry edit
 * flows category/unit back into the defaults. Here the user is looking straight
 * at the catalog, so the rules invert: a duplicate name is an ERROR rather than a
 * hit, an emptied field is an explicit "clear this default" rather than "don't
 * touch it", and deleting is a real operation with a guard. Two files keep those
 * two contracts from bleeding into each other.
 *
 * Every function takes an injected PrismaClient (the project-wide test seam) and
 * throws German ApiErrors; permission (membership) is the caller's job, exactly
 * like every other core in this codebase.
 */

/**
 * One article as the Katalog screen renders it.
 *
 * The two derived fields are the reason this read model exists at all: the screen
 * cannot decide whether to offer "Löschen" without knowing how many lists use the
 * article, and it cannot warn about the favourite side effect without isFavorite.
 * Computing both here means the client component gets a flat, render-ready array
 * and never has to ask a follow-up question.
 */
export interface CatalogArticle {
  id: string;
  name: string;
  defaultCategory: string | null;
  defaultUnit: string | null;
  /** Distinct lists (active AND completed) that contain this article. */
  usedInListCount: number;
  /** True when the project has favourited this article. */
  isFavorite: boolean;
}

/**
 * The whole catalog of a project, alphabetically, with usage and favourite flags.
 *
 * Deliberately UNCAPPED, unlike searchCatalog's `take`: this is a management
 * screen, and an article silently cut off the end of the list would be one nobody
 * could ever rename or delete. A household project's catalog is a few hundred
 * rows (the brief expects 50–300), so the whole set is cheap to read and cheap to
 * hand to the client for live filtering.
 *
 * Because there is no `take`, sorting in JS with the shared comparator is safe
 * here — the caveat in sort.ts applies only to a truncated query.
 */
export async function listCatalog(db: PrismaClient, projectId: string): Promise<CatalogArticle[]> {
  const items = await db.catalogItem.findMany({
    where: { projectId }, // project-scoped: the catalog is per-project memory
    include: {
      // Only the listId is needed — the distinct count is computed below. Prisma
      // cannot express COUNT(DISTINCT list_id) per row, and pulling the ids is
      // cheaper than one extra query per article.
      listItems: { select: { listId: true } },
      // 0 or 1 row per project by the @@unique — presence is the whole answer.
      favorites: { select: { id: true } },
    },
  });

  return items
    .map((item) => ({
      id: item.id,
      name: item.name,
      defaultCategory: item.defaultCategory,
      defaultUnit: item.defaultUnit,
      // A Set is the distinct: the same article twice on one list is one list.
      usedInListCount: new Set(item.listItems.map((listItem) => listItem.listId)).size,
      isFavorite: item.favorites.length > 0,
    }))
    // Sort AFTER the projection so the comparator works on plain names — the
    // contract compareArticleNames declares (same order of operations as listFavorites).
    .sort((a, b) => compareArticleNames(a.name, b.name));
}

/**
 * The one German sentence for a normalized-name collision, quoted verbatim from
 * the design (brief § 6.8, handoff § 8). Exported so the screen's tests and the
 * core agree on the wording instead of duplicating the string.
 */
export const DUPLICATE_ARTICLE_MESSAGE = "Artikel existiert bereits";

/** Message + limit shared by create and update, so both validate identically. */
function assertValidArticleName(name: string): string {
  const normalizedName = normalizeName(name);
  if (!normalizedName) throw new ApiError(400, "Name darf nicht leer sein");
  if (name.length > MAX_ITEM_NAME_LENGTH) {
    throw new ApiError(400, `Name darf höchstens ${MAX_ITEM_NAME_LENGTH} Zeichen lang sein`);
  }
  return normalizedName;
}

/** Display name as it is stored: user's casing, trimmed, inner whitespace collapsed. */
function toDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Turns Prisma's unique-constraint violation into the same 409 the pre-check
 * throws. Why both: the pre-check gives the nice error in the normal case, but
 * two members creating the same article in the same second would slip past it —
 * the DB constraint is the real guarantee, and P2002 is how it announces itself.
 */
function rethrowAsDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError(409, DUPLICATE_ARTICLE_MESSAGE);
  }
  throw error;
}

export interface CreateCatalogArticleInput {
  projectId: string;
  name: string;
}

/**
 * Creates an article directly from the Katalog screen's „Neuen Artikel anlegen…" row.
 *
 * Contrast with getOrCreateCatalogItem (catalog.ts), which is the implicit path
 * and deliberately returns the existing row for a known name: there the user was
 * typing a list entry and any article that matches is the right answer. Here the
 * user asked for a NEW article, so a known name is a 409 — otherwise the screen
 * would appear to do nothing.
 */
export async function createCatalogArticle(
  db: PrismaClient,
  input: CreateCatalogArticleInput,
): Promise<CatalogItem> {
  const normalizedName = assertValidArticleName(input.name);

  // Pre-check for the friendly error. The compound unique is what actually
  // guarantees uniqueness — see rethrowAsDuplicate for the concurrent case.
  const existing = await db.catalogItem.findUnique({
    where: { projectId_normalizedName: { projectId: input.projectId, normalizedName } },
  });
  if (existing) throw new ApiError(409, DUPLICATE_ARTICLE_MESSAGE);

  try {
    return await db.catalogItem.create({
      data: { projectId: input.projectId, name: toDisplayName(input.name), normalizedName },
    });
  } catch (error) {
    rethrowAsDuplicate(error);
  }
}

/**
 * Normalizes a default coming from a form field. An empty or whitespace-only
 * string means "cleared" (null), because that is what an emptied input means on
 * a screen that shows the current value.
 */
function toDefaultValue(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export interface UpdateCatalogArticleInput {
  projectId: string;
  catalogItemId: string;
  name: string;
  category: string | null;
  unit: string | null;
}

/**
 * Saves the edit panel: rename plus both defaults, in ONE write.
 *
 * Why one function and not rename + setDefaults: the design's panel has a single
 * „Speichern". Two calls would mean the defaults could land while the rename
 * bounces off a collision, leaving the user with a half-applied edit and an error
 * message. Validating first and writing once makes that impossible.
 *
 * IMPORTANT: this CAN clear a default (see toDefaultValue), which is the exact
 * opposite of flowBackCatalogDefaults. Both are correct: there the null came from
 * an entry the user cleared locally and must not wipe shared memory; here the
 * user emptied the catalog's own field while looking at it.
 */
export async function updateCatalogArticle(
  db: PrismaClient,
  input: UpdateCatalogArticleInput,
): Promise<CatalogItem> {
  const { projectId, catalogItemId } = input;
  // Shape check first: a malformed id can never match a uuid column, and Prisma
  // would throw P2023 (a fake 500) instead of returning null. 404 = "not yours".
  if (!isUuid(catalogItemId)) throw new ApiError(404, "Artikel nicht gefunden");

  const normalizedName = assertValidArticleName(input.name);

  // findFirst scoped by projectId is the enforcement point: an article id from
  // another project must be indistinguishable from a non-existent one.
  const article = await db.catalogItem.findFirst({ where: { id: catalogItemId, projectId } });
  if (!article) throw new ApiError(404, "Artikel nicht gefunden");

  // Only a name that resolves to a DIFFERENT identity can collide. Skipping the
  // query when the normalized name is unchanged is what makes „milch" → „Milch"
  // (a pure display-name fix) work instead of 409-ing against itself.
  if (normalizedName !== article.normalizedName) {
    const collision = await db.catalogItem.findUnique({
      where: { projectId_normalizedName: { projectId, normalizedName } },
    });
    if (collision) throw new ApiError(409, DUPLICATE_ARTICLE_MESSAGE);
  }

  try {
    return await db.catalogItem.update({
      where: { id: catalogItemId },
      data: {
        name: toDisplayName(input.name),
        normalizedName,
        defaultCategory: toDefaultValue(input.category),
        defaultUnit: toDefaultValue(input.unit),
      },
    });
  } catch (error) {
    // Concurrent rename onto the same target name — the unique index catches it.
    rethrowAsDuplicate(error);
  }
}
