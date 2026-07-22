import { PrismaClient, type List } from "@prisma/client";
import { randomUUID } from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { applyOperation } from "./operations";
import { computeCursor, getListDelta } from "./delta";

// Same DB-test setup as operations.test.ts: a real client against the Neon test branch, reset to a
// deterministic baseline before each test, with a fresh user/project/list.
const db = new PrismaClient();
let projectId: string;
let list: List;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
  list = await db.list.create({ data: { projectId, name: "Einkauf" } });
});

afterAll(async () => {
  await db.$disconnect();
});

// Add one entry through the REAL operations funnel (so updatedAt is stamped exactly as in prod) and
// return its id. Each awaited op does several Neon round-trips, so consecutive adds land in distinct
// milliseconds — the strict `> since` delta window is deterministic here.
async function addItem(name: string): Promise<string> {
  const itemId = randomUUID();
  await applyOperation(db, list, { op: "add_item", itemId, name });
  return itemId;
}

describe("computeCursor", () => {
  it("is 0 for an empty item set (nothing has been updated yet)", () => {
    expect(computeCursor([])).toBe(0);
  });

  it("returns the max updatedAt in epoch ms", () => {
    const a = new Date("2020-01-01T00:00:00.000Z");
    const b = new Date("2021-06-15T12:00:00.000Z");
    expect(computeCursor([{ updatedAt: a }, { updatedAt: b }])).toBe(b.getTime());
  });

  it("never goes below the given `since` (monotonic guard)", () => {
    const old = new Date("2020-01-01T00:00:00.000Z");
    const since = new Date("2021-01-01T00:00:00.000Z").getTime();
    // The newest remaining item is older than `since` (e.g. the newest entry was just deleted) —
    // the cursor must stay at `since`, never move backward.
    expect(computeCursor([{ updatedAt: old }], since)).toBe(since);
  });
});

describe("getListDelta", () => {
  it("baseline (no since): returns every item body, the full id set, and a positive cursor", async () => {
    const id1 = await addItem("Milch");
    const id2 = await addItem("Brot");
    const delta = await getListDelta(db, list.id);
    expect(delta.items.map((i) => i.name).sort()).toEqual(["Brot", "Milch"]);
    expect(delta.itemIds.slice().sort()).toEqual([id1, id2].sort());
    expect(delta.cursor).toBeGreaterThan(0);
    expect(delta.list).toMatchObject({
      id: list.id,
      name: "Einkauf",
      status: "active",
      completedAt: null,
    });
  });

  it("delta (with since): returns only bodies changed after the cursor, but ALWAYS the full id set", async () => {
    const id1 = await addItem("Milch");
    const baseline = await getListDelta(db, list.id); // cursor now covers id1
    const id2 = await addItem("Brot"); // changed AFTER the cursor
    const delta = await getListDelta(db, list.id, baseline.cursor);
    expect(delta.items.map((i) => i.name)).toEqual(["Brot"]); // only the new body
    expect(delta.itemIds.slice().sort()).toEqual([id1, id2].sort()); // but both ids (full set)
  });

  it("makes a deletion observable via a shrunken id set (no tombstone needed)", async () => {
    const id1 = await addItem("Milch");
    const baseline = await getListDelta(db, list.id);
    await applyOperation(db, list, { op: "remove_item", itemId: id1 });
    const delta = await getListDelta(db, list.id, baseline.cursor);
    expect(delta.items).toEqual([]); // nothing NEW changed...
    expect(delta.itemIds).toEqual([]); // ...but the id is gone -> the client prunes it
  });

  it("keeps the cursor monotonic across a deletion-only poll (never moves backward)", async () => {
    await addItem("Milch");
    const first = await getListDelta(db, list.id);
    const id2 = await addItem("Brot");
    const second = await getListDelta(db, list.id, first.cursor);
    await applyOperation(db, list, { op: "remove_item", itemId: id2 }); // remove the NEWEST entry
    const third = await getListDelta(db, list.id, second.cursor);
    expect(third.cursor).toBeGreaterThanOrEqual(second.cursor);
  });

  it("surfaces a check_item change in the delta with checked=true", async () => {
    const id1 = await addItem("Milch");
    const baseline = await getListDelta(db, list.id);
    await applyOperation(db, list, { op: "check_item", itemId: id1, checked: true });
    const delta = await getListDelta(db, list.id, baseline.cursor);
    expect(delta.items).toHaveLength(1);
    expect(delta.items[0]).toMatchObject({ id: id1, checked: true });
  });

  it("serializes list completion metadata as epoch ms", async () => {
    const when = new Date("2022-02-02T00:00:00.000Z");
    await db.list.update({
      where: { id: list.id },
      data: { status: "completed", completedAt: when },
    });
    const delta = await getListDelta(db, list.id);
    expect(delta.list.status).toBe("completed");
    expect(delta.list.completedAt).toBe(when.getTime());
  });
});
