import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "./catalog";
import { searchCatalog } from "./search";

// One shared client for the file (same pattern as the other core tests). resetDb gives every test
// a clean, deterministic catalog.
const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  // A catalog item needs a project to belong to; the user is only the project owner.
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("searchCatalog", () => {
  it("returns items whose normalized name starts with the query (case-insensitive)", async () => {
    await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await getOrCreateCatalogItem(db, { projectId, name: "Milchreis" });
    await getOrCreateCatalogItem(db, { projectId, name: "Brot" });
    const results = await searchCatalog(db, projectId, "MIL"); // upper-case query still matches
    expect(results.map((r) => r.name)).toEqual(["Milch", "Milchreis"]);
  });

  it("returns a lean suggestion shape carrying the catalog defaults", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.catalogItem.update({
      where: { id: item.id },
      data: { defaultCategory: "Kühlregal", defaultUnit: "l" },
    });
    const [result] = await searchCatalog(db, projectId, "Milch");
    // Exactly the four fields autocomplete needs — no projectId/normalizedName/createdAt leak.
    expect(result).toEqual({
      id: item.id,
      name: "Milch",
      defaultCategory: "Kühlregal",
      defaultUnit: "l",
    });
  });

  it("returns all items alphabetically for a blank/whitespace query (browse mode)", async () => {
    await getOrCreateCatalogItem(db, { projectId, name: "Brot" });
    await getOrCreateCatalogItem(db, { projectId, name: "Apfel" });
    const results = await searchCatalog(db, projectId, "   ");
    expect(results.map((r) => r.name)).toEqual(["Apfel", "Brot"]);
  });

  it("caps the number of results at the given limit", async () => {
    for (let i = 0; i < 5; i++) {
      await getOrCreateCatalogItem(db, { projectId, name: `Artikel ${i}` });
    }
    const results = await searchCatalog(db, projectId, "", 3);
    expect(results).toHaveLength(3);
  });

  it("never returns catalog items from another project", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    const results = await searchCatalog(db, projectId, "Milch");
    expect(results).toHaveLength(0);
  });
});
