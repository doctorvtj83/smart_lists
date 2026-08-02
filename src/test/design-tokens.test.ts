import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The design handoff is the binding source for colours. This test pins the token
// contract in code so a later slice cannot silently drift a value: changing a
// colour has to be a conscious edit here as well. It reads the raw stylesheet
// because tokens are plain CSS, not TypeScript.
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

// Exactly the palette from docs/design/2026-08-01-ui-handoff (README table plus
// the inline styles of the two .dc.html prototypes, which are the authority).
const EXPECTED_COLORS: Record<string, string> = {
  "--color-bg": "#fcfcfb",
  "--color-bg-frozen": "#f7f7f5",
  "--color-bg-sidebar": "#f3f4f2",
  "--color-surface": "#ffffff",
  "--color-text-primary": "#232322",
  "--color-text-secondary": "#5a5a55",
  "--color-text-tertiary": "#77776f",
  "--color-text-muted": "#a3a39b",
  "--color-text-placeholder": "#c2c2ba",
  "--color-text-checked": "#b3b3ab",
  "--color-accent": "#3e63c4",
  "--color-accent-dark": "#2f4a94",
  "--color-accent-tint": "#eef2fc",
  "--color-danger": "#bf4a41",
  "--color-danger-tint": "#fdf3f2",
  "--color-danger-dark": "#8a4038",
  "--color-success": "#6d8a5e",
  "--color-success-tint": "#eef1ea",
  "--color-success-text": "#4c5c43",
  "--color-hairline": "#ececea",
  "--color-hairline-weak": "#f1f1ee",
  "--color-border-strong": "#dcdcd7",
  "--color-border-active-panel": "#dfe4f2",
  "--color-control-border": "#c6c6bf",
  "--color-checked-archived": "#b8bdb2",
  "--color-grabber": "#e3e3df",
};

describe("design tokens", () => {
  it("defines every colour token with the value from the handoff", () => {
    for (const [token, value] of Object.entries(EXPECTED_COLORS)) {
      expect(css).toContain(`${token}: ${value};`);
    }
  });

  it("defines the radii, shadow and motion tokens the primitives use", () => {
    for (const token of [
      "--radius-card",
      "--radius-panel",
      "--radius-control",
      "--radius-control-sm",
      "--radius-pill",
      "--radius-sheet",
      "--shadow-card",
      "--shadow-dropdown",
      "--shadow-sheet",
      "--shadow-hero",
      "--shadow-panel-active",
      "--motion-fade",
      "--motion-sheet",
      "--motion-drawer",
      "--ease-sheet",
    ]) {
      expect(css).toContain(`${token}:`);
    }
  });

  it("declares the keyframes the primitives animate with", () => {
    for (const name of ["sl-fade", "sl-sheet", "sl-drawer", "sl-banner", "sl-pop", "sl-flash"]) {
      expect(css).toContain(`@keyframes ${name}`);
    }
  });

  it("has no dark-mode block — the design is light only", () => {
    expect(css).not.toContain("prefers-color-scheme");
  });
});
