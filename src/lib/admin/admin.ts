import type { AllowlistEntry, PrismaClient } from "@prisma/client";
import { normalizeEmail } from "@/lib/auth/normalize";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";
// Reuse, do not redefine: 254 is the RFC 5321 practical maximum and is already the app's one
// email-length rule (Slice 2). A second copy here would be a second thing to keep in sync.
import { MAX_EMAIL_LENGTH } from "@/lib/projects/membership";

// This module is the ONLY writer of `allowlist_entries` and of `users.is_admin`.
// It deliberately does not touch src/lib/auth/allowlist.ts: that module is the READ gate on the
// login path (isEmailAllowed + provisionUser), and writing the list is a different responsibility
// with different callers (an admin in the UI, not the OAuth callback).
//
// Pattern: dependency injection of the PrismaClient (first parameter), exactly like membership.ts —
// production passes the singleton from @/lib/db, tests pass a client bound to the Neon test branch.

// Minimal shape check for an invited email. Deliberately not an RFC-complete validator (those are
// famously wrong in both directions): the real verification is that Google authenticates that
// address on login. This only rejects input that is obviously not an address, so a typo becomes a
// visible error instead of a dead allowlist row nobody can ever use.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Counts the admins. Used by the lockout invariants below, never exported: "how many admins are
// there" is not a question any caller outside this module should need to ask.
async function countAdmins(db: PrismaClient): Promise<number> {
  return db.user.count({ where: { isAdmin: true } });
}

// The user fields the admin page may see. Deliberately NOT the full User: googleSub (the OAuth
// identity) must never leave the server — the same least-exposure rule as MemberUser in
// membership.ts. Enforced at the data-access layer so every transport inherits it.
export interface AccessEntryUser {
  id: string;
  displayName: string | null;
  isAdmin: boolean;
}

// One row of the access table: the allowlist email plus the person behind it, if they exist yet.
export interface AccessEntry {
  email: string;
  createdAt: Date;
  user: AccessEntryUser | null;
}

// The access table: every allowlisted email, joined with its user where there is one.
//
// Why two queries and a Map instead of a Prisma `include`: there is no FK between
// allowlist_entries and users (MVP design §3.2 — "kein FK auf User nötig"), so Prisma has no
// relation to traverse. Two indexed reads plus an in-memory join is still O(1) round-trips; a
// per-row lookup would be the N+1 this avoids.
export async function listAccessEntries(db: PrismaClient): Promise<AccessEntry[]> {
  // Oldest invite first: a stable, meaningful order (the seeded first admin stays on top) that
  // does not depend on Postgres' arbitrary row order.
  const entries = await db.allowlistEntry.findMany({ orderBy: { createdAt: "asc" } });

  // Both sides store the email normalized (provisionUser and inviteEmail both call normalizeEmail),
  // so the join key is an exact match — no lower() in SQL, no collation surprises.
  const users = await db.user.findMany({
    where: { email: { in: entries.map((entry) => entry.email) } },
    select: { id: true, email: true, displayName: true, isAdmin: true },
    orderBy: { createdAt: "asc" },
  });

  const byEmail = new Map<string, AccessEntryUser>();
  for (const user of users) {
    // First wins = oldest account wins, preserving the deterministic display rule used by
    // membership.ts without making that one displayed account authoritative for lockout checks.
    if (!byEmail.has(user.email)) {
      byEmail.set(user.email, {
        id: user.id,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
      });
    }
  }

  return entries.map((entry) => ({
    email: entry.email,
    createdAt: entry.createdAt,
    // ?? null (not undefined): the UI branches on `user === null` to render "Noch nie angemeldet".
    user: byEmail.get(entry.email) ?? null,
  }));
}

export interface InviteEmailInput {
  email: string;
  // The inviting admin's id. Callers pass requireAdmin()'s return value, which is a user id the
  // guard just read back from the database — so it is always a real UUID and never needs an
  // isUuid check before it reaches the uuid column.
  invitedBy: string;
}

// Invites an email = adds it to the allowlist, which is the ONLY thing that lets a Google account
// past handleSignIn (Slice 1). No mail is sent: the project has no mail capability at all (design
// §2), so an invitation is a database row and the person is told out of band.
export async function inviteEmail(
  db: PrismaClient,
  input: InviteEmailInput,
): Promise<AllowlistEntry> {
  const email = normalizeEmail(input.email);

  // Length before shape: an over-long but well-formed address must produce the message that
  // actually explains the problem. Also keeps unbounded input away from the DB (see MAX_EMAIL_LENGTH).
  if (email.length > MAX_EMAIL_LENGTH) {
    throw new ApiError(400, "E-Mail-Adresse ist zu lang");
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Keine gültige E-Mail-Adresse");
  }

  // Upsert = idempotent invite: re-inviting somebody who is already listed is a no-op, not a
  // unique-constraint crash. The EMPTY update is the load-bearing part — it preserves the original
  // invitedBy and createdAt, so re-inviting never rewrites who first let this person in.
  return db.allowlistEntry.upsert({
    where: { email },
    update: {},
    create: { email, invitedBy: input.invitedBy },
  });
}

