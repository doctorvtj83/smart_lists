import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "@/lib/projects/projects";
import { listActiveListSummaries, listArchivedListSummaries } from "./summaries";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const project = await createProject(db, { name: "Haushalt", ownerId: owner.id });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

// Adds one entry to a list. The catalog item is created inline because a ListItem
// cannot exist without one (article identity, MVP design §3.1).
async function addEntry(listId: string, name: string, checked: boolean, sortIndex: number) {
  const catalogItem = await db.catalogItem.create({
    data: { projectId, name, normalizedName: name.toLowerCase() },
  });
  await db.listItem.create({
    data: { listId, catalogItemId: catalogItem.id, checked, sortIndex },
  });
}

describe("listActiveListSummaries", () => {
  it("returns an empty array for a project without lists", async () => {
    expect(await listActiveListSummaries(db, projectId)).toEqual([]);
  });

  it("counts only UNCHECKED entries as open", async () => {
    const list = await db.list.create({ data: { projectId, name: "Einkauf" } });
    await addEntry(list.id, "Milch", false, 0);
    await addEntry(list.id, "Brot", false, 1);
    await addEntry(list.id, "Butter", true, 2);

    const [summary] = await listActiveListSummaries(db, projectId);
    expect(summary).toEqual({ id: list.id, name: "Einkauf", openCount: 2 });
  });

  it("reports 0 open for a list with no entries at all", async () => {
    const list = await db.list.create({ data: { projectId, name: "Leer" } });
    const [summary] = await listActiveListSummaries(db, projectId);
    expect(summary.id).toBe(list.id);
    expect(summary.openCount).toBe(0);
  });

  it("excludes completed lists — the archive is a different screen", async () => {
    await db.list.create({ data: { projectId, name: "Offen" } });
    await db.list.create({
      data: { projectId, name: "Fertig", status: "completed", completedAt: new Date() },
    });

    const summaries = await listActiveListSummaries(db, projectId);
    expect(summaries.map((s) => s.name)).toEqual(["Offen"]);
  });

  it("orders newest-created first, like listLists('active')", async () => {
    await db.list.create({ data: { projectId, name: "Zuerst" } });
    await db.list.create({ data: { projectId, name: "Danach" } });

    const summaries = await listActiveListSummaries(db, projectId);
    expect(summaries.map((s) => s.name)).toEqual(["Danach", "Zuerst"]);
  });
});

describe("listArchivedListSummaries", () => {
  it("returns an empty array for a project that never completed a list", async () => {
    await db.list.create({ data: { projectId, name: "Offen" } });
    expect(await listArchivedListSummaries(db, projectId)).toEqual([]);
  });

  it("returns completed lists newest-completed first, with their date", async () => {
    const older = new Date("2026-07-01T10:00:00Z");
    const newer = new Date("2026-07-29T10:00:00Z");
    await db.list.create({
      data: { projectId, name: "Alt", status: "completed", completedAt: older },
    });
    await db.list.create({
      data: { projectId, name: "Neu", status: "completed", completedAt: newer },
    });

    const summaries = await listArchivedListSummaries(db, projectId);
    expect(summaries.map((s) => s.name)).toEqual(["Neu", "Alt"]);
    expect(summaries[0].completedAt?.toISOString()).toBe(newer.toISOString());
  });
});
