import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Enforces the handoff's § PWA / Mobil rule: "Tap-Targets ≥44px".
 *
 * Why this test reads CSS text instead of measuring rendered nodes: jsdom
 * performs no layout and does not resolve CSS Modules, so every
 * getBoundingClientRect() is 0×0. The stylesheet is the only place the rule is
 * actually expressed, so the stylesheet is what gets pinned — the same approach
 * design-tokens.test.ts takes for the palette.
 *
 * A control satisfies the rule one of two ways:
 *   1. it declares min-height: 44px (or height: 44px) itself, or
 *   2. it carries the ::after hit-area expander, which centres a ≥44×44
 *      transparent box on the control without moving a drawn pixel.
 */

const files = new Map<string, string>();

/** Reads (and memoises) a stylesheet relative to the repo root. */
function readCss(relativePath: string): string {
  const cached = files.get(relativePath);
  if (cached) return cached;
  const css = readFileSync(resolve(process.cwd(), relativePath), "utf8");
  files.set(relativePath, css);
  return css;
}

/**
 * The declaration block of one exact selector, or null.
 *
 * The `\s*\{` anchor is what keeps `.track` from also matching
 * `.track[data-checked="true"]` or `.track::after` — only a brace may follow.
 */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

/**
 * Returns whether a selector satisfies the handoff's ≥44px tap-target rule.
 *
 * A drawn box smaller than 44px can comply in two ways: the control itself
 * declares a 44px height, or it carries a ::after hit-area expander. This
 * function checks both paths so CONTROLS entries stay enforceable in CI
 * without jsdom layout.
 */
function hasHitArea(css: string, selector: string): boolean {
  const own = ruleBody(css, selector);
  if (own && /(?:min-)?height:\s*44px/.test(own)) return true;

  const expander = ruleBody(css, `${selector}::after`);
  if (!expander) return false;
  // All three are required: content makes the pseudo-element exist, and the two
  // minimums are the actual 44px guarantee.
  return (
    /content:\s*""/.test(expander) &&
    /min-width:\s*44px/.test(expander) &&
    /min-height:\s*44px/.test(expander)
  );
}

// Every interactive control in the app whose drawn box is smaller than 44px.
// A new control that needs a finger belongs here. Controls already at 44px
// (Button .primary/.secondary, RowLink .row, Autocomplete .row, EntryRow .row,
// DrawerTrigger .trigger, ListMenu .trigger) are compliant by their own
// min-height and are deliberately absent.
const CONTROLS: Array<{ file: string; selector: string }> = [
  { file: "src/components/ui/Toggle.module.css", selector: ".track" },
  { file: "src/app/lists/[listId]/EntryRow.module.css", selector: ".check" },
  { file: "src/components/ui/Chip.module.css", selector: ".remove" },
  { file: "src/components/ui/Chip.module.css", selector: ".interactive" },
  { file: "src/components/ui/ChipTabs.module.css", selector: ".tab" },
  { file: "src/components/ui/Button.module.css", selector: ".text" },
  { file: "src/components/ui/Button.module.css", selector: ".danger" },
  { file: "src/app/admin/page.module.css", selector: ".rowAction" },
  { file: "src/app/lists/[listId]/page.module.css", selector: ".bannerAction" },
  { file: "src/app/page.module.css", selector: ".adminLink" },
];

describe("touch targets", () => {
  it.each(CONTROLS)("$file $selector offers a ≥44px hit area", ({ file, selector }) => {
    expect(hasHitArea(readCss(file), selector)).toBe(true);
  });

  // Wrapped rows of expanded chips must not overlap: with a 44px hit area, two
  // rows whose pitch is smaller than 44px let the upper chip swallow taps meant
  // for the lower one. chip height + row-gap ≥ 44px is what prevents that.
  it.each([
    "src/app/projects/[projectId]/favoriten/FavoritesEditor.module.css",
    "src/app/lists/[listId]/EntrySheet.module.css",
    "src/app/projects/[projectId]/NewListSheet.module.css",
  ])("%s gives wrapped chip rows enough pitch for the expanders", (file) => {
    const body = ruleBody(readCss(file), ".chips");
    expect(body).not.toBeNull();
    const rowGap = /row-gap:\s*(\d+)px/.exec(body as string);
    expect(rowGap, "no explicit row-gap on .chips").not.toBeNull();
    expect(Number(rowGap?.[1])).toBeGreaterThanOrEqual(12);
  });
});
