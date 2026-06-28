import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { isEmailAllowed, provisionUser } from "./allowlist";

const db = new PrismaClient();

beforeEach(async () => {
  await resetDb(db); // Every test starts with empty tables so allowlist state cannot leak between cases.
});

afterAll(async () => {
  await db.$disconnect();
});

describe("isEmailAllowed", () => {
  it("true when the normalized email is in the allowlist", async () => {
    await db.allowlistEntry.create({ data: { email: "alice@example.com" } });

    // The input casing and whitespace differ on purpose; login checks must use canonical email storage.
    expect(await isEmailAllowed(db, "  Alice@Example.com ")).toBe(true);
  });

  it("false when the email is not in the allowlist", async () => {
    expect(await isEmailAllowed(db, "stranger@example.com")).toBe(false);
  });
});

describe("provisionUser", () => {
  it("creates a user on first login", async () => {
    const user = await provisionUser(db, {
      googleSub: "google-123",
      email: "  Bob@Example.com ",
      displayName: "Bob",
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe("bob@example.com"); // Users store normalized email so auth lookups stay canonical.
    expect(user.isAdmin).toBe(false); // New login users must not get allowlist-admin permissions by default.
  });

  it("is idempotent: a second login creates no second user but updates", async () => {
    const first = await provisionUser(db, {
      googleSub: "google-123",
      email: "bob@example.com",
      displayName: "Bob",
    });
    const second = await provisionUser(db, {
      googleSub: "google-123",
      email: "bob@example.com",
      displayName: "Bob New Name",
    });

    expect(second.id).toBe(first.id); // googleSub is the stable external identity, so repeated login keeps one user.
    expect(await db.user.count()).toBe(1); // Idempotent provisioning prevents duplicate users.
    expect(second.displayName).toBe("Bob New Name"); // Profile changes should refresh on later logins.
  });

  // NOTE: this tests provisionUser in isolation. It does NOT imply that a user
  // can freely change their Google email and keep access — the signIn gate
  // (handleSignIn) re-checks the new email against the allowlist before
  // provisionUser is ever called, so in the real flow the new address must also
  // be allowlisted. What this asserts is narrower: when provisioning does run
  // with a changed email, it refreshes the stored email and never touches isAdmin.
  it("refreshes a changed normalized email and preserves admin rights (provisioning in isolation)", async () => {
    const first = await provisionUser(db, {
      googleSub: "google-admin",
      email: "admin@example.com",
      displayName: "Admin User",
    });

    await db.user.update({
      where: { id: first.id },
      data: { isAdmin: true }, // Admin rights are granted out-of-band and must survive later profile refreshes.
    });

    const second = await provisionUser(db, {
      googleSub: "google-admin",
      email: "  Admin.New@Example.com ",
      displayName: "Admin User",
    });
    const persisted = await db.user.findUniqueOrThrow({
      where: { googleSub: "google-admin" },
    });

    expect(second.id).toBe(first.id); // Same googleSub must still map to one stable app user.
    expect(await db.user.count()).toBe(1); // The email refresh must not create a duplicate identity.
    expect(second.isAdmin).toBe(true);
    expect(persisted.isAdmin).toBe(true);
    expect(second.email).toBe("admin.new@example.com");
    expect(persisted.email).toBe("admin.new@example.com");
  });
});
