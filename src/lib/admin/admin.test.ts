import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { getRole } from "@/lib/projects/guard";
import {
  excludeFromAllProjects,
  inviteEmail,
  listAccessEntries,
  listProjectAccess,
  revokeEmail,
  setAdmin,
} from "./admin";

// One shared client for the file (the pattern every core test in Slices 1–7 uses). resetDb gives
// every test a clean DB; the beforeEach then rebuilds the ONE fixture every admin test needs:
// a signed-in admin who is also on the allowlist — i.e. the state seed.ts bootstraps in production.
const db = new PrismaClient();
let adminId: string;

beforeEach(async () => {
  await resetDb(db);
  const admin = await db.user.create({
    data: {
      googleSub: "g-admin",
      email: "admin@example.com",
      displayName: "Admin",
      isAdmin: true,
    },
  });
  adminId = admin.id;
  // invitedBy stays null here on purpose: this mirrors the seeded first row, which the UI must
  // tolerate (design §8 — "invitedBy is nullable and null for seeded rows").
  await db.allowlistEntry.create({ data: { email: "admin@example.com" } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("inviteEmail", () => {
  it("stores the email normalized and records the inviter", async () => {
    await inviteEmail(db, { email: "  Foo@Bar.DE  ", invitedBy: adminId });
    const rows = await db.allowlistEntry.findMany({ where: { email: "foo@bar.de" } });
    expect(rows).toHaveLength(1);
    // invitedBy exists since Slice 1 and has never been populated — this slice is what gives it meaning.
    expect(rows[0].invitedBy).toBe(adminId);
  });

  it("opens the login gate for that email", async () => {
    // The whole point of an invite: isEmailAllowed (the Slice 1 read gate) must now say yes.
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    expect(await isEmailAllowed(db, "GAST@example.com")).toBe(true);
  });

  it("is idempotent: a repeat invite keeps one row and the ORIGINAL inviter", async () => {
    const second = await db.user.create({
      data: { googleSub: "g-second", email: "second@example.com" },
    });
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    await inviteEmail(db, { email: "gast@example.com", invitedBy: second.id });
    const rows = await db.allowlistEntry.findMany({ where: { email: "gast@example.com" } });
    expect(rows).toHaveLength(1);
    // The upsert's empty `update` is what preserves the first invitation's provenance.
    expect(rows[0].invitedBy).toBe(adminId);
  });

  it("rejects a malformed email with 400", async () => {
    await expect(
      inviteEmail(db, { email: "kein-at-zeichen", invitedBy: adminId }),
    ).rejects.toMatchObject({ status: 400, message: "Keine gültige E-Mail-Adresse" });
  });

  it("rejects an over-long email with 400 (length is checked before shape)", async () => {
    // Well-formed but 262 chars: proves the length guard runs first, so the admin gets the
    // message that actually explains the problem.
    const tooLong = `${"a".repeat(250)}@example.com`;
    await expect(inviteEmail(db, { email: tooLong, invitedBy: adminId })).rejects.toMatchObject({
      status: 400,
      message: "E-Mail-Adresse ist zu lang",
    });
  });
});

describe("revokeEmail", () => {
  it("removes the row and closes the login gate", async () => {
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    await revokeEmail(db, { email: "GAST@example.com", callerId: adminId });
    expect(await isEmailAllowed(db, "gast@example.com")).toBe(false);
  });

  it("leaves the user row untouched (nothing but the allowlist row is deleted)", async () => {
    const guest = await db.user.create({
      data: { googleSub: "g-guest", email: "gast@example.com" },
    });
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    await revokeEmail(db, { email: "gast@example.com", callerId: adminId });
    // Deleting users is explicitly out of scope (design §2): Project.ownerId is a required FK.
    expect(await db.user.findUnique({ where: { id: guest.id } })).not.toBeNull();
  });

  it("refuses to revoke the caller's own access with 403", async () => {
    await expect(
      revokeEmail(db, { email: "admin@example.com", callerId: adminId }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Du kannst dir den Zugang nicht selbst entziehen.",
    });
  });

  it("refuses self-revocation when the caller is a newer account sharing the email", async () => {
    // Turn the oldest matching account into a non-admin, then create the real acting admin as the
    // newer duplicate. This reproduces both historical bypasses: an oldest-only lookup sees
    // neither the caller's identity nor the only admin bound to the allowlist email.
    await db.user.update({ where: { id: adminId }, data: { isAdmin: false } });
    const newerAdmin = await db.user.create({
      data: {
        googleSub: "g-newer-admin",
        email: "admin@example.com",
        displayName: "Newer Admin",
        isAdmin: true,
      },
    });

    await expect(
      revokeEmail(db, { email: "ADMIN@example.com", callerId: newerAdmin.id }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Du kannst dir den Zugang nicht selbst entziehen.",
    });
    // The failed operation must leave the login gate open; checking persistence makes the test
    // prove the invariant's externally visible effect instead of only matching an exception.
    expect(await isEmailAllowed(db, "admin@example.com")).toBe(true);
  });

  it("refuses to revoke the last remaining admin with 403", async () => {
    // Caller is somebody else, so the self-check cannot be what fires here. Without this rule the
    // app would end up with no one able to maintain the allowlist and no way back except SQL.
    const other = await db.user.create({
      data: { googleSub: "g-other", email: "other@example.com" },
    });
    await expect(
      revokeEmail(db, { email: "admin@example.com", callerId: other.id }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Der letzte Admin kann nicht entfernt werden.",
    });
  });

  it("revokes an admin's access while another admin remains", async () => {
    await db.user.create({
      data: { googleSub: "g-two", email: "two@example.com", isAdmin: true },
    });
    await db.allowlistEntry.create({ data: { email: "two@example.com" } });
    await revokeEmail(db, { email: "two@example.com", callerId: adminId });
    expect(await isEmailAllowed(db, "two@example.com")).toBe(false);
  });

  it("rejects an unknown email with 404", async () => {
    await expect(
      revokeEmail(db, { email: "niemand@example.com", callerId: adminId }),
    ).rejects.toMatchObject({
      status: 404,
      message: "E-Mail steht nicht auf der Zugangsliste",
    });
  });
});

describe("listAccessEntries", () => {
  it("joins each allowlist email with its user, oldest invite first", async () => {
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    const entries = await listAccessEntries(db);
    expect(entries.map((e) => e.email)).toEqual(["admin@example.com", "gast@example.com"]);
    expect(entries[0].user).toEqual({ id: adminId, displayName: "Admin", isAdmin: true });
    // Invited but never signed in -> no User row exists yet (JIT provisioning, Slice 1).
    expect(entries[1].user).toBeNull();
  });

  it("ignores users whose email is not on the allowlist", async () => {
    // A revoked person keeps their User row; they must not reappear as an access entry.
    await db.user.create({ data: { googleSub: "g-ex", email: "ex@example.com" } });
    const entries = await listAccessEntries(db);
    expect(entries.map((e) => e.email)).toEqual(["admin@example.com"]);
  });

  it("never exposes googleSub (the OAuth identity stays server-side)", async () => {
    // Same leak rule Slice 2 retrofitted onto listMembers. Serializing the whole result is what
    // makes a future `user: true` (instead of a narrow select) fail this test.
    const entries = await listAccessEntries(db);
    expect(JSON.stringify(entries)).not.toContain("g-admin");
  });
});

describe("setAdmin", () => {
  it("grants admin rights to an existing user", async () => {
    const user = await db.user.create({
      data: { googleSub: "g-new", email: "new@example.com" },
    });
    await setAdmin(db, { userId: user.id, isAdmin: true, callerId: adminId });
    const updated = await db.user.findUnique({ where: { id: user.id } });
    expect(updated?.isAdmin).toBe(true);
  });

  it("revokes admin rights while another admin remains", async () => {
    const other = await db.user.create({
      data: { googleSub: "g-two", email: "two@example.com", isAdmin: true },
    });
    await setAdmin(db, { userId: other.id, isAdmin: false, callerId: adminId });
    const updated = await db.user.findUnique({ where: { id: other.id } });
    expect(updated?.isAdmin).toBe(false);
  });

  it("refuses self-demotion with 403", async () => {
    await expect(
      setAdmin(db, { userId: adminId, isAdmin: false, callerId: adminId }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Du kannst dir die Adminrechte nicht selbst entziehen.",
    });
  });

  it("refuses to demote the last remaining admin with 403", async () => {
    // Caller is a different person, so this can only be the last-admin rule firing.
    const other = await db.user.create({
      data: { googleSub: "g-other", email: "other@example.com" },
    });
    await expect(
      setAdmin(db, { userId: adminId, isAdmin: false, callerId: other.id }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Der letzte Admin kann nicht entfernt werden.",
    });
  });

  it("rejects an unknown userId with 404", async () => {
    // The flag lives on User, not on the allowlist email: rights only attach to somebody who has
    // actually signed in at least once (design §3).
    await expect(
      setAdmin(db, { userId: randomUUID(), isAdmin: true, callerId: adminId }),
    ).rejects.toMatchObject({ status: 404, message: "Nutzer nicht gefunden" });
  });

  it("rejects a non-UUID userId with 404 (never reaches the uuid column)", async () => {
    // Without the isUuid guard Postgres rejects the value and Prisma raises P2023, which the error
    // mapper would report as a fake 500 (see validate.ts).
    await expect(
      setAdmin(db, { userId: "not-a-uuid", isAdmin: true, callerId: adminId }),
    ).rejects.toMatchObject({ status: 404, message: "Nutzer nicht gefunden" });
  });
});

// Fixture for the two project-scoped reads: a guest who OWNS one project and is a plain MEMBER of
// two others — the exact shape the exclusion has to treat asymmetrically.
async function seedGuestWithProjects() {
  const guest = await db.user.create({
    data: { googleSub: "g-guest", email: "gast@example.com" },
  });
  const owned = await db.project.create({ data: { name: "Gasts Projekt", ownerId: guest.id } });
  await db.membership.create({ data: { projectId: owned.id, userId: guest.id, role: "owner" } });

  const haushalt = await db.project.create({ data: { name: "Haushalt", ownerId: adminId } });
  const ferien = await db.project.create({ data: { name: "Ferien", ownerId: adminId } });
  for (const project of [haushalt, ferien]) {
    await db.membership.create({ data: { projectId: project.id, userId: adminId, role: "owner" } });
    await db.membership.create({ data: { projectId: project.id, userId: guest.id, role: "member" } });
  }
  return { guest, owned, haushalt, ferien };
}

describe("listProjectAccess", () => {
  it("returns every project with the person's role and the project name", async () => {
    const { guest, owned, haushalt, ferien } = await seedGuestWithProjects();
    const access = await listProjectAccess(db, guest.id);
    // Sorted by name so the confirmation panel reads predictably.
    expect(access).toEqual([
      { projectId: ferien.id, name: "Ferien", role: "member" },
      { projectId: owned.id, name: "Gasts Projekt", role: "owner" },
      { projectId: haushalt.id, name: "Haushalt", role: "member" },
    ]);
  });

  it("returns an empty array for a user without memberships", async () => {
    const lonely = await db.user.create({
      data: { googleSub: "g-lonely", email: "lonely@example.com" },
    });
    expect(await listProjectAccess(db, lonely.id)).toEqual([]);
  });

  it("returns an empty array for an unknown or malformed id (never a 500)", async () => {
    // This read is driven by a URL parameter, so a crafted id must produce an empty panel, not a crash.
    expect(await listProjectAccess(db, randomUUID())).toEqual([]);
    expect(await listProjectAccess(db, "not-a-uuid")).toEqual([]);
  });
});

describe("excludeFromAllProjects", () => {
  it("removes every MEMBER membership and reports how many", async () => {
    const { guest, haushalt, ferien } = await seedGuestWithProjects();
    const result = await excludeFromAllProjects(db, { userId: guest.id });
    expect(result.removedCount).toBe(2);
    // getRole is the function every permission check in the app goes through, and it reads live —
    // so a null here IS the proof that content access ended on the person's next request.
    expect(await getRole(db, haushalt.id, guest.id)).toBeNull();
    expect(await getRole(db, ferien.id, guest.id)).toBeNull();
  });

  it("keeps owner memberships and names the skipped projects", async () => {
    const { guest, owned } = await seedGuestWithProjects();
    const result = await excludeFromAllProjects(db, { userId: guest.id });
    // Project.ownerId is a required FK and there is no ownership handover in the product, so an
    // owner is never ejected — the admin is told instead (design §2/§6).
    expect(result.ownedProjects).toEqual([{ id: owned.id, name: "Gasts Projekt" }]);
    expect(await getRole(db, owned.id, guest.id)).toBe("owner");
  });

  it("leaves other users' memberships in the same projects untouched", async () => {
    const { guest, haushalt } = await seedGuestWithProjects();
    await excludeFromAllProjects(db, { userId: guest.id });
    expect(await getRole(db, haushalt.id, adminId)).toBe("owner");
  });

  it("deletes no project and no user", async () => {
    const { guest } = await seedGuestWithProjects();
    await excludeFromAllProjects(db, { userId: guest.id });
    expect(await db.user.findUnique({ where: { id: guest.id } })).not.toBeNull();
    expect(await db.project.count()).toBe(3);
  });

  it("is idempotent: a second run removes nothing and still reports the owned projects", async () => {
    const { guest, owned } = await seedGuestWithProjects();
    await excludeFromAllProjects(db, { userId: guest.id });
    const second = await excludeFromAllProjects(db, { userId: guest.id });
    expect(second.removedCount).toBe(0);
    expect(second.ownedProjects).toEqual([{ id: owned.id, name: "Gasts Projekt" }]);
  });

  it("treats a malformed id as a no-op (no P2023 crash)", async () => {
    expect(await excludeFromAllProjects(db, { userId: "not-a-uuid" })).toEqual({
      removedCount: 0,
      ownedProjects: [],
    });
  });
});
