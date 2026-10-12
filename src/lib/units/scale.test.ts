import { describe, expect, it } from "vitest";
import { convertQuantity, sameScaleGroup, scaleToDefault } from "./scale";

describe("convertQuantity", () => {
  it.each([
    [1, "kg", "g", 1000],
    [500, "g", "kg", 0.5],
    [1, "Pfund", "kg", 0.5],
    [250, "g", "Pfund", 0.5],
    [1, "kg", "Pfund", 2],
    [500, "ml", "l", 0.5],
    [2, "dl", "cl", 20],
    [1, "l", "dl", 10],
    [1, "m", "mm", 1000],
    [15, "mm", "cm", 1.5],
    [1.5, "Liter", "ml", 1500],
    [2, "KG", " g ", 2000],
  ])("converts %d %s to %s", (q, from, to, expected) => {
    expect(convertQuantity(q, from, to)).toBe(expected);
  });

  it("rounds to three decimals (accepted loss, U6)", () => {
    expect(convertQuantity(2.5, "g", "kg")).toBe(0.003);
  });

  it("returns null when the rounded result would be 0", () => {
    expect(convertQuantity(0.4, "g", "kg")).toBeNull();
  });

  it.each([
    ["g", "l"],
    ["l", "m"],
    ["l", "Flasche"],
    ["Ltr", "l"],
    ["TL", "EL"],
  ])("refuses %s → %s", (from, to) => expect(convertQuantity(1, from, to)).toBeNull());
});

describe("sameScaleGroup", () => {
  it("groups units within a scale family", () => {
    expect(sameScaleGroup("l", "ml")).toBe(true);
    expect(sameScaleGroup("Liter", "l")).toBe(true);
    expect(sameScaleGroup("Pfund", "kg")).toBe(true);
    expect(sameScaleGroup("g", "ml")).toBe(false);
    expect(sameScaleGroup("Flasche", "Flasche")).toBe(false); // not in any group
    expect(sameScaleGroup(null, "l")).toBe(false);
    expect(sameScaleGroup(undefined, undefined)).toBe(false);
  });
});

describe("scaleToDefault", () => {
  it("converts quantity and preserves default unit spelling", () => {
    expect(scaleToDefault(500, "ml", "l")).toEqual({ quantity: 0.5, unit: "l" });
    expect(scaleToDefault(2, "Liter", "l")).toEqual({ quantity: 2, unit: "l" });
    expect(scaleToDefault(500, "ml", "Liter")).toEqual({ quantity: 0.5, unit: "Liter" });
    expect(scaleToDefault(250, "g", "Pfund")).toEqual({ quantity: 0.5, unit: "Pfund" });
    expect(scaleToDefault(null, "ml", "l")).toEqual({ quantity: null, unit: "l" });
    expect(scaleToDefault(500, "ml", null)).toBeNull(); // U5: no default
    expect(scaleToDefault(2, "Flasche", "l")).toBeNull(); // other group
    expect(scaleToDefault(2, undefined, "l")).toBeNull(); // inherit path, step 5 handles it
    expect(scaleToDefault(0.4, "g", "kg")).toBeNull(); // rounds to zero
  });
});
