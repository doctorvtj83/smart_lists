import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Enforces a 16px floor on every text-entry control in the app.
 *
 * Why this rule exists: iOS WebKit force-zooms the viewport when a text input
 * receives focus and its computed font-size is below 16px. Two decisions of
 * ours turn that nuisance into a stuck screen:
 *   - app-metadata.ts deliberately sets no maximumScale (pinch zoom is an
 *     accessibility requirement), so nothing suppresses the auto-zoom, and
 *   - manifest.ts uses display: "standalone", so there is no address bar for
 *     WebKit to restore the previous scale from on blur.
 * The result is the reported bug: tapping "Menge" in the entry sheet zooms the
 * whole app a little, the right edge goes off-screen, and it stays that way
 * after the sheet closes until the user pinches out by hand.
 *
 * Why this test reads CSS text instead of measuring rendered nodes: jsdom
 * performs no layout and does not resolve CSS Modules, so a computed style is
 * never available. The stylesheet is where the rule is actually expressed, so
 * the stylesheet is what gets pinned — the same approach design-tokens.test.ts
 * takes for the palette and touch-targets.test.ts for the 44px rule.
 *
 * This is a DELIBERATE deviation from the handoff prototypes, which draw these
 * fields at 14.5–15.5px. The prototypes were never focused on a real iPhone.
 * 16px is the platform's floor, not a design preference — do not "restore" the
 * prototype values here.
 */

const IOS_ZOOM_FLOOR_PX = 16;

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
 * The `\s*\{` anchor is what keeps `.input` from also matching `.input:focus`
 * or `.input:disabled` — only a brace may follow. Same helper as
 * touch-targets.test.ts; duplicated rather than shared because these two files
 * pin unrelated rules and a shared helper would couple them.
 */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

/** The px value of a rule's own `font-size`, or null if it declares none. */
function fontSizePx(css: string, selector: string): number | null {
  const body = ruleBody(css, selector);
  if (!body) return null;
  // Decimals matter: the values this rule replaced were 14.5px and 15.5px, and
  // a \d+ pattern would read "15.5px" as a compliant 15.
  const match = /font-size:\s*([\d.]+)px/.exec(body);
  return match ? Number(match[1]) : null;
}

// Every <input> the user can type into. A new text field belongs here; a
// control that cannot receive text (checkbox, hidden input, the Stepper's
// read-only spinbutton) does not, because WebKit only zooms for text entry.
const TEXT_INPUTS: Array<{ file: string; selector: string }> = [
  // Both TextField sizes: .sm is the entry sheet's Menge/Einheit/Kategorie row
  // (the exact field in the bug report), .md is every other form field.
  { file: "src/components/ui/TextField.module.css", selector: ".md" },
  { file: "src/components/ui/TextField.module.css", selector: ".sm" },
  // The add-entry row at the foot of a list.
  { file: "src/components/ui/Autocomplete.module.css", selector: ".input" },
  // The catalog's search box.
  {
    file: "src/app/projects/[projectId]/katalog/CatalogBrowser.module.css",
    selector: ".searchInput",
  },
];

// InlineEdit is the exception: its input declares `font: inherit` so the field
// matches the heading it replaces. That makes the WRAPPER's size the one that
// reaches WebKit, so each wrapper is what has to clear the floor.
const INLINE_EDIT_WRAPPERS = [
  "src/app/lists/[listId]/ListTitle.module.css",
  "src/app/projects/[projectId]/ProjectTitle.module.css",
  "src/app/projects/[projectId]/rezepte/[recipeId]/RecipeTitle.module.css",
];

describe("iOS focus-zoom floor", () => {
  it.each(TEXT_INPUTS)("$file $selector is at least 16px", ({ file, selector }) => {
    const size = fontSizePx(readCss(file), selector);
    expect(size, `${selector} declares no font-size of its own`).not.toBeNull();
    expect(size).toBeGreaterThanOrEqual(IOS_ZOOM_FLOOR_PX);
  });

  // Pins the inheritance itself: if a later slice gave .input its own smaller
  // font-size, the wrapper assertions below would still pass while the real
  // field dropped under the floor.
  it("keeps InlineEdit's field inheriting its heading's size", () => {
    const body = ruleBody(readCss("src/components/ui/InlineEdit.module.css"), ".input");
    expect(body).not.toBeNull();
    expect(body).toMatch(/font:\s*inherit/);
    expect(body).not.toMatch(/font-size:/);
  });

  it.each(INLINE_EDIT_WRAPPERS)("%s hands InlineEdit at least 16px", (file) => {
    const size = fontSizePx(readCss(file), ".title");
    expect(size, ".title declares no font-size").not.toBeNull();
    expect(size).toBeGreaterThanOrEqual(IOS_ZOOM_FLOOR_PX);
  });
});
