import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { addEntryFromRow } from "./addEntry";
import { UNCATEGORIZED_LABEL } from "./categories";

const db = new PrismaClient();

// One project + one list, rebuilt for every test so cases cannot leak into each other.
async function seed() {
  // googleSub is required by the User model (Auth.js Google subject); the brief
  // seed omitted it, so we add a unique value per run like the other DB tests.
  const user = await db.user.create({
    data: {
      googleSub: `g-${randomUUID()}`,
      email: `owner-${randomUUID()}@example.com`,
      displayName: "Owner",
    },
  });
  // ownerId is required on Project; membership is created explicitly so the
  // seed still matches the brief's intent (owner + list under one project).
  const project = await db.project.create({
    data: { name: "Haushalt", ownerId: user.id },
  });
  await db.membership.create({
    data: { projectId: project.id, userId: user.id, role: "owner" },
  });
  const list = await db.list.create({ data: { projectId: project.id, name: "Einkauf" } });
  return { project, list };
}

beforeEach(async () => {
  await resetDb(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("addEntryFromRow", () => {
  it("creates the entry with the client-generated id", async () => {
    const { list } = await seed();
    const itemId = randomUUID();

    const { item } = await addEntryFromRow(db, list, { itemId, name: "Milch", activeCategory: null });

    expect(item.id).toBe(itemId);
    expect(item.listId).toBe(list.id);
  });

  it("creates the catalog article on first use", async () => {
    const { project, list } = await seed();

    await addEntryFromRow(db, list, { itemId: randomUUID(), name: "Milch", activeCategory: null });

    const article = await db.catalogItem.findFirst({ where: { projectId: project.id } });
    expect(article?.name).toBe("Milch");
  });

  // "Alle" is expressed as null: inherit whatever the catalog remembers.
  it("inherits the catalog default category in the Alle view", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Milch", normalizedName: "milch", defaultCategory: "Molkerei" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: null,
    });

    expect(item.category).toBe("Molkerei");
  });

  it("lets the active chip override the catalog default", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Milch", normalizedName: "milch", defaultCategory: "Molkerei" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: "Kühlregal",
    });

    expect(item.category).toBe("Kühlregal");
  });

  // Flow-back is the product rule (CLAUDE.md § architecture): adding under a chip
  // IS setting the category explicitly, so the catalog learns it.
  it("flows an active chip back into the catalog default", async () => {
    const { project, list } = await seed();

    await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: "Molkerei",
    });

    const article = await db.catalogItem.findFirst({ where: { projectId: project.id } });
    expect(article?.defaultCategory).toBe("Molkerei");
  });

  it("adds without a category when the Ohne-Kategorie chip is active", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Milch", normalizedName: "milch", defaultCategory: "Molkerei" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: UNCATEGORIZED_LABEL,
    });

    expect(item.category).toBeNull();
    // Clearing on the entry must NOT erase the shared catalog memory.
    const article = await db.catalogItem.findFirst({ where: { projectId: project.id } });
    expect(article?.defaultCategory).toBe("Molkerei");
  });

  it("asks for a category when a brand-new article lands without one", async () => {
    const { list } = await seed();

    const { needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Dübel",
      activeCategory: null,
    });

    expect(needsCategory).toBe(true);
  });

  it("does not ask when the new article got a category from the active chip", async () => {
    const { list } = await seed();

    const { needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Dübel",
      activeCategory: "Werkzeug",
    });

    expect(needsCategory).toBe(false);
  });

  // A known article without a default is a deliberate choice the user already
  // made once — nagging again on every add would be noise.
  it("does not ask for a known article, even without a category", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Dübel", normalizedName: "dübel" },
    });

    const { needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Dübel",
      activeCategory: null,
    });

    expect(needsCategory).toBe(false);
  });

  it("rejects an empty name with the German message", async () => {
    const { list } = await seed();

    await expect(
      addEntryFromRow(db, list, { itemId: randomUUID(), name: "   ", activeCategory: null }),
    ).rejects.toThrow("Name darf nicht leer sein");
  });
});

