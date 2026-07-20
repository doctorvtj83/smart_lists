import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import {
  allItemsChecked,
  completeList,
  createList,
  deleteList,
  getListWithItems,
  listLists,
  renameList,
  reopenList,
} from "./lists";

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

  it("filters to active lists when status='active'", async () => {
    const active = await createList(db, { projectId, name: "Offen" });
    const done = await createList(db, { projectId, name: "Fertig" });
    await completeList(db, done.id);
    const lists = await listLists(db, projectId, "active");
    expect(lists.map((l) => l.name)).toEqual(["Offen"]);
    expect(active.id).toBeTruthy(); // (created above; referenced to satisfy the linter)
  });

  it("returns completed lists newest-completed first when status='completed'", async () => {
    const first = await createList(db, { projectId, name: "Zuerst" });
    const second = await createList(db, { projectId, name: "Danach" });
    await completeList(db, first.id);
    // Force a later completedAt on `second` so the desc ordering is deterministic.
    await db.list.update({
      where: { id: second.id },
      data: { status: "completed", completedAt: new Date(Date.now() + 60_000) },
    });
    const archived = await listLists(db, projectId, "completed");
    expect(archived.map((l) => l.name)).toEqual(["Danach", "Zuerst"]);
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

describe("completeList", () => {
  it("marks an active list completed and stamps completedAt", async () => {
    const list = await createList(db, { projectId, name: "Einkauf" });
    const completed = await completeList(db, list.id);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it("is idempotent: re-completing does NOT re-stamp completedAt", async () => {
    const list = await createList(db, { projectId, name: "Einkauf" });
    await completeList(db, list.id);
    // Force a known past timestamp, then complete again: the status guard must skip the write, so
    // the timestamp Slice 5 orders by is preserved.
    const past = new Date("2020-01-01T00:00:00.000Z");
    await db.list.update({ where: { id: list.id }, data: { completedAt: past } });
    const again = await completeList(db, list.id);
    expect(again.completedAt).toEqual(past); // unchanged — not re-stamped to "now"
  });
});

describe("reopenList", () => {
  it("reopens a completed list (undo): status active, completedAt cleared", async () => {
    const list = await createList(db, { projectId, name: "Einkauf" });
    await completeList(db, list.id);
    const reopened = await reopenList(db, list.id);
    expect(reopened.status).toBe("active");
    expect(reopened.completedAt).toBeNull();
  });
});

describe("allItemsChecked", () => {
  it("is false for a list with no entries (nothing to complete)", () => {
    expect(allItemsChecked([])).toBe(false);
  });

  it("is false when at least one entry is unchecked", () => {
    expect(allItemsChecked([{ checked: true }, { checked: false }])).toBe(false);
  });

  it("is true when the list has entries and all are checked", () => {
    expect(allItemsChecked([{ checked: true }, { checked: true }])).toBe(true);
  });
});
