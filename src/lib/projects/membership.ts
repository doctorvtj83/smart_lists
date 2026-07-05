import type { Membership, PrismaClient, User } from "@prisma/client";
import { normalizeEmail } from "@/lib/auth/normalize";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

// Upper bound for email input. 254 chars is the practical maximum length of an email address
// (RFC 5321 path limit); anything longer is garbage input and must not reach the DB query.
export const MAX_EMAIL_LENGTH = 254;

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

  // Length guard before querying: unbounded input must not reach the DB (see MAX_EMAIL_LENGTH).
  if (email.length > MAX_EMAIL_LENGTH) {
    throw new ApiError(400, "E-Mail-Adresse ist zu lang");
  }

  // User.email is not unique (googleSub is the identity), so findFirst — practically one row per email.
  // orderBy makes the pick deterministic if two accounts ever share an email: the oldest account
  // wins. Without it, Postgres returns rows in arbitrary order and the invite could bind randomly.
  const user = await db.user.findFirst({ where: { email }, orderBy: { createdAt: "asc" } });
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
  // The target userId comes straight from the URL segment. A malformed (non-UUID) id can never
  // match a membership — but Postgres would reject it with a driver error (Prisma P2023), which
  // our error mapper reports as a 500. Treat it as "membership not found" instead (see validate.ts).
  if (!isUuid(input.projectId) || !isUuid(input.userId)) {
    throw new ApiError(404, "Mitglied nicht gefunden");
  }

  const membership = await db.membership.findUnique({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
  });
  if (!membership) throw new ApiError(404, "Mitglied nicht gefunden");
  if (membership.role === "owner") {
    throw new ApiError(403, "Der Owner kann nicht entfernt werden.");
  }
  await db.membership.delete({ where: { id: membership.id } });
}

// The user fields that are safe to show to fellow project members. Deliberately NOT the full User:
// googleSub (the OAuth identity) and isAdmin (the allowlist-admin flag) are internal and must never
// leave the server — this list is serialized verbatim by GET /api/projects/:id/members.
export type MemberUser = Pick<User, "id" | "email" | "displayName">;

// Lists a project's members with their user record, oldest membership first.
// The `& { user: MemberUser }` return type reflects the nested `select` below so callers get typed
// user data limited to the safe fields (principle of least exposure at the data-access layer,
// so every transport — REST or UI — inherits the restriction automatically).
export async function listMembers(
  db: PrismaClient,
  projectId: string,
): Promise<(Membership & { user: MemberUser })[]> {
  return db.membership.findMany({
    where: { projectId },
    // Nested select instead of `user: true`: only expose what members are allowed to see.
    include: { user: { select: { id: true, email: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
}
