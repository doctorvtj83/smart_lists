import type { Membership, PrismaClient, User } from "@prisma/client";
import { normalizeEmail } from "@/lib/auth/normalize";
import { ApiError } from "@/lib/http/errors";

export interface AddMemberInput {
  projectId: string;
  email: string;
}

// Adds an existing user as a member of a project, identified by email.
// Why "existing": a Membership needs a user_id, and a User row only exists after that person's first login
// (JIT provisioning, Slice 1). Pre-login invitations would need a model change -> Phase 2.
// Idempotent: upsert means inviting an already-member is a no-op, not a duplicate/error.
export async function addMember(
  db: PrismaClient,
  input: AddMemberInput,
): Promise<Membership> {
  const email = normalizeEmail(input.email);

  // User.email is not unique (googleSub is the identity), so findFirst — practically one row per email.
  const user = await db.user.findFirst({ where: { email } });
  if (!user) {
    throw new ApiError(
      404,
      "Nutzer nicht gefunden – die Person muss sich zuerst einmal anmelden.",
    );
  }

  return db.membership.upsert({
    where: { projectId_userId: { projectId: input.projectId, userId: user.id } },
    update: {}, // already a member -> change nothing (idempotent)
    create: { projectId: input.projectId, userId: user.id, role: "member" },
  });
}

export interface RemoveMemberInput {
  projectId: string;
  userId: string;
}

// Removes a member from a project. The owner cannot be removed (you delete the project to dissolve it).
export async function removeMember(
  db: PrismaClient,
  input: RemoveMemberInput,
): Promise<void> {
  const membership = await db.membership.findUnique({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
  });
  if (!membership) throw new ApiError(404, "Mitglied nicht gefunden");
  if (membership.role === "owner") {
    throw new ApiError(403, "Der Owner kann nicht entfernt werden.");
  }
  await db.membership.delete({ where: { id: membership.id } });
}

// Lists a project's members with their user record, oldest membership first.
// The `& { user: User }` return type reflects the `include: { user: true }` so callers get typed user data.
export async function listMembers(
  db: PrismaClient,
  projectId: string,
): Promise<(Membership & { user: User })[]> {
  return db.membership.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}
