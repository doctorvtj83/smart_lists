import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "./projects";
import { getProjectNav } from "./nav";

const db = new PrismaClient();
let ownerId: string;
let outsiderId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const outsider = await db.user.create({
    data: { googleSub: "g-out", email: "out@example.com" },
  });
  ownerId = owner.id;
  outsiderId = outsider.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("getProjectNav", () => {
  it("returns the project, its counts, the caller's role and all their projects", async () => {
    const haushalt = await createProject(db, { name: "Haushalt", ownerId });
    await createProject(db, { name: "Camping", ownerId });
    await db.list.create({ data: { projectId: haushalt.id, name: "Einkauf" } });
    await db.list.create({
      data: {
        projectId: haushalt.id,
        name: "Fertig",
        status: "completed",
        completedAt: new Date(),
      },
    });

    const nav = await getProjectNav(db, haushalt.id, ownerId);

    expect(nav).not.toBeNull();
    expect(nav!.projectName).toBe("Haushalt");
    expect(nav!.role).toBe("owner");
    // Only ACTIVE lists — the archive is its own screen.
    expect(nav!.activeListCount).toBe(1);
    expect(nav!.memberCount).toBe(1);
    // The switcher lists every project of the caller, oldest first.
    expect(nav!.projects.map((p) => p.name)).toEqual(["Haushalt", "Camping"]);
  });

  it("returns null for a project the caller is not a member of", async () => {
    const project = await createProject(db, { name: "Fremd", ownerId });

    expect(await getProjectNav(db, project.id, outsiderId)).toBeNull();
  });

  it("returns null for an unknown project id", async () => {
    expect(await getProjectNav(db, "11111111-1111-4111-8111-111111111111", ownerId)).toBeNull();
  });

  it("carries the project's recipe settings for the nav entry", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId });
    await db.project.update({
      where: { id: project.id },
      data: { recipesEnabled: true, recipeLabelPlural: "Sets" },
    });

    const nav = await getProjectNav(db, project.id, ownerId);

    // The panel needs BOTH: the flag decides whether the entry is rendered, the plural is its label.
    expect(nav!.recipesEnabled).toBe(true);
    expect(nav!.recipeLabelPlural).toBe("Sets");
  });

  it("reports recipes as off by default", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId });

    const nav = await getProjectNav(db, project.id, ownerId);

    expect(nav!.recipesEnabled).toBe(false);
    expect(nav!.recipeLabelPlural).toBe("Rezepte");
  });

  // A malformed id arrives straight from the URL segment and must not reach a
  // uuid column (Prisma P2023 → a fake 500).
  it("returns null for a malformed project id", async () => {
    expect(await getProjectNav(db, "not-a-uuid", ownerId)).toBeNull();
  });
});
