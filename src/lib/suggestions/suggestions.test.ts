import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { addFavorite } from "@/lib/favorites/favorites";
import { computeSuggestions, createListWithArticles, createPrefilledList } from "./suggestions";

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
// `completedAt: null` seeds the pathological row the NULLS-LAST ordering exists to defend against —
// a list marked completed that carries no timestamp. completeList never produces one, but a seed or
// a future import path could, so the window has to survive it.
async function completedList(names: string[], completedAt: Date | null) {
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

  it("keeps a completed list without completedAt from evicting a real one (NULLS LAST)", async () => {
    // Pins Slice 5 locked decision #4. Postgres sorts NULLs FIRST on a DESC sort, so without the
    // explicit `nulls: "last"` the timestamp-less list below would occupy slot 1 of the M=4 window
    // and push the OLDEST real list out — which would drop Zucker from 2 lists to 1 (< N=2).
    await completedList(["Zwiebel"], null); // completed, but never stamped
    await completedList(["Zucker"], new Date("2026-07-01"));
    await completedList(["Zucker"], new Date("2026-07-02"));
    await completedList(["Mehl"], new Date("2026-07-03"));
    await completedList(["Mehl"], new Date("2026-07-04"));

    const suggestions = await computeSuggestions(db, projectId);
    // Correct (NULLS LAST): window = the four dated lists -> Zucker 2, Mehl 2, both >= N=2.
    // Broken (NULLS FIRST): window = null-list + the three newest -> Zucker 1 -> only Mehl.
    expect(suggestions.map((s) => s.name)).toEqual(["Mehl", "Zucker"]);
  });

  it("respects the project's M window size, not just N", async () => {
    // The existing N test only varies N. M=1 shrinks the window to the single most recent completed
    // list, so the older list's article must not be suggested even though N=1 would otherwise take it.
    await db.project.update({
      where: { id: projectId },
      data: { suggestionRuleN: 1, suggestionRuleM: 1 },
    });
    await completedList(["Alt"], new Date("2026-07-01"));
    await completedList(["Neu"], new Date("2026-07-02"));

    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Neu"]);
  });

  it("treats a non-positive M as an empty window instead of inverting it", async () => {
    // Prisma reads a NEGATIVE `take` as "the LAST n rows", so an unclamped take: -1 would silently
    // flip the window and return the OLDEST completed list instead of none. N=1 makes the difference
    // observable: unclamped -> ["Alt"] (the oldest list), clamped -> [] (no window, no statistic).
    await db.project.update({
      where: { id: projectId },
      data: { suggestionRuleN: 1, suggestionRuleM: -1 },
    });
    await completedList(["Alt"], new Date("2026-07-01"));
    await completedList(["Neu"], new Date("2026-07-02"));

    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions).toHaveLength(0);
  });

  it("still returns favorites when M is non-positive (only the statistic goes silent)", async () => {
    // The clamp must disable the STATISTIC half only. Favorites are unconditional (MVP design §4.3:
    // "Favoriten: alle Favorite des Projekts"), so they survive any window configuration.
    await db.project.update({ where: { id: projectId }, data: { suggestionRuleM: 0 } });
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await addFavorite(db, { projectId, catalogItemId: milch.id });

    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Milch"]);
  });

  it("sorts the result by German locale rules, not by code point", async () => {
    // localeCompare(…, "de") treats Ä as a diacritic variant of A. A naive code-point sort would put
    // every umlaut AFTER Z ("Apfel, Zucker, Äpfel"), which reads as broken in a German UI.
    // normalizeName only lowercases/trims, so "Apfel" and "Äpfel" are two distinct catalog articles.
    for (const name of ["Zucker", "Äpfel", "Apfel"]) {
      const item = await getOrCreateCatalogItem(db, { projectId, name });
      await addFavorite(db, { projectId, catalogItemId: item.id });
    }
    const suggestions = await computeSuggestions(db, projectId);
    expect(suggestions.map((s) => s.name)).toEqual(["Apfel", "Äpfel", "Zucker"]);
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

describe("createPrefilledList", () => {
  it("creates an active list with the given name", async () => {
    const list = await createPrefilledList(db, { projectId, name: "Wocheneinkauf" });
    expect(list.name).toBe("Wocheneinkauf");
    expect(list.status).toBe("active"); // pre-fill produces a normal, editable active list
  });

  it("pre-fills one entry per favorite, inheriting the catalog category/unit", async () => {
    const milch = await getOrCreateCatalogItem(db, { projectId, name: "Milch" });
    await db.catalogItem.update({
      where: { id: milch.id },
      data: { defaultCategory: "Kühlregal", defaultUnit: "l" },
    });
    await addFavorite(db, { projectId, catalogItemId: milch.id });

    const list = await createPrefilledList(db, { projectId, name: "Wocheneinkauf" });
    const items = await db.listItem.findMany({
      where: { listId: list.id },
      include: { catalogItem: true },
    });
    expect(items).toHaveLength(1);
    expect(items[0].catalogItem.name).toBe("Milch");
    expect(items[0].category).toBe("Kühlregal"); // inherited from the catalog default at add time
    expect(items[0].unit).toBe("l");
  });

  it("pre-fills from the N-of-M statistic as well as favorites", async () => {
    // Milch in 2 of the last completed lists (N=2) -> statistic-suggested even without a favorite.
    await completedList(["Milch"], new Date("2026-07-01"));
    await completedList(["Milch"], new Date("2026-07-02"));
    const list = await createPrefilledList(db, { projectId, name: "Wocheneinkauf" });
    const items = await db.listItem.findMany({
      where: { listId: list.id },
      include: { catalogItem: true },
    });
    expect(items.map((i) => i.catalogItem.name)).toEqual(["Milch"]);
  });

  it("creates an empty list when there is nothing to suggest", async () => {
    const list = await createPrefilledList(db, { projectId, name: "Leer" });
    const items = await db.listItem.findMany({ where: { listId: list.id } });
    expect(items).toHaveLength(0);
  });

  it("honors a client-supplied list id (offline-prep convention)", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const list = await createPrefilledList(db, { projectId, name: "Mit ID", id });
    expect(list.id).toBe(id);
  });

  it("gives the pre-filled entries distinct, ascending sortIndexes", async () => {
    // Each add_item derives sortIndex from the current max, so the loop must run sequentially. Two
    // suggestions with the same index would make the list order ambiguous in the UI.
    for (const name of ["Apfel", "Brot"]) {
      const item = await getOrCreateCatalogItem(db, { projectId, name });
      await addFavorite(db, { projectId, catalogItemId: item.id });
    }
    const list = await createPrefilledList(db, { projectId, name: "Wocheneinkauf" });
    const items = await db.listItem.findMany({
      where: { listId: list.id },
      orderBy: { sortIndex: "asc" },
      include: { catalogItem: true },
    });
    expect(items.map((i) => i.sortIndex)).toEqual([1, 2]); // applyOperation: max(null→0)+1, then max(1)+1
    expect(items.map((i) => i.catalogItem.name)).toEqual(["Apfel", "Brot"]);
  });

  it("leaves no half-filled list behind when an entry fails mid-loop", async () => {
    // Force a failure PART WAY THROUGH the loop. "Apfel" is valid and sorts first, so it is added
    // successfully; the second article's name is 201 chars, one over MAX_ITEM_NAME_LENGTH, so
    // getOrCreateCatalogItem throws ApiError 400 on it. Seeding that row directly via
    // db.catalogItem.create is what bypasses the very validation we want to trip later — no public
    // path can create such an article, which is exactly why this is the cheapest failure injection.
    const apfel = await getOrCreateCatalogItem(db, { projectId, name: "Apfel" });
    await addFavorite(db, { projectId, catalogItemId: apfel.id });

    const tooLong = "B".repeat(201); // MAX_ITEM_NAME_LENGTH is 200 (src/lib/catalog/catalog.ts)
    const broken = await db.catalogItem.create({
      data: { projectId, name: tooLong, normalizedName: tooLong.toLowerCase() },
    });
    await addFavorite(db, { projectId, catalogItemId: broken.id });

    await expect(createPrefilledList(db, { projectId, name: "Kaputt" })).rejects.toMatchObject({
      status: 400,
    });

    // The compensating delete must have removed the list AND (via the list->items cascade) the
    // "Apfel" entry that had already been written before the failure.
    expect(await db.list.findMany({ where: { projectId } })).toHaveLength(0);
    expect(await db.listItem.findMany({})).toHaveLength(0);
  });
});

describe("createListWithArticles", () => {
  it("creates the list and adds exactly the given articles, in order", async () => {
    const list = await createListWithArticles(db, {
      projectId,
      name: "Einkauf",
      articleNames: ["Milch", "Brot"],
    });

    const created = await db.list.findUniqueOrThrow({
      where: { id: list.id },
      include: { items: { orderBy: { sortIndex: "asc" }, include: { catalogItem: true } } },
    });
    expect(created.name).toBe("Einkauf");
    expect(created.items.map((item) => item.catalogItem.name)).toEqual(["Milch", "Brot"]);
  });

  it("creates a plain empty list when the selection is empty", async () => {
    const list = await createListWithArticles(db, {
      projectId,
      name: "Leer",
      articleNames: [],
    });

    const items = await db.listItem.findMany({ where: { listId: list.id } });
    expect(items).toEqual([]);
  });

  it("rejects an invalid name and creates nothing", async () => {
    await expect(
      createListWithArticles(db, { projectId, name: "   ", articleNames: ["Milch"] }),
    ).rejects.toThrow("Name darf nicht leer sein");

    expect(await db.list.count({ where: { projectId } })).toBe(0);
  });
});