export interface RevokeEmailInput {
  email: string;
  // The acting admin's id — needed for the self-revocation invariant, not for authorization
  // (authorization is requireAdmin's job at the page boundary).
  callerId: string;
}

// Revokes an email = removes the allowlist row, and nothing else. Memberships, projects and the
// user row all survive; ending project access is the separate, explicit intent implemented by
// excludeFromAllProjects (design §2/§6).
//
// Honest limitation, stated in the UI too: this blocks FUTURE logins. A JWT already issued keeps
// working until it expires — a signed token has no link back to the server (design §4).
export async function revokeEmail(db: PrismaClient, input: RevokeEmailInput): Promise<void> {
  const email = normalizeEmail(input.email);

  const entry = await db.allowlistEntry.findUnique({ where: { email } });
  if (!entry) throw new ApiError(404, "E-Mail steht nicht auf der Zugangsliste");

  // Load the acting account by its stable identity instead of resolving the target email to one
  // arbitrary User row. User.email is intentionally non-unique, so an oldest-account lookup could
  // otherwise hide a newer caller who shares the same allowlist identity.
  const caller = await db.user.findUnique({
    where: { id: input.callerId },
    select: { email: true },
  });

  // Invariant 1: nobody may revoke the allowlist identity their own account uses. Normalize the
  // caller's stored email defensively so this comparison remains correct even for legacy rows.
  if (caller && normalizeEmail(caller.email) === email) {
    throw new ApiError(403, "Du kannst dir den Zugang nicht selbst entziehen.");
  }

  // One allowlist row gates every account sharing its email. Count ALL admins bound to the target,
  // not merely the oldest account, then ensure at least one admin remains outside that identity.
  const [adminCount, adminsBoundToEmail] = await Promise.all([
    countAdmins(db),
    db.user.count({ where: { email, isAdmin: true } }),
  ]);
  // Invariant 2 is independent from self-revocation: another user must also be unable to remove an
  // email that is the login gate for every remaining admin account.
  if (adminsBoundToEmail > 0 && adminCount <= adminsBoundToEmail) {
    throw new ApiError(403, "Der letzte Admin kann nicht entfernt werden.");
  }

  // Delete by the row's own id (already loaded), so the delete cannot hit a different row than the
  // one the invariants were checked against.
  await db.allowlistEntry.delete({ where: { id: entry.id } });
}

export interface SetAdminInput {
  userId: string;
  // The target state, not a toggle: the UI sends what it wants to be true, so a double-submit or a
  // stale page cannot flip the flag to the opposite of what the admin saw and clicked.
  isAdmin: boolean;
  callerId: string;
}

// Grants or revokes global admin rights.
//
// Why this takes effect immediately even though sessions are JWTs: the only thing the flag controls
// is access to /admin, and that page's guard (requireAdmin) reads isAdmin from the DATABASE, not
// from the token (design §4/§5). Nothing else in the app reads isAdmin.
export async function setAdmin(db: PrismaClient, input: SetAdminInput): Promise<void> {
  // Shape check before the query: a malformed id can never match a uuid column, and Prisma would
  // raise P2023 -> fake 500. Treat it as "not found", the Slice 2 convention.
  if (!isUuid(input.userId)) throw new ApiError(404, "Nutzer nicht gefunden");

  const user = await db.user.findUnique({ where: { id: input.userId } });
  // Admin rights attach to a USER, so the person must have logged in at least once (JIT
  // provisioning, Slice 1). There is nothing to flag on a merely invited email.
  if (!user) throw new ApiError(404, "Nutzer nicht gefunden");

  // Both invariants only concern REMOVING rights; granting can never lock anybody out.
  if (!input.isAdmin) {
    // Invariant 1: nobody demotes themselves (checked first so the caller gets the message that
    // explains their own action, not the generic last-admin one).
    if (user.id === input.callerId) {
      throw new ApiError(403, "Du kannst dir die Adminrechte nicht selbst entziehen.");
    }
    // Invariant 2: the last admin stays. Guarded by `user.isAdmin` so demoting a non-admin (a
    // no-op) never trips it. See locked decision 7 for the accepted read-committed race.
    if (user.isAdmin && (await countAdmins(db)) <= 1) {
      throw new ApiError(403, "Der letzte Admin kann nicht entfernt werden.");
    }
  }

  // Returns void rather than the updated User: the full row carries googleSub, and no caller needs
  // it — the page re-reads through listAccessEntries, which has the safe projection.
  await db.user.update({ where: { id: user.id }, data: { isAdmin: input.isAdmin } });
}
