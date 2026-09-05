import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { normalizeName } from "./normalize";
import { getCatalogVocabulary } from "./vocabulary";

interface CatalogFixtureRow {
  name: string;
  defaultCategory: string | null;
  defaultUnit: string | null;
}

// One shared client mirrors the catalog search integration tests, while resetDb keeps each
// vocabulary assertion isolated from rows created by earlier tests.
const db = new PrismaClient();

/**
 * Seeds one independent project and its catalog so each test can express only the vocabulary
 * rows relevant to the behavior it protects. Random fixture identities let one test create two
 * projects without violating the user's unique Google identity constraint.
 */
async function seedProjectWithCatalog(rows: CatalogFixtureRow[]): Promise<string> {
  const fixtureIdentity = randomUUID();
  const user = await db.user.create({
    data: {
      googleSub: `catalog-vocabulary-${fixtureIdentity}`,
      email: `catalog-vocabulary-${fixtureIdentity}@example.com`,
    },
  });
  const project = await db.project.create({
    data: { name: "Haushalt", ownerId: user.id },
  });

  await db.catalogItem.createMany({
    data: rows.map((row) => ({
      projectId: project.id,
      name: row.name,
      normalizedName: normalizeName(row.name),
      defaultCategory: row.defaultCategory,
      defaultUnit: row.defaultUnit,
    })),
  });

  return project.id;
}

beforeEach(async () => {
  await resetDb(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("getCatalogVocabulary", () => {
  it("returns the distinct default categories and units of one project", async () => {
    const projectId = await seedProjectWithCatalog([
      { name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
      { name: "Joghurt", defaultCategory: "Molkerei", defaultUnit: "g" },
      { name: "Äpfel", defaultCategory: "Obst", defaultUnit: null },
    ]);

    const vocabulary = await getCatalogVocabulary(db, projectId);

    // Distinct: "Molkerei" appears twice in the catalog, once in the vocabulary.
    expect(vocabulary.categories).toEqual(["Molkerei", "Obst"]);
    expect(vocabulary.units).toEqual(["g", "l"]);
  });

  it("drops nulls rather than surfacing them as empty chips", async () => {
    const projectId = await seedProjectWithCatalog([
      { name: "Salz", defaultCategory: null, defaultUnit: null },
    ]);

    const vocabulary = await getCatalogVocabulary(db, projectId);

    expect(vocabulary.categories).toEqual([]);
    expect(vocabulary.units).toEqual([]);
  });

  it("sorts categories under German rules so Ä lands next to A", async () => {
    const projectId = await seedProjectWithCatalog([
      { name: "Zucker", defaultCategory: "Zutaten", defaultUnit: null },
      { name: "Äpfel", defaultCategory: "Äpfel & Co", defaultUnit: null },
      { name: "Brot", defaultCategory: "Backwaren", defaultUnit: null },
    ]);

    const vocabulary = await getCatalogVocabulary(db, projectId);

    expect(vocabulary.categories).toEqual(["Äpfel & Co", "Backwaren", "Zutaten"]);
  });

  it("never leaks another project's vocabulary", async () => {
    const mine = await seedProjectWithCatalog([
      { name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
    ]);
    await seedProjectWithCatalog([
      { name: "Zelt", defaultCategory: "Camping", defaultUnit: "Stk" },
    ]);

    const vocabulary = await getCatalogVocabulary(db, mine);

    expect(vocabulary.categories).toEqual(["Molkerei"]);
    expect(vocabulary.units).toEqual(["l"]);
  });
});
