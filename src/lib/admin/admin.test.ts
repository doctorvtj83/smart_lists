import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { inviteEmail, listAccessEntries, revokeEmail } from "./admin";

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
