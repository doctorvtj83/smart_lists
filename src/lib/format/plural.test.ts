import { describe, expect, it } from "vitest";
import { recipeLabels } from "@/lib/recipes/labels";
import {
  formatArticleCount,
  formatArticleDefaults,
  formatArticleEnumeration,
  formatListCount,
  formatMemberCount,
  formatNewListLabel,
  formatNewListWithRecipesLabel,
  formatOpenCount,
  formatOpenOfTotal,
  formatProjectMeta,
  formatApplyResult,
  formatRecipeArticleCount,
  formatRecipeOverlapNote,
  formatUsedInLists,
  formatUsedInRecipes,
} from "./plural";

describe("formatListCount", () => {
  it("uses the singular for exactly one", () => {
    expect(formatListCount(1)).toBe("1 Liste");
  });

  it("uses the plural for everything else", () => {
    expect(formatListCount(3)).toBe("3 Listen");
    expect(formatListCount(0)).toBe("0 Listen"); // German: "0 Listen", not "0 Liste"
  });
});

describe("formatMemberCount", () => {
  it("uses the singular for exactly one", () => {
    expect(formatMemberCount(1)).toBe("1 Mitglied");
  });

  it("uses the plural for everything else", () => {
    expect(formatMemberCount(4)).toBe("4 Mitglieder");
  });
});

describe("formatProjectMeta", () => {
  it("joins both counts with the design's middle dot", () => {
    expect(formatProjectMeta(3, 4)).toBe("3 Listen · 4 Mitglieder");
    expect(formatProjectMeta(1, 2)).toBe("1 Liste · 2 Mitglieder");
  });
});

describe("formatOpenCount", () => {
  it("renders the project-detail style open counter", () => {
    expect(formatOpenCount(5)).toBe("5 offen");
    expect(formatOpenCount(0)).toBe("0 offen");
  });
});

describe("formatOpenOfTotal", () => {
  it("renders the Weitermachen counter", () => {
    expect(formatOpenOfTotal(5, 8)).toBe("5 von 8 offen");
  });
});

describe("formatArticleCount", () => {
  it("counts articles for the Katalog header", () => {
    expect(formatArticleCount(124)).toBe("124 Artikel");
  });

  // "Artikel" is one of the German nouns whose plural equals its singular — this
  // test exists so nobody "fixes" it into "1 Artikeln" later.
  it("keeps the noun unchanged in the singular and at zero", () => {
    expect(formatArticleCount(1)).toBe("1 Artikel");
    expect(formatArticleCount(0)).toBe("0 Artikel");
  });
});

describe("formatUsedInLists", () => {
  it("uses the singular for exactly one list", () => {
    expect(formatUsedInLists(1)).toBe("wird in 1 Liste verwendet");
  });

  it("uses the plural for more than one list", () => {
    expect(formatUsedInLists(3)).toBe("wird in 3 Listen verwendet");
  });
});

describe("formatArticleDefaults", () => {
  it("joins category and unit with the middle dot", () => {
    expect(formatArticleDefaults("Molkerei", "l")).toBe("Molkerei · l");
  });

  it("prints just the one value that is set", () => {
    expect(formatArticleDefaults("Molkerei", null)).toBe("Molkerei");
    expect(formatArticleDefaults(null, "kg")).toBe("kg");
  });

  // A row with no defaults still needs a sub line — without it the rows in the
  // dense list would alternate between two heights.
  it("falls back to a filler when nothing is set", () => {
    expect(formatArticleDefaults(null, null)).toBe("Keine Vorgaben");
  });
});

describe("formatNewListLabel", () => {
  it("names the empty case without a number", () => {
    expect(formatNewListLabel(0)).toBe("Leere Liste anlegen");
  });

  it("uses the DATIVE singular for exactly one", () => {
    expect(formatNewListLabel(1)).toBe("Liste mit 1 Eintrag anlegen");
  });

  // "mit" governs the dative, so the plural is "Einträgen", not "Einträge" —
  // the exact trap this helper exists to keep out of the call site.
  it("uses the dative plural for many", () => {
    expect(formatNewListLabel(7)).toBe("Liste mit 7 Einträgen anlegen");
  });
});

