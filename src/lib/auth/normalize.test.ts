import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./normalize";

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });

  it("is idempotent (applying twice changes nothing)", () => {
    const once = normalizeEmail("  Foo@Example.COM ");
    expect(normalizeEmail(once)).toBe(once);
  });
});
