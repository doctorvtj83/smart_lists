import { describe, it, expect } from "vitest";
import { formatQuantityLabel, parseGermanDecimal } from "./quantity";

describe("parseGermanDecimal", () => {
  it("reads a German decimal comma", () => {
    expect(parseGermanDecimal("1,5")).toBe(1.5);
  });

  it("also accepts a dot, because both keyboards exist", () => {
    expect(parseGermanDecimal("1.5")).toBe(1.5);
  });

  it("reads a plain integer", () => {
    expect(parseGermanDecimal("3")).toBe(3);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseGermanDecimal("  2,25  ")).toBe(2.25);
  });

  // null is "the user cleared the field", which is a legal update_item value.
  it("maps an empty or whitespace-only field to null", () => {
    expect(parseGermanDecimal("")).toBeNull();
    expect(parseGermanDecimal("   ")).toBeNull();
  });

  // NaN is deliberate: applyOperation's Number.isFinite guard rejects it with the
  // German message, so garbage never silently becomes 0 or clears the field.
  it("returns NaN for text that is not a number", () => {
    expect(parseGermanDecimal("viel")).toBeNaN();
    expect(parseGermanDecimal("1,5,5")).toBeNaN();
  });
});

describe("formatQuantityLabel", () => {
  it("joins quantity and unit with a space", () => {
    expect(formatQuantityLabel(1.5, "l")).toBe("1,5 l");
  });

  it("prints the quantity alone when there is no unit", () => {
    expect(formatQuantityLabel(3, null)).toBe("3");
  });

  it("prints the unit alone when there is no quantity", () => {
    expect(formatQuantityLabel(null, "Packung")).toBe("Packung");
  });

  it("is empty when the entry carries neither", () => {
    expect(formatQuantityLabel(null, null)).toBe("");
    expect(formatQuantityLabel(null, "  ")).toBe("");
  });
});