describe("formatRecipeArticleCount", () => {
  it("uses the same noun for singular and plural", () => {
    // "Artikel" is one of the German nouns whose plural equals its singular.
    expect(formatRecipeArticleCount(1)).toBe("1 Artikel");
    expect(formatRecipeArticleCount(6)).toBe("6 Artikel");
    expect(formatRecipeArticleCount(0)).toBe("Noch keine Artikel");
  });
});

describe("formatUsedInRecipes", () => {
  const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

  it("uses the singular only for exactly one", () => {
    expect(formatUsedInRecipes(1, labels)).toBe("wird in 1 Rezept verwendet");
    expect(formatUsedInRecipes(2, labels)).toBe("wird in 2 Rezepten verwendet");
  });

  it("uses the project's own wording", () => {
    const sets = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });
    expect(formatUsedInRecipes(3, sets)).toBe("wird in 3 Sets verwendet");
  });
});

describe("formatApplyResult", () => {
  it("names the recipes with their counts and both totals", () => {
    expect(formatApplyResult([{ name: "Lasagne", count: 2 }], 4, 2)).toBe(
      "Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt",
    );
  });

  it("lists several recipes in the order they were applied", () => {
    expect(
      formatApplyResult(
        [
          { name: "Lasagne", count: 2 },
          { name: "Chili", count: 1 },
        ],
        5,
        0,
      ),
    ).toBe("Lasagne ×2, Chili ×1 hinzugefügt · 5 neue Einträge");
  });

  it("uses the singular for exactly one new entry", () => {
    expect(formatApplyResult([{ name: "Chili", count: 1 }], 1, 0)).toBe(
      "Chili ×1 hinzugefügt · 1 neuer Eintrag",
    );
  });

  it("drops the „neue Einträge“ half when everything merged", () => {
    expect(formatApplyResult([{ name: "Chili", count: 1 }], 0, 3)).toBe(
      "Chili ×1 hinzugefügt · 3 zusammengeführt",
    );
  });

  it("says so when an empty recipe produced nothing at all", () => {
    expect(formatApplyResult([{ name: "Leer", count: 1 }], 0, 0)).toBe(
      "Leer ×1 hinzugefügt · keine neuen Einträge",
    );
  });
});

describe("formatArticleEnumeration", () => {
  it("joins three names the way German writes a list", () => {
    expect(formatArticleEnumeration(["Milch", "Eier", "Butter"])).toBe("Milch, Eier und Butter");
  });

  it("joins two names with „und“", () => {
    expect(formatArticleEnumeration(["Milch", "Eier"])).toBe("Milch und Eier");
  });

  it("returns a single name unchanged", () => {
    expect(formatArticleEnumeration(["Milch"])).toBe("Milch");
  });

  it("returns an empty string for an empty list", () => {
    expect(formatArticleEnumeration([])).toBe("");
  });
});

describe("formatRecipeOverlapNote", () => {
  const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

  it("explains an overlap of several articles", () => {
    expect(formatRecipeOverlapNote(["Milch", "Eier", "Butter"], labels)).toBe(
      "Milch, Eier und Butter kommen schon aus den Rezepten und werden nicht doppelt hinzugefügt.",
    );
  });

  it("uses the singular verb for one article", () => {
    expect(formatRecipeOverlapNote(["Milch"], labels)).toBe(
      "Milch kommt schon aus den Rezepten und wird nicht doppelt hinzugefügt.",
    );
  });

  it("uses the project's own plural label", () => {
    const sets = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });
    expect(formatRecipeOverlapNote(["Milch"], sets)).toContain("aus den Sets");
  });

  it("returns an empty string when nothing overlaps, so the caller can render it unconditionally", () => {
    expect(formatRecipeOverlapNote([], labels)).toBe("");
  });
});

describe("formatNewListWithRecipesLabel", () => {
  it("shows the de-duplicated article total", () => {
    expect(formatNewListWithRecipesLabel(15)).toBe("Liste anlegen · 15 Artikel");
  });

  it("keeps the singular", () => {
    expect(formatNewListWithRecipesLabel(1)).toBe("Liste anlegen · 1 Artikel");
  });

  it("falls back to the empty-list wording at zero, exactly like formatNewListLabel", () => {
    expect(formatNewListWithRecipesLabel(0)).toBe("Leere Liste anlegen");
  });
});
