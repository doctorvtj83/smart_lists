import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createList, deleteList, getListWithItems, listLists, renameList } from "./lists";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createList", () => {
  it("creates an active list with a generated id when none is supplied", async () => {
    const list = await createList(db, { projectId, name: "Wocheneinkauf" });
    expect(list.id).toBeTruthy();
    expect(list.name).toBe("Wocheneinkauf");
    expect(list.status).toBe("active"); // schema default; completion is Slice 6
    expect(list.completedAt).toBeNull();
  });

  // Offline-prep convention: the client may generate the UUID so an offline-created list keeps
  // its identity when synced later (Phase 2). The server only validates the shape.
  it("honors a client-supplied UUID", async () => {
    const id = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
    const list = await createList(db, { projectId, name: "Packliste", id });
    expect(list.id).toBe(id);
  });

  it("rejects a malformed client-supplied id with 400", async () => {
    await expect(
      createList(db, { projectId, name: "Kaputt", id: "not-a-uuid" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an empty (whitespace-only) name with 400", async () => {
    await expect(createList(db, { projectId, name: "   " })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a name longer than 200 characters with 400", async () => {
    await expect(
      createList(db, { projectId, name: "x".repeat(201) }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("listLists", () => {
  it("returns only this project's lists, newest first", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Fremd", ownerId: otherUser.id } });
    const older = await createList(db, { projectId, name: "Alt" });
    // Force a distinct createdAt so the desc ordering is deterministic (same-ms inserts are possible).
    await db.list.update({
      where: { id: older.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    await createList(db, { projectId, name: "Neu" });
    await createList(db, { projectId: otherProject.id, name: "Fremdliste" });

    const lists = await listLists(db, projectId);
    expect(lists.map((l) => l.name)).toEqual(["Neu", "Alt"]);
  });
});

describe("getListWithItems", () => {
  it("returns items ordered by sortIndex, each with its catalog item (name source)", async () => {
    const list = await createList(db, { projectId, name: "Einkauf" });
    const milk = await db.catalogItem.create({
      data: { projectId, name: "Milch", normalizedName: "milch" },
    });
    const bread = await db.catalogItem.create({
      data: { projectId, name: "Brot", normalizedName: "brot" },
    });
    // Inserted out of order on purpose: read order must come from sortIndex, not insertion.
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: bread.id, sortIndex: 2 },
    });
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: milk.id, sortIndex: 1 },
    });

    const loaded = await getListWithItems(db, list.id);
    expect(loaded?.items.map((i) => i.catalogItem.name)).toEqual(["Milch", "Brot"]);
  });

  it("returns null for an unknown list", async () => {
    expect(await getListWithItems(db, "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b")).toBeNull();
  });
});

describe("renameList", () => {
  it("changes the name", async () => {
    const list = await createList(db, { projectId, name: "Alt" });
    const renamed = await renameList(db, list.id, "Neu");
    expect(renamed.name).toBe("Neu");
  });

  it("rejects an empty (whitespace-only) name with 400", async () => {
    const list = await createList(db, { projectId, name: "Alt" });
    await expect(renameList(db, list.id, "   ")).rejects.toMatchObject({ status: 400 });
  });
});

describe("deleteList", () => {
  it("deletes the list and cascades its items", async () => {
    const list = await createList(db, { projectId, name: "Weg" });
    const item = await db.catalogItem.create({
      data: { projectId, name: "Milch", normalizedName: "milch" },
    });
    await db.listItem.create({ data: { listId: list.id, catalogItemId: item.id, sortIndex: 1 } });

    await deleteList(db, list.id);
    expect(await getListWithItems(db, list.id)).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(0);
  });
});
