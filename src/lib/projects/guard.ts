import type { PrismaClient, Role } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";

/**
 * Reads the caller's role in a project, or null if they are not a member.
 *
 * Dependency injection of the db client makes this testable against the test DB.
 * This is the atomic read operation for all authorization decisions.
 *
 * Pattern: Dependency injection allows the same function to be used with the production DB
 * or a test DB, without coupling to a global database singleton.
 *
 * @param db - The Prisma client (injected for testability)
 * @param projectId - The project to check membership in
 * @param userId - The user to check the role for
 * @returns The user's role ('owner' or 'member') if they are a member, null otherwise
 */
export async function getRole(
  db: PrismaClient,
  projectId: string,
  userId: string,
): Promise<Role | null> {
  // Uses the compound unique index (projectId_userId) to do an indexed lookup
  // rather than a table scan. This is essential for performance at scale.
  // The schema.prisma defines @@unique([projectId, userId]) which Prisma exposes
  // as the composite key "projectId_userId" for findUnique().
  const membership = await db.membership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return membership ? membership.role : null;
}

/**
 * Asserts the caller is a member of a project; returns their role.
 *
 * Non-members receive a 404 error (not 403) so the API does not reveal
 * whether a project exists to users who don't have access to it.
 * This is a privacy/security pattern: avoid leaking project existence.
 *
 * Pattern: Layering authorization checks — requireMembership is the base layer
 * used by more specialized guards like requireOwner. This keeps the logic DRY
 * and ensures consistent 404 behavior for non-members across all checks.
 *
 * @param db - The Prisma client (injected for testability)
 * @param projectId - The project to check membership in
 * @param userId - The user to authenticate
 * @returns The user's role if they are a member
 * @throws ApiError(404) if the user is not a member (existence is hidden)
 */
export async function requireMembership(
  db: PrismaClient,
  projectId: string,
  userId: string,
): Promise<Role> {
  const role = await getRole(db, projectId, userId);
  if (!role) throw new ApiError(404, "Projekt nicht gefunden");
  return role;
}

/**
 * Asserts the caller is the owner of a project.
 *
 * Builds on requireMembership, so the error codes compose predictably:
 *   - non-member → 404 (propagated from requireMembership) — project doesn't exist to them
 *   - member but not owner → 403 (thrown here) — you exist but don't have permission
 *   - owner → ok, returns "owner"
 *
 * Pattern: Layering: this guard delegates to requireMembership for the basic membership
 * check, then adds an owner-specific check. This means the 404-hiding behavior is
 * inherited for free, and we only add the 403 for a member without owner role.
 *
 * @param db - The Prisma client (injected for testability)
 * @param projectId - The project to check ownership of
 * @param userId - The user to authenticate
 * @returns The user's role (always "owner" if the function returns)
 * @throws ApiError(404) if the user is not a member (non-members get 404, not 403)
 * @throws ApiError(403) if the user is a member but not the owner
 */
export async function requireOwner(
  db: PrismaClient,
  projectId: string,
  userId: string,
): Promise<Role> {
  const role = await requireMembership(db, projectId, userId);
  if (role !== "owner") throw new ApiError(403, "Nur der Owner darf das");
  return role;
}
