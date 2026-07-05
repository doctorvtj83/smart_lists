import { PrismaClient, type List } from "@prisma/client";
import { randomUUID } from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { applyOperation, parseOperation } from "./operations";

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

// Convenience: add one item and return it (most cases need an existing entry to mutate).
async function addMilk(itemId = randomUUID()) {
  return (await applyOperation(db, list, {
    op: "add_item",
    itemId,
    name: "Milch",
    quantity: 1,
    unit: "l",
    category: "Kühlregal",
  }))!;
}

// Helper for the synchronous parse errors: capture the thrown value and assert its status.
// (toThrowError only matches class/message; the STATUS is what the HTTP boundary cares about.)
function expectParseError(body: unknown, status: number) {
  try {
    parseOperation(body);
    expect.unreachable("parseOperation should have thrown");
  } catch (error) {
    expect(error).toMatchObject({ status });
  }
}

describe("parseOperation", () => {
  it("parses a valid add_item body", () => {
    const op = parseOperation({ op: "add_item", itemId: randomUUID(), name: "Brot" });
    expect(op.op).toBe("add_item");
  });

  it("rejects an unknown op with 400", () => {
    expectParseError({ op: "explode", itemId: randomUUID() }, 400);
  });

  it("rejects a missing/non-string itemId with 400", () => {
    expectParseError({ op: "remove_item" }, 400);
  });

  it("rejects an update_item with an unknown field with 400", () => {
    expectParseError({ op: "update_item", itemId: randomUUID(), field: "checked", value: true }, 400);
  });

  it("rejects a non-object body with 400", () => {
    expectParseError(null, 400);
  });
});

