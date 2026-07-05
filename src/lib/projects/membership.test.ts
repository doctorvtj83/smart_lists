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

  // Unbounded input must not reach the DB: 254 chars is the practical RFC limit for an email address.
  it("rejects an email longer than 254 characters with 400", async () => {
    const tooLong = `${"a".repeat(250)}@example.com`; // 262 chars total
    await expect(addMember(db, { projectId, email: tooLong })).rejects.toMatchObject({
      status: 400,
    });
  });

  // User.email is not unique (googleSub is the identity). If two accounts ever share an email,
  // the lookup must be deterministic: the oldest account wins, not a random row.
  it("picks the oldest user when two users share an email", async () => {
    const first = await db.user.create({
      data: { googleSub: "g-dup-1", email: "dup@example.com", createdAt: new Date("2026-01-01") },
    });
    await db.user.create({
      data: { googleSub: "g-dup-2", email: "dup@example.com", createdAt: new Date("2026-01-02") },
    });
    const membership = await addMember(db, { projectId, email: "dup@example.com" });
    expect(membership.userId).toBe(first.id);
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

  // A malformed (non-UUID) userId arrives straight from the URL segment; Postgres uuid columns
  // reject it with a driver error. The core must map that to a clean 404, not crash into a 500.
  it("throws 404 for a malformed (non-UUID) userId", async () => {
    await expect(removeMember(db, { projectId, userId: "not-a-uuid" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("listMembers", () => {
  // Security: the members API is consumed by every project member. It must expose only what the
  // UI needs (id, email, displayName) — never internal fields like googleSub (the OAuth identity)
  // or isAdmin (the allowlist-admin flag).
  it("exposes only id, email and displayName of each user", async () => {
    const members = await listMembers(db, projectId);
    expect(members).toHaveLength(1); // just the owner from beforeEach
    const user = members[0].user;
    expect(user.email).toBe("owner@example.com");
    expect(user.id).toBe(ownerId);
    expect(user).not.toHaveProperty("googleSub");
    expect(user).not.toHaveProperty("isAdmin");
  });
});
