import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { expandRecipe, assertValidRecipeCount, type ExpandableRecipe } from "./expand";

/**
 * Builds a recipe literal. `ExpandableRecipe` is STRUCTURAL on purpose (it is a subset of
 * Slice 18's `RecipeWithItems`), which is exactly what lets this test hand it plain objects.
 */
function recipe(
  items: { name: string; quantity: number | null; unit: string | null; sortIndex: number }[],
): ExpandableRecipe {
  return {
    items: items.map((item, index) => ({
      catalogItemId: `article-${index}`,
      catalogItem: { name: item.name },
      quantity: item.quantity,
      unit: item.unit,
      sortIndex: item.sortIndex,
    })),
  };
}

describe("expandRecipe", () => {
  it("multiplies every quantity by the count", () => {
    const planned = expandRecipe(
      recipe([{ name: "Milch", quantity: 0.5, unit: "l", sortIndex: 0 }]),
      3,
    );

    expect(planned).toEqual([
      { catalogItemId: "article-0", name: "Milch", quantity: 1.5, unit: "l" },
    ]);
  });

  it("leaves a null quantity null at any count (D4: Salz stays Salz)", () => {
    const planned = expandRecipe(
      recipe([{ name: "Salz", quantity: null, unit: null, sortIndex: 0 }]),
      7,
    );

    expect(planned[0].quantity).toBeNull();
  });

  it("rounds away float drift at the precision the UI formats at", () => {
    // 0.1 * 3 is 0.30000000000000004 in IEEE 754. The row label would hide it; the entry
    // sheet's MENGE field would not.
    const planned = expandRecipe(
      recipe([{ name: "Öl", quantity: 0.1, unit: "l", sortIndex: 0 }]),
      3,
    );

    expect(planned[0].quantity).toBe(0.3);
  });

  it("keeps a null unit null — inheritance happens at apply time, not here", () => {
    const planned = expandRecipe(
      recipe([{ name: "Zwiebeln", quantity: 2, unit: null, sortIndex: 0 }]),
      2,
    );

    expect(planned[0].unit).toBeNull();
    expect(planned[0].quantity).toBe(4);
  });

  it("emits lines in sortIndex order regardless of the input order", () => {
    const unordered = recipe([
      { name: "Zweitens", quantity: 1, unit: null, sortIndex: 5 },
      { name: "Erstens", quantity: 1, unit: null, sortIndex: 1 },
    ]);

    expect(expandRecipe(unordered, 1).map((line) => line.name)).toEqual(["Erstens", "Zweitens"]);
  });

  it("accepts both bounds", () => {
    const one = recipe([{ name: "Milch", quantity: 1, unit: "l", sortIndex: 0 }]);
    expect(expandRecipe(one, 1)[0].quantity).toBe(1);
    expect(expandRecipe(one, 99)[0].quantity).toBe(99);
  });

  it.each([0, -1, 100, 2.5, Number.NaN])("rejects the count %s", (count) => {
    const one = recipe([{ name: "Milch", quantity: 1, unit: "l", sortIndex: 0 }]);

    expect(() => expandRecipe(one, count)).toThrow(ApiError);
    expect(() => expandRecipe(one, count)).toThrow("Anzahl muss zwischen 1 und 99 liegen");
  });
});

describe("assertValidRecipeCount", () => {
  it("answers with a 400, not a 500 — it validates a form field", () => {
    try {
      assertValidRecipeCount(0);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ApiError).status).toBe(400);
    }
  });
});
