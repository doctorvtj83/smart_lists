import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { isEmailAllowed } from "./allowlist";

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
