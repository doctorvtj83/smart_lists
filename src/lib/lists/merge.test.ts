import { describe, expect, it } from "vitest";
import {
  findMergeTarget,
  formatMergeMessage,
  round3,
  unitsMatch,
  type MergeCandidate,
} from "./merge";

// One article, one list: every candidate below differs only in the field under test.
const ARTICLE = "11111111-1111-4111-8111-111111111111";
const OTHER_ARTICLE = "22222222-2222-4222-8222-222222222222";

/** A quantified, unchecked row of ARTICLE — the DEFAULT merge target; each test bends one field. */
function row(overrides: Partial<MergeCandidate> = {}): MergeCandidate {
  return {
    id: "row-1",
    catalogItemId: ARTICLE,
    quantity: 1,
    unit: "l",
    checked: false,
    sortIndex: 1,
    ...overrides,
  };
}

/** An incoming „2 l Milch". */
function incoming(overrides: Partial<Parameters<typeof findMergeTarget>[1]> = {}) {
  return { catalogItemId: ARTICLE, quantity: 2, unit: "l" as string | null, ...overrides };
}

describe("round3", () => {
  // The reason this function exists: float addition leaks precision the entry sheet would surface.
  it("kills the float tail of 0.1 + 0.2", () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });

  it("keeps three decimals and rounds the fourth", () => {
    expect(round3(1.2345)).toBe(1.235);
    expect(round3(0.125)).toBe(0.125);
  });

  it("leaves a whole number alone", () => {
    expect(round3(3)).toBe(3);
  });
});

describe("unitsMatch", () => {
  it("matches the same unit spelled in a different case", () => {
    expect(unitsMatch("l", "L")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(unitsMatch(" l ", "l")).toBe(true);
  });

  it("treats 'no unit' as its own bucket that matches only itself", () => {
    expect(unitsMatch(null, null)).toBe(true);
    expect(unitsMatch(null, "l")).toBe(false);
    expect(unitsMatch("l", null)).toBe(false);
  });

  // A blank string is what a cleared text input produces; it must land in the null bucket, not in
  // a third bucket of its own.
  it("treats an empty or whitespace-only unit as no unit", () => {
    expect(unitsMatch("", null)).toBe(true);
    expect(unitsMatch("   ", null)).toBe(true);
  });

  it("does not convert units: l and ml are different", () => {
    expect(unitsMatch("l", "ml")).toBe(false);
  });
});

describe("findMergeTarget", () => {
  it("merges into the same article with the same unit", () => {
    expect(findMergeTarget([row()], incoming())?.id).toBe("row-1");
  });

  it("merges when both sides have no unit at all", () => {
    expect(findMergeTarget([row({ unit: null })], incoming({ unit: null }))?.id).toBe("row-1");
  });

  it("merges across a unit case difference", () => {
    expect(findMergeTarget([row({ unit: "L" })], incoming({ unit: "l" }))?.id).toBe("row-1");
  });

  it("refuses a different unit (no conversion: 1 l and 500 ml stay apart)", () => {
    expect(findMergeTarget([row({ unit: "l" })], incoming({ unit: "ml" }))).toBeNull();
  });

  it("refuses when only one side has a unit", () => {
    expect(findMergeTarget([row({ unit: null })], incoming({ unit: "l" }))).toBeNull();
    expect(findMergeTarget([row({ unit: "l" })], incoming({ unit: null }))).toBeNull();
  });

  // D1 mixed case: a bare „Milch" into a quantified row has no number to add — merging it
  // would invent nothing useful and hide the wish next to a measured amount.
  it("refuses when the incoming add has no quantity and the existing row does", () => {
    expect(findMergeTarget([row()], incoming({ quantity: null }))).toBeNull();
  });

  it("refuses when the existing row has no quantity and the incoming add does", () => {
    expect(findMergeTarget([row({ quantity: null })], incoming())).toBeNull();
  });

  // D1 presence case: two unquantified wishes for the same article in the same unit bucket
  // are indistinguishable. A second „Salz" row is a duplicate the user cannot tell apart
  // (UAT Check 5: applying the recipe again must not spawn a second Salz).
  it("absorbs an unquantified add into an existing unquantified row of the same article", () => {
    expect(
      findMergeTarget(
        [row({ quantity: null, unit: null })],
        incoming({ quantity: null, unit: null }),
      )?.id,
    ).toBe("row-1");
  });

  it("absorbs two unquantified rows that share a unit bucket", () => {
    expect(
      findMergeTarget(
        [row({ quantity: null, unit: "Prise" })],
        incoming({ quantity: null, unit: "prise" }),
      )?.id,
    ).toBe("row-1");
  });

  it("refuses an unquantified add when the existing unquantified row is in a different unit", () => {
    expect(
      findMergeTarget(
        [row({ quantity: null, unit: "Prise" })],
        incoming({ quantity: null, unit: null }),
      ),
    ).toBeNull();
  });

  // D2: what is already in the basket is settled.
  it("refuses a checked row", () => {
    expect(findMergeTarget([row({ checked: true })], incoming())).toBeNull();
  });

  it("refuses a row of a different article", () => {
    expect(findMergeTarget([row({ catalogItemId: OTHER_ARTICLE })], incoming())).toBeNull();
  });

  it("picks the lowest sortIndex when several rows qualify, whatever order they arrive in", () => {
    const candidates = [
      row({ id: "late", sortIndex: 9 }),
      row({ id: "early", sortIndex: 2 }),
      row({ id: "middle", sortIndex: 5 }),
    ];
    expect(findMergeTarget(candidates, incoming())?.id).toBe("early");
  });

  it("skips disqualified rows and takes the next qualifying one", () => {
    const candidates = [
      row({ id: "checked", sortIndex: 1, checked: true }),
      row({ id: "usable", sortIndex: 2 }),
    ];
    expect(findMergeTarget(candidates, incoming())?.id).toBe("usable");
  });

  it("returns nothing for an empty candidate list", () => {
    expect(findMergeTarget([], incoming())).toBeNull();
  });

  // The narrowed return type is what lets the funnel add without a non-null assertion.
  it("returns a target whose quantity is a number", () => {
    const target = findMergeTarget([row({ quantity: 1.5 })], incoming());
    expect(target?.quantity).toBe(1.5);
  });
});

describe("formatMergeMessage", () => {
  it("names the row that absorbed the add and its new total", () => {
    expect(
      formatMergeMessage({
        targetItemId: "row-1",
        name: "Milch",
        previousQuantity: 1,
        quantity: 3,
        unit: "l",
      }),
    ).toBe("Zu 1 l Milch addiert → 3 l");
  });

  it("uses the German decimal comma", () => {
    expect(
      formatMergeMessage({
        targetItemId: "row-1",
        name: "Milch",
        previousQuantity: 0.5,
        quantity: 2,
        unit: "l",
      }),
    ).toBe("Zu 0,5 l Milch addiert → 2 l");
  });

  it("works for an article without a unit", () => {
    expect(
      formatMergeMessage({
        targetItemId: "row-1",
        name: "Zwiebeln",
        previousQuantity: 2,
        quantity: 5,
        unit: null,
      }),
    ).toBe("Zu 2 Zwiebeln addiert → 5");
  });

  it("has nothing to say for a presence merge — the row did not change", () => {
    expect(
      formatMergeMessage({
        targetItemId: "row-1",
        name: "Salz",
        previousQuantity: null,
        quantity: null,
        unit: null,
      }),
    ).toBe("");
  });
});
