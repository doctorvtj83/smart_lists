import type { CatalogItem, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { normalizeName } from "./normalize";

// Upper bound for article names (same rationale and value as MAX_PROJECT_NAME_LENGTH: the DB column
// is unbounded TEXT; 200 chars is generous for a human-entered article). Exported so the operations
// core and any transport reference the same limit.
export const MAX_ITEM_NAME_LENGTH = 200;

export interface GetOrCreateCatalogItemInput {
  projectId: string;
  name: string;
}

// Resolves a typed article name to THE catalog row for that article in this project — creating it
// on first use. This get-or-create is how the catalog "remembers" every article ever entered
// (MVP design §4.4): known normalized name -> reuse (identity preserved for statistics and
// autocomplete), new name -> new row.
export async function getOrCreateCatalogItem(
  db: PrismaClient,
  input: GetOrCreateCatalogItemInput,
): Promise<CatalogItem> {
  const normalizedName = normalizeName(input.name);

  // Core-level validation (defense in depth, Slice 2 convention): every transport inherits it.
  if (!normalizedName) throw new ApiError(400, "Name darf nicht leer sein");
  if (input.name.length > MAX_ITEM_NAME_LENGTH) {
    throw new ApiError(400, `Name darf höchstens ${MAX_ITEM_NAME_LENGTH} Zeichen lang sein`);
  }

  // Display name: keep the user's casing, but trim + collapse whitespace so the stored name is clean.
  const displayName = input.name.trim().replace(/\s+/g, " ");

  // Pattern: upsert on the compound unique (projectId, normalizedName) — one round-trip, and the DB
  // constraint (not application logic) guarantees a single row per article identity even under
  // concurrent adds of the same new name.
  // `update: {}`: an existing article is returned unchanged — the FIRST-typed display name wins for
  // now; updating defaults/display via entry edits is the Slice 4 flow-back, not this function.
  return db.catalogItem.upsert({
    where: { projectId_normalizedName: { projectId: input.projectId, normalizedName } },
    update: {},
    create: { projectId: input.projectId, name: displayName, normalizedName },
  });
}
