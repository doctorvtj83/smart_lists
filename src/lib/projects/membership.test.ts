import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "./projects";
import { addMember, listMembers, removeMember } from "./membership";

const db = new PrismaClient();
let ownerId: string;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  ownerId = owner.id;
  const project = await createProject(db, { name: "Haushalt", ownerId });
  projectId = project.id; // already has the owner membership
});

afterAll(async () => {
  await db.$disconnect();
});

describe("addMember", () => {
  it("adds an existing user (looked up by normalized email) as a member", async () => {
    await db.user.create({ data: { googleSub: "g-m", email: "member@example.com" } });
    // Email written differently on purpose -> normalization must match it.
    const membership = await addMember(db, { projectId, email: "  Member@Example.com " });
    expect(membership.role).toBe("member");

    const members = await listMembers(db, projectId);
    expect(members).toHaveLength(2); // owner + new member
  });

  it("is idempotent: adding the same member twice keeps a single membership", async () => {
    await db.user.create({ data: { googleSub: "g-m", email: "member@example.com" } });
    await addMember(db, { projectId, email: "member@example.com" });
    await addMember(db, { projectId, email: "member@example.com" });
    expect(await db.membership.count({ where: { projectId } })).toBe(2); // owner + one member
  });

  it("throws 404 if no user with that email has logged in yet", async () => {
    await expect(addMember(db, { projectId, email: "ghost@example.com" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("removeMember", () => {
  it("removes a member", async () => {
    const member = await db.user.create({ data: { googleSub: "g-m", email: "member@example.com" } });
    await addMember(db, { projectId, email: "member@example.com" });
    await removeMember(db, { projectId, userId: member.id });
    expect(await db.membership.count({ where: { projectId } })).toBe(1); // only the owner left
  });

  it("refuses to remove the owner", async () => {
    await expect(removeMember(db, { projectId, userId: ownerId })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws 404 when the membership does not exist", async () => {
    const stranger = await db.user.create({ data: { googleSub: "g-s", email: "s@example.com" } });
    await expect(removeMember(db, { projectId, userId: stranger.id })).rejects.toMatchObject({
      status: 404,
    });
  });
});
