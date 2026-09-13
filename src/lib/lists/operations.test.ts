import { PrismaClient, type List } from "@prisma/client";
import { randomUUID } from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { applyOperation, applyOperationDetailed, parseOperation } from "./operations";

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

describe("catalog flow-back", () => {
  it("add_item with an explicit category seeds the catalog default", async () => {
    await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Bananen",
      category: "Obst",
    });
    const cat = await db.catalogItem.findFirstOrThrow({
      where: { projectId, normalizedName: "bananen" },
    });
    expect(cat.defaultCategory).toBe("Obst"); // learned from the add-time value
  });

  it("update_item category flows back to the catalog default", async () => {
    const item = await addMilk(); // adds Milch (category "Kühlregal") -> default seeded on add
    await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "category",
      value: "Vorrat",
    });
    const cat = await db.catalogItem.findUniqueOrThrow({ where: { id: item.catalogItemId } });
    expect(cat.defaultCategory).toBe("Vorrat"); // edit overwrites the default (last value wins)
  });

  it("clearing an entry's category does NOT erase the catalog default", async () => {
    const item = await addMilk(); // default becomes "Kühlregal"
    await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "category",
      value: null,
    });
    const cat = await db.catalogItem.findUniqueOrThrow({ where: { id: item.catalogItemId } });
    expect(cat.defaultCategory).toBe("Kühlregal"); // unchanged
  });

  it("a later add of the same article inherits the flowed-back default", async () => {
    const item = await addMilk();
    await applyOperation(db, list, {
      op: "update_item",
      itemId: item.id,
      field: "category",
      value: "Vorrat",
    });
    // Add the same article WITHOUT a category -> inherits the (now updated) catalog default.
    const created = (await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Milch",
    }))!;
    expect(created.category).toBe("Vorrat");
  });
});

// ---------------------------------------------------------------------------
// Slice 17 — entry merging. The funnel's most delicate behaviour: an add may now
// resolve to a row the client never named.
// ---------------------------------------------------------------------------

/** Adds one entry through the funnel and returns the detailed result. */
async function add(operation: {
  itemId?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
}) {
  return applyOperationDetailed(db, list, {
    op: "add_item",
    itemId: operation.itemId ?? randomUUID(),
    name: operation.name,
    quantity: operation.quantity,
    unit: operation.unit,
    category: operation.category,
  });
}

