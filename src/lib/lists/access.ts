import type { List, PrismaClient, Role } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { isUuid } from "@/lib/validate";

// What list-scoped callers get back: the resolved list (so they don't have to load it again) and
// the caller's role (Slice 3 doesn't branch on it — all list actions are member-level per the
// permission matrix — but Slices 6/7 consumers may).
export interface ListAccess {
  list: List;
  role: Role;
}

// The list-scoped authorization primitive: resolves a list by id and asserts the caller is a
// member of the project it belongs to. List routes only know a listId, but permission is defined
// per PROJECT (MVP design §6) — this is the bridge.
//
// Pattern: composition over duplication — this guard derives the projectId from the list row and
// delegates to the Slice 2 requireMembership, inheriting its 404-hiding behavior for non-members.
// Error order matters: unknown list -> 404, known list but non-member -> the SAME 404 wording
// class, so a stranger cannot distinguish "list doesn't exist" from "list exists but not yours".
export async function requireListAccess(
  db: PrismaClient,
  listId: string,
  userId: string,
): Promise<ListAccess> {
  // Shape check first: a malformed id from the URL must behave like a missing list (404), not
  // crash the uuid column lookup with Prisma P2023 (-> fake 500). See validate.ts.
  if (!isUuid(listId)) throw new ApiError(404, "Liste nicht gefunden");

  const list = await db.list.findUnique({ where: { id: listId } });
  if (!list) throw new ApiError(404, "Liste nicht gefunden");

  // Membership check against the list's project. Throws ApiError(404, "Projekt nicht gefunden")
  // for non-members — a 404 either way, which is exactly the existence-hiding we want.
  const role = await requireMembership(db, list.projectId, userId);
  return { list, role };
}
