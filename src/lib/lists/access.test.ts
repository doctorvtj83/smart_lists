import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { requireListAccess } from "./access";

const db = new PrismaClient();
let ownerId: string;
let memberId: string;
let strangerId: string;
let listId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const member = await db.user.create({ data: { googleSub: "g-member", email: "member@example.com" } });
  const stranger = await db.user.create({ data: { googleSub: "g-stranger", email: "stranger@example.com" } });
  ownerId = owner.id;
  memberId = member.id;
  strangerId = stranger.id;

  const project = await db.project.create({ data: { name: "Haushalt", ownerId } });
  await db.membership.create({ data: { projectId: project.id, userId: ownerId, role: "owner" } });
  await db.membership.create({ data: { projectId: project.id, userId: memberId, role: "member" } });
  const list = await db.list.create({ data: { projectId: project.id, name: "Einkauf" } });
  listId = list.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("requireListAccess", () => {
  it("returns the list and role for the owner", async () => {
    const { list, role } = await requireListAccess(db, listId, ownerId);
    expect(list.id).toBe(listId);
    expect(role).toBe("owner");
  });

  it("returns the list and role for a member", async () => {
    const { role } = await requireListAccess(db, listId, memberId);
    expect(role).toBe("member");
  });

  // Non-members get 404 (not 403): neither the list nor the project may leak its existence.
  it("throws 404 for a non-member", async () => {
    await expect(requireListAccess(db, listId, strangerId)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 for an unknown list id", async () => {
    await expect(
      requireListAccess(db, "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b", ownerId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 (not a 500) for a malformed list id", async () => {
    await expect(requireListAccess(db, "not-a-uuid", ownerId)).rejects.toMatchObject({
      status: 404,
    });
  });
});
