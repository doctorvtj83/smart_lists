import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import {
  createCatalogArticle,
  DUPLICATE_ARTICLE_MESSAGE,
  listCatalog,
  updateCatalogArticle,
} from "./manage";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  // A catalog item needs a project; the user is only needed as the project owner.
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

// Test helpers: the catalog management core is tested against real rows, so these
// build the fixtures directly instead of going through the Slice 3 operations —
// that keeps a failure here pointing at THIS module and not at applyOperation.
async function makeArticle(name: string, defaults: { category?: string; unit?: string } = {}) {
  return db.catalogItem.create({
    data: {
      projectId,
      name,
      normalizedName: name.trim().toLowerCase(),
      defaultCategory: defaults.category ?? null,
      defaultUnit: defaults.unit ?? null,
    },
  });
}

async function makeList(name: string, completed = false) {
  return db.list.create({
    data: {
      projectId,
      name,
      status: completed ? "completed" : "active",
      completedAt: completed ? new Date() : null,
    },
  });
}

async function addEntry(listId: string, catalogItemId: string, sortIndex = 1) {
  return db.listItem.create({ data: { listId, catalogItemId, sortIndex } });
}

describe("listCatalog", () => {
  it("returns an empty array for a project without articles", async () => {
    expect(await listCatalog(db, projectId)).toEqual([]);
  });

  // The shared ordering rule (compareArticleNames) sorts under German rules, so
  // "Äpfel" belongs next to "Apfel" — not after "Zucker" where a code-point sort
  // would put it.
  it("sorts articles by display name under German rules", async () => {
    await makeArticle("Zucker");
    await makeArticle("Äpfel");
    await makeArticle("Butter");

    const articles = await listCatalog(db, projectId);
    expect(articles.map((a) => a.name)).toEqual(["Äpfel", "Butter", "Zucker"]);
  });

  it("surfaces the catalog defaults", async () => {
    await makeArticle("Milch", { category: "Molkerei", unit: "l" });

    const [milch] = await listCatalog(db, projectId);
    expect(milch.defaultCategory).toBe("Molkerei");
    expect(milch.defaultUnit).toBe("l");
  });

  // The delete guard counts LISTS, not entries: the same article twice on one
  // list is still one list, and the note must say "1 Liste".
  it("counts the distinct lists an article appears on, not the entries", async () => {
    const milch = await makeArticle("Milch");
    const einkauf = await makeList("Einkauf");
    const wochenende = await makeList("Wochenende");
    await addEntry(einkauf.id, milch.id, 1);
    await addEntry(einkauf.id, milch.id, 2); // same list again -> still one list
    await addEntry(wochenende.id, milch.id, 1);

    const [article] = await listCatalog(db, projectId);
    expect(article.usedInListCount).toBe(2);
  });

  // Completed lists count too: they feed the N-of-M suggestion statistic, which
  // is precisely what the delete guard protects.
  it("counts completed lists as usage", async () => {
    const nudeln = await makeArticle("Nudeln");
    const archiviert = await makeList("Letzte Woche", true);
    await addEntry(archiviert.id, nudeln.id);

    const [article] = await listCatalog(db, projectId);
    expect(article.usedInListCount).toBe(1);
  });

  it("reports zero usage for an article no list mentions", async () => {
    await makeArticle("Kerzen");
    const [article] = await listCatalog(db, projectId);
    expect(article.usedInListCount).toBe(0);
  });

  it("flags an article that is a project favourite", async () => {
    const milch = await makeArticle("Milch");
    await makeArticle("Kerzen");
    await db.favorite.create({ data: { projectId, catalogItemId: milch.id } });

    const articles = await listCatalog(db, projectId);
    expect(articles.find((a) => a.name === "Milch")!.isFavorite).toBe(true);
    expect(articles.find((a) => a.name === "Kerzen")!.isFavorite).toBe(false);
  });

  it("never returns another project's articles", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    await db.catalogItem.create({
      data: { projectId: otherProject.id, name: "Zelt", normalizedName: "zelt" },
    });
    await makeArticle("Milch");

    const articles = await listCatalog(db, projectId);
    expect(articles.map((a) => a.name)).toEqual(["Milch"]);
  });
});

