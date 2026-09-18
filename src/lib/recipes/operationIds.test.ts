import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/validate";
import { deriveOperationId } from "./operationIds";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const RECIPE = "22222222-2222-4222-8222-222222222222";
const ARTICLE = "33333333-3333-4333-8333-333333333333";

describe("deriveOperationId", () => {
  it("returns the same id for the same inputs — this is what makes a retry a no-op", () => {
    expect(deriveOperationId(TOKEN, RECIPE, ARTICLE)).toBe(
      deriveOperationId(TOKEN, RECIPE, ARTICLE),
    );
  });

  it("produces a well-formed UUID the uuid columns accept", () => {
    expect(isUuid(deriveOperationId(TOKEN, RECIPE, ARTICLE))).toBe(true);
  });

  it("stamps UUID version 5, so the value is a name-based id and not mistaken for random", () => {
    // The version nibble is the first character of the third group.
    expect(deriveOperationId(TOKEN, RECIPE, ARTICLE).split("-")[2][0]).toBe("5");
  });

  it("separates a different token — a NEW attempt applies again instead of replaying", () => {
    const other = "44444444-4444-4444-8444-444444444444";
    expect(deriveOperationId(other, RECIPE, ARTICLE)).not.toBe(
      deriveOperationId(TOKEN, RECIPE, ARTICLE),
    );
  });

  it("separates the same article in two different recipes", () => {
    const otherRecipe = "55555555-5555-4555-8555-555555555555";
    expect(deriveOperationId(TOKEN, otherRecipe, ARTICLE)).not.toBe(
      deriveOperationId(TOKEN, RECIPE, ARTICLE),
    );
  });

  it("separates two articles of the same recipe", () => {
    const otherArticle = "66666666-6666-4666-8666-666666666666";
    expect(deriveOperationId(TOKEN, RECIPE, otherArticle)).not.toBe(
      deriveOperationId(TOKEN, RECIPE, ARTICLE),
    );
  });

  it("cannot be confused by a separator planted inside a field", () => {
    // Without length-prefixed or escaped joining, ("a:b", "c") and ("a", "b:c") would hash the
    // same string. The implementation must keep them apart.
    expect(deriveOperationId(TOKEN, `${RECIPE}:x`, ARTICLE)).not.toBe(
      deriveOperationId(TOKEN, RECIPE, `x:${ARTICLE}`),
    );
  });
});
