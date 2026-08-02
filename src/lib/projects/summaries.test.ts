import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "./projects";
import { listProjectSummaries } from "./summaries";

const db = new PrismaClient();
let ownerId: string;
let memberId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const member = await db.user.create({
    data: { googleSub: "g-member", email: "member@example.com" },
  });
  ownerId = owner.id;
  memberId = member.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("listProjectSummaries", () => {
  it("returns an empty array for a user without projects", async () => {
    expect(await listProjectSummaries(db, ownerId)).toEqual([]);
  });

  it("counts members and reports the caller's own role", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId });
    await db.membership.create({ data: { projectId: project.id, userId: memberId, role: "member" } });

    const [forOwner] = await listProjectSummaries(db, ownerId);
    expect(forOwner.name).toBe("Haushalt");
    expect(forOwner.memberCount).toBe(2);
    expect(forOwner.role).toBe("owner");

    // The SAME project seen by the member reports "member" — the role is the
    // caller's, not the project's, which is what drives the OWNER badge.
    const [forMember] = await listProjectSummaries(db, memberId);
    expect(forMember.role).toBe("member");
  });

  it("counts only ACTIVE lists, never archived ones", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId });
    await db.list.create({ data: { projectId: project.id, name: "Einkauf" } });
    await db.list.create({ data: { projectId: project.id, name: "Wochenende" } });
    await db.list.create({
      data: {
        projectId: project.id,
        name: "Erledigt",
        status: "completed",
        completedAt: new Date(),
      },
    });

    const [summary] = await listProjectSummaries(db, ownerId);
    expect(summary.activeListCount).toBe(2);
  });

  it("excludes projects the user is not a member of", async () => {
    await createProject(db, { name: "Fremd", ownerId });
    expect(await listProjectSummaries(db, memberId)).toEqual([]);
  });

  it("orders oldest first, matching listProjectsForUser", async () => {
    await createProject(db, { name: "Zuerst", ownerId });
    await createProject(db, { name: "Danach", ownerId });

    const summaries = await listProjectSummaries(db, ownerId);
    expect(summaries.map((s) => s.name)).toEqual(["Zuerst", "Danach"]);
  });
});
