import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { addFavorite, listFavorites, removeFavorite } from "./favorites";

// One shared client for the file (same pattern as the other core tests). resetDb gives every test a
// clean, deterministic project + catalog.
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

describe("addFavorite", () => {
  it("favorites a catalog article of the project", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    const fav = await addFavorite(db, { projectId, catalogItemId: item.id });
    expect(fav.projectId).toBe(projectId);
    expect(fav.catalogItemId).toBe(item.id);
  });

  it("is idempotent: favoriting the same article twice keeps a single row", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: item.id });
    await addFavorite(db, { projectId, catalogItemId: item.id });
    const rows = await db.favorite.findMany({ where: { projectId } });
    expect(rows).toHaveLength(1);
  });

  it("rejects a catalog item from another project with 404 (no cross-project favoriting)", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    await expect(addFavorite(db, { projectId, catalogItemId: foreign.id })).rejects.toMatchObject({
      status: 404,
      // A foreign article must be indistinguishable from a non-existent one: the message must NOT
      // hint that the id exists elsewhere, or the 404 leaks the other project's catalog.
      message: "Artikel nicht gefunden",
    });
  });

  it("rejects a malformed catalog item id with 404 (never reaches the uuid column)", async () => {
    await expect(addFavorite(db, { projectId, catalogItemId: "not-a-uuid" })).rejects.toMatchObject({
      status: 404,
      message: "Artikel nicht gefunden",
    });
  });
});

describe("removeFavorite", () => {
  it("removes a favorite", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: item.id });
    await removeFavorite(db, { projectId, catalogItemId: item.id });
    const rows = await db.favorite.findMany({ where: { projectId } });
    expect(rows).toHaveLength(0);
  });

  it("is idempotent: removing a non-existent favorite is a no-op", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    // Never favorited — removing must not throw.
    await expect(removeFavorite(db, { projectId, catalogItemId: item.id })).resolves.toBeUndefined();
  });

  it("treats a malformed catalog item id as a silent no-op (no P2023 crash)", async () => {
    // removeFavorite's isUuid guard exists so a malformed id never reaches the uuid column, where
    // Prisma would raise P2023 and the route would return a fake 500 instead of an idempotent
    // success. Remove is idempotent by contract, so "id that cannot exist" must resolve, not throw.
    await expect(
      removeFavorite(db, { projectId, catalogItemId: "not-a-uuid" }),
    ).resolves.toBeUndefined();
  });
});

describe("listFavorites", () => {
  it("returns favorites with their catalog item, ordered alphabetically by article name", async () => {
    const brot = await getOrCreateCatalogItem(db, { projectId, name: "Brot" });
    const apfel = await getOrCreateCatalogItem(db, { projectId, name: "Apfel" });
    await addFavorite(db, { projectId, catalogItemId: brot.id });
    await addFavorite(db, { projectId, catalogItemId: apfel.id });
    const favorites = await listFavorites(db, projectId);
    expect(favorites.map((f) => f.catalogItem.name)).toEqual(["Apfel", "Brot"]);
  });

  it("never returns favorites from another project", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    await addFavorite(db, { projectId: other.id, catalogItemId: foreign.id });
    const favorites = await listFavorites(db, projectId);
    expect(favorites).toHaveLength(0);
  });
});
