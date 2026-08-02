import { describe, it, expect } from "vitest";
import { AVATAR_COLORS, avatarColor } from "./avatarColor";

describe("avatarColor", () => {
  it("only ever returns a colour from the design's two-colour palette", () => {
    for (const name of ["Haushalt", "Camping", "Baumarkt", "Urlaub 2026", "ä", ""]) {
      expect(AVATAR_COLORS).toContain(avatarColor(name));
    }
  });

  it("is deterministic, so a project keeps its colour across renders", () => {
    expect(avatarColor("Haushalt")).toBe(avatarColor("Haushalt"));
  });

  it("distinguishes different names", () => {
    // The exact assignment does not matter; that these two differ is what the
    // design shows (Haushalt accent, Camping the lighter shade).
    expect(avatarColor("Haushalt")).not.toBe(avatarColor("Camping"));
  });
});
