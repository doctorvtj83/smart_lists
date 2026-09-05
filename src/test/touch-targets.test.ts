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
// Task 9 extends this list; a new control that needs a finger belongs here.
const CONTROLS: Array<{ file: string; selector: string }> = [
  { file: "src/components/ui/Toggle.module.css", selector: ".track" },
];

describe("touch targets", () => {
  it.each(CONTROLS)("$file $selector offers a ≥44px hit area", ({ file, selector }) => {
    expect(hasHitArea(readCss(file), selector)).toBe(true);
  });
});
