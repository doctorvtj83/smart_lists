import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/test/reset-db";
import { requireAdmin } from "./session";

// This is the project's FIRST module mock, and it is justified here and only here: requireAdmin's
// whole point is that it trusts the DATABASE over the session token, and proving that needs a
// session claiming something the database contradicts. The real @/auth module boots Auth.js with
// the Google provider and reads a request context that does not exist in a Vitest process.
//
// vi.hoisted: vi.mock calls are hoisted above the imports by Vitest's transform, so the mock
// function must be created in a hoisted block — otherwise it would not exist yet when the factory runs.
const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: mockAuth }));

const db = new PrismaClient();

beforeEach(async () => {
  await resetDb(db);
  // Reset between tests so a leftover session from a previous test cannot make one pass by accident.
  mockAuth.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("requireAdmin", () => {
  it("returns the caller's id when the database says they are an admin", async () => {
    const user = await db.user.create({
      data: { googleSub: "g-a", email: "a@example.com", isAdmin: true },
    });
    mockAuth.mockResolvedValue({ user: { id: user.id, isAdmin: true } });
    await expect(requireAdmin(db)).resolves.toBe(user.id);
  });

  it("rejects a signed-in non-admin with 403", async () => {
    const user = await db.user.create({
      data: { googleSub: "g-b", email: "b@example.com" },
    });
    mockAuth.mockResolvedValue({ user: { id: user.id, isAdmin: false } });
    await expect(requireAdmin(db)).rejects.toMatchObject({
      status: 403,
      message: "Kein Zugriff",
    });
  });

  it("rejects a request without a session with 401", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAdmin(db)).rejects.toMatchObject({
      status: 401,
      message: "Nicht angemeldet",
    });
  });

  it("reads the flag from the DATABASE, not the token: a stale isAdmin=true token is rejected", async () => {
    // The decisive test of this slice. The JWT is issued at login and lives up to 30 days; if the
    // guard trusted token.isAdmin, a demoted admin would keep /admin for weeks (design §5).
    const user = await db.user.create({
      data: { googleSub: "g-c", email: "c@example.com", isAdmin: false },
    });
    mockAuth.mockResolvedValue({ user: { id: user.id, isAdmin: true } });
    await expect(requireAdmin(db)).rejects.toMatchObject({
      status: 403,
      message: "Kein Zugriff",
    });
  });

  it("rejects a session whose user no longer exists with 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: randomUUID(), isAdmin: true } });
    await expect(requireAdmin(db)).rejects.toMatchObject({ status: 403 });
  });
});
