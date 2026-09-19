import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { ApiError } from "@/lib/http/errors";
import { recipeLabels } from "./labels";
import { addRecipeItem, createRecipe } from "./recipes";
import { applyRecipesToList, createListWithRecipes } from "./apply";

const db = new PrismaClient();
const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

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

/** A catalog article, optionally with a default unit (to prove apply-time inheritance). */
async function makeArticle(name: string, defaultUnit: string | null = null) {
  return db.catalogItem.create({
    data: { projectId, name, normalizedName: name.trim().toLowerCase(), defaultUnit },
  });
}

/** An empty active list. */
async function makeList(name = "Samstag") {
  return db.list.create({ data: { projectId, name } });
}

/** A recipe with lines, in the order given. */
async function makeRecipe(
  name: string,
  lines: { catalogItemId: string; quantity: number | null; unit: string | null }[],
) {
  const recipe = await createRecipe(db, { projectId, name }, labels);
  for (const line of lines) {
    await addRecipeItem(db, { projectId, recipeId: recipe.id, ...line }, labels);
  }
  return recipe;
}

/** The list's entries with their article names, in list order — what the assertions read. */
async function entriesOf(listId: string) {
  const items = await db.listItem.findMany({
    where: { listId },
    orderBy: { sortIndex: "asc" },
    include: { catalogItem: true },
  });
  return items.map((item) => ({
    name: item.catalogItem.name,
    quantity: item.quantity,
    unit: item.unit,
  }));
}

describe("applyRecipesToList", () => {
  it("multiplies the quantities onto the list", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 0.5, unit: "l" },
    ]);
    const list = await makeList();

    const result = await applyRecipesToList(
      db,
      list,
      [{ recipeId: recipe.id, count: 3 }],
      randomUUID(),
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 1.5, unit: "l" }]);
    expect(result).toEqual({
      applied: [{ recipeId: recipe.id, name: "Lasagne", count: 3 }],
      added: 1,
      merged: 0,
    });
  });

  it("adds an unquantified line once, whatever the count (D4)", async () => {
    const salt = await makeArticle("Salz");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: salt.id, quantity: null, unit: null },
    ]);
    const list = await makeList();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 5 }], randomUUID(), labels);

    expect(await entriesOf(list.id)).toEqual([{ name: "Salz", quantity: null, unit: null }]);
  });

  // UAT Check 5: applying the same recipe again must grow quantified rows and leave unquantified
  // ones (Salz) as a single line — D1's presence merge, not a second indistinguishable row.
  it("does not duplicate an unquantified line when the same recipe is applied again", async () => {
    const apples = await makeArticle("Äpfel");
    const bananas = await makeArticle("Banenen");
    const salt = await makeArticle("Salz");
    const recipe = await makeRecipe("Obstsalat", [
      { catalogItemId: apples.id, quantity: 500, unit: "g" },
      { catalogItemId: bananas.id, quantity: 3, unit: null },
      { catalogItemId: salt.id, quantity: null, unit: null },
    ]);
    const list = await makeList();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], randomUUID(), labels);
    const second = await applyRecipesToList(
      db,
      list,
      [{ recipeId: recipe.id, count: 1 }],
      randomUUID(),
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([
      { name: "Äpfel", quantity: 1500, unit: "g" },
      { name: "Banenen", quantity: 9, unit: null },
      { name: "Salz", quantity: null, unit: null },
    ]);
    expect(second.added).toBe(0);
    expect(second.merged).toBe(3);
  });

  it("inherits the catalog default unit for a line that has none", async () => {
    const yoghurt = await makeArticle("Joghurt", "Becher");
    const recipe = await makeRecipe("Frühstück", [
      { catalogItemId: yoghurt.id, quantity: 2, unit: null },
    ]);
    const list = await makeList();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], randomUUID(), labels);

    // The inheritance is add_item's step 5 — apply must NOT have its own copy of that rule.
    expect(await entriesOf(list.id)).toEqual([
      { name: "Joghurt", quantity: 4, unit: "Becher" },
    ]);
  });

  it("merges two recipes that need the same article in the same unit", async () => {
    const milk = await makeArticle("Milch");
    const lasagne = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 1, unit: "l" },
    ]);
    const chili = await makeRecipe("Chili", [{ catalogItemId: milk.id, quantity: 0.5, unit: "l" }]);
    const list = await makeList();

    const result = await applyRecipesToList(
      db,
      list,
      [
        { recipeId: lasagne.id, count: 2 },
        { recipeId: chili.id, count: 1 },
      ],
      randomUUID(),
      labels,
    );

    // ONE row: Slice 17's merge did the work, because both sides carry a quantity and the unit.
    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 2.5, unit: "l" }]);
    expect(result.added).toBe(1);
    expect(result.merged).toBe(1);
  });

  it("is a no-op when the SAME token is applied twice (the retry case)", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const list = await makeList();
    const token = randomUUID();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], token, labels);
    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], token, labels);

    // The sum must NOT have moved. This is the whole point of the derived ids.
    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 2, unit: "l" }]);
  });

  it("applies again under a NEW token — a second deliberate apply is not a replay", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const list = await makeList();

    await applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 2 }], randomUUID(), labels);
    const second = await applyRecipesToList(
      db,
      list,
      [{ recipeId: recipe.id, count: 2 }],
      randomUUID(),
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 4, unit: "l" }]);
    expect(second.merged).toBe(1);
    expect(second.added).toBe(0);
  });

  it("skips a selection with count 0 — the picker's „not chosen“", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const list = await makeList();

    const result = await applyRecipesToList(
      db,
      list,
      [{ recipeId: recipe.id, count: 0 }],
      randomUUID(),
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([]);
    expect(result).toEqual({ applied: [], added: 0, merged: 0 });
  });

  it("refuses a count above 99 and writes NOTHING, not even the valid recipe before it", async () => {
    const milk = await makeArticle("Milch");
    const salt = await makeArticle("Salz");
    const good = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const bad = await makeRecipe("Chili", [{ catalogItemId: salt.id, quantity: 1, unit: null }]);
    const list = await makeList();

    await expect(
      applyRecipesToList(
        db,
        list,
        [
          { recipeId: good.id, count: 1 },
          { recipeId: bad.id, count: 100 },
        ],
        randomUUID(),
        labels,
      ),
    ).rejects.toThrow("Anzahl muss zwischen 1 und 99 liegen");

    expect(await entriesOf(list.id)).toEqual([]);
  });

  it("refuses a completed list with the spec's 409", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [{ catalogItemId: milk.id, quantity: 1, unit: "l" }]);
    const list = await db.list.create({
      data: { projectId, name: "Erledigt", status: "completed", completedAt: new Date() },
    });

    await expect(
      applyRecipesToList(db, list, [{ recipeId: recipe.id, count: 1 }], randomUUID(), labels),
    ).rejects.toThrow("Die Liste ist bereits abgeschlossen");
    expect(await entriesOf(list.id)).toEqual([]);
  });

  it("404s on a recipe from another project, writing nothing", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Fremd", ownerId: otherUser.id } });
    const foreignArticle = await db.catalogItem.create({
      data: { projectId: otherProject.id, name: "Milch", normalizedName: "milch" },
    });
    const foreign = await createRecipe(db, { projectId: otherProject.id, name: "Fremd" }, labels);
    await addRecipeItem(
      db,
      { projectId: otherProject.id, recipeId: foreign.id, catalogItemId: foreignArticle.id },
      labels,
    );
    const list = await makeList();

    await expect(
      applyRecipesToList(db, list, [{ recipeId: foreign.id, count: 1 }], randomUUID(), labels),
    ).rejects.toThrow("Dieses Rezept gibt es nicht mehr");
    expect(await entriesOf(list.id)).toEqual([]);
  });

  it("answers a malformed recipe id with a 404, not a driver error", async () => {
    const list = await makeList();

    try {
      await applyRecipesToList(db, list, [{ recipeId: "not-a-uuid", count: 1 }], randomUUID(), labels);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(404);
    }
  });
});

