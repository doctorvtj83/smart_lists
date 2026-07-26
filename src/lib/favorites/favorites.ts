import type { CatalogItem, Favorite, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

// The read shape the UI/REST list renders: a favorite plus its catalog item — the favorite row only
// stores ids, so it is useless for display without the article's name/defaults (article identity,
// MVP design §3.1).
export type FavoriteWithItem = Favorite & { catalogItem: CatalogItem };

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

// All favorites of a project, each with its catalog item, alphabetical by article name for a stable
// UI. Permission is checked by the caller (requireMembership).
export async function listFavorites(
  db: PrismaClient,
  projectId: string,
): Promise<FavoriteWithItem[]> {
  return db.favorite.findMany({
    where: { projectId }, // project-scoped: favorites are per-project shared memory
    include: { catalogItem: true }, // the article's name/defaults are needed to render/suggest
    // Order by the RELATED catalog item's name (Prisma supports relation ordering) — human-friendly
    // and deterministic without storing a separate sort column on the favorite.
    orderBy: { catalogItem: { name: "asc" } },
  });
}