describe("addEntryFromRow — quantity parsing (Slice 15)", () => {
  it("splits a leading quantity and unit out of the typed text", async () => {
    const { project, list } = await seed();

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1,5 l Milch",
      activeCategory: null,
    });

    expect(item.quantity).toBe(1.5);
    expect(item.unit).toBe("l");
    // THE rule of this slice: the catalog only ever receives the article NAME.
    const article = await db.catalogItem.findFirstOrThrow({ where: { projectId: project.id } });
    expect(article.name).toBe("Milch");
  });

  // Ruling 3 (reversed): a parsed unit is an ordinary explicit unit, so Slice 4's
  // flow-back applies unchanged and the project's next pre-filled list inherits it.
  it("flows the parsed unit back into the catalog default", async () => {
    const { project, list } = await seed();

    await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1,5 l Milch",
      activeCategory: null,
    });

    const article = await db.catalogItem.findFirstOrThrow({ where: { projectId: project.id } });
    expect(article.defaultUnit).toBe("l");
    // The QUANTITY is entry-specific and must never become catalog memory —
    // there is no column for it, and this asserts the article stayed name-only.
    expect(article.name).toBe("Milch");
  });

  it("takes a leading number without a unit as a bare count", async () => {
    const { project, list } = await seed();

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "3 Joghurt",
      activeCategory: null,
    });

    expect(item.quantity).toBe(3);
    expect(item.unit).toBeNull();
    const article = await db.catalogItem.findFirstOrThrow({ where: { projectId: project.id } });
    expect(article.name).toBe("Joghurt");
  });

  // No parsed unit means "not supplied", which is what lets the catalog default
  // through — the same `undefined` vs `null` distinction add_item already uses.
  it("inherits the catalog's default unit when the text carries no unit", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: {
        projectId: project.id,
        name: "Joghurt",
        normalizedName: "joghurt",
        defaultUnit: "Becher",
      },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "3 Joghurt",
      activeCategory: null,
    });

    expect(item.quantity).toBe(3);
    expect(item.unit).toBe("Becher");
  });

  it("recognises a unit the project's own catalog contributed", async () => {
    const { project, list } = await seed();
    // „Palette" is not in the base vocabulary — the project taught it.
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Bier", normalizedName: "bier", defaultUnit: "Palette" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "2 Palette Wasser",
      activeCategory: null,
    });

    expect(item.quantity).toBe(2);
    expect(item.unit).toBe("Palette");
    const article = await db.catalogItem.findFirstOrThrow({
      where: { projectId: project.id, normalizedName: "wasser" },
    });
    expect(article.name).toBe("Wasser");
  });

  // The escape hatch (ruling 4): an article that ALREADY exists under a name
  // starting with a number must never be shredded by the parser.
  it("leaves a known article that starts with a number intact", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "7 Zwerge Bier", normalizedName: "7 zwerge bier" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "7 Zwerge Bier",
      activeCategory: null,
    });

    expect(item.quantity).toBeNull();
    expect(item.unit).toBeNull();
    // No second article was invented for „Zwerge Bier".
    expect(await db.catalogItem.count({ where: { projectId: project.id } })).toBe(1);
  });

  // needsCategory has to read the article for the PARSED name, not the raw text.
  it("asks for a category using the parsed article name", async () => {
    const { list } = await seed();

    const { needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "2 kg Dübel",
      activeCategory: null,
    });

    expect(needsCategory).toBe(true);
  });

  it("does not ask when the parsed article is already known", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: {
        projectId: project.id,
        name: "Milch",
        normalizedName: "milch",
        defaultCategory: "Molkerei",
      },
    });

    const { item, needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1,5 l Milch",
      activeCategory: null,
    });

    expect(needsCategory).toBe(false);
    // The catalog default still reaches the entry through the parsed name.
    expect(item.category).toBe("Molkerei");
  });

  // An active chip still wins over everything the parser found.
  it("keeps the active chip's category when the text carries a quantity", async () => {
    const { list } = await seed();

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1,5 l Milch",
      activeCategory: "Molkerei",
    });

    expect(item.category).toBe("Molkerei");
    expect(item.unit).toBe("l");
  });
});
