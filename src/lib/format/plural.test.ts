import { describe, expect, it } from "vitest";
import {
  formatArticleCount,
  formatArticleDefaults,
  formatListCount,
  formatMemberCount,
  formatOpenCount,
  formatOpenOfTotal,
  formatProjectMeta,
  formatUsedInLists,
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