describe("add_item — merging", () => {
  it("adds the quantity to an existing unchecked row and returns THAT row", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const secondId = randomUUID();

    const { item, merge } = await add({
      itemId: secondId,
      name: "Milch",
      quantity: 2,
      unit: "l",
    });

    expect(item!.id).toBe(first.item!.id); // the TARGET row, not the id we sent
    expect(item!.id).not.toBe(secondId);
    expect(item!.quantity).toBe(3);
    expect(merge).toMatchObject({
      targetItemId: first.item!.id,
      name: "Milch",
      previousQuantity: 1,
      quantity: 3,
      unit: "l",
    });

    // The whole point: ONE row, not two.
    const rows = await db.listItem.findMany({ where: { listId: list.id } });
    expect(rows).toHaveLength(1);
  });

  it("leaves the target's category, unit spelling, sortIndex and checked state untouched", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "L", category: "Kühlregal" });

    await add({ name: "Milch", quantity: 2, unit: "l", category: "Vorrat" });

    const row = await db.listItem.findUniqueOrThrow({ where: { id: first.item!.id } });
    expect(row.quantity).toBe(3); // the ONLY field a merge changes
    expect(row.unit).toBe("L"); // the existing spelling wins
    expect(row.category).toBe("Kühlregal"); // never silently re-filed
    expect(row.sortIndex).toBe(first.item!.sortIndex);
    expect(row.checked).toBe(false);
  });

  it("records the absorbed add in the ledger under the client's id", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const secondId = randomUUID();

    await add({ itemId: secondId, name: "Milch", quantity: 2, unit: "l" });

    const ledger = await db.absorbedEntry.findUniqueOrThrow({ where: { id: secondId } });
    expect(ledger.listId).toBe(list.id);
    expect(ledger.targetItemId).toBe(first.item!.id);
    expect(ledger.quantity).toBe(2); // what THIS add contributed, not the total
  });

  it("does not merge into a checked row", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    await applyOperation(db, list, { op: "check_item", itemId: first.item!.id, checked: true });

    const { item, merge } = await add({ name: "Milch", quantity: 2, unit: "l" });

    expect(merge).toBeNull();
    expect(item!.id).not.toBe(first.item!.id);
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });

  it("does not merge when the incoming add carries no quantity", async () => {
    await add({ name: "Milch", quantity: 1, unit: "l" });

    const { merge } = await add({ name: "Milch" });

    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });

  it("does not merge when the existing row carries no quantity", async () => {
    await add({ name: "Milch" });

    const { merge } = await add({ name: "Milch", quantity: 2, unit: null });

    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });

  it("does not merge across different units (1 l and 500 ml stay apart)", async () => {
    await add({ name: "Milch", quantity: 1, unit: "l" });

    const { merge } = await add({ name: "Milch", quantity: 500, unit: "ml" });

    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(2);
  });

  it("merges across a unit case difference", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "L" });

    const { item } = await add({ name: "Milch", quantity: 2, unit: "l" });

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(3);
  });

  it("merges into a row whose unit was INHERITED from the catalog default", async () => {
    // The catalog knows Joghurt comes in Becher; neither add names a unit, so both inherit it —
    // and must therefore land in the same bucket (funnel step 5 resolves the unit BEFORE matching).
    await db.catalogItem.create({
      data: { projectId, name: "Joghurt", normalizedName: "joghurt", defaultUnit: "Becher" },
    });
    const first = await add({ name: "Joghurt", quantity: 2 });

    const { item } = await add({ name: "Joghurt", quantity: 3 });

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(5);
    expect(item!.unit).toBe("Becher");
  });

  it("merges two rows of the same article that differ only in spelling", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });

    // Article identity is the normalized name, so „ milch " is the SAME article.
    const { item } = await add({ name: " milch ", quantity: 1.5, unit: "l" });

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(2.5);
  });

  it("rounds the sum to three decimals", async () => {
    await add({ name: "Milch", quantity: 0.1, unit: "l" });

    const { item } = await add({ name: "Milch", quantity: 0.2, unit: "l" });
    // Prisma deserializes both 0.3 and PostgreSQL's binary-float tail as the JavaScript number
    // 0.3. Reading the database value as text proves the STORED quantity is normalized too, which
    // keeps persistence and formatGermanNumber's displayed value one and the same.
    const [stored] = await db.$queryRaw<Array<{ quantityText: string }>>`
      SELECT quantity::text AS "quantityText"
      FROM list_items
      WHERE id = ${item!.id}::uuid
    `;

    expect(item!.quantity).toBe(0.3);
    expect(stored.quantityText).toBe("0.3");
  });

  it("merges into the lowest sortIndex when two rows qualify", async () => {
    const top = await add({ name: "Milch", quantity: 1, unit: "l" });
    await add({ name: "Brot" });
    // A second Milch row can only exist from before this slice (or via a checked row that got
    // unchecked) — the funnel is still required to pick deterministically.
    await db.listItem.create({
      data: {
        listId: list.id,
        catalogItemId: top.item!.catalogItemId,
        quantity: 5,
        unit: "l",
        sortIndex: 99,
      },
    });

    const { item } = await add({ name: "Milch", quantity: 1, unit: "l" });

    expect(item!.id).toBe(top.item!.id);
    expect(item!.quantity).toBe(2);
  });

  it("still flows an explicitly supplied unit back to the catalog on a merged add", async () => {
    // Catalog memory is independent of WHERE the entry landed (design §3, step 7).
    await add({ name: "Milch", quantity: 1, unit: "l" });

    await add({ name: "Milch", quantity: 2, unit: "l", category: "Kühlregal" });

    const article = await db.catalogItem.findFirstOrThrow({
      where: { projectId, normalizedName: "milch" },
    });
    expect(article.defaultCategory).toBe("Kühlregal");
    expect(article.defaultUnit).toBe("l");
  });

  it("reports no merge for an ordinary add", async () => {
    const { item, merge } = await add({ name: "Brot", quantity: 1 });

    expect(merge).toBeNull();
    expect(item!.quantity).toBe(1);
  });

  it("keeps applyOperation's old contract: it returns the affected row", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });

    const returned = await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Milch",
      quantity: 2,
      unit: "l",
    });

    expect(returned!.id).toBe(first.item!.id);
    expect(returned!.quantity).toBe(3);
  });
});

