import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getRole, requireMembership, requireOwner } from "./guard";

const db = new PrismaClient();

// Three actors and one project shared by the cases below.
let ownerId: string;
let memberId: string;
let strangerId: string;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const member = await db.user.create({ data: { googleSub: "g-member", email: "member@example.com" } });
  const stranger = await db.user.create({ data: { googleSub: "g-stranger", email: "stranger@example.com" } });
  ownerId = owner.id;
  memberId = member.id;
  strangerId = stranger.id;

  const project = await db.project.create({ data: { name: "Haushalt", ownerId } });
  projectId = project.id;
  await db.membership.create({ data: { projectId, userId: ownerId, role: "owner" } });
  await db.membership.create({ data: { projectId, userId: memberId, role: "member" } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("getRole", () => {
  it("returns the role for members", async () => {
    expect(await getRole(db, projectId, ownerId)).toBe("owner");
    expect(await getRole(db, projectId, memberId)).toBe("member");
  });

  it("returns null for a non-member", async () => {
    expect(await getRole(db, projectId, strangerId)).toBeNull();
  });
});

describe("requireMembership", () => {
  it("returns the role for members", async () => {
    expect(await requireMembership(db, projectId, memberId)).toBe("member");
  });

  it("throws 404 for a non-member (existence is hidden)", async () => {
    await expect(requireMembership(db, projectId, strangerId)).rejects.toMatchObject({ status: 404 });
  });
});

describe("requireOwner", () => {
  it("passes for the owner", async () => {
    await expect(requireOwner(db, projectId, ownerId)).resolves.toBe("owner");
  });

  it("throws 403 for a member", async () => {
    await expect(requireOwner(db, projectId, memberId)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 404 for a non-member", async () => {
    await expect(requireOwner(db, projectId, strangerId)).rejects.toMatchObject({ status: 404 });
  });
});
