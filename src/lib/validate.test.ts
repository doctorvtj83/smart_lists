import { describe, expect, it } from "vitest";
import { isUuid } from "./validate";

describe("isUuid", () => {
  it("accepts a canonical UUID (any casing)", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("rejects strings that are not canonical UUIDs", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    // Right characters but wrong grouping/length must also be rejected.
    expect(isUuid("123e4567e89b12d3a456426614174000")).toBe(false);
    expect(isUuid("123e4567-e89b-12d3-a456-42661417400")).toBe(false);
  });
});
