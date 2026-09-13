import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { ApiError } from "@/lib/http/errors";
import { recipeLabels } from "./labels";
import {
  createRecipe,
  deleteRecipe,
  getRecipeWithItems,
  listRecipes,
  renameRecipe,
} from "./recipes";

const db = new PrismaClient();
let projectId: string;

// The default wording. Passing it explicitly on every call is the point of ruling R4: the cores
// never read the project just to phrase an error.
const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

/** Fixtures are built directly, so a failure here points at THIS module. */
async function makeArticle(name: string) {
  return db.catalogItem.create({
    data: { projectId, name, normalizedName: name.trim().toLowerCase() },
  });
}

describe("createRecipe", () => {
  it("creates a recipe with the normalized identity key", async () => {
    const recipe = await createRecipe(db, { projectId, name: "  Lasagne  " }, labels);

    expect(recipe.name).toBe("Lasagne"); // display name: trimmed, spaces collapsed
    expect(recipe.normalizedName).toBe("lasagne"); // identity key: the catalog's rule
    expect(recipe.projectId).toBe(projectId);
  });

  it("accepts a client-generated id", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const recipe = await createRecipe(db, { projectId, id, name: "Chili" }, labels);
    expect(recipe.id).toBe(id);
  });

  it("rejects a second recipe with the same normalized name", async () => {
    await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    await expect(createRecipe(db, { projectId, name: " lasagne " }, labels)).rejects.toMatchObject({
      status: 409,
      message: "Ein Rezept mit diesem Namen existiert bereits",
    });
  });

  it("phrases the collision with the project's own label", async () => {
    const sets = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });
    await createRecipe(db, { projectId, name: "Lasagne" }, sets);

    await expect(createRecipe(db, { projectId, name: "Lasagne" }, sets)).rejects.toMatchObject({
      message: "Ein Set mit diesem Namen existiert bereits",
    });
  });

  it("rejects an empty name", async () => {
    await expect(createRecipe(db, { projectId, name: "   " }, labels)).rejects.toMatchObject({
      status: 400,
      message: "Name darf nicht leer sein",
    });
  });

  it("rejects a name over the length limit", async () => {
    await expect(
      createRecipe(db, { projectId, name: "x".repeat(201) }, labels),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("lets two projects hold a recipe of the same name", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });

    await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    // Uniqueness is (project, normalizedName) — recipes are project memory, not global.
    await expect(
      createRecipe(db, { projectId: other.id, name: "Lasagne" }, labels),
    ).resolves.toMatchObject({ name: "Lasagne" });
  });
});

describe("listRecipes", () => {
  it("returns recipes sorted with the German collator, each with its line count", async () => {
    const zwiebeln = await makeArticle("Zwiebeln");
    const milch = await makeArticle("Milch");
    const chili = await createRecipe(db, { projectId, name: "Chili" }, labels);
    await createRecipe(db, { projectId, name: "Älplermagronen" }, labels);
    await db.recipeItem.createMany({
      data: [
        { recipeId: chili.id, catalogItemId: zwiebeln.id, sortIndex: 0 },
        { recipeId: chili.id, catalogItemId: milch.id, sortIndex: 1 },
      ],
    });

    const summaries = await listRecipes(db, projectId);

    // "Ä" sorts next to "A" under the German collator, not after "Z".
    expect(summaries.map((summary) => summary.name)).toEqual(["Älplermagronen", "Chili"]);
    expect(summaries.map((summary) => summary.itemCount)).toEqual([0, 2]);
  });

  it("never returns another project's recipes", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);

    expect(await listRecipes(db, projectId)).toEqual([]);
  });
});

describe("getRecipeWithItems", () => {
  it("returns the lines by sortIndex, each with its catalog article", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");
    const hack = await makeArticle("Hackfleisch");
    await db.recipeItem.createMany({
      data: [
        { recipeId: recipe.id, catalogItemId: milch.id, quantity: 1, unit: "l", sortIndex: 1 },
        { recipeId: recipe.id, catalogItemId: hack.id, quantity: 500, unit: "g", sortIndex: 0 },
      ],
    });

    const loaded = await getRecipeWithItems(db, projectId, recipe.id);

    expect(loaded!.items.map((item) => item.catalogItem.name)).toEqual(["Hackfleisch", "Milch"]);
    expect(loaded!.items[0].quantity).toBe(500);
  });

  it("returns null for another project's recipe and for a malformed id", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    const foreign = await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);

    // Existence hiding: a foreign id must be indistinguishable from a missing one.
    expect(await getRecipeWithItems(db, projectId, foreign.id)).toBeNull();
    // A malformed id must never reach the uuid column (Prisma P2023 -> a fake 500).
    expect(await getRecipeWithItems(db, projectId, "nope")).toBeNull();
  });
});

describe("renameRecipe", () => {
  it("renames and re-derives the identity key", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasange" }, labels);

    const renamed = await renameRecipe(db, { projectId, recipeId: recipe.id, name: "Lasagne" }, labels);

    expect(renamed.name).toBe("Lasagne");
    expect(renamed.normalizedName).toBe("lasagne");
  });

  it("allows a pure display-name fix that keeps the same identity", async () => {
    const recipe = await createRecipe(db, { projectId, name: "lasagne" }, labels);

    // "lasagne" -> "Lasagne" normalizes to the SAME key, so it must not 409 against itself.
    await expect(
      renameRecipe(db, { projectId, recipeId: recipe.id, name: "Lasagne" }, labels),
    ).resolves.toMatchObject({ name: "Lasagne" });
  });

  it("rejects renaming onto another recipe's name", async () => {
    await createRecipe(db, { projectId, name: "Chili" }, labels);
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    await expect(
      renameRecipe(db, { projectId, recipeId: recipe.id, name: "chili" }, labels),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("404s for another project's recipe", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    const foreign = await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);

    await expect(
      renameRecipe(db, { projectId, recipeId: foreign.id, name: "Neu" }, labels),
    ).rejects.toMatchObject({ status: 404, message: "Dieses Rezept gibt es nicht mehr" });
  });
});

describe("deleteRecipe", () => {
  it("deletes the recipe and its lines, and nothing else", async () => {
    const recipe = await createRecipe(db, { projectId, name: "Lasagne" }, labels);
    const milch = await makeArticle("Milch");
    await db.recipeItem.create({
      data: { recipeId: recipe.id, catalogItemId: milch.id, sortIndex: 0 },
    });

    await deleteRecipe(db, { projectId, recipeId: recipe.id }, labels);

    expect(await db.recipe.count()).toBe(0);
    // The lines go with it via the FK cascade...
    expect(await db.recipeItem.count()).toBe(0);
    // ...but the ARTICLE stays. A recipe is a reference to catalog memory, not its owner.
    expect(await db.catalogItem.count()).toBe(1);
  });

  it("404s for another project's recipe", async () => {
    const user = await db.user.create({ data: { googleSub: "g-v", email: "v@example.com" } });
    const other = await db.project.create({ data: { name: "Zweitprojekt", ownerId: user.id } });
    const foreign = await createRecipe(db, { projectId: other.id, name: "Fremd" }, labels);

    await expect(
      deleteRecipe(db, { projectId, recipeId: foreign.id }, labels),
    ).rejects.toMatchObject({ status: 404 });
    expect(await db.recipe.count()).toBe(1);
  });
});
