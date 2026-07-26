import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { addFavorite } from "@/lib/favorites/favorites";
import { computeSuggestions } from "./suggestions";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  // Explicit N=2, M=4 (the schema defaults) so the intent of each test is visible.
  const project = await db.project.create({
    data: { name: "Haushalt", ownerId: user.id, suggestionRuleN: 2, suggestionRuleM: 4 },
  });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

// Seeds a COMPLETED list containing the given article names. In the app, Slice 6's completeList sets
// status + completedAt; here we write them directly so the statistic is exercised without driving the
// UI (deterministic inputs, MVP design §7). Each name resolves to (or creates) the project's catalog
// item, then gets a list item (entries are created directly — this is test setup, not the app's
// mutation path).
async function completedList(names: string[], completedAt: Date) {
  const list = await db.list.create({
    data: { projectId, name: "Erledigt", status: "completed", completedAt },
  });
  let sortIndex = 0;
  for (const name of names) {
    const catalogItem = await getOrCreateCatalogItem(db, { projectId, name });
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: catalogItem.id, sortIndex: sortIndex++ },
    });
  }
  return list;
}

describe("computeSuggestions", () => {
  it("always suggests every project favorite (even with no completed lists)", async () => {
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: milch.id });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);
  });

  it("suggests an article that appears in >= N of the last M completed lists", async () => {
    // Milch in 2 completed lists (>= N=2) -> suggested; Brot in 1 (< 2) -> not suggested.
    await completedList(["Milch", "Brot"], new Date("2026-07-01"));
    await completedList(["Milch"], new Date("2026-07-02"));
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);
  });

  it("counts an article once per list even if it is listed twice in the same list", async () => {
    // Milch twice in ONE completed list = 1 list, which is < N=2 -> not suggested.
    const list = await db.list.create({
      data: { projectId, name: "Erledigt", status: "completed", completedAt: new Date("2026-07-01") },
    });
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.listItem.create({ data: { listId: list.id, catalogItemId: milch.id, sortIndex: 0 } });
    await db.listItem.create({ data: { listId: list.id, catalogItemId: milch.id, sortIndex: 1 } });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0);
  });

  it("unions favorites and the statistic without duplicating an article that is both", async () => {
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: milch.id });
    await completedList(["Milch"], new Date("2026-07-01"));
    await completedList(["Milch"], new Date("2026-07-02")); // now also statistic-qualified
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]); // exactly once
  });

  it("only considers the last M completed lists (older lists fall out of the window)", async () => {
    // M=4. Butter appears in the 1st and 5th most-recent completed lists — the 5th is OUTSIDE the
    // window, so Butter is seen in only 1 of the last 4 (< N=2) and is not suggested.
    await completedList(["Butter"], new Date("2026-07-01")); // 5th most recent -> outside window
    await completedList(["Zucker"], new Date("2026-07-02"));
    await completedList(["Zucker"], new Date("2026-07-03"));
    await completedList(["Mehl"], new Date("2026-07-04"));
    await completedList(["Butter", "Zucker"], new Date("2026-07-05")); // most recent
    const suggestions = await computeSuggestions(db, projectId);
    // Zucker: in lists dated 07-02, 07-03, 07-05 within the window -> 3 lists (>= 2) -> suggested.
    // Butter: only in 07-05 within the window (07-01 is out) -> 1 list -> not suggested.
    expect(suggestions.map((s) => s.name)).toEqual(["Zucker"]);
  });

  it("ignores active (non-completed) lists in the statistic", async () => {
    const active = await db.list.create({ data: { projectId, name: "Offen" } }); // status active
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.listItem.create({ data: { listId: active.id, catalogItemId: milch.id, sortIndex: 0 } });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0); // active list contributes nothing
  });

  it("ignores a reopened list: clearing completedAt drops it out of the window", async () => {
    // Slice 6's reopenList sets status back to active AND clears completedAt. Two completed lists
    // qualify Milch (N=2); reopening one must push it back below the threshold.
    await completedList(["Milch"], new Date("2026-07-01"));
    const second = await completedList(["Milch"], new Date("2026-07-02"));
    await db.list.update({
      where: { id: second.id },
      data: { status: "active", completedAt: null }, // exactly what reopenList writes
    });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0); // only 1 completed list left -> < N=2
  });

  it("respects the project's own N/M parameters", async () => {
    await db.project.update({ where: { id: projectId }, data: { suggestionRuleN: 1 } });
    await completedList(["Milch"], new Date("2026-07-01")); // 1 list, now enough with N=1
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);
  });

  it("carries the article name and catalog defaults in the suggestion shape", async () => {
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.catalogItem.update({
      where: { id: milch.id },
      data: { defaultCategory: "Kühlregal", defaultUnit: "l" },
    });
    await addFavorite(db, { projectId, catalogItemId: milch.id });
    const [suggestion] = await computeSuggestions(db, projectId);
    expect(suggestion).toEqual({
      catalogItemId: milch.id,
      name: "Milch",
      defaultCategory: "Kühlregal",
      defaultUnit: "l",
    });
  });

  it("is project-scoped: another project's favorites and completed lists never leak", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const other = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await getOrCreateCatalogItem(db, { projectId: other.id, name: "Milch" });
    await addFavorite(db, { projectId: other.id, catalogItemId: foreign.id });
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0);
  });
});