describe("add_item — merge idempotency", () => {
  // THE test of this slice. Without the ledger, replaying a merged add adds the amount again —
  // silently, with no duplicate row to reveal it.
  it("replaying a merged add does not add the quantity twice", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    const merged = { itemId: replayId, name: "Milch", quantity: 2, unit: "l" };

    await add(merged);
    const { item, merge } = await add(merged); // the retry

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(3); // NOT 5
    // The replay reports the same outcome the first application did, so a retried request paints
    // the same banner rather than nothing.
    expect(merge).toMatchObject({ previousQuantity: 1, quantity: 3 });
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(1);
  });

  it("returns no merge outcome when the target quantity was cleared before replay", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    const merged = { itemId: replayId, name: "Milch", quantity: 2, unit: "l" };
    await add(merged);
    // A later absolute edit may intentionally remove the number. The ledger still proves the add
    // was applied, but there is no meaningful sum left from which to reconstruct a banner.
    await applyOperation(db, list, {
      op: "update_item",
      itemId: first.item!.id,
      field: "quantity",
      value: null,
    });

    const { item, merge } = await add(merged);

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBeNull();
    expect(merge).toBeNull();
    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(1);
  });

  // The subtlest behaviour in the feature, and the consistency rule with remove_item: once the
  // target row is gone, the client's id is free again — exactly as it is after a remove.
  it("re-creates the entry when the target row was deleted since", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    const merged = { itemId: replayId, name: "Milch", quantity: 2, unit: "l" };
    await add(merged);

    await applyOperation(db, list, { op: "remove_item", itemId: first.item!.id });
    const { item, merge } = await add(merged); // the retry, target gone

    expect(item!.id).toBe(replayId); // a real row under the client's own id
    expect(item!.quantity).toBe(2);
    expect(merge).toBeNull();
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
  });

  it("keeps the stale ledger row harmless on a second replay after that", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    const merged = { itemId: replayId, name: "Milch", quantity: 2, unit: "l" };
    await add(merged);
    await applyOperation(db, list, { op: "remove_item", itemId: first.item!.id });
    await add(merged); // re-created under replayId

    const { item } = await add(merged); // and again

    // Step 2 (a row with this id exists) is reached before step 3, so the stale ledger row pointing
    // at the deleted target is never consulted again.
    expect(item!.id).toBe(replayId);
    expect(item!.quantity).toBe(2);
    expect(await db.listItem.count({ where: { listId: list.id } })).toBe(1);
  });

  it("composes two different adds into the correct sum", async () => {
    const first = await add({ name: "Milch", quantity: 1, unit: "l" });

    await add({ name: "Milch", quantity: 2, unit: "l" });
    const { item } = await add({ name: "Milch", quantity: 0.5, unit: "l" });

    expect(item!.id).toBe(first.item!.id);
    expect(item!.quantity).toBe(3.5);
    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(2);
  });

  it("rejects a ledger id replayed against a DIFFERENT list with 409", async () => {
    await add({ name: "Milch", quantity: 1, unit: "l" });
    const replayId = randomUUID();
    await add({ itemId: replayId, name: "Milch", quantity: 2, unit: "l" });

    const otherList = await db.list.create({ data: { projectId, name: "Zweite Liste" } });

    // Same rule as a ListItem id reused across lists: a reused UUID is a client bug, and it must
    // surface as a clean 409 rather than a Prisma unique-constraint 500.
    await expect(
      applyOperationDetailed(db, otherList, {
        op: "add_item",
        itemId: replayId,
        name: "Milch",
        quantity: 2,
        unit: "l",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("discards the ledger with the list it belongs to", async () => {
    await add({ name: "Milch", quantity: 1, unit: "l" });
    await add({ name: "Milch", quantity: 2, unit: "l" });
    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(1);

    await db.list.delete({ where: { id: list.id } });

    expect(await db.absorbedEntry.count({ where: { listId: list.id } })).toBe(0);
  });
});
