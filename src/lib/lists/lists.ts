import type { CatalogItem, List, ListItem, ListStatus, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

// Upper bound for list names — same rationale and value as MAX_PROJECT_NAME_LENGTH (Slice 2):
// unbounded TEXT column, so the core must cap human input. Exported for transports to reference.
export const MAX_LIST_NAME_LENGTH = 200;

// Core-level name validation (defense in depth, Slice 2 convention): routes trim/check too, but
// server actions and future transports go through this same core.
function assertValidListName(name: string): void {
  if (!name.trim()) throw new ApiError(400, "Name darf nicht leer sein");
  if (name.length > MAX_LIST_NAME_LENGTH) {
    throw new ApiError(400, `Name darf höchstens ${MAX_LIST_NAME_LENGTH} Zeichen lang sein`);
  }
}

// The read shape the UI and REST detail endpoint render: a list with its items, each item carrying
// its catalog item — the entry's display NAME lives on the catalog item (article identity,
// MVP design §3.1), so items are useless for rendering without it.
export type ListWithItems = List & {
  items: (ListItem & { catalogItem: CatalogItem })[];
};

// Input for creating a list. `id` is optional: the client MAY generate the UUID (offline-prep
// convention) — e.g. Phase 2 creates lists offline and syncs them later without losing identity.
export interface CreateListInput {
  projectId: string;
  name: string;
  id?: string;
}

// Creates an active list in a project. Permission (membership) is checked by the caller via the
// guard — the core stays transport- and auth-agnostic, like the Slice 2 project core.
export async function createList(db: PrismaClient, input: CreateListInput): Promise<List> {
  assertValidListName(input.name);
  // A client-supplied id must be a well-formed UUID, or Postgres rejects it with a driver error
  // (Prisma P2023 -> fake 500). Reject malformed ids as a clean 400 instead (see validate.ts).
  if (input.id !== undefined && !isUuid(input.id)) {
    throw new ApiError(400, "Ungültige Listen-ID");
  }
  return db.list.create({
    // `id: undefined` lets the schema's @default(uuid()) generate one server-side (the fallback).
    data: { id: input.id, projectId: input.projectId, name: input.name },
  });
}

// All lists of a project, newest first: on a phone you almost always want the list you just
// created or used most recently at the top. (Slice 6 will split active vs. archived views.)
export async function listLists(db: PrismaClient, projectId: string): Promise<List[]> {
  return db.list.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
}

// Single list with its items (ordered by sortIndex = the manual order) and each item's catalog
// item, or null if it does not exist. Permission is checked by the caller (requireListAccess).
export async function getListWithItems(
  db: PrismaClient,
  listId: string,
): Promise<ListWithItems | null> {
  // Shape check first: a malformed id can never match, and must not reach the uuid column (P2023).
  if (!isUuid(listId)) return null;
  return db.list.findUnique({
    where: { id: listId },
    include: {
      items: {
        // sortIndex is the single source of ordering truth; the UI groups by category on top of it.
        orderBy: { sortIndex: "asc" },
        include: { catalogItem: true },
      },
    },
  });
}

// Renames a list. Same name rules as createList — otherwise the limit could be bypassed via rename.
export async function renameList(db: PrismaClient, listId: string, name: string): Promise<List> {
  assertValidListName(name);
  return db.list.update({ where: { id: listId }, data: { name } });
}

// Deletes a list. Its items are removed automatically by the onDelete: Cascade FK (schema, Task 1).
export async function deleteList(db: PrismaClient, listId: string): Promise<void> {
  await db.list.delete({ where: { id: listId } });
}

// Marks a list as completed (MVP design §4.6, "Abschließen"). List-level lifecycle mutation — NOT an
// entry operation — so it lives here beside renameList/deleteList, not in the operations funnel.
//
// IDEMPOTENCY (locked decision): the write is guarded by `status: "active"`, so completing an
// already-completed list changes nothing and, crucially, does NOT re-stamp completedAt. Slice 5
// orders the "last M completed lists" window by completedAt, so a re-stamp would silently reshuffle
// that window. updateMany (not update) tolerates the guarded no-match without throwing.
export async function completeList(db: PrismaClient, listId: string): Promise<List> {
  await db.list.updateMany({
    where: { id: listId, status: "active" }, // only an active list transitions (idempotent guard)
    data: { status: "completed", completedAt: new Date() },
  });
  // Return the current row whether we just completed it or it was already completed. findUniqueOrThrow
  // is safe: the caller has already resolved the list via requireListAccess, so it exists.
  return db.list.findUniqueOrThrow({ where: { id: listId } });
}

// Reopens a completed list — the "undo" of the auto-suggest prompt (MVP design §4.6, "mit Undo").
// Clears completedAt so the list leaves the archive (and, once Slice 5 ships, the statistic window)
// until it is completed again.
export async function reopenList(db: PrismaClient, listId: string): Promise<List> {
  return db.list.update({
    where: { id: listId },
    data: { status: "active", completedAt: null },
  });
}

// Pure predicate: are ALL of a list's entries checked (and is there at least one)? Drives the
// auto-suggest completion prompt (§7 "Auto-Vorschlag bei vollständig abgehakt"). Kept pure and
// synchronous — it takes just the checked flags — so the UI can call it on already-loaded items and
// it is trivially unit-testable without a DB. An EMPTY list is deliberately NOT "all checked": there
// is nothing to complete, so we must not nag the user to finish an empty list.
export function allItemsChecked(items: { checked: boolean }[]): boolean {
  return items.length > 0 && items.every((item) => item.checked);
}
