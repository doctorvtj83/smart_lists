import { describe, it, expect } from "vitest";
import { compareArticleNames, compareGermanText } from "./sort";

describe("compareGermanText", () => {
  // The whole reason this comparator exists: a code-point sort puts "Ä" after "Z".
  it("sorts umlauts next to their base letter, not after Z", () => {
    const sorted = ["Zucker", "Äpfel", "Apfel"].sort(compareGermanText);
    expect(sorted).toEqual(["Apfel", "Äpfel", "Zucker"]);
  });

  it("is case-insensitive in the German collation", () => {
    expect(compareGermanText("apfel", "Apfel")).toBeLessThan(0);
    expect(compareGermanText("Brot", "apfel")).toBeGreaterThan(0);
  });
});

describe("compareArticleNames", () => {
  // It must keep behaving exactly as before — it is now a named alias.
  it("still orders article names under German rules", () => {
    const sorted = ["Öl", "Nudeln", "Mehl"].sort(compareArticleNames);
    expect(sorted).toEqual(["Mehl", "Nudeln", "Öl"]);
  });
});
