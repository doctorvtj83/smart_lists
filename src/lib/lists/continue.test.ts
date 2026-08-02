import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "@/lib/projects/projects";
import { getContinueList, lastTouchedAt, pickContinueList } from "./continue";

const db = new PrismaClient();
let userId: string;
let strangerId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const stranger = await db.user.create({ data: { googleSub: "g-s", email: "s@example.com" } });
  userId = user.id;
  strangerId = stranger.id;
});

afterAll(async () => {
  await db.$disconnect();
});

// --- The pure ranking rule ---------------------------------------------------

describe("lastTouchedAt", () => {
  it("is the newest item's updatedAt", () => {
    const touched = lastTouchedAt({
      id: "a",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [
        { updatedAt: new Date("2026-02-01T00:00:00Z") },
        { updatedAt: new Date("2026-03-01T00:00:00Z") },
      ],
    });
    expect(touched.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("falls back to the list's own createdAt when it has no items", () => {
    const touched = lastTouchedAt({
      id: "a",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [],
    });
    expect(touched.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("never returns a time earlier than the list's creation", () => {
    // Defensive: a freshly created list whose only item predates it cannot happen
    // through the app, but the rule must still be monotonic.
    const touched = lastTouchedAt({
      id: "a",
      createdAt: new Date("2026-05-01T00:00:00Z"),
      items: [{ updatedAt: new Date("2026-01-01T00:00:00Z") }],
    });
    expect(touched.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("pickContinueList", () => {
  it("returns null for no lists", () => {
    expect(pickContinueList([])).toBeNull();
  });

  it("picks the most recently touched list", () => {
    const older = {
      id: "older",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [{ updatedAt: new Date("2026-02-01T00:00:00Z") }],
    };
    const newer = {
      id: "newer",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [{ updatedAt: new Date("2026-04-01T00:00:00Z") }],
    };
    expect(pickContinueList([older, newer])?.id).toBe("newer");
    // Order of the input must not matter.
    expect(pickContinueList([newer, older])?.id).toBe("newer");
  });

  it("breaks a tie by the later createdAt so the result is deterministic", () => {
    const a = { id: "a", createdAt: new Date("2026-01-01T00:00:00Z"), items: [] };
    const b = { id: "b", createdAt: new Date("2026-01-02T00:00:00Z"), items: [] };
    expect(pickContinueList([a, b])?.id).toBe("b");
    expect(pickContinueList([b, a])?.id).toBe("b");
  });
});

// --- The DB read -------------------------------------------------------------

describe("getContinueList", () => {
  it("returns null when the user has no projects", async () => {
    expect(await getContinueList(db, userId)).toBeNull();
  });

  it("returns null when every list is completed", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId: userId });
    await db.list.create({
      data: {
        projectId: project.id,
        name: "Erledigt",
        status: "completed",
        completedAt: new Date(),
      },
    });
    expect(await getContinueList(db, userId)).toBeNull();
  });

  it("returns the list with its project name and open/total counts", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId: userId });
    const list = await db.list.create({ data: { projectId: project.id, name: "Einkauf Samstag" } });
    const article = await db.catalogItem.create({
      data: { projectId: project.id, name: "Milch", normalizedName: "milch" },
    });
    // Three entries, one of them already checked -> 2 open of 3.
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: article.id, sortIndex: 0, checked: true },
    });
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: article.id, sortIndex: 1 },
    });
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: article.id, sortIndex: 2 },
    });

    const card = await getContinueList(db, userId);
    expect(card).toEqual({
      listId: list.id,
      listName: "Einkauf Samstag",
      projectId: project.id,
      projectName: "Haushalt",
      openCount: 2,
      totalCount: 3,
    });
  });

  it("ignores lists in projects the user is not a member of", async () => {
    const foreign = await createProject(db, { name: "Fremd", ownerId: strangerId });
    await db.list.create({ data: { projectId: foreign.id, name: "Geheim" } });
    expect(await getContinueList(db, userId)).toBeNull();
  });

  it("spans projects: the most recently touched list wins regardless of project", async () => {
    const a = await createProject(db, { name: "A", ownerId: userId });
    const b = await createProject(db, { name: "B", ownerId: userId });
    // Created in this order, so B's list is the newer one by createdAt.
    await db.list.create({ data: { projectId: a.id, name: "Alt" } });
    const newer = await db.list.create({ data: { projectId: b.id, name: "Neu" } });

    const card = await getContinueList(db, userId);
    expect(card?.listId).toBe(newer.id);
    expect(card?.projectName).toBe("B");
  });

  it("handles a list with no entries at all", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId: userId });
    const list = await db.list.create({ data: { projectId: project.id, name: "Leer" } });

    const card = await getContinueList(db, userId);
    expect(card).toEqual({
      listId: list.id,
      listName: "Leer",
      projectId: project.id,
      projectName: "Haushalt",
      openCount: 0,
      totalCount: 0,
    });
  });
});
