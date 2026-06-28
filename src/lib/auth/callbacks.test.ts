import { PrismaClient } from "@prisma/client";
import type { Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import {
  handleSignIn,
  enrichToken,
  enrichSession,
  isRequestAuthorized,
} from "./callbacks";

const db = new PrismaClient();

beforeEach(async () => {
  await resetDb(db); // Each case starts from empty tables so admission state cannot leak between tests.
});

afterAll(async () => {
  await db.$disconnect();
});

// Builds a Google OIDC profile. email_verified is not on the base next-auth
// Profile type, so we assemble the object and cast once, in one place.
function googleProfile(overrides: Record<string, unknown> = {}): Profile {
  return {
    sub: "google-123",
    email: "user@example.com",
    email_verified: true,
    name: "Test User",
    ...overrides,
  } as Profile;
}

describe("handleSignIn (the OAuth admission gate)", () => {
  // The gate is the security boundary of the whole app, so each rejection
  // reason gets its own test — a regression in any one silently opens access.

  it("rejects when the profile has no email", async () => {
    expect(await handleSignIn(db, googleProfile({ email: undefined }))).toBe(false);
    expect(await db.user.count()).toBe(0); // A rejected login must never provision a user.
  });

  it("rejects when the profile has no Google sub", async () => {
    expect(await handleSignIn(db, googleProfile({ sub: undefined }))).toBe(false);
    expect(await db.user.count()).toBe(0);
  });

  it("rejects when the Google email is not verified", async () => {
    // Allowlist the address so we prove email_verified is what blocks it, not the allowlist.
    await db.allowlistEntry.create({ data: { email: "user@example.com" } });
    expect(await handleSignIn(db, googleProfile({ email_verified: false }))).toBe(false);
    expect(await db.user.count()).toBe(0);
  });

  it("rejects when email_verified is absent (not strictly true)", async () => {
    await db.allowlistEntry.create({ data: { email: "user@example.com" } });
    expect(await handleSignIn(db, googleProfile({ email_verified: undefined }))).toBe(false);
    expect(await db.user.count()).toBe(0);
  });

  it("rejects a verified account whose email is not on the allowlist", async () => {
    expect(await handleSignIn(db, googleProfile())).toBe(false);
    expect(await db.user.count()).toBe(0);
  });

  it("admits and provisions a verified, allowlisted account", async () => {
    await db.allowlistEntry.create({ data: { email: "user@example.com" } });

    expect(await handleSignIn(db, googleProfile())).toBe(true);

    // Admission must leave exactly one provisioned, non-admin user behind.
    const user = await db.user.findUniqueOrThrow({ where: { googleSub: "google-123" } });
    expect(user.email).toBe("user@example.com");
    expect(user.displayName).toBe("Test User");
    expect(user.isAdmin).toBe(false);
  });

  it("admits using normalized email when allowlist casing differs", async () => {
    await db.allowlistEntry.create({ data: { email: "user@example.com" } });

    // Google hands back mixed case / whitespace; the gate must still match the allowlist row.
    expect(await handleSignIn(db, googleProfile({ email: "  User@Example.com " }))).toBe(true);
    expect(await db.user.count()).toBe(1);
  });
});

describe("enrichToken (JWT enrichment on sign-in)", () => {
  it("copies the app user id and admin flag onto the token", async () => {
    const created = await db.user.create({
      data: { googleSub: "google-123", email: "user@example.com", isAdmin: true },
    });

    const token = await enrichToken(db, {} as JWT, googleProfile());

    expect(token.userId).toBe(created.id); // Downstream authorization reads userId, so it must be the app UUID.
    expect(token.isAdmin).toBe(true);
  });

  it("leaves the token untouched when there is no profile (later requests)", async () => {
    // Auth.js only passes profile on the initial sign-in call; on every later
    // call profile is undefined and the token must pass through with no DB query.
    const token = await enrichToken(db, { userId: "existing" } as JWT, undefined);

    expect(token.userId).toBe("existing");
  });

  it("does not set userId when no app user matches the sub", async () => {
    const token = await enrichToken(db, {} as JWT, googleProfile());

    expect(token.userId).toBeUndefined(); // No matching user means no identity to attach.
  });
});

describe("enrichSession (mirrors JWT identity into the session)", () => {
  it("copies userId and isAdmin from the token into the session user", () => {
    const session = { user: { id: "", isAdmin: false }, expires: "" } as Session;

    const result = enrichSession(session, { userId: "u-1", isAdmin: true } as JWT);

    expect(result.user.id).toBe("u-1");
    expect(result.user.isAdmin).toBe(true);
  });

  it("leaves the session user unchanged when the token has no userId", () => {
    const session = { user: { id: "untouched", isAdmin: false }, expires: "" } as Session;

    const result = enrichSession(session, {} as JWT);

    expect(result.user.id).toBe("untouched");
  });
});

describe("isRequestAuthorized (middleware predicate)", () => {
  it("authorizes a session that carries an app user id", () => {
    expect(isRequestAuthorized({ user: { id: "u-1", isAdmin: false }, expires: "" } as Session)).toBe(true);
  });

  it("rejects a missing session", () => {
    expect(isRequestAuthorized(null)).toBe(false);
  });

  it("rejects a session whose user has no id", () => {
    // A token that never went through the sign-in gate leaves user.id empty.
    expect(isRequestAuthorized({ user: { id: "", isAdmin: false }, expires: "" } as Session)).toBe(false);
  });
});
