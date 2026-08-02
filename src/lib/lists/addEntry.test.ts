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
