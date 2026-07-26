import type { Favorite, PrismaClient } from "@prisma/client";
import { compareArticleNames } from "@/lib/catalog/sort";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

// The read shape the UI/REST list renders. The favorite row only stores ids, so it is useless for
// display without the article's name/defaults (article identity, MVP design §3.1) — but the raw
// Prisma row is the wrong thing to hand out: it also carries normalizedName (an internal identity
// key), projectId and createdAt, none of which a client needs. Projecting here follows the same
// "don't over-expose" precedent as Slice 2's MemberUser and Slice 4's CatalogSuggestion.
// The fields are field-for-field identical to SuggestedArticle ON PURPOSE: favorites are a SUBSET of
// the suggestion set, so both reads hand the UI the same article shape. The two types stay separate
// (rather than one importing the other) because that would point the favorites core at the
// suggestions core, inverting the real dependency — suggestions read favorites, never the reverse.
export interface FavoriteArticle {
  catalogItemId: string;
  name: string;
  defaultCategory: string | null;
  defaultUnit: string | null;
}

// A favorite is identified by (project, article). Both ids together are the input to add/remove —
// grouping them in one type keeps the two call sites (and the REST adapters) consistent.
export interface FavoriteRef {
  projectId: string;
  catalogItemId: string;
}

// Favorites an article for the whole project (MVP design §4.3). Idempotent by design: favoriting an
// already-favorited article returns the existing row unchanged. Permission (membership) is checked
// by the caller via the guard — the core stays transport- and auth-agnostic.
export async function addFavorite(db: PrismaClient, input: FavoriteRef): Promise<Favorite> {
  const { projectId, catalogItemId } = input;
  // Shape check first: a malformed id can never match a uuid column, and must not reach it (Prisma
  // P2023 -> fake 500). Treat it as "article not found" — the same 404 a non-project article gets.
  if (!isUuid(catalogItemId)) throw new ApiError(404, "Artikel nicht gefunden");

  // The article MUST belong to THIS project. Without this check a member could favorite another
  // project's catalog item by guessing its id (the @@unique alone would happily store it). findFirst
  // scoped by projectId is the enforcement point.
  const catalogItem = await db.catalogItem.findFirst({ where: { id: catalogItemId, projectId } });
  if (!catalogItem) throw new ApiError(404, "Artikel nicht gefunden");

  // Pattern: idempotent upsert on the compound unique (projectId, catalogItemId) — one round-trip,
  // and the DB constraint (not app logic) guarantees a single row even under concurrent adds.
  // `update: {}`: an existing favorite is returned unchanged (there is nothing to update).
  return db.favorite.upsert({
    where: { projectId_catalogItemId: { projectId, catalogItemId } },
    update: {},
    create: { projectId, catalogItemId },
  });
}

// Un-favorites an article. Idempotent: removing a favorite that isn't there is a successful no-op
// (same convention as remove_item). Scoping by projectId keeps foreign favorites untouchable.
export async function removeFavorite(db: PrismaClient, input: FavoriteRef): Promise<void> {
  const { projectId, catalogItemId } = input;
  // A malformed id can't match anything — silent no-op instead of a P2023 crash (idempotent remove).
  if (!isUuid(catalogItemId)) return;
  // deleteMany (not delete): tolerates 0 matches, so an already-removed favorite is a no-op success.
  await db.favorite.deleteMany({ where: { projectId, catalogItemId } });
}

// All favorites of a project as lean article rows, alphabetical by article name for a stable UI.
// Permission is checked by the caller (requireMembership).
export async function listFavorites(
  db: PrismaClient,
  projectId: string,
): Promise<FavoriteArticle[]> {
  const favorites = await db.favorite.findMany({
    where: { projectId }, // project-scoped: favorites are per-project shared memory
    include: { catalogItem: true }, // the article's name/defaults are needed to render/suggest
    // NOTE: no `orderBy` here on purpose. Ordering happens in JS below via compareArticleNames, so
    // this list and computeSuggestions cannot drift apart under a different database collation.
  });

  // Map to the lean article shape (drop internal columns before they cross a boundary) — same
  // mapping step searchCatalog performs for CatalogSuggestion — then sort with the shared rule.
  // Sorting AFTER the projection (not before) keeps the comparator working on plain names, which is
  // exactly the contract compareArticleNames declares.
  return favorites
    .map((favorite) => ({
      catalogItemId: favorite.catalogItemId,
      name: favorite.catalogItem.name,
      defaultCategory: favorite.catalogItem.defaultCategory,
      defaultUnit: favorite.catalogItem.defaultUnit,
    }))
    .sort((a, b) => compareArticleNames(a.name, b.name));
}