describe("createCatalogArticle", () => {
  it("creates an article with a cleaned display name and a normalized identity", async () => {
    const article = await createCatalogArticle(db, { projectId, name: "  Rote   Paprika " });

    expect(article.projectId).toBe(projectId);
    expect(article.name).toBe("Rote Paprika"); // casing kept, whitespace cleaned
    expect(article.normalizedName).toBe("rote paprika"); // identity key
    expect(article.defaultCategory).toBeNull();
    expect(article.defaultUnit).toBeNull();
  });

  // The whole point of this function vs. getOrCreateCatalogItem: here a known
  // name is a failure, not a hit — and any spelling of it counts as known.
  it("refuses a different spelling of an article that already exists", async () => {
    await createCatalogArticle(db, { projectId, name: "Milch" });

    await expect(
      createCatalogArticle(db, { projectId, name: " MILCH " }),
    ).rejects.toMatchObject({ status: 409, message: DUPLICATE_ARTICLE_MESSAGE });
    expect(await db.catalogItem.count({ where: { projectId } })).toBe(1);
  });

  it("rejects a name that is empty after normalization with 400", async () => {
    await expect(createCatalogArticle(db, { projectId, name: "   " })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a name longer than 200 characters with 400", async () => {
    await expect(
      createCatalogArticle(db, { projectId, name: "x".repeat(201) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("allows the same name in a different project", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o2", email: "o2@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    await createCatalogArticle(db, { projectId, name: "Milch" });

    const other = await createCatalogArticle(db, { projectId: otherProject.id, name: "Milch" });
    expect(other.projectId).toBe(otherProject.id);
  });
});

describe("updateCatalogArticle", () => {
  it("renames the article and writes both defaults", async () => {
    const article = await makeArticle("Milch");

    const updated = await updateCatalogArticle(db, {
      projectId,
      catalogItemId: article.id,
      name: "Vollmilch",
      category: "Molkerei",
      unit: "l",
    });

    expect(updated.name).toBe("Vollmilch");
    expect(updated.normalizedName).toBe("vollmilch"); // identity follows the name
    expect(updated.defaultCategory).toBe("Molkerei");
    expect(updated.defaultUnit).toBe("l");
  });

  // Re-spelling the article's OWN name is not a collision: same normalized name,
  // same row. Without the `!==` guard below this would 409 against itself.
  it("accepts a pure re-spelling of the article's own name", async () => {
    const article = await makeArticle("milch");

    const updated = await updateCatalogArticle(db, {
      projectId,
      catalogItemId: article.id,
      name: "Milch",
      category: null,
      unit: null,
    });

    expect(updated.id).toBe(article.id);
    expect(updated.name).toBe("Milch");
    expect(updated.normalizedName).toBe("milch");
  });

  it("refuses a rename onto another article, in any spelling", async () => {
    await makeArticle("Butter");
    const milch = await makeArticle("Milch");

    await expect(
      updateCatalogArticle(db, {
        projectId,
        catalogItemId: milch.id,
        name: " BUTTER ",
        category: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ status: 409, message: DUPLICATE_ARTICLE_MESSAGE });

    // Nothing was written: the collision is checked before the update.
    const unchanged = await db.catalogItem.findUniqueOrThrow({ where: { id: milch.id } });
    expect(unchanged.name).toBe("Milch");
  });

  // The management screen is allowed to CLEAR a default — unlike the entry
  // flow-back, which ignores null so an entry-local clear cannot wipe the catalog.
  it("clears a default when the field arrives empty", async () => {
    const article = await makeArticle("Milch", { category: "Molkerei", unit: "l" });

    const updated = await updateCatalogArticle(db, {
      projectId,
      catalogItemId: article.id,
      name: "Milch",
      category: "   ",
      unit: "",
    });

    expect(updated.defaultCategory).toBeNull();
    expect(updated.defaultUnit).toBeNull();
  });

  // Entry category is a SNAPSHOT taken at add time (schema comment on ListItem):
  // editing the catalog default must never rewrite lists that already exist.
  it("leaves the category already snapshotted on existing entries untouched", async () => {
    const article = await makeArticle("Milch", { category: "Molkerei" });
    const list = await makeList("Einkauf");
    const entry = await db.listItem.create({
      data: { listId: list.id, catalogItemId: article.id, sortIndex: 1, category: "Molkerei" },
    });

    await updateCatalogArticle(db, {
      projectId,
      catalogItemId: article.id,
      name: "Milch",
      category: "Kühlregal",
      unit: null,
    });

    const stillThere = await db.listItem.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stillThere.category).toBe("Molkerei");
  });

  it("rejects an empty name with 400", async () => {
    const article = await makeArticle("Milch");
    await expect(
      updateCatalogArticle(db, {
        projectId,
        catalogItemId: article.id,
        name: "   ",
        category: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("hides another project's article behind a 404", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o3", email: "o3@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await db.catalogItem.create({
      data: { projectId: otherProject.id, name: "Zelt", normalizedName: "zelt" },
    });

    await expect(
      updateCatalogArticle(db, {
        projectId,
        catalogItemId: foreign.id,
        name: "Zeltplane",
        category: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("answers 404 for a malformed id instead of crashing", async () => {
    await expect(
      updateCatalogArticle(db, {
        projectId,
        catalogItemId: "not-a-uuid",
        name: "Milch",
        category: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