describe("add_item", () => {
  it("creates the entry with the client-supplied id, linked to a catalog item", async () => {
    const itemId = randomUUID();
    const item = await addMilk(itemId);
    expect(item.id).toBe(itemId); // stable client-generated identity (offline-prep)
    expect(item.quantity).toBe(1);
    expect(item.unit).toBe("l");
    expect(item.category).toBe("Kühlregal");
    expect(item.checked).toBe(false);
    expect(item.sortIndex).toBe(1); // first entry -> max(0) + 1

    const catalogItem = await db.catalogItem.findUnique({ where: { id: item.catalogItemId } });
    expect(catalogItem?.normalizedName).toBe("milch");
  });

  it("reuses the catalog item for a known name spelled differently", async () => {
    await addMilk();
    const second = (await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: " MILCH ",
    }))!;
    expect(await db.catalogItem.count({ where: { projectId } })).toBe(1);
    expect(second.sortIndex).toBe(2); // appended after the first entry
  });

  it("inherits category/unit from the catalog defaults when not supplied", async () => {
    await db.catalogItem.create({
      data: {
        projectId,
        name: "Butter",
        normalizedName: "butter",
        defaultCategory: "Kühlregal",
        defaultUnit: "Stück",
      },
    });
    const item = (await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Butter",
    }))!;
    expect(item.category).toBe("Kühlregal"); // snapshot of the default at add time
    expect(item.unit).toBe("Stück");
  });

  // IDEMPOTENCY (the §7 merge seam, add side): replaying the same add must not duplicate.
  it("is idempotent: replaying the same itemId returns the existing entry unchanged", async () => {
    const itemId = randomUUID();
    await addMilk(itemId);
    const replay = (await applyOperation(db, list, {
      op: "add_item",
      itemId,
      name: "Milch",
      quantity: 99, // replay carries different values on purpose -> must NOT overwrite
    }))!;
    expect(replay.quantity).toBe(1); // original values win; a replay is a no-op
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
  });

  it("rejects an itemId that already exists in ANOTHER list with 409", async () => {
    const otherList = await db.list.create({ data: { projectId, name: "Andere" } });
    const itemId = randomUUID();
    await addMilk(itemId);
    await expect(
      applyOperation(db, otherList, { op: "add_item", itemId, name: "Milch" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a malformed itemId with 400", async () => {
    await expect(
      applyOperation(db, list, { op: "add_item", itemId: "not-a-uuid", name: "Milch" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a non-finite or non-positive quantity with 400", async () => {
    await expect(
      applyOperation(db, list, { op: "add_item", itemId: randomUUID(), name: "M", quantity: 0 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      applyOperation(db, list, { op: "add_item", itemId: randomUUID(), name: "M", quantity: NaN }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an over-long unit or category with 400", async () => {
    await expect(
      applyOperation(db, list, {
        op: "add_item",
        itemId: randomUUID(),
        name: "M",
        unit: "x".repeat(101),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("update_item", () => {
  it("updates a single field and bumps updatedAt (the LWW timestamp)", async () => {
    const item = await addMilk();
    const updated = (await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "quantity",
      value: 2,
    }))!;
    expect(updated.quantity).toBe(2);
    expect(updated.unit).toBe("l"); // untouched fields stay (field-granular by design)
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(item.updatedAt.getTime());
  });

  it("can null out a nullable field (e.g. clear the category)", async () => {
    const item = await addMilk();
    const updated = (await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "category",
      value: null,
    }))!;
    expect(updated.category).toBeNull();
  });

  it("can reorder via sortIndex", async () => {
    const item = await addMilk();
    const updated = (await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "sortIndex",
      value: 5,
    }))!;
    expect(updated.sortIndex).toBe(5);
  });

  it("rejects a wrongly-typed value for the field with 400", async () => {
    const item = await addMilk();
    await expect(
      applyOperation(db, list, {
        op: "update_item",
        itemId: item.id,
        field: "quantity",
        value: "viele",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 for an entry that does not exist in this list", async () => {
    await expect(
      applyOperation(db, list, {
        op: "update_item",
        itemId: randomUUID(),
        field: "quantity",
        value: 2,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("check_item", () => {
  it("checks and unchecks an entry", async () => {
    const item = await addMilk();
    const checked = (await applyOperation(db, list, {
      op: "check_item",
      itemId: item.id,
      checked: true,
    }))!;
    expect(checked.checked).toBe(true);
    const unchecked = (await applyOperation(db, list, {
      op: "check_item",
      itemId: item.id,
      checked: false,
    }))!;
    expect(unchecked.checked).toBe(false);
  });

  it("throws 404 for an entry that does not exist in this list", async () => {
    await expect(
      applyOperation(db, list, { op: "check_item", itemId: randomUUID(), checked: true }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("remove_item", () => {
  it("removes the entry and returns null", async () => {
    const item = await addMilk();
    const result = await applyOperation(db, list, { op: "remove_item", itemId: item.id });
    expect(result).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(0);
  });

  // IDEMPOTENCY (the §7 merge seam, remove side): "already gone" is success, not an error —
  // a replayed remove (Phase 2 queue) or two users removing the same entry must both succeed.
  it("is idempotent: removing a missing entry is a silent no-op", async () => {
    await expect(
      applyOperation(db, list, { op: "remove_item", itemId: randomUUID() }),
    ).resolves.toBeNull();
  });

  it("does not remove an entry that belongs to another list", async () => {
    const otherList = await db.list.create({ data: { projectId, name: "Andere" } });
    const item = await addMilk();
    await applyOperation(db, otherList, { op: "remove_item", itemId: item.id });
    expect(await db.listItem.count({ where: { id: item.id } })).toBe(1); // still there
  });
});

// Two operations on DIFFERENT entries must coexist untouched (§7: "unabhängige Operationen
// koexistieren") — the entry-granular model guarantees no cross-entry interference.
describe("independent operations", () => {
  it("operations on different entries do not affect each other", async () => {
    const milk = await addMilk();
    const bread = (await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Brot",
    }))!;
    await applyOperation(db, list, { op: "check_item", itemId: milk.id, checked: true });
    await applyOperation(db, list, {
      op: "update_item",
      itemId: bread.id,
      field: "quantity",
      value: 2,
    });

    const items = await db.listItem.findMany({ where: { listId: list.id } });
    const milkRow = items.find((i) => i.id === milk.id)!;
    const breadRow = items.find((i) => i.id === bread.id)!;
    expect(milkRow.checked).toBe(true);
    expect(milkRow.quantity).toBe(1); // untouched by the bread update
    expect(breadRow.quantity).toBe(2);
    expect(breadRow.checked).toBe(false); // untouched by the milk check
  });
});
