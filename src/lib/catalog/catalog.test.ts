import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "./catalog";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  // A catalog item needs a project to belong to; the user is only needed as the project owner.
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("getOrCreateCatalogItem", () => {
  it("creates a new catalog item with normalized identity and cleaned display name", async () => {
    const item = await getOrCreateCatalogItem(db, { projectId, name: "  Rote   Paprika " });
    expect(item.projectId).toBe(projectId);
    expect(item.normalizedName).toBe("rote paprika"); // identity key
    expect(item.name).toBe("Rote Paprika"); // display name keeps the case, whitespace cleaned
    expect(item.defaultCategory).toBeNull(); // unknown until a user sets one (Slice 4 flow-back)
    expect(item.defaultUnit).toBeNull();
  });

  // The core §7 seam "Normalisierung & Katalog-Identität": variants of one name -> ONE row.
  it("returns the existing item for a different spelling of the same name", async () => {
    const first = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    const second = await getOrCreateCatalogItem(db, { projectId, name: " MILCH  " });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Milch"); // first-typed display name wins (flow-back is Slice 4)
    expect(await db.catalogItem.count({ where: { projectId } })).toBe(1);
  });

  it("keeps identities separate per project (same name, two projects, two rows)", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const a = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    const b = await getOrCreateCatalogItem(db, { projectId: otherProject.id, name: "Milch" });
    expect(a.id).not.toBe(b.id);
  });

  it("rejects a name that is empty after normalization with 400", async () => {
    await expect(getOrCreateCatalogItem(db, { projectId, name: "   " })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a name longer than 200 characters with 400", async () => {
    await expect(
      getOrCreateCatalogItem(db, { projectId, name: "x".repeat(201) }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
