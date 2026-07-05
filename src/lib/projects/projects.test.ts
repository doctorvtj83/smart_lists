import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import {
  createProject,
  deleteProject,
  getProject,
  listProjectsForUser,
  renameProject,
} from "./projects";

const db = new PrismaClient();
let userId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  userId = user.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createProject", () => {
  it("creates the project with defaults and the creator as owner membership", async () => {
    const project = await createProject(db, { name: "Einkauf", ownerId: userId });
    expect(project.id).toBeTruthy();
    expect(project.name).toBe("Einkauf");
    expect(project.ownerId).toBe(userId);
    expect(project.suggestionRuleN).toBe(2); // default from the schema
    expect(project.suggestionRuleM).toBe(4); // default from the schema

    // The owner membership must exist (this is what later permission checks read).
    const membership = await db.membership.findUnique({
      where: { projectId_userId: { projectId: project.id, userId } },
    });
    expect(membership?.role).toBe("owner");
  });

  // Core-level validation (defense in depth): routes trim/check too, but server actions and any
  // future transport must not be able to write empty or absurdly long names into the DB.
  it("rejects an empty (whitespace-only) name with 400", async () => {
    await expect(createProject(db, { name: "   ", ownerId: userId })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a name longer than 200 characters with 400", async () => {
    await expect(
      createProject(db, { name: "x".repeat(201), ownerId: userId }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("listProjectsForUser", () => {
  it("returns only projects the user is a member of", async () => {
    const other = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    await createProject(db, { name: "Meins", ownerId: userId });
    await createProject(db, { name: "Fremd", ownerId: other.id });

    const mine = await listProjectsForUser(db, userId);
    expect(mine.map((p) => p.name)).toEqual(["Meins"]);
  });
});

describe("renameProject", () => {
  it("changes the name", async () => {
    const project = await createProject(db, { name: "Alt", ownerId: userId });
    const renamed = await renameProject(db, project.id, "Neu");
    expect(renamed.name).toBe("Neu");
  });

  // Rename must enforce the same name rules as create — otherwise the limit could be bypassed.
  it("rejects an empty (whitespace-only) name with 400", async () => {
    const project = await createProject(db, { name: "Alt", ownerId: userId });
    await expect(renameProject(db, project.id, "   ")).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a name longer than 200 characters with 400", async () => {
    const project = await createProject(db, { name: "Alt", ownerId: userId });
    await expect(renameProject(db, project.id, "x".repeat(201))).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("deleteProject", () => {
  it("deletes the project and cascades its memberships", async () => {
    const project = await createProject(db, { name: "Weg", ownerId: userId });
    await deleteProject(db, project.id);

    expect(await getProject(db, project.id)).toBeNull();
    expect(await db.membership.count({ where: { projectId: project.id } })).toBe(0);
  });
});
