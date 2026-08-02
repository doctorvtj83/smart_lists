import { describe, it, expect } from "vitest";
import {
  ALL_CATEGORIES_LABEL,
  UNCATEGORIZED_LABEL,
  categoryChipOptions,
  categoryLabel,
  groupItemsByCategory,
  knownCategories,
} from "./categories";

// The shape every helper here works on: anything with a nullable category.
const item = (category: string | null, name = "x") => ({ category, name });

describe("categoryLabel", () => {
  it("maps null, empty and whitespace to the German uncategorized label", () => {
    expect(categoryLabel(null)).toBe(UNCATEGORIZED_LABEL);
    expect(categoryLabel("")).toBe(UNCATEGORIZED_LABEL);
    expect(categoryLabel("   ")).toBe(UNCATEGORIZED_LABEL);
  });

  it("trims a real category", () => {
    expect(categoryLabel("  Molkerei ")).toBe("Molkerei");
  });
});

describe("categoryChipOptions", () => {
  it("puts Alle first, real categories alphabetically, Ohne Kategorie last", () => {
    const options = categoryChipOptions([
      item(null),
      item("Molkerei"),
      item("Obst & Gemüse"),
      item("Äpfel & Co"),
    ]);
    expect(options).toEqual([
      ALL_CATEGORIES_LABEL,
      "Äpfel & Co",
      "Molkerei",
      "Obst & Gemüse",
      UNCATEGORIZED_LABEL,
    ]);
  });

  it("omits Ohne Kategorie when every entry has a category", () => {
    expect(categoryChipOptions([item("Molkerei")])).toEqual([ALL_CATEGORIES_LABEL, "Molkerei"]);
  });

  it("deduplicates categories that several entries share", () => {
    expect(categoryChipOptions([item("Molkerei"), item("Molkerei")])).toEqual([
      ALL_CATEGORIES_LABEL,
      "Molkerei",
    ]);
  });

  // The design's rule: the active chip survives its category going empty, and it
  // must stay in its sorted position rather than being appended at the end.
  it("keeps the active category in the row even when no entry has it", () => {
    expect(categoryChipOptions([item("Obst & Gemüse")], "Molkerei")).toEqual([
      ALL_CATEGORIES_LABEL,
      "Molkerei",
      "Obst & Gemüse",
    ]);
  });

  it("returns only Alle for an empty list", () => {
    expect(categoryChipOptions([])).toEqual([ALL_CATEGORIES_LABEL]);
  });
});

describe("groupItemsByCategory", () => {
  it("groups in chip order and drops Alle", () => {
    const milch = item("Molkerei", "Milch");
    const apfel = item("Obst & Gemüse", "Apfel");
    const dubel = item(null, "Dübel");
    const groups = groupItemsByCategory([dubel, milch, apfel]);
    expect(groups.map((g) => g.category)).toEqual([
      "Molkerei",
      "Obst & Gemüse",
      UNCATEGORIZED_LABEL,
    ]);
    expect(groups[0].items).toEqual([milch]);
    expect(groups[2].items).toEqual([dubel]);
  });

  it("preserves the incoming order inside a group (sortIndex order)", () => {
    const a = item("Molkerei", "Butter");
    const b = item("Molkerei", "Milch");
    expect(groupItemsByCategory([a, b])[0].items).toEqual([a, b]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupItemsByCategory([])).toEqual([]);
  });
});

describe("knownCategories", () => {
  it("unions catalog defaults with entry categories, sorted and deduplicated", () => {
    expect(knownCategories(["Molkerei", null, "Backwaren"], ["Molkerei", "Obst & Gemüse"])).toEqual([
      "Backwaren",
      "Molkerei",
      "Obst & Gemüse",
    ]);
  });

  it("ignores empty and whitespace-only values and never returns the placeholder", () => {
    expect(knownCategories(["", "  ", null], [null])).toEqual([]);
  });
});
