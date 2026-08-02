import { describe, it, expect } from "vitest";
import { buildAutocomplete, type AutocompleteArticle } from "./autocomplete";

const article = (id: string, name: string, defaultCategory: string | null = null): AutocompleteArticle => ({
  id,
  name,
  defaultCategory,
});

const catalog = [
  article("a1", "Milch", "Molkerei"),
  article("a2", "Milchreis"),
  article("a3", "Buttermilch", "Molkerei"),
  article("a4", "Brot", "Backwaren"),
];

describe("buildAutocomplete", () => {
  it("shows nothing at all while the field is empty", () => {
    expect(buildAutocomplete(catalog, "")).toEqual({ options: [], createName: null });
    expect(buildAutocomplete(catalog, "   ")).toEqual({ options: [], createName: null });
  });

  // Substring, not prefix: the design's dropdown finds "Buttermilch" for "milch".
  // searchCatalog stays prefix-only — see the implementation comment.
  it("matches anywhere in the name, case-insensitively", () => {
    const { options } = buildAutocomplete(catalog, "MILCH");
    expect(options.map((option) => option.name)).toEqual(["Milch", "Milchreis", "Buttermilch"]);
  });

  it("carries the default category as the dropdown's sub-label", () => {
    const { options } = buildAutocomplete(catalog, "Milch");
    expect(options[0].hint).toBe("· Molkerei");
    expect(options[1].hint).toBe("");
  });

  it("caps the dropdown", () => {
    expect(buildAutocomplete(catalog, "milch", 2).options).toHaveLength(2);
  });

  it("offers to create the article when nothing matches exactly", () => {
    expect(buildAutocomplete(catalog, "Milc").createName).toBe("Milc");
  });

  // An exact hit means the row would create a duplicate — the catalog resolves
  // it to the same article anyway, so offering it is noise.
  it("does not offer creation when the typed name already exists", () => {
    expect(buildAutocomplete(catalog, "milch").createName).toBeNull();
    expect(buildAutocomplete(catalog, "  Milch  ").createName).toBeNull();
  });

  it("offers creation when the catalog is empty", () => {
    expect(buildAutocomplete([], "Dübel")).toEqual({ options: [], createName: "Dübel" });
  });

  it("collapses inner whitespace in the offered name, like the catalog does", () => {
    expect(buildAutocomplete([], "Rote   Bete").createName).toBe("Rote Bete");
  });
});
