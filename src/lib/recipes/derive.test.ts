import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { ApiError } from "@/lib/http/errors";
import { recipeLabels } from "./labels";
import { createRecipe, getRecipeWithItems } from "./recipes";
import { createRecipeFromList } from "./derive";

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

async function makeArticle(name: string) {
  return db.catalogItem.create({
    data: { projectId, name, normalizedName: name.trim().toLowerCase() },
  });
}

describe("createRecipeFromList", () => {
  it("creates the recipe with its lines in the given order", async () => {
    const hack = await makeArticle("Hackfleisch");
    const milk = await makeArticle("Milch");

    const recipe = await createRecipeFromList(
      db,
      {
        projectId,
        name: "Lasagne",
        lines: [
          { catalogItemId: hack.id, name: "Hackfleisch", quantity: 250, unit: "g" },
          { catalogItemId: milk.id, name: "Milch", quantity: 0.5, unit: "l" },
        ],
      },
      labels,
    );

    const stored = await getRecipeWithItems(db, projectId, recipe.id);
    expect(stored!.name).toBe("Lasagne");
    expect(
      stored!.items.map((item) => ({
        name: item.catalogItem.name,
        quantity: item.quantity,
        unit: item.unit,
        sortIndex: item.sortIndex,
      })),
    ).toEqual([
      { name: "Hackfleisch", quantity: 250, unit: "g", sortIndex: 0 },
      { name: "Milch", quantity: 0.5, unit: "l", sortIndex: 1 },
    ]);
  });

  it("stores an unquantified line as null/null", async () => {
    const salt = await makeArticle("Salz");

    const recipe = await createRecipeFromList(
      db,
      { projectId, name: "Lasagne", lines: [{ catalogItemId: salt.id, name: "Salz", quantity: null, unit: null }] },
      labels,
    );

    const stored = await getRecipeWithItems(db, projectId, recipe.id);
    expect(stored!.items[0].quantity).toBeNull();
    expect(stored!.items[0].unit).toBeNull();
  });

  it("surfaces a duplicate name as the 409 the name field renders", async () => {
    const salt = await makeArticle("Salz");
    await createRecipe(db, { projectId, name: "Lasagne" }, labels);

    try {
      await createRecipeFromList(
        db,
        { projectId, name: "  lasagne ", lines: [{ catalogItemId: salt.id, name: "Salz", quantity: null, unit: null }] },
        labels,
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).message).toBe("Ein Rezept mit diesem Namen existiert bereits");
    }
  });

  it("leaves no half-built recipe behind when a line fails", async () => {
    const salt = await makeArticle("Salz");
    // An article from another project: addRecipeItem 404s on it (Slice 18's scoping rule).
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Fremd", ownerId: otherUser.id } });
    const foreign = await db.catalogItem.create({
      data: { projectId: other.id, name: "Fremd", normalizedName: "fremd" },
    });

    await expect(
      createRecipeFromList(
        db,
        {
          projectId,
          name: "Lasagne",
          lines: [
            { catalogItemId: salt.id, name: "Salz", quantity: null, unit: null },
            { catalogItemId: foreign.id, name: "Fremd", quantity: 1, unit: null },
          ],
        },
        labels,
      ),
    ).rejects.toThrow("Artikel nicht gefunden");

    // A recipe named „Lasagne“ holding only Salz would silently occupy the name the user wanted.
    expect(await db.recipe.count({ where: { projectId } })).toBe(0);
  });

  it("accepts a client-generated id, like every other entity here", async () => {
    const salt = await makeArticle("Salz");
    const id = "77777777-7777-4777-8777-777777777777";

    const recipe = await createRecipeFromList(
      db,
      { projectId, id, name: "Lasagne", lines: [{ catalogItemId: salt.id, name: "Salz", quantity: null, unit: null }] },
      labels,
    );

    expect(recipe.id).toBe(id);
  });
});
