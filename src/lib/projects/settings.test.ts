import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { updateRecipeSettings } from "./settings";

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

describe("updateRecipeSettings", () => {
  it("enables the feature and stores the project's own wording", async () => {
    const project = await updateRecipeSettings(db, projectId, {
      recipesEnabled: true,
      recipeLabelSingular: "  Set  ",
      recipeLabelPlural: " Sets ",
    });

    expect(project.recipesEnabled).toBe(true);
    expect(project.recipeLabelSingular).toBe("Set"); // trimmed on the way in
    expect(project.recipeLabelPlural).toBe("Sets");
  });

  it("keeps the labels when the feature is switched off", async () => {
    await updateRecipeSettings(db, projectId, {
      recipesEnabled: true,
      recipeLabelSingular: "Set",
      recipeLabelPlural: "Sets",
    });

    const off = await updateRecipeSettings(db, projectId, {
      recipesEnabled: false,
      recipeLabelSingular: "Set",
      recipeLabelPlural: "Sets",
    });

    // Off must be reversible without re-typing the wording (spec §2).
    expect(off.recipesEnabled).toBe(false);
    expect(off.recipeLabelSingular).toBe("Set");
  });

  it("falls back to the defaults for a blank label", async () => {
    const project = await updateRecipeSettings(db, projectId, {
      recipesEnabled: true,
      recipeLabelSingular: "   ",
      recipeLabelPlural: "",
    });

    // An empty field means "I don't want to rename it", not "call it nothing".
    expect(project.recipeLabelSingular).toBe("Rezept");
    expect(project.recipeLabelPlural).toBe("Rezepte");
  });

  it("rejects a label over the length limit", async () => {
    await expect(
      updateRecipeSettings(db, projectId, {
        recipesEnabled: true,
        recipeLabelSingular: "x".repeat(41),
        recipeLabelPlural: "Sets",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Bezeichnung darf höchstens 40 Zeichen lang sein",
    });
  });

  it("404s for an unknown or malformed project id", async () => {
    await expect(
      updateRecipeSettings(db, "nope", {
        recipesEnabled: true,
        recipeLabelSingular: "Set",
        recipeLabelPlural: "Sets",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
