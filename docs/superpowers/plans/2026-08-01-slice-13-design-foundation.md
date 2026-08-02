# Slice 13: Design Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the UI design handoff into a reusable presentation layer — design tokens, the Figtree font, one icon set, and the shared UI primitives (button, field, card/row, chips, empty state, bottom sheet, destructive confirm, inline edit, banner) that slices 14, 10, 11 and 12 all consume — so no later slice has to invent styling.

**Architecture:** Design tokens live as CSS custom properties on `:root` in `src/app/globals.css`; every primitive is a small React component in `src/components/ui/` with its own **CSS Module** that reads those tokens. Primitives are pure presentation — no data fetching, no domain logic, no Prisma. Components that need hooks (`Sheet`, `InlineEdit`, `TextField`) carry `"use client"`; the rest stay server-renderable so Slice 14's Server Components can use them directly. Behaviour is verified with Vitest + Testing Library in a `jsdom` environment, opted into per file so the existing node/Postgres test suite is untouched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, `next/font/google` (Figtree), `lucide-react` (icons), Vitest 4 + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom` + `jsdom`.

## Global Constraints

- **The design handoff is binding.** `docs/design/2026-08-01-ui-handoff/` — the **inline styles inside `Smart Lists Prototyp.dc.html` and `Smart Lists Optionen.dc.html` are the authority** for every measurement and colour; the README table is a summary. Never paste the handoff markup — rebuild it in React.
- **Ignore Turn 1 of `Smart Lists Optionen.dc.html`** (roughly lines 700–1000, palette `#d95d4e` / `#f1e9e2` / `#dccfc2`). Those are discarded explorations. The binding palette is the one in this plan.
- **Styling approach: CSS Modules.** No Tailwind, no CSS-in-JS, no inline `style={{…}}` in primitives.
- **Icons: `lucide-react` only**, stroke width `1.75`, default size `17px`.
- **Font: Figtree**, weights 400/500/600/700/800, via `next/font/google`, fallback `system-ui, sans-serif`.
- **Language:** code, identifiers and comments in **English**; all user-facing strings in **German**.
- **Comment density (CLAUDE.md):** every function gets a comment saying what it does *and why*; every non-obvious line gets an inline comment. Do not thin out existing comments.
- **No new runtime dependency** beyond `lucide-react`. Dev dependencies added: `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- **Versions in the repo today (do not bump):** Next `16.2.9`, React `19.2.4`, Vitest `^4.1.9`, Node `>=20.9.0`.
- **Mobile first (iPhone):** tap targets ≥ 44px, `env(safe-area-inset-*)` respected, bottom sheets get ~30px extra bottom padding.
- **Colours are light-only.** The design has no dark mode — the create-next-app `prefers-color-scheme: dark` block gets deleted, not extended.
- **Every component test asserts behaviour, not class names.** CSS Modules class names are compiler-generated; assert roles, accessible names, text and attributes.

### Binding colour palette (from the handoff)

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#fcfcfb` | App background |
| `--color-bg-frozen` | `#f7f7f5` | Completed list |
| `--color-bg-sidebar` | `#f3f4f2` | Drawer / desktop sidebar |
| `--color-surface` | `#ffffff` | Cards, sheets, inputs |
| `--color-text-primary` | `#232322` | Headings, entry names |
| `--color-text-secondary` | `#5a5a55` | Body copy, labels |
| `--color-text-tertiary` | `#77776f` | Inactive chips, empty-state copy |
| `--color-text-muted` | `#a3a39b` | Metadata, section labels |
| `--color-text-placeholder` | `#c2c2ba` | Input placeholders |
| `--color-text-checked` | `#b3b3ab` | Checked entry name |
| `--color-accent` | `#3e63c4` | Buttons, active chips, links |
| `--color-accent-dark` | `#2f4a94` | Text on accent tint |
| `--color-accent-tint` | `#eef2fc` | Info banner, badges, favourite chips |
| `--color-danger` | `#bf4a41` | Destructive actions, errors |
| `--color-danger-tint` | `#fdf3f2` | Dangerous option surface |
| `--color-danger-dark` | `#8a4038` | Text on danger tint |
| `--color-success` | `#6d8a5e` | Completed marker |
| `--color-success-tint` | `#eef1ea` | Completed banner surface |
| `--color-success-text` | `#4c5c43` | Text on success tint |
| `--color-hairline` | `#ececea` | Header/section lines, card borders, input borders |
| `--color-hairline-weak` | `#f1f1ee` | Row separators, search field bg, neutral chips |
| `--color-border-strong` | `#dcdcd7` | Secondary button border, toggle off |
| `--color-border-active-panel` | `#dfe4f2` | Open catalog edit panel |
| `--color-control-border` | `#c6c6bf` | Unchecked checkbox ring, chevrons, dashed inline-edit underline |
| `--color-checked-archived` | `#b8bdb2` | Checked circle in archive |
| `--color-grabber` | `#e3e3df` | Sheet grabber |
| `--color-overlay` | `rgba(35,35,34,.3)` | Sheet dim |
| `--color-overlay-strong` | `rgba(35,35,34,.35)` | Drawer dim |

### Binding radii, shadows, motion

- Radii: cards/rows `12px` · hero card & panels `14px` · inputs/buttons `10px` · small inputs `8px` · pills `99px` · sheets `20px 20px 0 0`
- Shadows: card `0 1px 2px rgba(35,35,34,.06)` · dropdown `0 8px 24px rgba(35,35,34,.14)` · sheet `0 -8px 32px rgba(35,35,34,.18)` · hero `0 4px 14px rgba(62,99,196,.22)` · active panel `0 2px 8px rgba(62,99,196,.08)`
- Motion: drawer `translateX(-100%) → 0`, 240ms ease-out · sheet `translateY(46px) + fade → 0`, 280ms `cubic-bezier(.2,.9,.3,1)` · fade 200ms · banner `translateY(-8px) + fade`, 280ms ease-out · check pop `scale .55 → 1.18 → 1`, 200ms ease-out · remote flash `background #eef2fc → transparent`, 1.4s ease-out · swipe snap-back `transform .18s ease-out`

---

## File Structure

**New — test infrastructure**
- `src/test/setup.ts` *(modified)* — adds Testing Library cleanup + jest-dom matchers, guarded so node-environment DB tests are unaffected.

**New — global styling**
- `src/app/globals.css` *(rewritten)* — token block, reset, base typography, keyframes, reduced-motion.
- `src/app/layout.tsx` *(modified)* — Figtree, `lang="de"`, real metadata.
- `src/app/page.module.css` *(deleted)* — orphaned create-next-app leftover; nothing imports it.
- `src/test/design-tokens.test.ts` — pins the token contract against the handoff.

**New — primitives (`src/components/ui/`)**

| File | Responsibility |
|---|---|
| `Icon.tsx` | Wraps a Lucide glyph at the project's stroke width, marked `aria-hidden`. |
| `Button.tsx` + `.module.css` | `primary` / `secondary` / `text` / `danger` actions. |
| `TextField.tsx` + `.module.css` | Labelled input with error wiring (`"use client"`, uses `useId`). |
| `FieldError.tsx` + `.module.css` | The inline error message under a field. |
| `SectionLabel.tsx` + `.module.css` | `11px/700` uppercase letterspaced section heading. |
| `Badge.tsx` + `.module.css` | OWNER / ADMIN pill. |
| `Avatar.tsx` + `.module.css` | Rounded-square initial, deterministic colour. |
| `avatarColor.ts` | Pure colour-pick function (unit-testable without a DOM). |
| `Card.tsx` + `.module.css` | White surface with hairline border and card shadow. |
| `RowLink.tsx` + `.module.css` | Tappable card row: leading slot, title, meta, chevron. |
| `Chip.tsx` + `.module.css` | Pill chip: tones, selected, struck, optional remove button. |
| `ChipTabs.tsx` + `.module.css` | The underlined filter tab row (`role="tablist"`). |
| `EmptyState.tsx` + `.module.css` | Glyph + title + one sentence + action slot. |
| `Sheet.tsx` + `.module.css` | Bottom sheet: dim, panel, grabber, Escape, scroll lock (`"use client"`). |
| `ConfirmSheet.tsx` + `.module.css` | Destructive confirmation built on `Sheet`. |
| `InlineEdit.tsx` + `.module.css` | Dashed-underline text → input, save on Enter/blur, cancel on Escape (`"use client"`). |
| `Banner.tsx` + `.module.css` | `info` / `success` banner with action slot. |

Each primitive gets a sibling `*.test.tsx`.

**New — verification surface**
- `src/app/dev/ui/page.tsx` — dev-only gallery route (404 in production).
- `src/app/dev/ui/Gallery.tsx` — the client component that renders every primitive.

---

### Task 1: Component test environment

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `src/test/setup.ts`
- Test: `src/components/ui/smoke.test.tsx` (temporary — deleted in Step 6)

**Interfaces:**
- Consumes: nothing.
- Produces: the convention every later task depends on — a component test file starts with the docblock `// @vitest-environment jsdom`, imports `render`/`screen` from `@testing-library/react`, and gets automatic cleanup plus `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveAttribute`, `toBeDisabled`, `toHaveValue`, `toHaveFocus`).

**Background you need:** `vitest.config.ts` sets `environment: "node"` because every existing test talks to the Neon test database. Component tests need a DOM. Vitest 4 removed `environmentMatchGlobs`, so the supported per-file switch is the docblock comment. `setupFiles` runs once per test file *inside* that file's environment, which is why the guard below works.

- [ ] **Step 1: Install the DOM testing dependencies**

```bash
npm install --save-dev jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Extend the shared test setup**

Replace the whole contents of `src/test/setup.ts` with:

```ts
import { config } from "dotenv";
import { afterEach } from "vitest";

// Load .env.test before Prisma opens any connection so tests never point at the
// developer database by accident. override: true makes the test DB authoritative.
config({ path: ".env.test", override: true });

// Component tests opt into a DOM by putting `// @vitest-environment jsdom` at the
// top of the file. setupFiles runs once per test file INSIDE that file's
// environment, so this guard is how one shared setup serves both worlds: the
// node-environment DB tests have no `document` and skip everything below.
if (typeof document !== "undefined") {
  // Testing Library only registers its own afterEach cleanup when Vitest's
  // globals are enabled. This project imports test helpers explicitly instead,
  // so we wire the cleanup ourselves — without it, renders from earlier tests
  // stay in document.body and getByRole finds duplicates.
  const { cleanup } = await import("@testing-library/react");
  // jest-dom adds the DOM matchers (toBeInTheDocument, toHaveAttribute, …) and
  // must be imported before any assertion runs, which is exactly what a setup
  // file guarantees.
  await import("@testing-library/jest-dom/vitest");
  afterEach(() => cleanup());
}
```

- [ ] **Step 3: Write the failing smoke test**

Create `src/components/ui/smoke.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// Proves three things at once before any real component exists: JSX compiles,
// jsdom is active for this file, and the jest-dom matchers were registered.
function Probe() {
  return <button type="button">Hallo</button>;
}

