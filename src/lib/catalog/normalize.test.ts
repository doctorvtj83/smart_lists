import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalize";

// The article-identity rule (MVP design §4.4): two spellings of the same article must produce the
// same normalized string, because CatalogItem.normalizedName is unique per project.
describe("normalizeName", () => {
  it("lowercases", () => {
    expect(normalizeName("Milch")).toBe("milch");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeName("  Brot ")).toBe("brot");
  });

  it("collapses repeated inner whitespace to single spaces", () => {
    expect(normalizeName("rote   Paprika")).toBe("rote paprika");
  });

  it("maps different spellings of the same article to one identity", () => {
    expect(normalizeName(" MILCH ")).toBe(normalizeName("milch"));
  });

  it("returns an empty string for whitespace-only input (caller rejects it)", () => {
    expect(normalizeName("   ")).toBe("");
  });
});