describe("createListWithRecipes", () => {
  it("applies the recipes BEFORE the pre-fill, so the recipe rows come first", async () => {
    const milk = await makeArticle("Milch");
    const bread = await makeArticle("Brot");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 1, unit: "l" },
    ]);

    const list = await createListWithRecipes(
      db,
      {
        projectId,
        name: "Samstag",
        articleNames: ["Brot"],
        selections: [{ recipeId: recipe.id, count: 1 }],
        token: randomUUID(),
      },
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([
      { name: "Milch", quantity: 1, unit: "l" },
      { name: "Brot", quantity: null, unit: null },
    ]);
    expect(bread.id).toBeDefined(); // the article existed before the list did
  });

  it("skips a suggestion the recipes already put on the list (spec §6's ordering rule)", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 3, unit: "l" },
    ]);

    const list = await createListWithRecipes(
      db,
      {
        projectId,
        name: "Samstag",
        // The pre-fill would add a bare, quantity-less „Milch“ — which D1 would never merge into
        // the recipe's 3 l. Skipping it is what keeps the list from showing Milch twice.
        articleNames: ["Milch"],
        selections: [{ recipeId: recipe.id, count: 1 }],
        token: randomUUID(),
      },
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Milch", quantity: 3, unit: "l" }]);
  });

  it("matches the skip by NORMALIZED name, not by exact spelling", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 1, unit: "l" },
    ]);

    const list = await createListWithRecipes(
      db,
      {
        projectId,
        name: "Samstag",
        articleNames: ["  milch  "],
        selections: [{ recipeId: recipe.id, count: 1 }],
        token: randomUUID(),
      },
      labels,
    );

    expect(await entriesOf(list.id)).toHaveLength(1);
  });

  it("drops a duplicate inside the pre-fill itself", async () => {
    await makeArticle("Brot");

    const list = await createListWithRecipes(
      db,
      {
        projectId,
        name: "Samstag",
        articleNames: ["Brot", "Brot"],
        selections: [],
        token: randomUUID(),
      },
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Brot", quantity: null, unit: null }]);
  });

  it("behaves exactly like a plain pre-fill when no recipe is chosen", async () => {
    await makeArticle("Brot");

    const list = await createListWithRecipes(
      db,
      { projectId, name: "Samstag", articleNames: ["Brot"], selections: [], token: randomUUID() },
      labels,
    );

    expect(await entriesOf(list.id)).toEqual([{ name: "Brot", quantity: null, unit: null }]);
  });

  it("deletes the half-built list when the apply fails (compensating action)", async () => {
    const milk = await makeArticle("Milch");
    const recipe = await makeRecipe("Lasagne", [
      { catalogItemId: milk.id, quantity: 1, unit: "l" },
    ]);

    await expect(
      createListWithRecipes(
        db,
        {
          projectId,
          name: "Samstag",
          articleNames: ["Brot"],
          // 100 is out of range: the apply throws before it writes anything.
          selections: [{ recipeId: recipe.id, count: 100 }],
          token: randomUUID(),
        },
        labels,
      ),
    ).rejects.toThrow("Anzahl muss zwischen 1 und 99 liegen");

    // A list named „Samstag“ holding an arbitrary subset would appear under AKTIVE LISTEN with no
    // sign that anything went wrong.
    expect(await db.list.count({ where: { projectId } })).toBe(0);
  });
});