describe("component test environment", () => {
  it("renders a component into a DOM and offers jest-dom matchers", () => {
    render(<Probe />);
    expect(screen.getByRole("button", { name: "Hallo" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/components/ui/smoke.test.tsx`
Expected: PASS (1 test). If it fails with "document is not defined", the docblock is missing or misspelled. If it fails on `toBeInTheDocument`, the guard in `setup.ts` did not run.

- [ ] **Step 5: Verify the existing suite is unaffected**

Run: `npm test`
Expected: all previously passing files still pass (203 tests before this slice) plus the 1 smoke test.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm src/components/ui/smoke.test.tsx
git add package.json package-lock.json src/test/setup.ts
git commit -m "test: jsdom + Testing Library setup for component tests"
```

---

### Task 2: Design tokens, Figtree and the global stylesheet

**Files:**
- Modify: `src/app/globals.css` (full rewrite)
- Modify: `src/app/layout.tsx`
- Delete: `src/app/page.module.css`
- Test: `src/test/design-tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS custom properties every `*.module.css` in this slice references, the `--font-figtree` variable used by `body`, and the keyframes `sl-fade`, `sl-sheet`, `sl-drawer`, `sl-banner`, `sl-pop`, `sl-flash`.

**Two constraints worth knowing:** (1) CSS custom properties **cannot** be used inside `@media` queries — the desktop breakpoint stays a literal `900px` in every media query, with the token table documenting it. (2) `src/app/page.module.css` is a create-next-app leftover; `grep -rn "page.module.css" src/` returns nothing, so deleting it is safe.

- [ ] **Step 1: Write the failing token contract test**

Create `src/test/design-tokens.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/test/design-tokens.test.ts`
Expected: FAIL — the current `globals.css` still holds the create-next-app defaults and a `prefers-color-scheme: dark` block.

- [ ] **Step 3: Rewrite `src/app/globals.css`**

Replace the whole file with:

```css
/*
 * Design tokens + global base styles.
 *
 * Source of truth: docs/design/2026-08-01-ui-handoff/ — the inline styles inside
 * the two .dc.html prototypes are binding for every value below. Changing a
 * value here means changing the design; src/test/design-tokens.test.ts pins the
 * palette so that stays a conscious act.
 */
:root {
  /* --- Colours -------------------------------------------------------- */
  --color-bg: #fcfcfb;
  --color-bg-frozen: #f7f7f5;
  --color-bg-sidebar: #f3f4f2;
  --color-surface: #ffffff;

  --color-text-primary: #232322;
  --color-text-secondary: #5a5a55;
  --color-text-tertiary: #77776f;
  --color-text-muted: #a3a39b;
  --color-text-placeholder: #c2c2ba;
  --color-text-checked: #b3b3ab;

  --color-accent: #3e63c4;
  --color-accent-dark: #2f4a94;
  --color-accent-tint: #eef2fc;

  --color-danger: #bf4a41;
  --color-danger-tint: #fdf3f2;
  --color-danger-dark: #8a4038;

  --color-success: #6d8a5e;
  --color-success-tint: #eef1ea;
  --color-success-text: #4c5c43;

  --color-hairline: #ececea;
  --color-hairline-weak: #f1f1ee;
  --color-border-strong: #dcdcd7;
  --color-border-active-panel: #dfe4f2;
  --color-control-border: #c6c6bf;
  --color-checked-archived: #b8bdb2;
  --color-grabber: #e3e3df;

  /* Overlays are rgba, not hex, because they sit on top of content. */
  --color-overlay: rgba(35, 35, 34, 0.3);
  --color-overlay-strong: rgba(35, 35, 34, 0.35);

  /* --- Radii ---------------------------------------------------------- */
  --radius-card: 12px;
  --radius-panel: 14px;
  --radius-control: 10px;
  --radius-control-sm: 8px;
  --radius-pill: 99px;
  --radius-sheet: 20px;

  /* --- Shadows -------------------------------------------------------- */
  --shadow-card: 0 1px 2px rgba(35, 35, 34, 0.06);
  --shadow-dropdown: 0 8px 24px rgba(35, 35, 34, 0.14);
  --shadow-sheet: 0 -8px 32px rgba(35, 35, 34, 0.18);
  --shadow-hero: 0 4px 14px rgba(62, 99, 196, 0.22);
  --shadow-panel-active: 0 2px 8px rgba(62, 99, 196, 0.08);

  /* --- Motion --------------------------------------------------------- */
  --motion-fade: 200ms;
  --motion-sheet: 280ms;
  --motion-drawer: 240ms;
  --ease-sheet: cubic-bezier(0.2, 0.9, 0.3, 1);

  /* --- Layout --------------------------------------------------------- */
  --screen-padding: 16px;
  --screen-padding-desktop: 36px;
  --sidebar-width: 250px;
  --content-max-width: 620px;
  /* Desktop breakpoint is 900px. It is NOT a custom property because CSS
     custom properties cannot be used inside @media queries — every media query
     in this codebase writes the literal `900px` and refers back to this note. */

  /* --- Safe areas (iPhone home indicator / notch) --------------------- */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);

  /* The design is light only — this stops iOS from auto-darkening form controls. */
  color-scheme: light;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  max-width: 100vw;
  /* Horizontal scroll would otherwise leak from the swipeable list rows. */
  overflow-x: hidden;
}

html {
  height: 100%;
}

body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text-primary);
  /* --font-figtree is injected by next/font in layout.tsx. */
  font-family: var(--font-figtree), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: inherit;
  text-decoration: none;
}

/* Form controls do not inherit the font by default in any browser. */
input,
button,
textarea,
select {
  font: inherit;
  color: inherit;
}

input::placeholder {
  color: var(--color-text-placeholder);
}

/* --- Keyframes -------------------------------------------------------- *
 * Values taken verbatim from the prototype's <style> block so the motion
 * matches the design reference exactly.
 * --------------------------------------------------------------------- */
@keyframes sl-fade {
  from {
    opacity: 0;
  }
}

@keyframes sl-sheet {
  from {
    transform: translateY(46px);
    opacity: 0;
  }
}

@keyframes sl-drawer {
  from {
    transform: translateX(-100%);
  }
}

@keyframes sl-banner {
  from {
    transform: translateY(-8px);
    opacity: 0;
  }
}

@keyframes sl-pop {
  0% {
    transform: scale(0.55);
  }
  60% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes sl-flash {
  0% {
    background: var(--color-accent-tint);
  }
  100% {
    background: transparent;
  }
}

/* Respect the OS "reduce motion" setting: the design's animations are all
   decorative, so switching them off costs nothing and avoids nausea triggers. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Run the token test to verify it passes**

Run: `npx vitest run src/test/design-tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Switch the root layout to Figtree**

Replace the whole contents of `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// next/font self-hosts the font at build time (no request to Google at runtime)
// and exposes it as a CSS variable, which globals.css consumes in `body`.
// Weights 400–800 are exactly the range the design uses.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Smart Lists",
  description: "Gemeinsame Listen für Haushalt, Einkauf und Reisen.",
};

// viewportFit: "cover" is what makes env(safe-area-inset-*) report real values
// on an iPhone — without it the safe-area tokens in globals.css are always 0.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fcfcfb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // lang="de" — the product's user-facing language, which also drives hyphenation
  // and screen-reader pronunciation.
  return (
    <html lang="de" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Delete the orphaned stylesheet**

```bash
grep -rn "page.module.css" src/   # expected: no output
rm src/app/page.module.css
```

- [ ] **Step 7: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds. The known pre-existing warnings (multiple lockfiles / Turbopack root, `middleware` deprecation) may still appear; nothing new.

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/test/design-tokens.test.ts
git add -A src/app/page.module.css
git commit -m "feat(ui): design tokens, Figtree and the light-only global stylesheet"
```

---

### Task 3: Icon wrapper

**Files:**
- Create: `src/components/ui/Icon.tsx`
- Test: `src/components/ui/Icon.test.tsx`

**Interfaces:**
- Consumes: `--color-*` tokens (via the caller's `className`).
- Produces: `Icon({ icon, size?, className? })` where `icon` is a `LucideIcon` (e.g. `ChevronRight` imported from `lucide-react`). Default `size` = 17, stroke width always 1.75, always `aria-hidden`. Later tasks import Lucide glyphs and pass them through this wrapper — never render a Lucide component directly.

- [ ] **Step 1: Install the icon set**

```bash
npm install lucide-react
```

- [ ] **Step 2: Write the failing test**

Create `src/components/ui/Icon.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ChevronRight } from "lucide-react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders the glyph with the project's stroke width and size", () => {
    const { container } = render(<Icon icon={ChevronRight} />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("stroke-width", "1.75");
    expect(svg).toHaveAttribute("width", "17");
  });

  it("is hidden from assistive technology because icons are decorative here", () => {
    const { container } = render(<Icon icon={ChevronRight} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts a size override for the larger glyphs", () => {
    const { container } = render(<Icon icon={ChevronRight} size={24} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "24");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/components/ui/Icon.test.tsx`
Expected: FAIL — `Cannot find module './Icon'`.

- [ ] **Step 4: Implement `src/components/ui/Icon.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";

type IconProps = {
  /** A Lucide glyph component, e.g. `ChevronRight` from "lucide-react". */
  icon: LucideIcon;
  /** Pixel size. 17 matches the placeholder squares in the design handoff. */
  size?: number;
  /** Colour is inherited from `currentColor`; pass a CSS Module class to change it. */
  className?: string;
};

/**
 * The single place icons are rendered.
 *
 * Why it exists: the design deliberately ships placeholder squares and only says
 * "pick one set, stroke ~1.75". Funnelling every glyph through this wrapper is
 * what makes that consistent — no call site can accidentally use a different
 * stroke width, and swapping the icon set later is a one-file change.
 *
 * Icons in this product are always decorative: every control they sit in also
 * carries a text label or an aria-label, so the glyph is hidden from screen
 * readers to avoid a duplicate announcement.
 */
export function Icon({ icon: Glyph, size = 17, className }: IconProps) {
  return <Glyph size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/Icon.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/ui/Icon.tsx src/components/ui/Icon.test.tsx
git commit -m "feat(ui): Icon wrapper over lucide-react at stroke 1.75"
```

---

### Task 4: Button

**Files:**
- Create: `src/components/ui/Button.tsx`, `src/components/ui/Button.module.css`
- Test: `src/components/ui/Button.test.tsx`

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces: `Button(props)` where props are all native `<button>` attributes plus `variant?: "primary" | "secondary" | "text" | "danger"` (default `"primary"`) and `fullWidth?: boolean`. Default `type` is `"button"`.

**Design values (handoff):** primary `13.5px/700`, white on `#3e63c4`, radius 10, padding `11px 14px`. Secondary `13.5px/700` `#5a5a55` on white, `1.5px solid #dcdcd7`, radius 10, padding `10px 14px`. Text trigger `13px/600` `#5a5a55`. Destructive trigger `13px/600` `#bf4a41` — never a filled button inside a list row. Full-width sheet button (`Fertig`, `Liste mit N Einträgen anlegen`): `15px/700`, padding `13px 0`, radius `11–12px`.

**No `"use client"`:** the component has no hooks. That keeps it usable straight from a Server Component (Slice 14's forms submit via server actions); when a client component imports it, Next pulls it into the client bundle automatically.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its German label as the accessible name", () => {
    render(<Button>Anlegen</Button>);
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeInTheDocument();
  });

  it("defaults to type=button so it never submits a surrounding form by accident", () => {
    render(<Button>Anlegen</Button>);
    expect(screen.getByRole("button", { name: "Anlegen" })).toHaveAttribute("type", "button");
  });

  it("still accepts type=submit for server-action forms", () => {
    render(<Button type="submit">Einladen</Button>);
    expect(screen.getByRole("button", { name: "Einladen" })).toHaveAttribute("type", "submit");
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Fertig</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Fertig
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(screen.getByRole("button", { name: "Fertig" })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps a caller-supplied className alongside its own", () => {
    render(<Button className="extern">Fertig</Button>);
    expect(screen.getByRole("button", { name: "Fertig" }).className).toContain("extern");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/Button.test.tsx`
Expected: FAIL — `Cannot find module './Button'`.

- [ ] **Step 3: Implement `src/components/ui/Button.module.css`**

```css
/* Shared shell. Variants below only change surface, colour and density. */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  background: none;
  border-radius: var(--radius-control);
  font-size: 13.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.button:disabled {
  opacity: 0.5;
  cursor: default;
}

.primary {
  background: var(--color-accent);
  color: var(--color-surface);
  padding: 11px 14px;
  /* ≥44px is the iOS tap-target floor from the handoff's PWA section. */
  min-height: 44px;
}

.secondary {
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border: 1.5px solid var(--color-border-strong);
  padding: 10px 14px;
  min-height: 44px;
}

/*
 * `text` and `danger` are inline triggers that sit INSIDE dense rows (e.g. the
 * admin table's "Zugang entziehen"). They deliberately have no min-height: the
 * handoff makes the row height guarantee the 44px tap target, and forcing it
 * here would blow those rows up.
 */
.text {
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 2px 6px;
}

.danger {
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 600;
  padding: 2px 6px;
}

/* The full-width call to action at the bottom of a sheet. */
.fullWidth {
  width: 100%;
  font-size: 15px;
  padding: 13px 0;
  border-radius: 12px;
}
```

- [ ] **Step 4: Implement `src/components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "text" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Stretches the button and enlarges it — the call to action at a sheet's foot. */
  fullWidth?: boolean;
};

/**
 * The project's only button.
 *
 * Why it exists: the design uses four visually distinct action weights and every
 * screen mixes them. Centralising them means a screen picks a *weight*, never a
 * colour — which is what keeps the destructive red reserved for destructive acts.
 *
 * Deliberately NOT a client component: it holds no state, so a Server Component
 * can render it inside a server-action <form>. `type` defaults to "button"
 * because HTML's default is "submit", which silently submits surrounding forms.
 */
export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  // filter(Boolean) drops the empty slots so the class attribute stays clean.
  const classes = [styles.button, styles[variant], fullWidth ? styles.fullWidth : "", className]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...rest} />;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/Button.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/Button.module.css src/components/ui/Button.test.tsx
git commit -m "feat(ui): Button primitive with four action weights"
```

---

### Task 5: TextField and FieldError

**Files:**
- Create: `src/components/ui/FieldError.tsx`, `src/components/ui/FieldError.module.css`
- Create: `src/components/ui/TextField.tsx`, `src/components/ui/TextField.module.css`
- Test: `src/components/ui/TextField.test.tsx`

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces:
  - `FieldError({ id?, children })` — renders `<p role="alert">` in `--color-danger`.
  - `TextField(props)` — all native `<input>` attributes except `size`, plus `label?: string`, `error?: string | null`, `fieldSize?: "md" | "sm"` (default `"md"`). Wires `aria-invalid` and `aria-describedby` to the error automatically.

**Design values:** medium input `15px`, padding `11px 14px`, radius 10, border `1.5px #ececea`, focus border `#3e63c4`. Small input (`MENGE`/`EINHEIT`/`KATEGORIE` in a sheet, catalog edit panel) `14.5px`, padding `9px 11px`, radius 8. Caption above a field: `11px/700`, `letter-spacing:.07em`, UPPERCASE, `#a3a39b`, `margin-top:4px` gap. Error: `12px`, `#bf4a41`, `margin-top:4px`, and the field border turns `#bf4a41`.

**Why this one *is* a client component:** it calls `useId()` to link the input to its label and error message. Hooks are not allowed in Server Components, and hand-passing an id at every call site is the kind of thing people forget — which silently breaks screen-reader error announcements. A Server Component can still render a client component, so Slice 14's server-action forms are unaffected.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/TextField.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("links the label to the input so clicking the label focuses it", async () => {
    render(<TextField label="Projektname" />);

    await userEvent.click(screen.getByText("Projektname"));

    expect(screen.getByLabelText("Projektname")).toHaveFocus();
  });

  it("renders without a label when none is given", () => {
    render(<TextField placeholder="Artikel suchen…" />);
    expect(screen.getByPlaceholderText("Artikel suchen…")).toBeInTheDocument();
  });

  it("accepts typed input", async () => {
    render(<TextField label="Projektname" />);

    await userEvent.type(screen.getByLabelText("Projektname"), "Haushalt");

    expect(screen.getByLabelText("Projektname")).toHaveValue("Haushalt");
  });

  it("shows the German error message and marks the input invalid", () => {
    render(<TextField label="Name" error="Artikel existiert bereits" />);

    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Artikel existiert bereits");
  });

  it("points aria-describedby at the error so screen readers announce it", () => {
    render(<TextField label="Name" error="Artikel existiert bereits" />);

    const input = screen.getByLabelText("Name");
    const describedBy = input.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "Artikel existiert bereits",
    );
  });

  it("has no error element and no aria-invalid when valid", () => {
    render(<TextField label="Name" />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });

  it("forwards a name attribute so server-action forms can read it", () => {
    render(<TextField label="E-Mail-Adresse" name="email" />);
    expect(screen.getByLabelText("E-Mail-Adresse")).toHaveAttribute("name", "email");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/TextField.test.tsx`
Expected: FAIL — `Cannot find module './TextField'`.

- [ ] **Step 3: Implement `src/components/ui/FieldError.module.css`**

```css
.error {
  font-size: 12px;
  color: var(--color-danger);
  margin-top: 4px;
  line-height: 1.4;
}
```

- [ ] **Step 4: Implement `src/components/ui/FieldError.tsx`**

```tsx
import type { ReactNode } from "react";
import styles from "./FieldError.module.css";

type FieldErrorProps = {
  /** Set by TextField so the input's aria-describedby can point here. */
  id?: string;
  children: ReactNode;
};

/**
 * The inline error message under a field.
 *
 * Why it exists: the handoff defines exactly one error presentation ("Rahmen +
 * Meldung in #bf4a41 direkt unter dem Feld, kurzer deutscher Satz"). Giving it
 * its own component means every screen inherits the same shape — including
 * role="alert", which makes a screen reader announce the message the moment it
 * appears instead of leaving the user stuck on a silently rejected form.
 */
export function FieldError({ id, children }: FieldErrorProps) {
  return (
    <p id={id} role="alert" className={styles.error}>
      {children}
    </p>
  );
}
```

- [ ] **Step 5: Implement `src/components/ui/TextField.module.css`**

```css
.wrapper {
  display: flex;
  flex-direction: column;
  /* Fields are almost always laid out in a flex row alongside a button. */
  flex: 1;
  min-width: 0;
}

.label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}

.input {
  width: 100%;
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1.5px solid var(--color-hairline);
  /* outline: none is safe here only because :focus paints an accent border. */
  outline: none;
}

.md {
  font-size: 15px;
  padding: 11px 14px;
  border-radius: var(--radius-control);
  min-height: 44px;
}

.sm {
  font-size: 14.5px;
  padding: 9px 11px;
  border-radius: var(--radius-control-sm);
}

.input:focus {
  border-color: var(--color-accent);
}

/* An invalid field keeps its red border even while focused — the error is the
   more important signal. */
.invalid,
.invalid:focus {
  border-color: var(--color-danger);
}
```

- [ ] **Step 6: Implement `src/components/ui/TextField.tsx`**

```tsx
"use client";

import { useId, type InputHTMLAttributes } from "react";
import { FieldError } from "./FieldError";
import styles from "./TextField.module.css";

// Omit<"size"> because the native `size` attribute (character width) would clash
// with our visual size prop; ours is called fieldSize to keep both available.
type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** The small uppercase caption above the field, in German. */
  label?: string;
  /** A German error message. Its presence also turns the border red. */
  error?: string | null;
  fieldSize?: "md" | "sm";
};

/**
 * The project's only text input.
 *
 * Why it exists: label wiring and error wiring are the two things hand-rolled
 * forms always get wrong. Doing them once here means every screen gets a field
 * whose label is clickable and whose error is announced, for free.
 *
 * "use client" is required because of useId(). That is a deliberate trade: the
 * alternative — demanding an explicit `id` at every call site — silently
 * degrades to an unlabelled field the first time someone forgets. Server
 * Components can still render this, so server-action forms are unaffected.
 */
export function TextField({
  label,
  error,
  fieldSize = "md",
  className,
  id,
  ...rest
}: TextFieldProps) {
  // useId gives a stable id across server render and hydration; an explicit
  // `id` prop still wins, so a caller can target the field from elsewhere.
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  const inputClasses = [
    styles.input,
    styles[fieldSize],
    error ? styles.invalid : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.wrapper}>
      {label ? (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={inputClasses}
        // `undefined` (not false/"") so the attributes vanish entirely when the
        // field is valid — a stray aria-invalid="false" confuses some readers.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/TextField.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/TextField.tsx src/components/ui/TextField.module.css src/components/ui/TextField.test.tsx src/components/ui/FieldError.tsx src/components/ui/FieldError.module.css
git commit -m "feat(ui): TextField with label/error wiring and FieldError"
```

---

### Task 6: SectionLabel, Badge and Avatar

**Files:**
- Create: `src/components/ui/SectionLabel.tsx`, `src/components/ui/SectionLabel.module.css`
- Create: `src/components/ui/Badge.tsx`, `src/components/ui/Badge.module.css`
- Create: `src/components/ui/avatarColor.ts`
- Create: `src/components/ui/Avatar.tsx`, `src/components/ui/Avatar.module.css`
- Test: `src/components/ui/SectionLabel.test.tsx`, `src/components/ui/Badge.test.tsx`, `src/components/ui/avatarColor.test.ts`, `src/components/ui/Avatar.test.tsx`

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces:
  - `SectionLabel({ children })` → `<h2>` at `11px/700`, `.09em`, uppercase, `--color-text-muted`.
  - `Badge({ children })` → pill at `10.5px/700`, `--color-accent-dark` on `--color-accent-tint` (used for `OWNER` and `ADMIN`).
  - `avatarColor(name: string): string` → one of the two accent shades from the design, chosen deterministically.
  - `Avatar({ name, size? })` → rounded square with the first letter; `size` default `30`.

**Design values:** section label `font-size:11px;font-weight:700;letter-spacing:.09em;color:#a3a39b` uppercase. Badge `font-size:10.5px;font-weight:700;color:#2f4a94;background:#eef2fc;border-radius:99px;padding:3px 8px`. Avatar in the Home project row `28px`/radius `8px`/`13px/800`; in the Projekte row `30px`/radius `9px`/`14px/800`; white letter. The design shows two avatar colours (`#3e63c4`, `#7a8fc9`) — those two, and only those two, are the palette.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/SectionLabel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionLabel } from "./SectionLabel";

describe("SectionLabel", () => {
  it("renders as a heading so the screen has a real outline", () => {
    render(<SectionLabel>Projekte</SectionLabel>);
    expect(screen.getByRole("heading", { name: "Projekte" })).toBeInTheDocument();
  });
});
```

Create `src/components/ui/Badge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its text", () => {
    render(<Badge>OWNER</Badge>);
    expect(screen.getByText("OWNER")).toBeInTheDocument();
  });
});
```

Create `src/components/ui/avatarColor.test.ts` (no docblock — this is a pure function, node environment is fine):

```ts
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
```

Create `src/components/ui/Avatar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("shows the first letter of the name, uppercased", () => {
    render(<Avatar name="haushalt" />);
    expect(screen.getByText("H")).toBeInTheDocument();
  });

  it("is hidden from assistive technology because the name is always next to it", () => {
    const { container } = render(<Avatar name="Haushalt" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders an empty circle instead of crashing on an empty name", () => {
    const { container } = render(<Avatar name="" />);
    expect(container.firstElementChild).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/ui/SectionLabel.test.tsx src/components/ui/Badge.test.tsx src/components/ui/avatarColor.test.ts src/components/ui/Avatar.test.tsx`
Expected: FAIL — all four modules missing.

- [ ] **Step 3: Implement `src/components/ui/SectionLabel.module.css`**

```css
.label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
```

- [ ] **Step 4: Implement `src/components/ui/SectionLabel.tsx`**

```tsx
import type { ReactNode } from "react";
import styles from "./SectionLabel.module.css";

/**
 * The small uppercase caption that opens a block ("WEITERMACHEN", "PROJEKTE",
 * "ZUGANG", "AKTIVE LISTEN").
 *
 * Why an <h2> and not a <div>: the design uses these as the only visible
 * structure on several screens, so they are the screen's real headings. Marking
 * them up as headings gives screen-reader users the same outline sighted users
 * get. `text-transform` (not uppercase literals) keeps the German text readable
 * to assistive tech.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className={styles.label}>{children}</h2>;
}
```

- [ ] **Step 5: Implement `src/components/ui/Badge.module.css`**

```css
.badge {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--color-accent-dark);
  background: var(--color-accent-tint);
  border-radius: var(--radius-pill);
  padding: 3px 8px;
  white-space: nowrap;
}
```

- [ ] **Step 6: Implement `src/components/ui/Badge.tsx`**

```tsx
import type { ReactNode } from "react";
import styles from "./Badge.module.css";

/**
 * A small status pill. The design uses exactly one look for it — accent text on
 * accent tint — for both "OWNER" (project rows, member rows) and "ADMIN" (the
 * Verwaltung header), so the component takes no tone prop on purpose: a second
 * badge colour would be a design decision, not a code decision.
 */
export function Badge({ children }: { children: ReactNode }) {
  return <span className={styles.badge}>{children}</span>;
}
```

- [ ] **Step 7: Implement `src/components/ui/avatarColor.ts`**

```ts
/**
 * The two avatar colours the design uses (accent, and a lighter accent shade).
 * Kept to exactly what the handoff shows — inventing a third would be inventing
 * design.
 */
export const AVATAR_COLORS = ["#3e63c4", "#7a8fc9"] as const;

/**
 * Picks a project's avatar colour from its name.
 *
 * Why derived instead of stored: projects have no colour column, and the design
 * shows different projects in different shades. Deriving it from the name keeps
 * the colour stable for a given project without a schema change — which matters
 * because the avatar shows up on Home, Projekte, the drawer and the switcher,
 * and a project that changed colour between screens would read as a bug.
 *
 * The hash is a small FNV-style accumulator: cheap, dependency-free and
 * deterministic. It is not a security primitive and does not need to be.
 */
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    // charCodeAt over the raw string handles umlauts fine — we only need a
    // stable number, not a linguistically meaningful one.
    hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
```

- [ ] **Step 8: Implement `src/components/ui/Avatar.module.css`**

```css
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--color-surface);
  font-weight: 800;
  /* Size, radius, font-size and background come from inline custom properties
     set in Avatar.tsx, because they scale together and depend on props. */
  width: var(--avatar-size);
  height: var(--avatar-size);
  border-radius: var(--avatar-radius);
  font-size: var(--avatar-font-size);
  background: var(--avatar-bg);
}
```

- [ ] **Step 9: Implement `src/components/ui/Avatar.tsx`**

```tsx
import type { CSSProperties } from "react";
import { avatarColor } from "./avatarColor";
import styles from "./Avatar.module.css";

type AvatarProps = {
  /** Project or person name; the first letter becomes the glyph. */
  name: string;
  /** Edge length in px. 28 in the Home rows, 30 in the Projekte/Mitglieder rows. */
  size?: number;
};

/**
 * The rounded-square initial next to a project or member name.
 *
 * Why aria-hidden: the avatar never carries information the adjacent text does
 * not already state, so announcing "H" before "Haushalt" is pure noise.
 *
 * Sizing goes through inline CSS custom properties rather than a class per size.
 * The design uses 28px and 30px today and the drawer will want another; a
 * variable keeps that a number at the call site instead of a new CSS class each
 * time. The radius and font size are derived so the proportions stay right.
 */
export function Avatar({ name, size = 30 }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase();

  // Ratios read off the handoff: 30px box → 9px radius → 14px letter.
  const style = {
    "--avatar-size": `${size}px`,
    "--avatar-radius": `${Math.round(size * 0.3)}px`,
    "--avatar-font-size": `${Math.round(size * 0.47)}px`,
    "--avatar-bg": avatarColor(name),
  } as CSSProperties;

  return (
    <span className={styles.avatar} style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui/SectionLabel.test.tsx src/components/ui/Badge.test.tsx src/components/ui/avatarColor.test.ts src/components/ui/Avatar.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 11: Commit**

```bash
git add src/components/ui/SectionLabel.* src/components/ui/Badge.* src/components/ui/Avatar.* src/components/ui/avatarColor.*
git commit -m "feat(ui): SectionLabel, Badge and Avatar display atoms"
```

---

### Task 7: Card and RowLink

**Files:**
- Create: `src/components/ui/Card.tsx`, `src/components/ui/Card.module.css`
- Create: `src/components/ui/RowLink.tsx`, `src/components/ui/RowLink.module.css`
- Test: `src/components/ui/Card.test.tsx`, `src/components/ui/RowLink.test.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 3) and the tokens.
- Produces:
  - `Card({ children, className?, elevated? })` — white surface, `1px solid --color-hairline`, radius 12 (or 14 when `elevated`), `--shadow-card`. No padding of its own; the caller supplies it, because the design pads a members card and a catalog card differently.
  - `RowLink({ href, title, meta?, leading?, trailing? })` — a whole-card link row with a trailing chevron.

**Design values:** row card `background:#fff;border:1px solid #ececea;border-radius:12px;display:flex;align-items:center;gap:11px;padding:13px 14px;box-shadow:0 1px 2px rgba(35,35,34,.05)`; title `15px/700 #232322`; meta `12px #a3a39b`; chevron `›` in `#c6c6bf`. Home's "Weitermachen" hero card uses radius `14px` and `padding:14px` — that is the `elevated` variant.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/Card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders its children", () => {
    render(
      <Card>
        <p>Inhalt</p>
      </Card>,
    );
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
  });

  it("keeps a caller-supplied className so the caller controls padding", () => {
    const { container } = render(<Card className="extern">x</Card>);
    expect(container.firstElementChild?.className).toContain("extern");
  });
});
```

Create `src/components/ui/RowLink.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RowLink } from "./RowLink";

