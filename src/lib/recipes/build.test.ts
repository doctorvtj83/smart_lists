import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { buildRecipeFromEntries, type DerivableEntry } from "./build";

/** The completed list, in the order the list screen shows it. */
const ENTRIES: DerivableEntry[] = [
  { id: "e1", catalogItemId: "c-hack", name: "Hackfleisch", quantity: 500, unit: "g" },
  { id: "e2", catalogItemId: "c-milch", name: "Milch", quantity: 1, unit: "l" },
  { id: "e3", catalogItemId: "c-zwiebel", name: "Zwiebeln", quantity: 2, unit: null },
  { id: "e4", catalogItemId: "c-salz", name: "Salz", quantity: null, unit: null },
  // A second Milch row in a different unit — legal on a list (D1 keeps them apart).
  { id: "e5", catalogItemId: "c-milch", name: "Milch", quantity: 500, unit: "ml" },
];

describe("buildRecipeFromEntries", () => {
  it("keeps the edited per-unit quantities", () => {
    const lines = buildRecipeFromEntries(ENTRIES, [
      { entryId: "e1", quantity: 250, unit: "g" },
      { entryId: "e2", quantity: 0.5, unit: "l" },
    ]);

    expect(lines).toEqual([
      { catalogItemId: "c-hack", name: "Hackfleisch", quantity: 250, unit: "g" },
      { catalogItemId: "c-milch", name: "Milch", quantity: 0.5, unit: "l" },
    ]);
  });

  it("follows the LIST's order, not the order the rows were ticked", () => {
    const lines = buildRecipeFromEntries(ENTRIES, [
      { entryId: "e3", quantity: 1, unit: null },
      { entryId: "e1", quantity: 250, unit: "g" },
    ]);

    expect(lines.map((line) => line.name)).toEqual(["Hackfleisch", "Zwiebeln"]);
  });

  it("keeps a cleared quantity as null — that is how an unquantified line is produced", () => {
    const lines = buildRecipeFromEntries(ENTRIES, [{ entryId: "e4", quantity: null, unit: null }]);

    expect(lines[0]).toEqual({
      catalogItemId: "c-salz",
      name: "Salz",
      quantity: null,
      unit: null,
    });
  });

  it("stores a blank unit as null rather than an empty string", () => {
    const lines = buildRecipeFromEntries(ENTRIES, [{ entryId: "e3", quantity: 1, unit: "  " }]);

    expect(lines[0].unit).toBeNull();
  });

  it("refuses the same article twice and names both amounts", () => {
    expect(() =>
      buildRecipeFromEntries(ENTRIES, [
        { entryId: "e2", quantity: 1, unit: "l" },
        { entryId: "e5", quantity: 500, unit: "ml" },
      ]),
    ).toThrow(
      "Milch ist zweimal ausgewählt (1 l und 500 ml) — bitte nur eine Zeile wählen",
    );
  });

  it("drops the amounts from the duplicate message when one row has none", () => {
    const entries: DerivableEntry[] = [
      { id: "a", catalogItemId: "c-milch", name: "Milch", quantity: null, unit: null },
      { id: "b", catalogItemId: "c-milch", name: "Milch", quantity: 1, unit: "l" },
    ];

    expect(() =>
      buildRecipeFromEntries(entries, [
        { entryId: "a", quantity: null, unit: null },
        { entryId: "b", quantity: 1, unit: "l" },
      ]),
    ).toThrow("Milch ist zweimal ausgewählt — bitte nur eine Zeile wählen");
  });

  it("refuses an empty selection", () => {
    expect(() => buildRecipeFromEntries(ENTRIES, [])).toThrow("Wähle mindestens einen Artikel");
  });

  it("refuses a selection that names an entry this list does not have", () => {
    try {
      buildRecipeFromEntries(ENTRIES, [{ entryId: "nope", quantity: 1, unit: null }]);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).message).toBe("Eintrag nicht gefunden");
    }
  });

  it.each([0, -1, Number.NaN])("refuses the quantity %s", (quantity) => {
    expect(() =>
      buildRecipeFromEntries(ENTRIES, [{ entryId: "e1", quantity, unit: "g" }]),
    ).toThrow("Menge muss eine positive Zahl sein");
  });
});
