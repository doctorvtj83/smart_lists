import { describe, expect, it } from "vitest";
import {
  formatListCount,
  formatMemberCount,
  formatOpenCount,
  formatOpenOfTotal,
  formatProjectMeta,
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