describe("RowLink", () => {
  it("is a link to the given target whose accessible name is the title", () => {
    render(<RowLink href="/projects/abc" title="Haushalt" />);

    const link = screen.getByRole("link", { name: /Haushalt/ });
    expect(link).toHaveAttribute("href", "/projects/abc");
  });

  it("shows the meta line when given", () => {
    render(<RowLink href="/projects/abc" title="Haushalt" meta="3 Listen · 4 Mitglieder" />);
    expect(screen.getByText("3 Listen · 4 Mitglieder")).toBeInTheDocument();
  });

  it("renders the leading and trailing slots", () => {
    render(
      <RowLink
        href="/projects/abc"
        title="Haushalt"
        leading={<span data-testid="leading" />}
        trailing={<span data-testid="trailing" />}
      />,
    );

    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByTestId("trailing")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/ui/Card.test.tsx src/components/ui/RowLink.test.tsx`
Expected: FAIL — both modules missing.

- [ ] **Step 3: Implement `src/components/ui/Card.module.css`**

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}

/* The Home "Weitermachen" hero and the drawer panels sit one step higher. */
.elevated {
  border-radius: var(--radius-panel);
}
```

- [ ] **Step 4: Implement `src/components/ui/Card.tsx`**

```tsx
import type { ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = {
  children: ReactNode;
  /** Radius 14 instead of 12 — the Home hero card and the drawer panels. */
  elevated?: boolean;
  /** Padding and layout are the caller's job; see the comment below. */
  className?: string;
};

/**
 * The white surface every grouped block sits on.
 *
 * Why it carries no padding: the design pads a members card (12px 14px), a
 * catalog panel (12px 14px + inner fields) and the Home hero (14px) differently,
 * and a card that guesses would be fought at every call site. The card owns the
 * surface — background, border, radius, shadow — and nothing else.
 */
export function Card({ children, elevated = false, className }: CardProps) {
  const classes = [styles.card, elevated ? styles.elevated : "", className]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
```

- [ ] **Step 5: Implement `src/components/ui/RowLink.module.css`**

```css
.row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  /* The whole card is the tap target; 44px is the iOS floor. */
  min-height: 44px;
}

.text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
  /* Long German project names truncate rather than wrap the row open. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 12px;
  color: var(--color-text-muted);
}

.chevron {
  flex: none;
  color: var(--color-control-border);
}
```

- [ ] **Step 6: Implement `src/components/ui/RowLink.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Icon } from "./Icon";
import styles from "./RowLink.module.css";

type RowLinkProps = {
  href: string;
  /** The row's headline — also its accessible name. */
  title: string;
  /** Second line, e.g. "3 Listen · 4 Mitglieder". */
  meta?: string;
  /** Usually an <Avatar />. */
  leading?: ReactNode;
  /** Usually a <Badge />; the chevron is added after it automatically. */
  trailing?: ReactNode;
};

/**
 * A tappable card row — the workhorse of Home, Projekte and the list overview.
 *
 * Why a next/link and not a card with a nested link: the design makes the whole
 * card tappable, and an <a> wrapping the row is the only version of that which
 * works with keyboard focus, middle-click and "open in new tab" for free.
 * Consequently the slots must not contain interactive elements — nested
 * interactive content inside a link is invalid HTML and unusable by keyboard.
 */
export function RowLink({ href, title, meta, leading, trailing }: RowLinkProps) {
  return (
    <Link href={href} className={styles.row}>
      {leading}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
      {trailing}
      <Icon icon={ChevronRight} size={16} className={styles.chevron} />
    </Link>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui/Card.test.tsx src/components/ui/RowLink.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/Card.* src/components/ui/RowLink.*
git commit -m "feat(ui): Card surface and tappable RowLink"
```

---

### Task 8: Chip and ChipTabs

**Files:**
- Create: `src/components/ui/Chip.tsx`, `src/components/ui/Chip.module.css`
- Create: `src/components/ui/ChipTabs.tsx`, `src/components/ui/ChipTabs.module.css`
- Test: `src/components/ui/Chip.test.tsx`, `src/components/ui/ChipTabs.test.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 3), tokens.
- Produces:
  - `Chip({ children, tone?, selected?, struck?, onClick?, onRemove?, removeLabel? })`. `tone`: `"outline" | "accent" | "neutral"`, default `"neutral"`. Renders a `<button>` when `onClick` is given and `onRemove` is not; otherwise a `<span>` (with a nested remove `<button>` when `onRemove` is given). **`onClick` and `onRemove` are mutually exclusive** — a button inside a button is invalid HTML.
  - `ChipTabs({ options, value, onChange, label })` — `role="tablist"` with one `role="tab"` per option; `label` is the tablist's accessible name (e.g. `"Kategorien"`).

**Design values (from the prototypes):**
- Filter tab (`ChipTabs`): row `display:flex;gap:18px;padding:11px 16px 0;border-bottom:1px solid #ececea;overflow-x:auto`. Tab `font-size:13.5px;padding-bottom:9px`. Active: `font-weight:700;color:#3e63c4;border-bottom:2px solid #3e63c4`. Inactive: `font-weight:500;color:#77776f`.
- `outline` chip (Favoriten): `display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;padding:7px 12px;border-radius:99px;background:#fff;border:1px solid #ececea;color:#232322`; the ✕ is `#c6c6bf` at `12px`.
- `accent` chip (favourite in the pre-fill preview): `font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:99px;background:#eef2fc;color:#2f4a94`.
- `neutral` chip (statistical article, unselected category): same metrics, `background:#f1f1ee;color:#5a5a55`.
- `selected` (chosen category in the entry sheet): `background:#3e63c4;color:#fff`.
- `struck` (de-selected pre-fill chip): `background:#fcfcfb;color:#c2c2ba;border:1px dashed #dcdcd7;text-decoration:line-through`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/Chip.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders as plain text when it has no interaction", () => {
    render(<Chip>Milch</Chip>);

    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("becomes a button when onClick is given and reports its selected state", async () => {
    const onClick = vi.fn();
    render(
      <Chip onClick={onClick} selected>
        Molkerei
      </Chip>,
    );

    const chip = screen.getByRole("button", { name: "Molkerei" });
    expect(chip).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reports aria-pressed=false when selectable but not selected", () => {
    render(<Chip onClick={() => {}}>Molkerei</Chip>);
    expect(screen.getByRole("button", { name: "Molkerei" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders a separate remove button with a German label", async () => {
    const onRemove = vi.fn();
    render(
      <Chip tone="outline" onRemove={onRemove} removeLabel="Milch entfernen">
        Milch
      </Chip>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Milch entfernen" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic German remove label", () => {
    render(
      <Chip tone="outline" onRemove={() => {}}>
        Milch
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Entfernen" })).toBeInTheDocument();
  });

  it("still shows its text when struck through", () => {
    render(<Chip struck>Milch</Chip>);
    expect(screen.getByText("Milch")).toBeInTheDocument();
  });
});
```

Create `src/components/ui/ChipTabs.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipTabs } from "./ChipTabs";

const OPTIONS = ["Alle", "Molkerei", "Ohne Kategorie"];

describe("ChipTabs", () => {
  it("renders one tab per option inside a labelled tablist", () => {
    render(<ChipTabs options={OPTIONS} value="Alle" onChange={() => {}} label="Kategorien" />);

    expect(screen.getByRole("tablist", { name: "Kategorien" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("marks exactly the active option as selected", () => {
    render(<ChipTabs options={OPTIONS} value="Molkerei" onChange={() => {}} label="Kategorien" />);

    expect(screen.getByRole("tab", { name: "Molkerei" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Alle" })).toHaveAttribute("aria-selected", "false");
  });

  it("reports the picked option", async () => {
    const onChange = vi.fn();
    render(<ChipTabs options={OPTIONS} value="Alle" onChange={onChange} label="Kategorien" />);

    await userEvent.click(screen.getByRole("tab", { name: "Ohne Kategorie" }));

    expect(onChange).toHaveBeenCalledWith("Ohne Kategorie");
  });

  it("keeps rendering an active option that is no longer in the list", () => {
    // The design requires the active chip to survive its category going empty —
    // the screen shows an empty state instead of falling back to "Alle".
    render(
      <ChipTabs options={["Alle"]} value="Molkerei" onChange={() => {}} label="Kategorien" />,
    );

    expect(screen.getByRole("tab", { name: "Molkerei" })).toHaveAttribute("aria-selected", "true");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/ui/Chip.test.tsx src/components/ui/ChipTabs.test.tsx`
Expected: FAIL — both modules missing.

- [ ] **Step 3: Implement `src/components/ui/Chip.module.css`**

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font-size: 12.5px;
  font-weight: 600;
  padding: 5px 11px;
  white-space: nowrap;
  background: none;
  cursor: default;
  user-select: none;
}

.interactive {
  cursor: pointer;
}

/* Favourites: a white pill with a visible edge, one size up. */
.outline {
  background: var(--color-surface);
  border-color: var(--color-hairline);
  color: var(--color-text-primary);
  font-size: 13.5px;
  padding: 7px 12px;
}

.accent {
  background: var(--color-accent-tint);
  color: var(--color-accent-dark);
}

.neutral {
  background: var(--color-hairline-weak);
  color: var(--color-text-secondary);
}

/* Wins over every tone: the chosen category in the entry sheet. */
.selected {
  background: var(--color-accent);
  color: var(--color-surface);
  border-color: transparent;
  font-weight: 700;
}

/* De-selected pre-fill preview: still readable, clearly switched off. */
.struck {
  background: var(--color-bg);
  color: var(--color-text-placeholder);
  border: 1px dashed var(--color-border-strong);
  text-decoration: line-through;
}

.remove {
  display: inline-flex;
  align-items: center;
  border: none;
  background: none;
  padding: 0;
  color: var(--color-control-border);
  cursor: pointer;
}
```

- [ ] **Step 4: Implement `src/components/ui/Chip.tsx`**

```tsx
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Icon } from "./Icon";
import styles from "./Chip.module.css";

export type ChipTone = "outline" | "accent" | "neutral";

type ChipProps = {
  children: ReactNode;
  tone?: ChipTone;
  /** Accent-filled: the currently chosen category in the entry sheet. */
  selected?: boolean;
  /** Struck through: a pre-fill suggestion the user switched off. */
  struck?: boolean;
  /** Makes the whole chip a toggle button. Mutually exclusive with onRemove. */
  onClick?: () => void;
  /** Adds a ✕ button inside the chip. Mutually exclusive with onClick. */
  onRemove?: () => void;
  /** German accessible name for the ✕, e.g. "Milch entfernen". */
  removeLabel?: string;
};

/**
 * The pill chip, in all the shapes the design uses: favourites (removable),
 * pre-fill preview (toggleable, strikeable), and the category picker inside the
 * entry sheet (selectable).
 *
 * Why onClick and onRemove are mutually exclusive: a chip with both would need a
 * button inside a button, which is invalid HTML and unreachable by keyboard. The
 * design never asks for both — favourites are removed, preview chips are
 * toggled — so the component encodes that rather than papering over it.
 */
export function Chip({
  children,
  tone = "neutral",
  selected = false,
  struck = false,
  onClick,
  onRemove,
  removeLabel = "Entfernen",
}: ChipProps) {
  // Order matters: struck and selected are states that override the base tone.
  const classes = [
    styles.chip,
    styles[tone],
    selected ? styles.selected : "",
    struck ? styles.struck : "",
    onClick ? styles.interactive : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Whole-chip toggle. aria-pressed is what tells a screen reader this is a
  // two-state control rather than a plain action.
  if (onClick && !onRemove) {
    return (
      <button type="button" className={classes} aria-pressed={selected} onClick={onClick}>
        {children}
      </button>
    );
  }

  // Static chip, optionally with its own small remove button.
  return (
    <span className={classes}>
      {children}
      {onRemove ? (
        <button type="button" className={styles.remove} aria-label={removeLabel} onClick={onRemove}>
          <Icon icon={X} size={12} />
        </button>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 5: Implement `src/components/ui/ChipTabs.module.css`**

```css
.tabs {
  display: flex;
  gap: 18px;
  padding: 11px var(--screen-padding) 0;
  border-bottom: 1px solid var(--color-hairline);
  /* Many categories scroll sideways rather than wrapping into a second row. */
  overflow-x: auto;
  /* Hides the scrollbar on desktop without hiding the ability to scroll. */
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  flex: none;
  border: none;
  background: none;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  padding: 0 0 9px;
  /* 2px of transparent border keeps inactive and active tabs the same height. */
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  cursor: pointer;
}

.active {
  font-weight: 700;
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}
```

- [ ] **Step 6: Implement `src/components/ui/ChipTabs.tsx`**

```tsx
import styles from "./ChipTabs.module.css";

type ChipTabsProps = {
  /** In display order. The list screen supplies "Alle" first, "Ohne Kategorie" last. */
  options: string[];
  /** The active option. May be absent from `options` — see the comment below. */
  value: string;
  onChange: (next: string) => void;
  /** German accessible name for the whole tab row, e.g. "Kategorien". */
  label: string;
};

/**
 * The underlined filter tab row above a list's content.
 *
 * Why role="tablist" and not a nav: these are a filter over the content directly
 * below them, not navigation (the handoff is explicit: "Kategorie-Chips ≠
 * Navigation"). The tab pattern is exactly that semantic.
 *
 * The active option is rendered even when it is missing from `options`. That is
 * the design's rule that the active chip survives its category going empty —
 * the screen then shows an empty state instead of silently jumping back to
 * "Alle", which would lose the user's place.
 */
export function ChipTabs({ options, value, onChange, label }: ChipTabsProps) {
  const visible = options.includes(value) ? options : [...options, value];

  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {visible.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.tab, active ? styles.active : ""].filter(Boolean).join(" ")}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui/Chip.test.tsx src/components/ui/ChipTabs.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/Chip.* src/components/ui/ChipTabs.*
git commit -m "feat(ui): pill Chip and the ChipTabs filter row"
```

---

### Task 9: EmptyState

**Files:**
- Create: `src/components/ui/EmptyState.tsx`, `src/components/ui/EmptyState.module.css`
- Test: `src/components/ui/EmptyState.test.tsx`

**Interfaces:**
- Consumes: tokens.
- Produces: `EmptyState({ icon, title, description, shape?, tone?, children? })`. `icon` is a `ReactNode` (usually `<Icon icon={Star} size={22} />`), `shape`: `"circle" | "square"` (default `"circle"`), `tone`: `"accent" | "neutral"` (default `"neutral"`), `children` is the action slot rendered directly under the sentence.

**Design values (Optionen 5a–5g):** container centred column, `padding: 0 36px`, `text-align:center`. Glyph `52px` box, `border-radius:50%` (circle) or `16px` (square), background `#eef2fc` with `#3e63c4` glyph (accent) or `#f1f1ee` with `#a3a39b` glyph (neutral). Title `16px/700 #232322`, `margin-top:14px`. Description `13.5px #77776f`, `line-height:1.5`, `margin-top:5px`. Action `margin-top:18px`, full width.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/EmptyState.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title as a heading and the sentence below it", () => {
    render(
      <EmptyState
        icon={<span data-testid="glyph" />}
        title="Noch keine Favoriten"
        description="Favoriten landen automatisch in jeder vorbefüllten Liste."
      />,
    );

    expect(screen.getByRole("heading", { name: "Noch keine Favoriten" })).toBeInTheDocument();
    expect(
      screen.getByText("Favoriten landen automatisch in jeder vorbefüllten Liste."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("glyph")).toBeInTheDocument();
  });

  it("renders the action slot so the next step sits right under the sentence", () => {
    render(
      <EmptyState icon={<span />} title="Noch kein Projekt" description="Leg eins an.">
        <button type="button">Anlegen</button>
      </EmptyState>,
    );

    expect(screen.getByRole("button", { name: "Anlegen" })).toBeInTheDocument();
  });

  it("works without an action", () => {
    render(
      <EmptyState
        icon={<span />}
        title="Noch nichts abgeschlossen"
        description="Abgeschlossene Listen landen hier."
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/EmptyState.test.tsx`
Expected: FAIL — `Cannot find module './EmptyState'`.

- [ ] **Step 3: Implement `src/components/ui/EmptyState.module.css`**

```css
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 36px;
  text-align: center;
}

.glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex: none;
}

.circle {
  border-radius: 50%;
}

.square {
  border-radius: 16px;
}

.accent {
  background: var(--color-accent-tint);
  color: var(--color-accent);
}

.neutral {
  background: var(--color-hairline-weak);
  color: var(--color-text-muted);
}

.title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-top: 14px;
}

.description {
  font-size: 13.5px;
  color: var(--color-text-tertiary);
  line-height: 1.5;
  margin-top: 5px;
}

.action {
  display: flex;
  gap: 8px;
  width: 100%;
  margin-top: 18px;
}
```

- [ ] **Step 4: Implement `src/components/ui/EmptyState.tsx`**

```tsx
import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  /** Usually an <Icon />; the 52px frame around it is drawn here. */
  icon: ReactNode;
  /** German headline, e.g. "Noch keine Favoriten". */
  title: string;
  /** Exactly one German sentence explaining what will fill this screen. */
  description: string;
  shape?: "circle" | "square";
  tone?: "accent" | "neutral";
  /** The next step — an input + button pair, or a single call to action. */
  children?: ReactNode;
};

/**
 * The one empty-state pattern, used by all seven empty screens in the design
 * (no projects, project without lists, empty list, emptied category filter, no
 * favourites, empty catalog, empty archive).
 *
 * Why one component for all seven: the design's whole point is that an empty
 * screen is not an error but an invitation — glyph, one sentence, and the action
 * immediately below it. Seven hand-built versions would drift apart within two
 * slices; one component with two visual knobs (shape, tone) cannot.
 *
 * The title is an <h2> for the same reason SectionLabel is: on an empty screen
 * it is frequently the only heading there is.
 */
export function EmptyState({
  icon,
  title,
  description,
  shape = "circle",
  tone = "neutral",
  children,
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={[styles.glyph, styles[shape], styles[tone]].join(" ")}>{icon}</span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      {children ? <div className={styles.action}>{children}</div> : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/EmptyState.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/EmptyState.*
git commit -m "feat(ui): the shared EmptyState pattern"
```

---

### Task 10: Sheet (bottom sheet)

**Files:**
- Create: `src/components/ui/Sheet.tsx`, `src/components/ui/Sheet.module.css`
- Test: `src/components/ui/Sheet.test.tsx`

**Interfaces:**
- Consumes: tokens, the `sl-fade` / `sl-sheet` keyframes.
- Produces: `Sheet({ open, onClose, title, children })`. Renders nothing when `open` is false. The panel is `role="dialog"` + `aria-modal="true"`, labelled by the title. Closes on Escape and on a click on the dim overlay; a click inside the panel does not close it.

**Design values:** overlay `background:rgba(35,35,34,.3)` + `animation: fade 200ms ease-out`. Panel `position:fixed;left:0;right:0;bottom:0;background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -8px 32px rgba(35,35,34,.18);padding:14px 18px 30px;animation:280ms cubic-bezier(.2,.9,.3,1)`. Grabber `width:36px;height:4px;border-radius:2px;background:#e3e3df;margin:0 auto 14px`. Title `17px/800 #232322`.

**Two deliberate departures from the prototype:** the prototype positions the sheet `absolute` inside a fake phone frame — in the real app it is `fixed`. And the bottom padding becomes `calc(30px + var(--safe-bottom))` so the sheet clears the iPhone home indicator.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Sheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  it("renders nothing while closed", () => {
    render(
      <Sheet open={false} onClose={() => {}} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a modal dialog labelled by its German title", () => {
    render(
      <Sheet open onClose={() => {}} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Neue Liste" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the dim overlay is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    await userEvent.click(screen.getByTestId("sheet-overlay"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the panel itself is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    await userEvent.click(screen.getByText("Inhalt"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks background scrolling while open and restores it on close", () => {
    const { rerender } = render(
      <Sheet open onClose={() => {}} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Sheet open={false} onClose={() => {}} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/Sheet.test.tsx`
Expected: FAIL — `Cannot find module './Sheet'`.

- [ ] **Step 3: Implement `src/components/ui/Sheet.module.css`**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  animation: sl-fade var(--motion-fade) ease-out;
  z-index: 30;
}

.panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-surface);
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  box-shadow: var(--shadow-sheet);
  /* 30px of bottom padding from the design, plus the iPhone home indicator. */
  padding: 14px 18px calc(30px + var(--safe-bottom));
  animation: sl-sheet var(--motion-sheet) var(--ease-sheet);
  z-index: 31;
  /* A long sheet (the revoke sheet with many projects) scrolls inside itself
     instead of growing past the top of the screen. */
  max-height: 85vh;
  overflow-y: auto;
}

/* Purely decorative affordance that says "this panel came up from below". */
.grabber {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-grabber);
  margin: 0 auto 14px;
}

.title {
  font-size: 17px;
  font-weight: 800;
  color: var(--color-text-primary);
}
```

- [ ] **Step 4: Implement `src/components/ui/Sheet.tsx`**

```tsx
"use client";

import { useEffect, useId, type ReactNode } from "react";
import styles from "./Sheet.module.css";

type SheetProps = {
  open: boolean;
  /** Called on Escape, on an overlay click, and by the sheet's own controls. */
  onClose: () => void;
  /** German sheet title, e.g. "Neue Liste" or "Zugang entziehen: anna@web.de". */
  title: string;
  children: ReactNode;
};

/**
 * The bottom sheet — the design's answer to every modal decision (entry detail,
 * new list with pre-fill preview, the two-way revoke confirmation).
 *
 * Why a client component: it owns keyboard handling and a body-scroll lock,
 * both of which need effects.
 *
 * Why no focus trap: the MVP keeps this deliberately small. Escape closes,
 * the overlay closes, and the panel is a labelled aria-modal dialog, which is
 * what a screen reader needs to announce it. A full trap (and focus restore) is
 * worth adding the day a sheet grows a multi-step flow — note it, don't build it
 * speculatively.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    // Nothing to wire up while closed — and the early return keeps the cleanup
    // from clearing an overflow lock that another sheet might own.
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    // Listening on document (not on the panel) is what makes Escape work no
    // matter where focus currently sits.
    document.addEventListener("keydown", handleKeyDown);
    // Stops the page behind the sheet from scrolling under the user's thumb.
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
    // onClose is in the deps because the handler closes over it. A caller passing
    // an inline arrow makes this effect re-run on every parent render — that is
    // harmless here (it tears down and immediately re-applies the same listener
    // and the same lock), so do not "fix" it by dropping the dependency.
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* The overlay is a plain div, not a button: it is a fallback gesture that
          duplicates Escape and the sheet's own cancel control, so putting it in
          the tab order would only add a nameless stop. */}
      <div className={styles.overlay} data-testid="sheet-overlay" onClick={onClose} />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.grabber} aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/Sheet.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Sheet.*
git commit -m "feat(ui): bottom Sheet with Escape, overlay close and scroll lock"
```

---

### Task 11: ConfirmSheet (destructive confirmation)

**Files:**
- Create: `src/components/ui/ConfirmSheet.tsx`, `src/components/ui/ConfirmSheet.module.css`
- Test: `src/components/ui/ConfirmSheet.test.tsx`

**Interfaces:**
- Consumes: `Sheet` (Task 10), tokens.
- Produces:
  ```ts
  export type ConfirmOption = {
    label: string;              // German, e.g. "Nur Zugang entziehen"
    description?: string;       // German consequence sentence
    tone: "neutral" | "danger";
    onSelect: () => void;
  };
  ```
  `ConfirmSheet({ open, onClose, title, children?, options, cancelLabel? })` — `children` is optional context above the options (e.g. the list of project memberships); `cancelLabel` defaults to `"Abbrechen"`.

**Design values:** neutral option `border:1.5px solid #dcdcd7;border-radius:12px;padding:12px 14px`; label `14px/700 #232322`; description `12px #5a5a55;line-height:1.45;margin-top:2px`. Danger option `border:1.5px solid #bf4a41;background:#fdf3f2;border-radius:12px;padding:12px 14px`; label `14px/700 #bf4a41`; description `12px #8a4038`. Options are `8px` apart, the first sits `16px` under the context. Cancel: `13.5px/600 #5a5a55`, centred, `margin-top:12px`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/ConfirmSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmSheet } from "./ConfirmSheet";

const TITLE = "Zugang entziehen: anna@web.de";

describe("ConfirmSheet", () => {
  it("renders every option as its own button", () => {
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        title={TITLE}
        options={[
          { label: "Nur Zugang entziehen", tone: "neutral", onSelect: () => {} },
          {
            label: "Zugang entziehen und aus allen Projekten entfernen",
            tone: "danger",
            onSelect: () => {},
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /Nur Zugang entziehen/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /aus allen Projekten entfernen/ }),
    ).toBeInTheDocument();
  });

  it("includes the consequence sentence in the option's accessible name", () => {
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        title={TITLE}
        options={[
          {
            label: "Nur Zugang entziehen",
            description: "Keine neuen Logins. Mitgliedschaften bleiben.",
            tone: "neutral",
            onSelect: () => {},
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Keine neuen Logins\. Mitgliedschaften bleiben\./ }),
    ).toBeInTheDocument();
  });

  it("calls the selected option and nothing else", async () => {
    const safe = vi.fn();
    const destructive = vi.fn();
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        title={TITLE}
        options={[
          { label: "Nur Zugang entziehen", tone: "neutral", onSelect: safe },
          { label: "Alles entfernen", tone: "danger", onSelect: destructive },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Nur Zugang entziehen" }));

    expect(safe).toHaveBeenCalledTimes(1);
    expect(destructive).not.toHaveBeenCalled();
  });

  it("closes on Abbrechen", async () => {
    const onClose = vi.fn();
    render(
      <ConfirmSheet
        open
        onClose={onClose}
        title={TITLE}
        options={[{ label: "Löschen", tone: "danger", onSelect: () => {} }]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders context passed as children above the options", () => {
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        title={TITLE}
        options={[{ label: "Löschen", tone: "danger", onSelect: () => {} }]}
      >
        <p>Mitglied in diesen Projekten:</p>
      </ConfirmSheet>,
    );

    expect(screen.getByText("Mitglied in diesen Projekten:")).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    render(
      <ConfirmSheet
        open={false}
        onClose={() => {}}
        title={TITLE}
        options={[{ label: "Löschen", tone: "danger", onSelect: () => {} }]}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/ConfirmSheet.test.tsx`
Expected: FAIL — `Cannot find module './ConfirmSheet'`.

- [ ] **Step 3: Implement `src/components/ui/ConfirmSheet.module.css`**

```css
.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.option {
  display: block;
  width: 100%;
  text-align: left;
  border-radius: var(--radius-card);
  padding: 12px 14px;
  background: var(--color-surface);
  cursor: pointer;
}

.neutral {
  border: 1.5px solid var(--color-border-strong);
}

.danger {
  border: 1.5px solid var(--color-danger);
  background: var(--color-danger-tint);
}

.optionLabel {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.danger .optionLabel {
  color: var(--color-danger);
}

.optionDescription {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.45;
  margin-top: 2px;
}

.danger .optionDescription {
  color: var(--color-danger-dark);
}

.cancel {
  display: block;
  width: 100%;
  border: none;
  background: none;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-align: center;
  margin-top: 12px;
  padding: 8px 0;
  cursor: pointer;
}
```

- [ ] **Step 4: Implement `src/components/ui/ConfirmSheet.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { Sheet } from "./Sheet";
import styles from "./ConfirmSheet.module.css";

export type ConfirmOption = {
  /** German action label, e.g. "Nur Zugang entziehen". */
  label: string;
  /** German sentence spelling out the consequence. Strongly recommended. */
  description?: string;
  /** "danger" gets the red border and tinted surface. */
  tone: "neutral" | "danger";
  onSelect: () => void;
};

type ConfirmSheetProps = {
  open: boolean;
  onClose: () => void;
  /** German sheet title naming the target, e.g. "Zugang entziehen: anna@web.de". */
  title: string;
  /** Optional context above the options — e.g. the affected memberships. */
  children?: ReactNode;
  options: ConfirmOption[];
  cancelLabel?: string;
};

/**
 * The destructive-confirmation pattern.
 *
 * Why options instead of a yes/no dialog: the design's most consequence-heavy
 * screen (Verwaltung's two-way revoke) offers two *different* destructive
 * outcomes side by side, one reversible and one not. Modelling confirmation as a
 * list of labelled options with their consequences spelled out — rather than
 * "Sind Sie sicher?" — is what lets the user pick the right one. Everything else
 * in the app that confirms (delete project, delete list, delete entry) is the
 * same pattern with a single option.
 *
 * The description lives inside the <button>, so a screen reader announces the
 * consequence together with the action instead of leaving it as loose text the
 * user may never reach.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  options,
  cancelLabel = "Abbrechen",
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {children}
      <div className={styles.options}>
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            className={[styles.option, styles[option.tone]].join(" ")}
            onClick={option.onSelect}
          >
            <span className={styles.optionLabel}>{option.label}</span>
            {option.description ? (
              <span className={styles.optionDescription}>{option.description}</span>
            ) : null}
          </button>
        ))}
      </div>
      <button type="button" className={styles.cancel} onClick={onClose}>
        {cancelLabel}
      </button>
    </Sheet>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/ConfirmSheet.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/ConfirmSheet.*
git commit -m "feat(ui): ConfirmSheet for destructive decisions with consequences"
```

---

### Task 12: InlineEdit

**Files:**
- Create: `src/components/ui/InlineEdit.tsx`, `src/components/ui/InlineEdit.module.css`
- Test: `src/components/ui/InlineEdit.test.tsx`

**Interfaces:**
- Consumes: `FieldError` (Task 5), tokens.
- Produces: `InlineEdit({ value, onSave, label, editable?, error? })`. `label` is the German accessible name (e.g. `"Projektname"`), `editable` defaults to `true`, `onSave(next: string)` is only called when the trimmed value is non-empty **and** actually changed.

**Design values:** resting state — text with `border-bottom:1.5px dashed #c6c6bf;padding-bottom:1px`, inheriting the surrounding text style. Editing — input with `1.5px solid #3e63c4`, `border-radius:10px`. Error — red border plus the message underneath.

**Behaviour contract:** Enter saves and leaves edit mode; Escape discards and leaves edit mode; blur saves. Enter must not save twice (Enter triggers the save, then the input blurs) — the `skipBlur` ref below is what prevents that.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/InlineEdit.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineEdit } from "./InlineEdit";

describe("InlineEdit", () => {
  it("shows the value as a button that opens the editor", async () => {
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));

    expect(screen.getByLabelText("Projektname")).toHaveValue("Haushalt");
  });

  it("focuses the input when the editor opens", async () => {
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));

    expect(screen.getByLabelText("Projektname")).toHaveFocus();
  });

  it("saves the new value on Enter — exactly once", async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.type(screen.getByLabelText("Projektname"), "Wohnung{Enter}");

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("Wohnung");
  });

  it("saves on blur", async () => {
    const onSave = vi.fn();
    render(
      <>
        <InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />
        <button type="button">woanders hin</button>
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.type(screen.getByLabelText("Projektname"), "Wohnung");
    await userEvent.click(screen.getByRole("button", { name: "woanders hin" }));

    expect(onSave).toHaveBeenCalledWith("Wohnung");
  });

  it("discards the edit on Escape", async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.type(screen.getByLabelText("Projektname"), "Wohnung{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Haushalt/ })).toBeInTheDocument();
  });

  it("does not save an unchanged value", async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.keyboard("{Enter}");

    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not save an empty value", async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.keyboard("{Enter}");

    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders plain text with no editor when not editable", () => {
    render(
      <InlineEdit value="Haushalt" label="Projektname" onSave={() => {}} editable={false} />,
    );

    expect(screen.getByText("Haushalt")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a server-side error under the field", async () => {
    render(
      <InlineEdit
        value="Milch"
        label="Name"
        onSave={() => {}}
        error="Artikel existiert bereits"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Artikel existiert bereits");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/InlineEdit.test.tsx`
Expected: FAIL — `Cannot find module './InlineEdit'`.

- [ ] **Step 3: Implement `src/components/ui/InlineEdit.module.css`**

```css
.wrapper {
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
}

/* Resting state: looks like text, but the dashed underline says "editable". */
.rest {
  border: none;
  background: none;
  padding: 0 0 1px;
  font: inherit;
  color: inherit;
  text-align: left;
  border-bottom: 1.5px dashed var(--color-control-border);
  cursor: text;
}

/* Members see the same text without the affordance — the design says
   owner-only controls are not rendered rather than disabled. */
.static {
  font: inherit;
  color: inherit;
}

.input {
  font: inherit;
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1.5px solid var(--color-accent);
  border-radius: var(--radius-control);
  padding: 6px 10px;
  outline: none;
  min-width: 0;
}

.invalid {
  border-color: var(--color-danger);
}
```

- [ ] **Step 4: Implement `src/components/ui/InlineEdit.tsx`**

```tsx
"use client";

import { useId, useRef, useState } from "react";
import { FieldError } from "./FieldError";
import styles from "./InlineEdit.module.css";

type InlineEditProps = {
  /** The saved value — the component treats this as the source of truth. */
  value: string;
  /** Called only with a non-empty, actually-changed value. */
  onSave: (next: string) => void | Promise<void>;
  /** German accessible name for the input, e.g. "Projektname". */
  label: string;
  /** false → plain text, no affordance (a member viewing an owner-only field). */
  editable?: boolean;
  /** A German error from the server, e.g. "Artikel existiert bereits". */
  error?: string | null;
};

/**
 * The shared inline-editing pattern: a piece of text with a dashed underline
 * that turns into a field when tapped, saves on Enter or blur, and cancels on
 * Escape. Used for the project name, the list name and the catalog article name.
 *
 * Why the component decides what "no change" means: every call site would
 * otherwise re-implement trim + compare, and a rename endpoint being hit with
 * the value it already holds is a pointless write that also shows up as a sync
 * delta for every other member.
 */
export function InlineEdit({
  value,
  onSave,
  label,
  editable = true,
  error,
}: InlineEditProps) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Enter saves and closes the editor, which immediately fires a blur. Without
  // this flag the blur handler would run commit() a second time. The same flag
  // is what makes Escape a true cancel rather than "cancel, then save on blur".
  const skipBlur = useRef(false);

  // Leaves edit mode, saving only if the value is meaningful and actually new.
  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) void onSave(next);
  }

  // Leaves edit mode, throwing the draft away.
  function cancel() {
    skipBlur.current = true;
    setDraft(value);
    setEditing(false);
  }

  function startEditing() {
    // Re-seed the draft from the current value so a previously cancelled edit
    // does not reappear the next time the field is opened.
    setDraft(value);
    setEditing(true);
  }

  if (!editable) {
    return <span className={styles.static}>{value}</span>;
  }

  if (!editing) {
    return (
      <span className={styles.wrapper}>
        <button type="button" className={styles.rest} onClick={startEditing}>
          {value}
        </button>
        {error ? <FieldError>{error}</FieldError> : null}
      </span>
    );
  }

  return (
    <span className={styles.wrapper}>
      {/* The label is visually hidden by being absent: the field replaces text
          that is already on screen, so an aria-label carries the name instead. */}
      <input
        id={inputId}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={[styles.input, error ? styles.invalid : ""].filter(Boolean).join(" ")}
        value={draft}
        // autoFocus is correct here: the field only exists because the user just
        // asked to edit, so focus is exactly where they expect it.
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            skipBlur.current = true;
            commit();
          } else if (event.key === "Escape") {
            cancel();
          }
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          commit();
        }}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </span>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/InlineEdit.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/InlineEdit.*
git commit -m "feat(ui): InlineEdit with Enter/blur save and Escape cancel"
```

---

### Task 13: Banner

**Files:**
- Create: `src/components/ui/Banner.tsx`, `src/components/ui/Banner.module.css`
- Test: `src/components/ui/Banner.test.tsx`

**Interfaces:**
- Consumes: tokens, the `sl-banner` keyframe.
- Produces: `Banner({ tone, children, icon?, action? })` with `tone: "info" | "success"`.

**Why this is in Slice 13 even though the meta plan's primitive list does not name it:** the design specifies three banners with the same anatomy — the Favoriten info banner (Screen 7), the "Alle Einträge sind abgehakt" prompt and the "✓ Abgeschlossen am …" banner (Screen 10). All three are pixel-specified today, and slices 11 and 12 each need one. Building it once here is the same argument that put the sheet and the chips in this slice.

**Design values:** container `display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:10px;animation:sl-banner 280ms ease-out`. Info: `background:#eef2fc`, text `13.5px #2f4a94`, `line-height:1.35`. Success: `background:#eef1ea`, text `13px #4c5c43`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Banner } from "./Banner";

describe("Banner", () => {
  it("announces itself politely as a status region", () => {
    render(<Banner tone="info">Alle Einträge sind abgehakt.</Banner>);

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Alle Einträge sind abgehakt.");
  });

  it("renders the action slot", () => {
    render(
      <Banner tone="info" action={<button type="button">Abschließen</button>}>
        Alle Einträge sind abgehakt.
      </Banner>,
    );

    expect(screen.getByRole("button", { name: "Abschließen" })).toBeInTheDocument();
  });

  it("renders the icon slot", () => {
    render(
      <Banner tone="success" icon={<span data-testid="glyph" />}>
        Abgeschlossen am 19.07.2026
      </Banner>,
    );

    expect(screen.getByTestId("glyph")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/Banner.test.tsx`
Expected: FAIL — `Cannot find module './Banner'`.

- [ ] **Step 3: Implement `src/components/ui/Banner.module.css`**

```css
.banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--radius-control);
  animation: sl-banner var(--motion-sheet) ease-out;
}

.text {
  flex: 1;
  min-width: 0;
}

.info {
  background: var(--color-accent-tint);
  color: var(--color-accent-dark);
  font-size: 13.5px;
  line-height: 1.35;
}

.success {
  background: var(--color-success-tint);
  color: var(--color-success-text);
  font-size: 13px;
}

.action {
  flex: none;
}
```

- [ ] **Step 4: Implement `src/components/ui/Banner.tsx`**

```tsx
import type { ReactNode } from "react";
import styles from "./Banner.module.css";

type BannerProps = {
  /** "info" = accent tint (prompts), "success" = green tint (completed list). */
  tone: "info" | "success";
  /** The German message. */
  children: ReactNode;
  /** Optional leading glyph. */
  icon?: ReactNode;
  /** Optional trailing control, e.g. "Abschließen" / "Wieder öffnen". */
  action?: ReactNode;
};

/**
 * The quiet, full-width message strip above a screen's content.
 *
 * Why role="status": these banners appear in reaction to something the user did
 * (the last entry got checked; the list was completed), and a polite live region
 * is what tells a screen-reader user that without stealing focus. The design is
 * explicit that this moment stays understated — "bewusst leise, kein Konfetti".
 */
export function Banner({ tone, children, icon, action }: BannerProps) {
  return (
    <div role="status" className={[styles.banner, styles[tone]].join(" ")}>
      {icon}
      <span className={styles.text}>{children}</span>
      {action ? <span className={styles.action}>{action}</span> : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/Banner.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Banner.*
git commit -m "feat(ui): Banner in info and success tones"
```

---

### Task 14: Dev gallery and manual verification

**Files:**
- Create: `src/app/dev/ui/page.tsx`
- Create: `src/app/dev/ui/Gallery.tsx`

**Interfaces:**
- Consumes: every primitive from tasks 3–13.
- Produces: the route `/dev/ui` in development. In a production build the route responds 404.

**Why:** this slice ships no user-facing screen, so nothing would otherwise prove the tokens actually render, that Figtree loaded, or that the sheet animates. The gallery is the slice's manual verification surface — and it stays useful in later slices as the place to eyeball a primitive without navigating the app.

- [ ] **Step 1: Create the guarded route `src/app/dev/ui/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { Gallery } from "./Gallery";

// A Server Component wrapper exists purely for this guard: the gallery is a
// development tool, and shipping it on the public app would expose an
// unauthenticated route. NODE_ENV is inlined at build time, so the production
// bundle contains a route that does nothing but 404.
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
```

- [ ] **Step 2: Create `src/app/dev/ui/Gallery.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ChipTabs } from "@/components/ui/ChipTabs";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { RowLink } from "@/components/ui/RowLink";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";

/**
 * A development-only gallery of every primitive from Slice 13.
 *
 * It is a client component because the sheets and chips need state. It is
 * deliberately plain: its job is to show the primitives, not to demonstrate
 * screen composition — that starts in Slice 14.
 */
export function Gallery() {
  const [chip, setChip] = useState("Alle");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState("Haushalt");
  const [favorites, setFavorites] = useState(["Milch", "Butter", "Brot"]);

  return (
    <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionLabel>Buttons</SectionLabel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button>Anlegen</Button>
        <Button variant="secondary">Leere Liste</Button>
        <Button variant="text">Abmelden</Button>
        <Button variant="danger">Projekt löschen…</Button>
        <Button disabled>Deaktiviert</Button>
      </div>
      <Button fullWidth>Liste mit 7 Einträgen anlegen</Button>

      <SectionLabel>Felder</SectionLabel>
      <TextField label="Projektname" placeholder="Projektname" />
      <TextField label="Name" defaultValue="Milch" error="Artikel existiert bereits" />
      <TextField label="Menge" fieldSize="sm" placeholder="1,5" />

      <SectionLabel>Zeilen und Karten</SectionLabel>
      <RowLink
        href="/dev/ui"
        title="Haushalt"
        meta="3 Listen · 4 Mitglieder"
        leading={<Avatar name="Haushalt" />}
        trailing={<Badge>OWNER</Badge>}
      />
      <RowLink
        href="/dev/ui"
        title="Camping"
        meta="1 Liste · 2 Mitglieder"
        leading={<Avatar name="Camping" />}
      />
      <Card elevated>
        <div style={{ padding: 14 }}>
          <strong>Einkauf Samstag</strong>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            Haushalt · 5 von 8 offen
          </div>
        </div>
      </Card>

      <SectionLabel>Chips</SectionLabel>
      <ChipTabs
        options={["Alle", "Molkerei", "Obst & Gemüse", "Ohne Kategorie"]}
        value={chip}
        onChange={setChip}
        label="Kategorien"
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {favorites.map((favorite) => (
          <Chip
            key={favorite}
            tone="outline"
            removeLabel={`${favorite} entfernen`}
            onRemove={() => setFavorites((current) => current.filter((f) => f !== favorite))}
          >
            {favorite}
          </Chip>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip tone="accent">★ Milch</Chip>
        <Chip tone="neutral">Äpfel</Chip>
        <Chip selected onClick={() => {}}>
          Molkerei
        </Chip>
        <Chip struck>Joghurt</Chip>
      </div>

      <SectionLabel>Banner</SectionLabel>
      <Banner tone="info" action={<Button variant="text">Abschließen</Button>}>
        Alle Einträge sind abgehakt.
      </Banner>
      <Banner tone="success" action={<Button variant="text">Wieder öffnen</Button>}>
        Abgeschlossen am 19.07.2026
      </Banner>

      <SectionLabel>Inline bearbeiten</SectionLabel>
      <InlineEdit value={name} label="Projektname" onSave={setName} />

      <SectionLabel>Sheets</SectionLabel>
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => setSheetOpen(true)}>Sheet öffnen</Button>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          Zugang entziehen
        </Button>
      </div>

      <SectionLabel>Leerer Zustand</SectionLabel>
      <div style={{ height: 300, display: "flex" }}>
        <EmptyState
          icon={<Icon icon={Star} size={22} />}
          shape="circle"
          tone="accent"
          title="Noch keine Favoriten"
          description="Favoriten landen automatisch in jeder vorbefüllten Liste — perfekt für Milch, Brot & Co."
        >
          <TextField placeholder="Artikelname" />
          <Button>Als Favorit</Button>
        </EmptyState>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Neue Liste">
        <TextField label="Listenname" placeholder="Listenname" />
        <div style={{ marginTop: 16 }}>
          <Button fullWidth onClick={() => setSheetOpen(false)}>
            Liste anlegen
          </Button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Zugang entziehen: anna@web.de"
        options={[
          {
            label: "Nur Zugang entziehen",
            description:
              "Keine neuen Logins. Mitgliedschaften bleiben — erneutes Einladen stellt alles wieder her.",
            tone: "neutral",
            onSelect: () => setConfirmOpen(false),
          },
          {
            label: "Zugang entziehen und aus allen Projekten entfernen",
            description:
              "Sofort und endgültig — erneutes Einladen bringt die Mitgliedschaften nicht zurück.",
            tone: "danger",
            onSelect: () => setConfirmOpen(false),
          },
        ]}
      >
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6 }}>
          Mitglied in diesen Projekten:
        </p>
      </ConfirmSheet>

      <div style={{ display: "flex", gap: 8, color: "var(--color-text-muted)" }}>
        <Icon icon={Trash2} />
        <span style={{ fontSize: 12 }}>Icon-Set: Lucide, Stroke 1.75</span>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run the full suite and the linter**

Run: `npm test`
Expected: PASS — the pre-existing 203 tests plus roughly 70 new ones from tasks 1–13 (4 + 3 + 6 + 7 + 8 + 5 + 10 + 3 + 6 + 6 + 9 + 3). Record the real number in Task 15; do not copy this estimate.

Run: `npm run lint`
Expected: no new errors (the pre-existing `.remember/` warning may remain).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual browser pass**

Run `npm run dev` and open http://localhost:3000/dev/ui. Confirm each of these, on a narrow (iPhone-width) viewport:

1. The page renders in **Figtree**, not a system serif/sans fallback (headings look geometric; check `body` computed `font-family` in devtools shows `__Figtree_…`).
2. The background is the warm off-white `#fcfcfb`, not pure white.
3. All four button weights look distinct; the destructive one is `#bf4a41` text, never a filled red button.
4. The invalid `TextField` shows a red border **and** the message "Artikel existiert bereits" underneath.
5. Row cards: avatar, title, meta, `OWNER` badge and a grey chevron; "Haushalt" and "Camping" have different avatar colours.
6. Tapping a `ChipTabs` tab moves the 2px accent underline.
7. Removing a favourite chip with its ✕ makes it disappear.
8. "Sheet öffnen" slides the sheet up from the bottom (~280ms), dims the background, and closes on **Escape**, on a tap on the dim area, and on "Liste anlegen" — but *not* on a tap inside the panel.
9. The background does not scroll while a sheet is open.
10. The revoke `ConfirmSheet` shows the neutral option and the red-bordered destructive option with their consequence sentences, and "Abbrechen" closes it.
11. Tapping "Haushalt" under *Inline bearbeiten* turns it into a focused input; Enter saves, Escape restores the old value.
12. The empty state is centred with the star in an accent-tinted circle, and its action sits directly under the sentence.

- [ ] **Step 5: Commit**

```bash
git add src/app/dev/ui/page.tsx src/app/dev/ui/Gallery.tsx
git commit -m "feat(ui): dev-only primitive gallery at /dev/ui"
```

---

### Task 15: Implementation review and plan bookkeeping

**Files:**
- Create: `docs/implementation-reviews/slice-13-design-foundation.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything built in tasks 1–14.
- Produces: the record the next slice's agent reads before starting Slice 14.

- [ ] **Step 1: Write the implementation review**

Create `docs/implementation-reviews/slice-13-design-foundation.md` in English, following the five sections CLAUDE.md requires:

1. **What was achieved** — the slice goal and whether it was fully met.
2. **Steps taken** — one line per task.
3. **Core components built** — every new file with a sentence on its role.
4. **Most important lines of code** — quote 5–10 blocks with an explanation. Good candidates: the `typeof document !== "undefined"` guard in `src/test/setup.ts` (one setup file serving two test environments); the `:root` token block (the design contract in code); the `skipBlur` ref in `InlineEdit` (why Enter does not save twice); the `onClick`/`onRemove` exclusivity in `Chip` (a button inside a button is invalid HTML); the `useId` in `TextField` (why it is a client component); the `!open` early return in `Sheet`'s effect (why the scroll lock is not cleared for a sheet that does not own it).
5. **Architecture contribution** — the presentation layer now exists and is proven; Slice 14 consumes it for the five already-built screens.

- [ ] **Step 2: Update the meta plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- Set the Slice 13 row's Status to `✅ Done / verified` and its Plan cell to `[2026-08-01-slice-13-design-foundation.md](2026-08-01-slice-13-design-foundation.md)`.
- Add a progress-log entry at the **top** of the Progress log using the template there. It must record at least:
  - **Delivered:** tokens + Figtree + the 14 primitives + `/dev/ui`.
  - **Tested:** the `npm test` file/test counts, `npm run lint`, `npm run build`, and the manual browser checklist from Task 14 Step 4.
  - **Follow-up decisions for later slices:**
    - Component tests opt into a DOM with `// @vitest-environment jsdom`; `src/test/setup.ts` registers Testing Library cleanup and jest-dom only in that environment.
    - `src/app/globals.css` is the single token source; `src/test/design-tokens.test.ts` pins the palette, so changing a colour means changing the test too — on purpose.
    - Only components with hooks carry `"use client"` (`Sheet`, `ConfirmSheet`, `TextField`, `InlineEdit`). The rest stay server-renderable.
    - `Chip`'s `onClick` and `onRemove` are mutually exclusive by design.
    - `RowLink` is a whole-card `<a>`, so its slots must not contain interactive elements.
    - `Sheet` has no focus trap and no focus restore — a deliberate MVP cut, worth revisiting when a sheet grows a multi-step flow.
    - CSS custom properties cannot be used in `@media`; the desktop breakpoint stays the literal `900px`.
  - **Inherited open items:** the Slice 7 review notes and the locale-date hydration overlay are still open — Slice 14 touches those pages and should fix the overlay while it is there.
- Replace the line "**Slice 13 is the next open slice** (plan still to be created)." in the UI-handoff note with "**Slice 14 is the next open slice** (plan still to be created)."

- [ ] **Step 3: Update CLAUDE.md**

Add a short section after "Tech stack" (keep it to a handful of lines):

```markdown
## UI layer

- **Design tokens** live as CSS custom properties in [src/app/globals.css](src/app/globals.css); [src/test/design-tokens.test.ts](src/test/design-tokens.test.ts) pins the palette against the handoff.
- **Primitives** live in [src/components/ui/](src/components/ui/) — Button, TextField/FieldError, Card, RowLink, Avatar, Badge, SectionLabel, Chip, ChipTabs, EmptyState, Sheet, ConfirmSheet, InlineEdit, Banner, Icon. Build screens out of these; do not restyle from scratch.
- **Styling:** CSS Modules only. **Icons:** `lucide-react`, always through `Icon` (stroke 1.75). **Font:** Figtree via `next/font/google`.
- **Component tests** put `// @vitest-environment jsdom` at the top of the file and use Testing Library; assert roles and text, never CSS-Module class names.
- `/dev/ui` renders every primitive in development (404 in production).
```

- [ ] **Step 4: Final verification**

Run: `npm test && npm run lint && npm run build`
Expected: all three succeed. Record the exact test counts in the review and the progress log — do not estimate them.

- [ ] **Step 5: Commit**

```bash
git add docs/implementation-reviews/slice-13-design-foundation.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md CLAUDE.md
git commit -m "docs: Slice 13 implementation review + meta-plan progress log"
```

---

## Out of scope for this slice

Named here so nobody builds them speculatively:

- **Screen layout components** — app header, drawer, desktop sidebar, project switcher. They belong to Slice 11, which is where their behaviour gets decided.
- **Restyling any existing screen.** Slice 14 does that; `src/app/**/page.tsx` keeps its current unstyled markup until then (except `layout.tsx`, which this slice must touch for the font).
- **The list entry row, the checkbox, swipe-to-delete, the trailing input row.** All Slice 12 — their behaviour and their client/server split are that slice's decisions, and the design's row is inseparable from them.
- **The per-row remote flash.** Slice 16, optional, last. The `sl-flash` keyframe is defined in `globals.css` now because it belongs to the token/motion contract, but nothing uses it yet — that is intentional.
- **Toast.** The prototype has one; no screen in the handoff's spec depends on it. Add it when a screen actually needs it.
- **A focus trap in `Sheet`.** See the comment in the component.
