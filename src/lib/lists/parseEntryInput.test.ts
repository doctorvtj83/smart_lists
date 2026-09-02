import { describe, expect, it } from "vitest";
import { buildUnitLookup, parseEntryInput } from "./parseEntryInput";

// The base vocabulary alone — most cases need no project units at all.
const units = buildUnitLookup([]);

describe("buildUnitLookup", () => {
  it("resolves a base alias to its canonical display form", () => {
    expect(units["liter"]).toBe("l");
    expect(units["stück"]).toBe("Stk");
  });

  it("adds the project's own catalog units and ignores blanks", () => {
    const lookup = buildUnitLookup(["Kiste", null, "   "]);
    expect(lookup["kiste"]).toBe("Kiste");
  });

  // A project whose catalog happens to hold „Liter" must still render „1,5 l" (handoff §2).
  it("lets the base list win over a project unit with the same spelling", () => {
    expect(buildUnitLookup(["Liter"])["liter"]).toBe("l");
  });
});

describe("parseEntryInput", () => {
  it("splits a decimal quantity, a known unit and the article name", () => {
    expect(parseEntryInput("1,5 l Milch", units)).toEqual({
      quantity: 1.5,
      unit: "l",
      name: "Milch",
    });
  });

  it("parses a unit glued to the number", () => {
    expect(parseEntryInput("500g Mehl", units)).toEqual({
      quantity: 500,
      unit: "g",
      name: "Mehl",
    });
  });

  it("accepts a dot decimal as well as the German comma", () => {
    expect(parseEntryInput("1.5 l Milch", units)).toEqual({
      quantity: 1.5,
      unit: "l",
      name: "Milch",
    });
  });

  it("canonicalises the unit's spelling and case", () => {
    expect(parseEntryInput("2 Liter Milch", units)).toEqual({
      quantity: 2,
      unit: "l",
      name: "Milch",
    });
    expect(parseEntryInput("250G Butter", units)).toEqual({
      quantity: 250,
      unit: "g",
      name: "Butter",
    });
  });

  it("takes a leading number without a known unit as a bare count", () => {
    expect(parseEntryInput("3 Joghurt", units)).toEqual({
      quantity: 3,
      unit: null,
      name: "Joghurt",
    });
  });

  it("recognises a unit the project's own catalog contributed", () => {
    expect(parseEntryInput("2 Palette Wasser", buildUnitLookup(["Palette"]))).toEqual({
      quantity: 2,
      unit: "Palette",
      name: "Wasser",
    });
  });

  it("trims and collapses whitespace like the catalog's name rule", () => {
    expect(parseEntryInput("  2   kg   Rote  Paprika ", units)).toEqual({
      quantity: 2,
      unit: "kg",
      name: "Rote Paprika",
    });
  });

  // --- the conservative refusals -------------------------------------------

  it("does not parse when nothing would be left to name the article", () => {
    expect(parseEntryInput("3 l", units)).toEqual({ quantity: null, unit: null, name: "3 l" });
  });

  it("does not parse a bare number", () => {
    expect(parseEntryInput("3", units)).toEqual({ quantity: null, unit: null, name: "3" });
  });

  it("does not parse a zero or negative quantity", () => {
    expect(parseEntryInput("0 Milch", units)).toEqual({
      quantity: null,
      unit: null,
      name: "0 Milch",
    });
    expect(parseEntryInput("-3 Milch", units)).toEqual({
      quantity: null,
      unit: null,
      name: "-3 Milch",
    });
  });

  it("does not treat Object.prototype keys as known units", () => {
    expect(parseEntryInput("1 constructor Milch", units)).toEqual({
      quantity: 1,
      unit: null,
      name: "constructor Milch",
    });
    expect(parseEntryInput("1 toString Milch", units)).toEqual({
      quantity: 1,
      unit: null,
      name: "toString Milch",
    });
  });

  it("does not parse a malformed decimal", () => {
    expect(parseEntryInput("1,5,5 Milch", units)).toEqual({
      quantity: null,
      unit: null,
      name: "1,5,5 Milch",
    });
  });

  it("leaves a plain name untouched", () => {
    expect(parseEntryInput("Milch", units)).toEqual({
      quantity: null,
      unit: null,
      name: "Milch",
    });
  });

  it("leaves an empty input empty rather than inventing a name", () => {
    expect(parseEntryInput("   ", units)).toEqual({ quantity: null, unit: null, name: "" });
  });

  // The escape hatch for „7 Zwerge Bier" lives in addEntryFromRow (Task 2), not here:
  // this function is deliberately catalog-blind so it stays pure and DB-free.
  it("still splits a number off a name that only looks like an article", () => {
    expect(parseEntryInput("7 Zwerge Bier", units)).toEqual({
      quantity: 7,
      unit: null,
      name: "Zwerge Bier",
    });
  });
});
