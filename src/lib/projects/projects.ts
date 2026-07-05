import type { PrismaClient, Project } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";

// Upper bound for project names. The DB column is unbounded TEXT, so without this check a client
// could store megabytes in a single name. 200 chars is generous for a human-entered list name.
// Exported so transports (routes/UI) can reference the same limit instead of hardcoding their own.
export const MAX_PROJECT_NAME_LENGTH = 200;

// Validates a project name at the core level (defense in depth: routes trim/check too, but server
// actions and any future transport go through the same core, so the rule is enforced exactly once).
// Throws ApiError(400) with a German user-facing message, consistent with the route-level checks.
function assertValidProjectName(name: string): void {
  if (!name.trim()) throw new ApiError(400, "Name darf nicht leer sein");
  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    throw new ApiError(400, `Name darf höchstens ${MAX_PROJECT_NAME_LENGTH} Zeichen lang sein`);
  }
}

// Input for creating a project. ownerId comes from the trusted session, never from the request body.
export interface CreateProjectInput {
  name: string;
  ownerId: string;
}

// Creates a project AND the creator's owner membership in one transaction.
// Why a transaction: a project without its owner membership would be unreachable (no one could pass the
// permission guard). $transaction guarantees both rows are written or neither is.
export async function createProject(
  db: PrismaClient,
  input: CreateProjectInput,
): Promise<Project> {
  // Validate before opening the transaction — no point acquiring a DB transaction for bad input.
  assertValidProjectName(input.name);
  return db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { name: input.name, ownerId: input.ownerId },
    });
    await tx.membership.create({
      data: { projectId: project.id, userId: input.ownerId, role: "owner" },
    });
    return project;
  });
}

// All projects the user belongs to (any role), oldest first for a stable list order.
// `memberships: { some: { userId } }` = "projects having at least one membership row for this user".
export async function listProjectsForUser(
  db: PrismaClient,
  userId: string,
): Promise<Project[]> {
  return db.project.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: "asc" },
  });
}

// Single project by id, or null if it does not exist. Permission is checked by the caller via the guard.
export async function getProject(
  db: PrismaClient,
  projectId: string,
): Promise<Project | null> {
  return db.project.findUnique({ where: { id: projectId } });
}

// Renames a project. Owner-only; the caller enforces that via requireOwner before calling this.
export async function renameProject(
  db: PrismaClient,
  projectId: string,
  name: string,
): Promise<Project> {
  // Same name rules as createProject — otherwise the length limit could be bypassed via rename.
  assertValidProjectName(name);
  return db.project.update({ where: { id: projectId }, data: { name } });
}

// Deletes a project. Memberships are removed automatically by the onDelete: Cascade FK (schema, Task 1).
export async function deleteProject(
  db: PrismaClient,
  projectId: string,
): Promise<void> {
  await db.project.delete({ where: { id: projectId } });
}
