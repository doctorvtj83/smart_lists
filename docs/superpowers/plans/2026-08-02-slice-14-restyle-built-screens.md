# Slice 14 — Restyle the Built Screens: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the five already-shipped screens — Login, Zugang verweigert, Home, Projekte, Verwaltung (incl. the two-way revoke sheet) — in the Slice 13 visual language, add the Home **"Weitermachen"** card with its new cross-project read function, and fix the inherited locale-date hydration overlay.

**Architecture:** Every screen stays a **Server Component** rendering the domain layer directly (the established pattern from Slices 2/9). Presentation is assembled exclusively from the Slice 13 primitives in `src/components/ui/`; only three new pieces are added — `PageHeader`, `ProgressBar` (both generic primitives) and the Home-local `ContinueCard`. Two new pure/DB read functions (`listProjectSummaries`, `getContinueList`) supply the meta lines and the Weitermachen card. The Verwaltung revoke flow keeps its existing `?revoke=<email>` URL-driven two-step architecture and its two Server Actions untouched — only the *presentation* becomes a bottom sheet, so the page needs exactly one small client component and no client-side data fetching.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), React 19, TypeScript, CSS Modules, `lucide-react` via `Icon`, Prisma 6 / Neon Postgres, Vitest (node + jsdom via `// @vitest-environment jsdom`), Testing Library.

## Global Constraints

- **In-app strings are German.** Code identifiers, comments and this plan are English (CLAUDE.md § Language convention). Copy the German labels **verbatim** from the handoff — they are quoted in each task.
- **Design source of truth:** `docs/design/2026-08-01-ui-handoff/README.md` plus the inline styles in `Smart Lists Optionen.dc.html` (screens `3a` Login, `3b` Zugang verweigert, `3c` Home, `3d` Projekte, `3k` Verwaltung, `3l` Revoke-Sheet, `5a` empty state "Keine Projekte"). Rebuild in React — **never paste the prototype markup**.
- **Styling: CSS Modules only.** One `X.module.css` next to each component. No inline `style={{...}}` in shipped screens (the `/dev/ui` gallery is the only place that keeps inline layout styles).
- **All colours, radii, shadows, motion come from the tokens in `src/app/globals.css`** (`var(--color-accent)`, `var(--radius-card)`, …). Never write a literal hex in a `.module.css` file. If a value is missing from `globals.css`, add the token there **and** extend `src/test/design-tokens.test.ts` — that test pins the palette on purpose.
- **Desktop breakpoint is the literal `900px`** in every `@media` query (CSS custom properties cannot be used inside `@media`; see the note in `globals.css`).
- **Build screens out of the Slice 13 primitives** — `Button`, `TextField`/`FieldError`, `Card`, `RowLink`, `Avatar`, `Badge`, `SectionLabel`, `Chip`, `ChipTabs`, `EmptyState`, `Sheet`, `ConfirmSheet`, `InlineEdit`, `Banner`, `Icon`. Do not restyle from scratch.
- **Icons:** `lucide-react`, always through `<Icon icon={X} />` (stroke 1.75, default size 17).
- **Owner-/Admin-only controls are NOT rendered**, never merely disabled (handoff § Destruktive Aktionen).
- **Component tests** put `// @vitest-environment jsdom` on line 1, use Testing Library, and assert **roles and text — never CSS-Module class names**.
- **Every function gets a comment explaining what it does and why it exists; every non-obvious block gets an inline comment** (CLAUDE.md § Code documentation standard). Do not thin out existing comments when editing a file.
- **Server Actions re-derive identity** (`auth()` / `requireAdmin(prisma)`) inside the action — never trust component-level state. Existing actions already do this; keep it when moving markup around.
- **Tap targets ≥ 44px**, safe areas respected via `var(--safe-top)` / `var(--safe-bottom)`.
- **Test command:** `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'` (DB tests need `.env.test` pointing at the Neon `test` branch). A single file: `npx vitest run <path>`.
- **Commit after every task.** German or English commit messages, consistent within the change.

---

## File Structure

**New — formatting helpers (pure, node-tested):**
- `src/lib/format/date.ts` — `formatGermanDate`, `formatGermanNumber`. Deterministic German formatting; the fix for the hydration overlay.
- `src/lib/format/plural.ts` — `formatProjectMeta`, `formatOpenCount`. German singular/plural for the meta lines.

**New — primitives (`src/components/ui/`, jsdom-tested, shown in `/dev/ui`):**
- `PageHeader.tsx` + `.module.css` — the screen header bar (title, optional leading/trailing slot, optional hairline). Slice 11 will drop the ☰ drawer trigger into its `leading` slot.
- `ProgressBar.tsx` + `.module.css` — the 5px accent progress track from the Weitermachen card.

**New — domain reads:**
- `src/lib/projects/summaries.ts` — `listProjectSummaries` (project + active-list count + member count + caller role).
- `src/lib/lists/continue.ts` — `lastTouchedAt` / `pickContinueList` (pure) + `getContinueList` (DB).

**New — screen-local components:**
- `src/app/ContinueCard.tsx` + `.module.css` — the Home hero card (co-located next to `page.tsx`, following the `src/app/lists/[listId]/ListSyncPoller.tsx` precedent).
- `src/app/login/GoogleLogo.tsx` — the official Google "G" as an inline SVG.
- `src/app/admin/RevokeSheet.tsx` + `.module.css` — client wrapper turning the existing `?revoke=` confirmation view into a bottom sheet.

**Modified — screens (markup only; server actions and domain calls stay as they are):**
- `src/app/login/page.tsx` + new `page.module.css`
- `src/app/auth/error/page.tsx` + new `page.module.css`
- `src/app/page.tsx` + new `page.module.css`
- `src/app/projects/page.tsx` + new `page.module.css`
- `src/app/admin/page.tsx` + new `page.module.css`

**Modified — hydration fix only:**
- `src/app/projects/[projectId]/page.tsx` (line ~236)
- `src/app/lists/[listId]/page.tsx` (lines ~196, ~250)

**Modified — gallery:**
- `src/app/dev/ui/Gallery.tsx` (adds `PageHeader` + `ProgressBar` sections)

---

## Task 1: German date/number formatting (fixes the hydration overlay)

Slice 13 handed over one open defect: `toLocaleDateString("de-DE")` is called during server render **and** during hydration. The two runtimes disagree — the server has no browser time zone, so a date near midnight renders as a different day on the client and React shows the hydration-error overlay. The fix is a formatter that pins **both** the locale and the time zone, so server and client are byte-identical by construction.

**Files:**
- Create: `src/lib/format/date.ts`
- Test: `src/lib/format/date.test.ts`
- Modify: `src/app/projects/[projectId]/page.tsx` (the `l.completedAt.toLocaleDateString("de-DE")` call, ~line 236)
- Modify: `src/app/lists/[listId]/page.tsx` (the `list.completedAt.toLocaleDateString("de-DE")` call ~line 196 and the `item.quantity.toLocaleString("de-DE")` call ~line 250)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatGermanDate(date: Date): string` → `"31.12.2026"`
  - `formatGermanNumber(value: number): string` → `"1,5"`, `"3"`

- [ ] **Step 1: Write the failing test**

Create `src/lib/format/date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatGermanDate, formatGermanNumber } from "./date";

describe("formatGermanDate", () => {
  it("formats as DD.MM.YYYY", () => {
    expect(formatGermanDate(new Date("2026-12-31T12:00:00Z"))).toBe("31.12.2026");
  });

  it("pads single-digit days and months", () => {
    expect(formatGermanDate(new Date("2026-07-05T12:00:00Z"))).toBe("05.07.2026");
  });

  // The whole point of the helper: the calendar day is resolved in Europe/Berlin,
  // never in the ambient time zone. Without the pinned zone a server rendering in
  // UTC and a browser in CEST disagree about this instant -> hydration mismatch.
  it("resolves the calendar day in Europe/Berlin, not in the ambient zone", () => {
    // 2026-07-29 22:30 UTC is already 2026-07-30 00:30 in Berlin (CEST, UTC+2).
    expect(formatGermanDate(new Date("2026-07-29T22:30:00Z"))).toBe("30.07.2026");
  });
});

describe("formatGermanNumber", () => {
  it("uses the decimal comma", () => {
    expect(formatGermanNumber(1.5)).toBe("1,5");
  });

  it("prints whole numbers without a decimal part", () => {
    expect(formatGermanNumber(3)).toBe("3");
  });

  // Quantities are Float in the schema; 0.1 + 0.2 style noise must not leak into the UI.
  it("caps the fraction at three digits", () => {
    expect(formatGermanNumber(0.30000000000000004)).toBe("0,3");
  });

  // No thousands separator: a quantity of 1000 is "1000", not "1.000" — the dot would
  // read as a decimal point next to the comma convention used above.
  it("does not group thousands", () => {
    expect(formatGermanNumber(1000)).toBe("1000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/format/date.test.ts`
Expected: FAIL — `Failed to resolve import "./date"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/format/date.ts`:

```ts
/**
 * Deterministic German formatting for dates and numbers.
 *
 * Why this module exists: `Date#toLocaleDateString("de-DE")` and
 * `Number#toLocaleString("de-DE")` resolve the *ambient* time zone and rely on
 * the host's locale data. In an App Router page that string is produced twice —
 * once on the server, once during hydration — and any disagreement makes React
 * throw a hydration error (the overlay Slice 13 handed over as open debt).
 *
 * Pinning both the locale and the time zone in a module-level formatter makes
 * the output a pure function of the instant, identical in Node and the browser.
 *
 * Pattern: module-level singleton formatters. `Intl.DateTimeFormat` is expensive
 * to construct and these are stateless, so they are built once per process.
 */

// Europe/Berlin, not UTC: the product is German and users expect the calendar day
// they live in. The zone must be explicit — "the server's zone" is not a value.
const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// maximumFractionDigits: 3 trims Float noise; useGrouping: false keeps "1000"
// from becoming "1.000", which would collide with the decimal-comma convention.
const numberFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 3,
  useGrouping: false,
});

/** German calendar date, e.g. "31.12.2026". Use for every user-visible date. */
export function formatGermanDate(date: Date): string {
  return dateFormatter.format(date);
}

/** German decimal number, e.g. "1,5". Use for every user-visible quantity. */
export function formatGermanNumber(value: number): string {
  return numberFormatter.format(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/format/date.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Replace the three unsafe locale calls**

In `src/app/projects/[projectId]/page.tsx`, add the import next to the other `@/lib` imports:

```ts
import { formatGermanDate } from "@/lib/format/date";
```

and replace the completed-date expression:

```tsx
{l.completedAt ? ` (${formatGermanDate(l.completedAt)})` : ""}
```

In `src/app/lists/[listId]/page.tsx`, add:

```ts
import { formatGermanDate, formatGermanNumber } from "@/lib/format/date";
```

and replace both expressions:

```tsx
{list.completedAt ? ` am ${formatGermanDate(list.completedAt)}` : ""}
```

```tsx
` — ${formatGermanNumber(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`}
```

- [ ] **Step 6: Verify nothing else calls the unsafe APIs**

Run: `grep -rn "toLocaleDateString\|toLocaleString\|toLocaleTimeString" src/`
Expected: **no matches**. Any hit is a hydration bug waiting to happen — route it through `src/lib/format/date.ts`.

- [ ] **Step 7: Run the full suite and the build**

Run: `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'`
Expected: PASS, 275+ tests (274 before this task + the 7 new ones, minus nothing).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/format/date.ts src/lib/format/date.test.ts \
        "src/app/projects/[projectId]/page.tsx" "src/app/lists/[listId]/page.tsx"
git commit -m "fix(ui): deterministic German date/number formatting (hydration overlay)"
```

---

## Task 2: German plural helpers for the meta lines

The design's meta lines are `"3 Listen · 4 Mitglieder"`, `"1 Liste · 2 Mitglieder"` and `"5 offen"`. German singular/plural is a pure string decision that two screens (Home, Projekte) and later slices need — so it is a tested pure function, not an inline ternary duplicated per screen.

**Files:**
- Create: `src/lib/format/plural.ts`
- Test: `src/lib/format/plural.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatListCount(count: number): string` → `"1 Liste"` / `"3 Listen"`
  - `formatMemberCount(count: number): string` → `"1 Mitglied"` / `"4 Mitglieder"`
  - `formatProjectMeta(listCount: number, memberCount: number): string` → `"3 Listen · 4 Mitglieder"`
  - `formatOpenCount(open: number): string` → `"5 offen"`
  - `formatOpenOfTotal(open: number, total: number): string` → `"5 von 8 offen"`

- [ ] **Step 1: Write the failing test**

Create `src/lib/format/plural.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatListCount,
  formatMemberCount,
  formatOpenCount,
  formatOpenOfTotal,
  formatProjectMeta,
} from "./plural";

describe("formatListCount", () => {
  it("uses the singular for exactly one", () => {
    expect(formatListCount(1)).toBe("1 Liste");
  });

  it("uses the plural for everything else", () => {
    expect(formatListCount(3)).toBe("3 Listen");
    expect(formatListCount(0)).toBe("0 Listen"); // German: "0 Listen", not "0 Liste"
  });
});

describe("formatMemberCount", () => {
  it("uses the singular for exactly one", () => {
    expect(formatMemberCount(1)).toBe("1 Mitglied");
  });

  it("uses the plural for everything else", () => {
    expect(formatMemberCount(4)).toBe("4 Mitglieder");
  });
});

describe("formatProjectMeta", () => {
  it("joins both counts with the design's middle dot", () => {
    expect(formatProjectMeta(3, 4)).toBe("3 Listen · 4 Mitglieder");
    expect(formatProjectMeta(1, 2)).toBe("1 Liste · 2 Mitglieder");
  });
});

describe("formatOpenCount", () => {
  it("renders the project-detail style open counter", () => {
    expect(formatOpenCount(5)).toBe("5 offen");
    expect(formatOpenCount(0)).toBe("0 offen");
  });
});

describe("formatOpenOfTotal", () => {
  it("renders the Weitermachen counter", () => {
    expect(formatOpenOfTotal(5, 8)).toBe("5 von 8 offen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/format/plural.test.ts`
Expected: FAIL — `Failed to resolve import "./plural"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/format/plural.ts`:

```ts
/**
 * German plural forms for the meta lines the design specifies.
 *
 * Why a module and not an inline ternary per screen: Home, Projekte and (later)
 * the drawer all print the same phrases. Centralising them means the wording is
 * changed once, and the singular/plural rule is covered by tests instead of by
 * five copies that drift apart.
 *
 * Only "exactly 1" takes the singular in German — 0 takes the plural
 * ("0 Listen"), which is the trap this module exists to get right.
 */

/** "1 Liste" / "3 Listen" — counts a project's ACTIVE lists. */
export function formatListCount(count: number): string {
  return `${count} ${count === 1 ? "Liste" : "Listen"}`;
}

/** "1 Mitglied" / "4 Mitglieder" — counts a project's memberships. */
export function formatMemberCount(count: number): string {
  return `${count} ${count === 1 ? "Mitglied" : "Mitglieder"}`;
}

/**
 * The project row's meta line, e.g. "3 Listen · 4 Mitglieder".
 * The separator is U+00B7 MIDDLE DOT surrounded by spaces — taken verbatim from
 * the handoff (screen 3d), not a hyphen and not a bullet.
 */
export function formatProjectMeta(listCount: number, memberCount: number): string {
  return `${formatListCount(listCount)} · ${formatMemberCount(memberCount)}`;
}

/** "5 offen" — the trailing meta on an active-list row (handoff screen 3e). */
export function formatOpenCount(open: number): string {
  return `${open} offen`;
}

/** "5 von 8 offen" — the Weitermachen card's counter (handoff screen 3c). */
export function formatOpenOfTotal(open: number, total: number): string {
  return `${open} von ${total} offen`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/format/plural.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/plural.ts src/lib/format/plural.test.ts
git commit -m "feat(format): German plural helpers for meta lines"
```

---

## Task 3: `PageHeader` and `ProgressBar` primitives

Four of the five screens in this slice share the same header bar (screens 3d, 3k and — without the hairline — 3c). Slice 11 will add the ☰ drawer trigger; building the header now with an open `leading` slot is what keeps that a one-line change instead of a re-layout. `ProgressBar` is the Weitermachen card's 5px track, kept separate because it is a generic, accessible primitive.

**Files:**
- Create: `src/components/ui/PageHeader.tsx`, `src/components/ui/PageHeader.module.css`
- Create: `src/components/ui/ProgressBar.tsx`, `src/components/ui/ProgressBar.module.css`
- Test: `src/components/ui/PageHeader.test.tsx`, `src/components/ui/ProgressBar.test.tsx`
- Modify: `src/app/dev/ui/Gallery.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PageHeader({ title, leading?, trailing?, hairline? }: { title: string; leading?: ReactNode; trailing?: ReactNode; hairline?: boolean })` — renders `<header>` containing an `<h1>`. `hairline` defaults to `true`.
  - `ProgressBar({ value, max, label }: { value: number; max: number; label: string })` — renders `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`/`aria-label`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/PageHeader.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as the page's level-1 heading", () => {
    render(<PageHeader title="Projekte" />);
    expect(screen.getByRole("heading", { level: 1, name: "Projekte" })).toBeInTheDocument();
  });

  it("renders the leading and trailing slots", () => {
    render(
      <PageHeader
        title="Verwaltung"
        leading={<span data-testid="leading" />}
        trailing={<span data-testid="trailing" />}
      />,
    );

    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByTestId("trailing")).toBeInTheDocument();
  });

  it("is a banner landmark so screen readers can jump to it", () => {
    render(<PageHeader title="Projekte" />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
```

Create `src/components/ui/ProgressBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("exposes value, bounds and an accessible name", () => {
    render(<ProgressBar value={3} max={8} label="3 von 8 erledigt" />);

    const bar = screen.getByRole("progressbar", { name: "3 von 8 erledigt" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
  });

  // A list with no entries at all must not divide by zero and must not render a
  // full bar — the Weitermachen card links to empty lists too.
  it("renders an empty bar when max is 0", () => {
    render(<ProgressBar value={0} max={0} label="Nichts erledigt" />);

    const bar = screen.getByRole("progressbar", { name: "Nichts erledigt" });
    expect(bar).toHaveAttribute("aria-valuemax", "0");
    expect(bar.querySelector("[data-testid='progress-fill']")).toHaveStyle({ width: "0%" });
  });

  it("clamps a value above max to a full bar", () => {
    render(<ProgressBar value={12} max={8} label="Alles erledigt" />);

    const fill = screen.getByRole("progressbar").querySelector("[data-testid='progress-fill']");
    expect(fill).toHaveStyle({ width: "100%" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx src/components/ui/ProgressBar.test.tsx`
Expected: FAIL — both imports unresolved.

- [ ] **Step 3: Write the implementations**

Create `src/components/ui/PageHeader.module.css`:

```css
/* Screen header bar. Measurements from the handoff (screens 3d/3k):
   padding 14px 16px 10px, 1px hairline, title 18px/700. */
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  /* The safe-area inset keeps the title clear of the iPhone notch; it collapses
     to 0px in every other context (see globals.css). */
  padding: calc(14px + var(--safe-top)) var(--screen-padding) 10px;
}

.hairline {
  border-bottom: 1px solid var(--color-hairline);
}

.title {
  flex: 1;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  /* Long project names must not push the trailing slot off screen. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 900px) {
  .header {
    padding-left: var(--screen-padding-desktop);
    padding-right: var(--screen-padding-desktop);
  }

  /* Desktop title is heavier and larger (handoff § Typografie). */
  .title {
    font-size: 21px;
    font-weight: 800;
  }
}
```

Create `src/components/ui/PageHeader.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

type PageHeaderProps = {
  /** The screen title — also the page's single <h1>. German, e.g. "Verwaltung". */
  title: string;
  /**
   * Slot before the title. Slice 14 leaves it empty; Slice 11 puts the ☰ drawer
   * trigger here, which is why the slot exists before there is anything to put in it.
   */
  leading?: ReactNode;
  /** Slot after the title, e.g. the ADMIN <Badge> on Verwaltung. */
  trailing?: ReactNode;
  /**
   * The 1px bottom rule. Screens with a hairline: Projekte, Verwaltung, Archiv.
   * Home has none (handoff screen 3c), so it opts out.
   */
  hairline?: boolean;
};

/**
 * The screen header bar shared by every top-level screen.
 *
 * Why a primitive: the design repeats exactly one header shape across screens,
 * and each screen needs the same safe-area padding, the same truncation rule and
 * the same single <h1>. Centralising it means Slice 11 adds the drawer trigger
 * in one place instead of five.
 *
 * Deliberately NOT a client component: it holds no state, so it renders inside
 * the Server Components that make up every screen in this slice.
 */
export function PageHeader({ title, leading, trailing, hairline = true }: PageHeaderProps) {
  // filter(Boolean) drops the empty slot so the class attribute stays clean
  // (same idiom as Button).
  const classes = [styles.header, hairline ? styles.hairline : ""].filter(Boolean).join(" ");

  return (
    // <header> gives the banner landmark for free — no explicit role needed.
    <header className={classes}>
      {leading}
      <h1 className={styles.title}>{title}</h1>
      {trailing}
    </header>
  );
}
```

Create `src/components/ui/ProgressBar.module.css`:

```css
/* Track + fill: 5px tall, radius 3px, accent on the weak hairline
   (handoff screen 3c). */
.track {
  height: 5px;
  border-radius: 3px;
  background: var(--color-hairline-weak);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 3px;
  background: var(--color-accent);
}
```

Create `src/components/ui/ProgressBar.tsx`:

```tsx
import styles from "./ProgressBar.module.css";

type ProgressBarProps = {
  /** How much is done. Clamped into [0, max] before rendering. */
  value: number;
  /** The total. May be 0 (an empty list) — the component must survive that. */
  max: number;
  /** German accessible name, e.g. "3 von 8 erledigt". Required: a bare bar says nothing. */
  label: string;
};

/**
 * The design's 5px progress track (Weitermachen card).
 *
 * Why it is its own primitive rather than two divs inside ContinueCard: it is
 * the only place in the app that has to be announced as a measurement, and the
 * ARIA wiring (role + the three value attributes) is exactly the kind of detail
 * that gets forgotten when it is inlined into a screen.
 *
 * The fill width is the one legitimate inline style in this codebase: it is a
 * computed value per render, which a CSS Module cannot express.
 */
export function ProgressBar({ value, max, label }: ProgressBarProps) {
  // Guard the two degenerate inputs: max === 0 would divide by zero, and a value
  // above max would overflow the track. Both are reachable (empty list, and a
  // stale count racing a poll), so they are handled, not asserted away.
  const ratio = max > 0 ? Math.min(Math.max(value, 0) / max, 1) : 0;

  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={styles.fill}
        data-testid="progress-fill"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx src/components/ui/ProgressBar.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Add both to the `/dev/ui` gallery**

In `src/app/dev/ui/Gallery.tsx`, add the imports alongside the existing ones (keep the list alphabetical):

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
```

and insert this block immediately before the `<SectionLabel>Chips</SectionLabel>` section:

```tsx
      <SectionLabel>Kopfzeile</SectionLabel>
      <PageHeader title="Verwaltung" trailing={<Badge>ADMIN</Badge>} />
      <PageHeader title="Smart Lists" hairline={false} />

      <SectionLabel>Fortschritt</SectionLabel>
      <ProgressBar value={3} max={8} label="3 von 8 erledigt" />
      <ProgressBar value={0} max={0} label="Nichts erledigt" />
      <ProgressBar value={8} max={8} label="Alles erledigt" />
```

- [ ] **Step 6: Run the full suite, lint and build**

Run: `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'`
Expected: PASS.

Run: `npm run lint`
Expected: only the pre-existing errors in `docs/design/2026-08-01-ui-handoff/support.js`; nothing under `src/`.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/PageHeader.tsx src/components/ui/PageHeader.module.css \
        src/components/ui/PageHeader.test.tsx \
        src/components/ui/ProgressBar.tsx src/components/ui/ProgressBar.module.css \
        src/components/ui/ProgressBar.test.tsx src/app/dev/ui/Gallery.tsx
git commit -m "feat(ui): PageHeader and ProgressBar primitives"
```

---

## Task 4: Login screen (`/login`)

Handoff screen `3a`. Centred column: 64px accent logo tile with a white check, "Smart Lists" 24px/800, "ANMELDUNG" 13px/600 letterspaced, the explanation sentence, and a white Google button with the **official** Google "G" (the handoff only hints at it with a colour wheel and explicitly says to use the real asset).

**Files:**
- Create: `src/app/login/GoogleLogo.tsx`
- Create: `src/app/login/page.module.css`
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `Icon` from `@/components/ui/Icon`.
- Produces: `GoogleLogo({ size }: { size?: number })` — an inline `<svg aria-hidden="true">` of the four-colour Google G. Not exported anywhere else.

- [ ] **Step 1: Create the Google logo asset**

Create `src/app/login/GoogleLogo.tsx`:

```tsx
/**
 * The official Google "G" as an inline SVG.
 *
 * Why inline and not a file in /public: it ships with the component that uses
 * it, so it cannot go missing, and it costs no extra request on the one screen
 * every user sees first.
 *
 * Why the exact paths and colours are reproduced verbatim: Google's branding
 * guidelines for "Sign in with Google" forbid recolouring or redrawing the mark.
 * The handoff notes this explicitly ("offizielles Branding-Asset verwenden").
 *
 * aria-hidden: the button's text already says "Mit Google anmelden", so the mark
 * is decoration — announcing it again would just be noise.
 */
export function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Write the styles**

Create `src/app/login/page.module.css`:

```css
/* Handoff screen 3a: a single centred column, no header, no chrome. */
.screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 32px horizontal per the design; the safe-area insets keep the column clear
     of the notch and the home indicator on an iPhone. */
  padding: calc(24px + var(--safe-top)) 32px calc(24px + var(--safe-bottom));
  text-align: center;
}

/* 64px tile, radius 18px, accent background, its own accent-tinted shadow. */
.logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--color-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(62, 99, 196, 0.25);
}

.wordmark {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
  margin-top: 18px;
}

.kicker {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.explanation {
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  margin-top: 22px;
  /* Keeps the sentence from stretching into an unreadable line on desktop. */
  max-width: 320px;
}

.form {
  width: 100%;
  max-width: 320px;
  margin-top: 26px;
}

/* The Google button is the one control in the app that is NOT a <Button>
   variant: Google's branding rules dictate its colours, border and label, so it
   cannot inherit the app's button weights. */
.googleButton {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border-strong);
  border-radius: 12px;
  /* 13px vertical + 15px line box clears the 44px minimum tap target. */
  padding: 13px 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
  cursor: pointer;
}

.googleButton:hover {
  background: var(--color-bg-frozen);
}
```

- [ ] **Step 3: Rewrite the page**

Replace `src/app/login/page.tsx` with:

```tsx
import { Check } from "lucide-react";
import { signIn } from "@/auth";
import { Icon } from "@/components/ui/Icon";
import { GoogleLogo } from "./GoogleLogo";
import styles from "./page.module.css";

// Server Component with a Server Action: the form posts to the server so Auth.js can start Google OAuth securely.
// Slice 14 restyles it to handoff screen 3a; the action itself is unchanged.
export default function LoginPage() {
  return (
    <main className={styles.screen}>
      {/* The logo tile is the app's mark: an accent square with a white check.
          aria-hidden because the wordmark right below already names the product. */}
      <div className={styles.logo} aria-hidden="true">
        <Icon icon={Check} size={30} />
      </div>
      <h1 className={styles.wordmark}>Smart Lists</h1>
      <p className={styles.kicker}>ANMELDUNG</p>
      <p className={styles.explanation}>
        Der Zugang ist geschlossen. Melde dich mit einem freigeschalteten Google-Konto an.
      </p>
      <form
        className={styles.form}
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        {/* A plain <button>, not the Button primitive: Google's branding rules own
            this control's colours and border (see page.module.css). */}
        <button type="submit" className={styles.googleButton}>
          <GoogleLogo />
          Mit Google anmelden
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Verify the build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed; no new `src/` lint errors.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open `http://localhost:3000/login` in a **private window** (no session).
Check, in order:
1. Accent tile 64px with a white check, wordmark "Smart Lists", kicker "ANMELDUNG".
2. The explanation sentence reads exactly `Der Zugang ist geschlossen. Melde dich mit einem freigeschalteten Google-Konto an.`
3. The Google button shows the real four-colour G (red/blue/yellow/green), white background, grey 1.5px border.
4. Everything is vertically centred; the browser console shows **no** hydration error.

- [ ] **Step 6: Commit**

```bash
git add src/app/login/
git commit -m "feat(ui): restyle login screen per handoff 3a"
```

---

## Task 5: "Zugang verweigert" screen (`/auth/error`)

Handoff screen `3b`. A friendly dead end, deliberately **not** styled as an error: lock glyph in a 56px neutral circle, 19px/800 title, explanation, accent back-link.

**Files:**
- Create: `src/app/auth/error/page.module.css`
- Modify: `src/app/auth/error/page.tsx`

**Interfaces:**
- Consumes: `Icon` from `@/components/ui/Icon`.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the styles**

Create `src/app/auth/error/page.module.css`:

```css
/* Handoff screen 3b. Same centred-column skeleton as login, wider gutters (36px). */
.screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(24px + var(--safe-top)) 36px calc(24px + var(--safe-bottom));
  text-align: center;
}

/* Neutral circle, NOT the destructive tint: being un-provisioned is not the
   user's mistake, so the screen must not shout at them (handoff § 3b). */
.glyph {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-hairline-weak);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.title {
  font-size: 19px;
  font-weight: 800;
  color: var(--color-text-primary);
  margin-top: 18px;
}

.explanation {
  font-size: 14px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  margin-top: 10px;
  max-width: 320px;
}

.back {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--color-accent);
  margin-top: 24px;
  /* Padding, not margin, so the tap target covers the full 44px height. */
  padding: 12px 8px;
}
```

- [ ] **Step 2: Rewrite the page**

Replace `src/app/auth/error/page.tsx` with:

```tsx
import Link from "next/link";
import { Lock } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import styles from "./page.module.css";

// Auth.js redirects rejected logins here when the signIn callback denies access.
// Slice 14 restyles it to handoff screen 3b: a friendly dead end, not an error page.
export default function AuthErrorPage() {
  return (
    <main className={styles.screen}>
      <div className={styles.glyph} aria-hidden="true">
        <Icon icon={Lock} size={24} />
      </div>
      <h1 className={styles.title}>Zugang nicht freigeschaltet</h1>
      <p className={styles.explanation}>
        Dieses Google-Konto ist noch nicht freigeschaltet. Ein Administrator muss deine
        E-Mail-Adresse zuerst einladen.
      </p>
      {/* The arrow is part of the label, exactly as in the design. */}
      <Link href="/login" className={styles.back}>
        ← Zurück zur Anmeldung
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Verify the build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Verify in the browser**

Open `http://localhost:3000/auth/error`.
Check:
1. Grey 56px circle with a lock icon — **no red anywhere**.
2. Title `Zugang nicht freigeschaltet`, explanation text matches the design verbatim.
3. `← Zurück zur Anmeldung` is accent-coloured and navigates to `/login`.

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/error/
git commit -m "feat(ui): restyle access-denied screen per handoff 3b"
```

---

## Task 6: `listProjectSummaries` read function

Both Home and Projekte need per-project meta the current `listProjectsForUser` does not carry: the number of **active** lists, the number of members, and **the caller's own role** (which drives the OWNER badge). One read function serves both screens.

**Files:**
- Create: `src/lib/projects/summaries.ts`
- Test: `src/lib/projects/summaries.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, the `Role` enum from `@prisma/client`.
- Produces:
  ```ts
  export interface ProjectSummary {
    id: string;
    name: string;
    activeListCount: number;
    memberCount: number;
    role: Role; // "owner" | "member" — the CALLER's role in this project
  }
  export function listProjectSummaries(db: PrismaClient, userId: string): Promise<ProjectSummary[]>
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/summaries.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "./projects";
import { listProjectSummaries } from "./summaries";

const db = new PrismaClient();
let ownerId: string;
let memberId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const member = await db.user.create({
    data: { googleSub: "g-member", email: "member@example.com" },
  });
  ownerId = owner.id;
  memberId = member.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("listProjectSummaries", () => {
  it("returns an empty array for a user without projects", async () => {
    expect(await listProjectSummaries(db, ownerId)).toEqual([]);
  });

  it("counts members and reports the caller's own role", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId });
    await db.membership.create({ data: { projectId: project.id, userId: memberId, role: "member" } });

    const [forOwner] = await listProjectSummaries(db, ownerId);
    expect(forOwner.name).toBe("Haushalt");
    expect(forOwner.memberCount).toBe(2);
    expect(forOwner.role).toBe("owner");

    // The SAME project seen by the member reports "member" — the role is the
    // caller's, not the project's, which is what drives the OWNER badge.
    const [forMember] = await listProjectSummaries(db, memberId);
    expect(forMember.role).toBe("member");
  });

  it("counts only ACTIVE lists, never archived ones", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId });
    await db.list.create({ data: { projectId: project.id, name: "Einkauf" } });
    await db.list.create({ data: { projectId: project.id, name: "Wochenende" } });
    await db.list.create({
      data: {
        projectId: project.id,
        name: "Erledigt",
        status: "completed",
        completedAt: new Date(),
      },
    });

    const [summary] = await listProjectSummaries(db, ownerId);
    expect(summary.activeListCount).toBe(2);
  });

  it("excludes projects the user is not a member of", async () => {
    await createProject(db, { name: "Fremd", ownerId });
    expect(await listProjectSummaries(db, memberId)).toEqual([]);
  });

  it("orders oldest first, matching listProjectsForUser", async () => {
    await createProject(db, { name: "Zuerst", ownerId });
    await createProject(db, { name: "Danach", ownerId });

    const summaries = await listProjectSummaries(db, ownerId);
    expect(summaries.map((s) => s.name)).toEqual(["Zuerst", "Danach"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/projects/summaries.test.ts`
Expected: FAIL — `Failed to resolve import "./summaries"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/projects/summaries.ts`:

```ts
import type { PrismaClient, Role } from "@prisma/client";

/**
 * A project row as the Home and Projekte screens render it: the project plus the
 * two counts in its meta line and the caller's own role.
 *
 * Why the role is part of the summary and not looked up separately: the OWNER
 * badge is per-viewer, and fetching it in a second round-trip per row would turn
 * one query into N+1.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  /** ACTIVE lists only — the archive is a separate screen and must not inflate this. */
  activeListCount: number;
  memberCount: number;
  /** The CALLER's role in this project, not the project's owner. */
  role: Role;
}

/**
 * All projects the user belongs to, each with the meta the design's row cards show
 * ("3 Listen · 4 Mitglieder" + the OWNER badge).
 *
 * Why a separate function instead of extending listProjectsForUser: that function
 * returns plain `Project` rows and is used by the REST layer, where the counts
 * would be dead weight. This one is a UI read model — a different shape for a
 * different consumer.
 *
 * Ordering is `createdAt: "asc"`, identical to listProjectsForUser, so the two
 * screens never disagree about the order of the same projects.
 */
export async function listProjectSummaries(
  db: PrismaClient,
  userId: string,
): Promise<ProjectSummary[]> {
  const rows = await db.project.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      // Filtered relation counts (GA since Prisma 5): the DB does the counting,
      // so no list or membership rows travel over the wire.
      _count: {
        select: {
          memberships: true,
          lists: { where: { status: "active" } },
        },
      },
      // Exactly the caller's membership row. The compound unique (projectId,
      // userId) guarantees at most one, and the outer `where` guarantees at
      // least one — so [0] is always present.
      memberships: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    activeListCount: row._count.lists,
    memberCount: row._count.memberships,
    role: row.memberships[0].role,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/projects/summaries.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/summaries.ts src/lib/projects/summaries.test.ts
git commit -m "feat(projects): listProjectSummaries read model for the row cards"
```

---

## Task 7: `getContinueList` — the Weitermachen read function

The one **new capability** in this slice: the user's most recently touched open list, across all their projects. `List` has no `updatedAt` column (see `prisma/schema.prisma`), and adding one would mean a migration plus write-path changes in every list operation — so "touched" is derived from what the app already records: the newest `ListItem.updatedAt` in the list, falling back to `List.createdAt` for a list nobody has typed into yet. The ranking is a **pure function** so the recency rule is tested without a database.

**Files:**
- Create: `src/lib/lists/continue.ts`
- Test: `src/lib/lists/continue.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`.
- Produces:
  ```ts
  export interface TouchableList { id: string; createdAt: Date; items: { updatedAt: Date }[] }
  export function lastTouchedAt(list: TouchableList): Date
  export function pickContinueList<T extends TouchableList>(lists: T[]): T | null

  export interface ContinueCardData {
    listId: string;
    listName: string;
    projectId: string;
    projectName: string;
    openCount: number;
    totalCount: number;
  }
  export function getContinueList(db: PrismaClient, userId: string): Promise<ContinueCardData | null>
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/continue.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "@/lib/projects/projects";
import { getContinueList, lastTouchedAt, pickContinueList } from "./continue";

const db = new PrismaClient();
let userId: string;
let strangerId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const stranger = await db.user.create({ data: { googleSub: "g-s", email: "s@example.com" } });
  userId = user.id;
  strangerId = stranger.id;
});

afterAll(async () => {
  await db.$disconnect();
});

// --- The pure ranking rule ---------------------------------------------------

describe("lastTouchedAt", () => {
  it("is the newest item's updatedAt", () => {
    const touched = lastTouchedAt({
      id: "a",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [
        { updatedAt: new Date("2026-02-01T00:00:00Z") },
        { updatedAt: new Date("2026-03-01T00:00:00Z") },
      ],
    });
    expect(touched.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("falls back to the list's own createdAt when it has no items", () => {
    const touched = lastTouchedAt({
      id: "a",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [],
    });
    expect(touched.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("never returns a time earlier than the list's creation", () => {
    // Defensive: a freshly created list whose only item predates it cannot happen
    // through the app, but the rule must still be monotonic.
    const touched = lastTouchedAt({
      id: "a",
      createdAt: new Date("2026-05-01T00:00:00Z"),
      items: [{ updatedAt: new Date("2026-01-01T00:00:00Z") }],
    });
    expect(touched.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("pickContinueList", () => {
  it("returns null for no lists", () => {
    expect(pickContinueList([])).toBeNull();
  });

  it("picks the most recently touched list", () => {
    const older = {
      id: "older",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [{ updatedAt: new Date("2026-02-01T00:00:00Z") }],
    };
    const newer = {
      id: "newer",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [{ updatedAt: new Date("2026-04-01T00:00:00Z") }],
    };
    expect(pickContinueList([older, newer])?.id).toBe("newer");
    // Order of the input must not matter.
    expect(pickContinueList([newer, older])?.id).toBe("newer");
  });

  it("breaks a tie by the later createdAt so the result is deterministic", () => {
    const a = { id: "a", createdAt: new Date("2026-01-01T00:00:00Z"), items: [] };
    const b = { id: "b", createdAt: new Date("2026-01-02T00:00:00Z"), items: [] };
    expect(pickContinueList([a, b])?.id).toBe("b");
    expect(pickContinueList([b, a])?.id).toBe("b");
  });
});

// --- The DB read -------------------------------------------------------------

describe("getContinueList", () => {
  it("returns null when the user has no projects", async () => {
    expect(await getContinueList(db, userId)).toBeNull();
  });

  it("returns null when every list is completed", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId: userId });
    await db.list.create({
      data: {
        projectId: project.id,
        name: "Erledigt",
        status: "completed",
        completedAt: new Date(),
      },
    });
    expect(await getContinueList(db, userId)).toBeNull();
  });

  it("returns the list with its project name and open/total counts", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId: userId });
    const list = await db.list.create({ data: { projectId: project.id, name: "Einkauf Samstag" } });
    const article = await db.catalogItem.create({
      data: { projectId: project.id, name: "Milch", normalizedName: "milch" },
    });
    // Three entries, one of them already checked -> 2 open of 3.
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: article.id, sortIndex: 0, checked: true },
    });
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: article.id, sortIndex: 1 },
    });
    await db.listItem.create({
      data: { listId: list.id, catalogItemId: article.id, sortIndex: 2 },
    });

    const card = await getContinueList(db, userId);
    expect(card).toEqual({
      listId: list.id,
      listName: "Einkauf Samstag",
      projectId: project.id,
      projectName: "Haushalt",
      openCount: 2,
      totalCount: 3,
    });
  });

  it("ignores lists in projects the user is not a member of", async () => {
    const foreign = await createProject(db, { name: "Fremd", ownerId: strangerId });
    await db.list.create({ data: { projectId: foreign.id, name: "Geheim" } });
    expect(await getContinueList(db, userId)).toBeNull();
  });

  it("spans projects: the most recently touched list wins regardless of project", async () => {
    const a = await createProject(db, { name: "A", ownerId: userId });
    const b = await createProject(db, { name: "B", ownerId: userId });
    // Created in this order, so B's list is the newer one by createdAt.
    await db.list.create({ data: { projectId: a.id, name: "Alt" } });
    const newer = await db.list.create({ data: { projectId: b.id, name: "Neu" } });

    const card = await getContinueList(db, userId);
    expect(card?.listId).toBe(newer.id);
    expect(card?.projectName).toBe("B");
  });

  it("handles a list with no entries at all", async () => {
    const project = await createProject(db, { name: "Haushalt", ownerId: userId });
    const list = await db.list.create({ data: { projectId: project.id, name: "Leer" } });

    const card = await getContinueList(db, userId);
    expect(card).toEqual({
      listId: list.id,
      listName: "Leer",
      projectId: project.id,
      projectName: "Haushalt",
      openCount: 0,
      totalCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/lists/continue.test.ts`
Expected: FAIL — `Failed to resolve import "./continue"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/lists/continue.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

/**
 * The minimum a list has to expose for the recency rule. Kept structural (not a
 * Prisma type) so the ranking can be tested with plain objects and no database.
 */
export interface TouchableList {
  id: string;
  createdAt: Date;
  items: { updatedAt: Date }[];
}

/**
 * When a list was last touched.
 *
 * Why derived and not stored: `List` has no updatedAt column. Adding one would
 * mean a migration plus a write in every entry operation — for a comfort feature.
 * `ListItem.updatedAt` already exists (Prisma bumps it on every update; it is the
 * last-writer-wins timestamp and Slice 7's sync cursor), so the newest item
 * timestamp IS the list's activity.
 *
 * The fallback to `createdAt` covers a list nobody has typed into yet, and the
 * Math.max keeps the rule monotonic: a list can never report activity from
 * before it existed.
 */
export function lastTouchedAt(list: TouchableList): Date {
  const newestItem = list.items.reduce(
    (max, item) => (item.updatedAt > max ? item.updatedAt : max),
    // Seeding the reduce with createdAt is what makes the empty-items case and
    // the monotonicity rule the same line of code.
    list.createdAt,
  );
  return newestItem;
}

/**
 * The single list the Weitermachen card points at: the most recently touched one.
 *
 * Ties are broken by the later `createdAt` so the result is deterministic — two
 * lists created in the same millisecond with no entries would otherwise depend on
 * the database's row order, and a card that flickers between two lists on reload
 * is worse than either choice.
 */
export function pickContinueList<T extends TouchableList>(lists: T[]): T | null {
  return lists.reduce<T | null>((best, candidate) => {
    if (best === null) return candidate;

    const bestTouched = lastTouchedAt(best).getTime();
    const candidateTouched = lastTouchedAt(candidate).getTime();

    if (candidateTouched > bestTouched) return candidate;
    if (candidateTouched < bestTouched) return best;
    // Tie on activity -> the younger list wins.
    return candidate.createdAt > best.createdAt ? candidate : best;
  }, null);
}

/** Everything the Home hero card renders. `null` means: render nothing. */
export interface ContinueCardData {
  listId: string;
  listName: string;
  projectId: string;
  projectName: string;
  /** Unchecked entries — the "5" in "5 von 8 offen". */
  openCount: number;
  /** All entries — the "8". May be 0 for a brand-new list. */
  totalCount: number;
}

/**
 * The user's most recently touched OPEN list across all their projects.
 *
 * This is the first genuinely cross-project read in the app: every other read is
 * scoped to one project after a membership check. Access control is therefore
 * baked into the query itself — `project: { memberships: { some: { userId } } }`
 * is the same membership predicate `listProjectsForUser` uses, so a list can only
 * surface here if the caller may already see it.
 *
 * Completed lists are excluded: "Weitermachen" means resume, and an archived list
 * has nothing to resume.
 */
export async function getContinueList(
  db: PrismaClient,
  userId: string,
): Promise<ContinueCardData | null> {
  const lists = await db.list.findMany({
    where: {
      status: "active",
      project: { memberships: { some: { userId } } },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      // Only the two fields the ranking and the counter need — not the whole
      // entry, and explicitly not the catalog item.
      items: { select: { updatedAt: true, checked: true } },
    },
  });

  const winner = pickContinueList(lists);
  if (winner === null) return null;

  return {
    listId: winner.id,
    listName: winner.name,
    projectId: winner.project.id,
    projectName: winner.project.name,
    openCount: winner.items.filter((item) => !item.checked).length,
    totalCount: winner.items.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/lists/continue.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/continue.ts src/lib/lists/continue.test.ts
git commit -m "feat(lists): getContinueList — most recently touched open list across projects"
```

---

## Task 8: The `ContinueCard` component

The Home hero card from handoff screen `3c`: list name 16px/700, chevron, `"Haushalt · 5 von 8 offen"`, and the progress bar. It is a whole-card link, so — like `RowLink` — its content must contain no interactive elements.

**Files:**
- Create: `src/app/ContinueCard.tsx`, `src/app/ContinueCard.module.css`
- Test: `src/app/ContinueCard.test.tsx`

**Interfaces:**
- Consumes: `ContinueCardData` (Task 7), `formatOpenOfTotal` (Task 2), `ProgressBar` (Task 3).
- Produces: `ContinueCard({ data }: { data: ContinueCardData })` — a `<Link>` to `/lists/<listId>`.

- [ ] **Step 1: Write the failing test**

Create `src/app/ContinueCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContinueCard } from "./ContinueCard";

const data = {
  listId: "list-1",
  listName: "Einkauf Samstag",
  projectId: "project-1",
  projectName: "Haushalt",
  openCount: 5,
  totalCount: 8,
};

describe("ContinueCard", () => {
  it("links to the list", () => {
    render(<ContinueCard data={data} />);

    const link = screen.getByRole("link", { name: /Einkauf Samstag/ });
    expect(link).toHaveAttribute("href", "/lists/list-1");
  });

  it("shows the project and the open counter", () => {
    render(<ContinueCard data={data} />);
    expect(screen.getByText("Haushalt · 5 von 8 offen")).toBeInTheDocument();
  });

  it("exposes progress as done-of-total, not open-of-total", () => {
    render(<ContinueCard data={data} />);

    // 5 of 8 are OPEN, so 3 of 8 are done — the bar fills with what is finished.
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
  });

  it("survives an empty list", () => {
    render(<ContinueCard data={{ ...data, openCount: 0, totalCount: 0 }} />);

    expect(screen.getByText("Haushalt · 0 von 0 offen")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/ContinueCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./ContinueCard"`.

- [ ] **Step 3: Write the styles**

Create `src/app/ContinueCard.module.css`:

```css
/* Handoff screen 3c: white card, 14px radius, hairline border, card shadow. */
.card {
  display: block;
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-panel);
  padding: 14px;
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.name {
  flex: 1;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  color: var(--color-control-border);
  /* align-items:baseline would otherwise drop the icon below the text baseline. */
  align-self: center;
}

/* .meta and .progress are <span>s inside the <a> (a <div> there would be invalid
   HTML), so they need display:block to stack. */
.meta {
  display: block;
  font-size: 12.5px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.progress {
  display: block;
  margin-top: 10px;
}
```

- [ ] **Step 4: Write the component**

Create `src/app/ContinueCard.tsx`:

```tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ContinueCardData } from "@/lib/lists/continue";
import { formatOpenOfTotal } from "@/lib/format/plural";
import styles from "./ContinueCard.module.css";

/**
 * The Home screen's "WEITERMACHEN" hero card: one tap back into the list the
 * user last worked on.
 *
 * Why it is not a <RowLink>: RowLink is a single-line row with a meta line, and
 * this card additionally carries a progress bar and uses a larger title weight.
 * Forcing it into RowLink would mean adding a slot nothing else uses.
 *
 * Co-located with page.tsx rather than living in components/ui because it is a
 * screen composition, not a reusable primitive (same precedent as
 * lists/[listId]/ListSyncPoller.tsx).
 *
 * Like RowLink, the whole card is one <a>, so nothing inside may be interactive.
 */
export function ContinueCard({ data }: { data: ContinueCardData }) {
  // The bar fills with what is DONE, while the label counts what is OPEN — the
  // design shows a partially filled bar next to "5 von 8 offen", so the two read
  // as complementary rather than contradictory.
  const doneCount = data.totalCount - data.openCount;

  return (
    <Link href={`/lists/${data.listId}`} className={styles.card}>
      <span className={styles.head}>
        <span className={styles.name}>{data.listName}</span>
        <Icon icon={ChevronRight} size={16} className={styles.chevron} />
      </span>
      {/* "Haushalt · 5 von 8 offen" — project first, exactly as in handoff 3c. */}
      <span className={styles.meta}>
        {data.projectName} · {formatOpenOfTotal(data.openCount, data.totalCount)}
      </span>
      <span className={styles.progress}>
        <ProgressBar
          value={doneCount}
          max={data.totalCount}
          label={`${doneCount} von ${data.totalCount} erledigt`}
        />
      </span>
    </Link>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/ContinueCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/ContinueCard.tsx src/app/ContinueCard.module.css src/app/ContinueCard.test.tsx
git commit -m "feat(ui): Weitermachen card for the home screen"
```

---

## Task 9: Home screen (`/`)

Handoff screen `3c`: title row with the signed-in email, `WEITERMACHEN` section (only when there is something to continue), `PROJEKTE` section of row cards, and the two footer actions — `Verwaltung` (admin only) and `Abmelden`.

**Files:**
- Create: `src/app/page.module.css`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getContinueList`, `listProjectSummaries`, `ContinueCard`, `PageHeader`, `RowLink`, `Avatar`, `SectionLabel`, `Button`, `formatListCount`.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the styles**

Create `src/app/page.module.css`:

```css
/* Handoff screen 3c. The header has no hairline here, and carries the signed-in
   email as a muted trailing slot. */
.email {
  font-size: 11.5px;
  color: var(--color-text-muted);
  /* Long addresses must shrink rather than push the title. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px var(--screen-padding) calc(18px + var(--safe-bottom));
}

/* The design puts extra air above every section label except the first. */
.spaced {
  margin-top: 6px;
}

/* Trailing list count on a project row: 12px muted (handoff 3c). */
.rowCount {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 2px 0;
}

.footerSpacer {
  flex: 1;
}

/* Footer "Verwaltung" — 13px/600 secondary, per handoff 3c. Padding, not margin,
   so the tap target reaches 44px. */
.adminLink {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 12px 2px;
}

@media (min-width: 900px) {
  .content {
    padding-left: var(--screen-padding-desktop);
    padding-right: var(--screen-padding-desktop);
    max-width: calc(var(--content-max-width) + 2 * var(--screen-padding-desktop));
  }
}
```

- [ ] **Step 2: Rewrite the page**

Replace `src/app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getContinueList } from "@/lib/lists/continue";
import { listProjectSummaries } from "@/lib/projects/summaries";
import { formatListCount } from "@/lib/format/plural";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowLink } from "@/components/ui/RowLink";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ContinueCard } from "./ContinueCard";
import styles from "./page.module.css";

// Middleware is the first protection layer; this explicit check keeps the page safe if middleware behavior changes.
// Slice 14 restyles it to handoff screen 3c and adds the "Weitermachen" card.
export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  // Two independent reads -> Promise.all, so the page costs one round-trip's
  // latency instead of two. Neither depends on the other's result.
  const [continueCard, projects] = await Promise.all([
    getContinueList(prisma, userId),
    listProjectSummaries(prisma, userId),
  ]);

  return (
    <>
      {/* No hairline on Home (handoff 3c) — the sections carry the structure. */}
      <PageHeader
        title="Smart Lists"
        hairline={false}
        trailing={<span className={styles.email}>{session.user.email}</span>}
      />
      <main className={styles.content}>
        {/* The section is omitted entirely when there is no open list — an empty
            "WEITERMACHEN" heading would be a promise the screen cannot keep. */}
        {continueCard && (
          <>
            <SectionLabel>WEITERMACHEN</SectionLabel>
            <ContinueCard data={continueCard} />
          </>
        )}

        <div className={continueCard ? styles.spaced : undefined}>
          <SectionLabel>PROJEKTE</SectionLabel>
        </div>
        {projects.map((project) => (
          <RowLink
            key={project.id}
            href={`/projects/${project.id}`}
            title={project.name}
            leading={<Avatar name={project.name} size={28} />}
            // Home shows only the list count; the member count is the Projekte
            // screen's job (handoff 3c vs. 3d).
            trailing={
              <span className={styles.rowCount}>{formatListCount(project.activeListCount)}</span>
            }
          />
        ))}

        <div className={styles.footer}>
          {/* Slice 9: the entry point to /admin. The session flag is good enough to decide
              VISIBILITY; authorization is the page's own job (requireAdmin reads the flag
              live from the DB, so a stale token gets redirected). */}
          {session.user.isAdmin && (
            <Link href="/admin" className={styles.adminLink}>
              Verwaltung
            </Link>
          )}
          <span className={styles.footerSpacer} />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="text">
              Abmelden
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Verify the build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Verify in the browser**

Sign in, open `http://localhost:3000/`.
Check:
1. Header shows "Smart Lists" with your email on the right, **no** bottom hairline.
2. With at least one active list containing entries: a `WEITERMACHEN` label and a card showing `<Listenname>` / `<Projekt> · N von M offen` / a partially filled accent bar. Tapping it opens `/lists/<id>`.
3. With **no** active list anywhere: the `WEITERMACHEN` section is absent entirely (not an empty heading).
4. `PROJEKTE` label, then one row card per project: 28px avatar with the initial, name, `3 Listen` on the right, chevron.
5. `Verwaltung` bottom-left only when signed in as an admin; `Abmelden` bottom-right, and it signs you out to `/login`.
6. Browser console: **no** hydration error.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.module.css
git commit -m "feat(ui): restyle home screen with Weitermachen card per handoff 3c"
```

---

## Task 10: Projekte screen (`/projects`)

Handoff screen `3d` plus empty state `5a`. Row cards with a 30px avatar, `"3 Listen · 4 Mitglieder"`, an OWNER badge on projects the viewer owns, and the create row (`Projektname` input + accent `Anlegen` button). With no projects, the create row moves into the centred empty state.

**Files:**
- Create: `src/app/projects/page.module.css`
- Modify: `src/app/projects/page.tsx`

**Interfaces:**
- Consumes: `listProjectSummaries`, `formatProjectMeta`, `PageHeader`, `RowLink`, `Avatar`, `Badge`, `TextField`, `Button`, `EmptyState`.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the styles**

Create `src/app/projects/page.module.css`:

```css
/* Handoff screen 3d. */
.content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px var(--screen-padding) calc(18px + var(--safe-bottom));
}

/* The create row: input grows, button hugs its label (handoff 3d + 5a). */
.createRow {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 6px;
}

.createField {
  flex: 1;
}

/* The empty state owns the vertical centre of the screen, and the create row
   sits directly under its copy (handoff § Empty States: "direkt darunter die Aktion"). */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

@media (min-width: 900px) {
  .content {
    padding-left: var(--screen-padding-desktop);
    padding-right: var(--screen-padding-desktop);
    max-width: calc(var(--content-max-width) + 2 * var(--screen-padding-desktop));
  }
}
```

- [ ] **Step 2: Rewrite the page**

Replace `src/app/projects/page.tsx` with:

```tsx
import { revalidatePath } from "next/cache";
import { FolderPlus } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/projects/projects";
import { listProjectSummaries } from "@/lib/projects/summaries";
import { formatProjectMeta } from "@/lib/format/plural";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowLink } from "@/components/ui/RowLink";
import { TextField } from "@/components/ui/TextField";
import styles from "./page.module.css";

// Server Component: runs entirely on the server, so it can read the session and
// call the DB core functions directly — no HTTP round-trip, no client-exposed secrets.
// Slice 14 restyles it to handoff screen 3d (empty state 5a) and swaps the plain
// project list for the summary read model that carries the meta line and the role.
export default async function ProjectsPage() {
  const session = await auth();
  // middleware.ts guarantees an authenticated session on this route, so user.id is always present.
  const userId = session!.user.id;

  // The summary read model (Slice 14) instead of listProjectsForUser: the design's
  // row cards need the two counts and the viewer's own role for the OWNER badge.
  const projects = await listProjectSummaries(prisma, userId);

  // Server Action: the <form action={create}> posts here on the server.
  // No client-side JS is required — Next.js progressive enhancement handles the form.
  // "use server" marks this function as a Server Action; Next.js serializes it and registers an endpoint.
  async function create(formData: FormData) {
    "use server";
    // Re-derive identity inside the action (defense in depth: never trust component-level state in actions,
    // because actions can be called from anywhere once registered).
    const s = await auth();
    const uid = s?.user?.id;
    if (!uid) return; // Should not happen behind middleware, but guard anyway.

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions silently.

    // Delegate to the same core function used by POST /api/projects — consistent business logic.
    await createProject(prisma, { name, ownerId: uid });

    // Tell Next.js to re-render this route's server component so the new project appears in the list.
    revalidatePath("/projects");
  }

  // The create row appears twice — inside the empty state and under the list — so
  // it is built once here rather than duplicated in both branches.
  const createRow = (
    <form action={create} className={styles.createRow}>
      <div className={styles.createField}>
        <TextField name="name" placeholder="Projektname" aria-label="Projektname" />
      </div>
      <Button type="submit">Anlegen</Button>
    </form>
  );

  return (
    <>
      <PageHeader title="Projekte" />
      <main className={styles.content}>
        {projects.length === 0 ? (
          // Empty state 5a. The action sits directly beneath the copy, which is the
          // shared empty-state pattern from the handoff.
          <div className={styles.empty}>
            <EmptyState
              icon={<Icon icon={FolderPlus} size={24} />}
              title="Noch kein Projekt"
              description="Ein Projekt bündelt Listen, Katalog und Favoriten — z. B. „Haushalt“."
            >
              {createRow}
            </EmptyState>
          </div>
        ) : (
          <>
            {projects.map((project) => (
              <RowLink
                key={project.id}
                href={`/projects/${project.id}`}
                title={project.name}
                meta={formatProjectMeta(project.activeListCount, project.memberCount)}
                leading={<Avatar name={project.name} />}
                // The badge marks the viewer's OWN ownership, which is why the role
                // comes from the summary (per-viewer) and not from project.ownerId.
                trailing={project.role === "owner" ? <Badge>OWNER</Badge> : undefined}
              />
            ))}
            {createRow}
          </>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 3: Verify the build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed.

(`EmptyState` already renders `{children}` inside its `.action` wrapper — no change needed there.)

- [ ] **Step 4: Verify in the browser**

Open `http://localhost:3000/projects`.
Check:
1. Header "Projekte" **with** a bottom hairline.
2. Each row: 30px rounded-square avatar with the initial, name 15px/700, meta `3 Listen · 4 Mitglieder`, `OWNER` pill only on projects you own, chevron on the right.
3. The create row sits below the list: bordered input with placeholder `Projektname` + a filled accent `Anlegen` button. Typing a name and submitting adds a row without a full reload flash.
4. Sign in as a user with **no** projects (or temporarily rename the query): the centred empty state shows `Noch kein Projekt`, the sentence, and the create row directly beneath.
5. Console: **no** hydration error.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/page.tsx src/app/projects/page.module.css
git commit -m "feat(ui): restyle projects screen per handoff 3d/5a"
```

---

## Task 11: Verwaltung main view (`/admin`)

Handoff screen `3k`. The `<table>` becomes a `Card` of rows: email (+ `(du)`), a status/meta sub-line, an accent `Admin gewähren/entziehen` action and a destructive `Zugang entziehen` link. Below it the `E-MAIL EINLADEN` block. The `?revoke=` branch is left untouched in this task — Task 12 turns it into the sheet.

**Files:**
- Create: `src/app/admin/page.module.css`
- Modify: `src/app/admin/page.tsx` (the main view only — everything from the `// --- Main view` banner down, plus the imports)

**Interfaces:**
- Consumes: `listAccessEntries`, the existing `inviteAction` / `setAdminAction` Server Actions, `PageHeader`, `Card`, `SectionLabel`, `Badge`, `Banner`, `TextField`, `Button`.
- Produces: `src/app/admin/page.module.css` and the restyled main view that Task 12 mounts the sheet onto.

- [ ] **Step 1: Write the styles**

Create `src/app/admin/page.module.css`:

```css
/* Handoff screen 3k. */
.content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px var(--screen-padding) calc(18px + var(--safe-bottom));
}

.spaced {
  margin-top: 4px;
}

/* One allowlist entry. The Card owns the outer border/radius, so rows only carry
   the divider — and the last row must not draw one. */
.entry {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-hairline-weak);
}

.entry:last-child {
  border-bottom: none;
}

.entryTop,
.entryBottom {
  display: flex;
  align-items: center;
  gap: 8px;
}

.entryBottom {
  margin-top: 1px;
}

.email {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

/* "(du)" is a lighter aside inside the email line. */
.self {
  font-weight: 400;
  color: var(--color-text-muted);
}

.status {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-muted);
}

.adminState {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

/* The two row actions are buttons inside forms/links, sized as text actions:
   12px/600, never filled — filled buttons in list rows are forbidden by the
   handoff's destructive-action pattern. */
.rowAction {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-accent);
  background: none;
  border: none;
  padding: 6px 2px;
  cursor: pointer;
  white-space: nowrap;
}

.rowActionDanger {
  composes: rowAction;
  color: var(--color-danger);
}

.inviteRow {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.inviteField {
  flex: 1;
}

.hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-muted);
}

@media (min-width: 900px) {
  .content {
    padding-left: var(--screen-padding-desktop);
    padding-right: var(--screen-padding-desktop);
    max-width: calc(var(--content-max-width) + 2 * var(--screen-padding-desktop));
  }
}
```

- [ ] **Step 2: Leave the `?revoke=` branch alone**

Do **not** touch the `if (revokeParam) { … }` block in this task. It stays working but unstyled, so the revoke flow keeps functioning between this commit and Task 12 — which is the task that dismantles the branch and replaces it with the sheet.

- [ ] **Step 3: Rewrite the main view's return block**

Replace everything from `return (` at the start of the main view (immediately after the `const stillOwned = ...` line) to the end of the component with:

```tsx
  return (
    <>
      <PageHeader title="Verwaltung" trailing={<Badge>ADMIN</Badge>} />
      <main className={styles.content}>
        {/* Shown once, right after an exclusion that skipped owner projects: the one
            genuinely surprising outcome of that flow (Slice 9). */}
        {stillOwned.length > 0 && (
          <Banner tone="info">
            Die Person besitzt weiterhin{" "}
            {stillOwned.map((p) => `„${p.name}“`).join(", ")} und hat dort weiter Zugriff. Löse das,
            indem du das Projekt löschst oder es jemand anderem überträgst.
          </Banner>
        )}

        <SectionLabel>ZUGANG</SectionLabel>
        <Card>
          {entries.map((entry) => {
            // The caller's own row renders without buttons. This is UI courtesy only — the
            // invariants that actually prevent a lockout live in the domain layer (design §6).
            const isSelf = entry.user?.id === callerId;
            // No User row means: invited, but never signed in (JIT provisioning, Slice 1).
            // displayName is nullable even for a real user, hence the second fallback.
            const status = entry.user
              ? (entry.user.displayName ?? "Angemeldet")
              : "Noch nie angemeldet";

            return (
              <div key={entry.email} className={styles.entry}>
                <div className={styles.entryTop}>
                  <span className={styles.email}>
                    {entry.email}
                    {isSelf && <span className={styles.self}> (du)</span>}
                  </span>
                  {/* Admin rights live on User, not on the allowlist email — there is
                      nothing to flag before that person's first login. */}
                  {entry.user && !isSelf && (
                    <form action={setAdminAction}>
                      <input type="hidden" name="userId" value={entry.user.id} />
                      {/* The form sends the TARGET state, not a toggle, so a stale page cannot
                          flip the flag to the opposite of what the admin saw and clicked. */}
                      <input
                        type="hidden"
                        name="isAdmin"
                        value={entry.user.isAdmin ? "false" : "true"}
                      />
                      <button type="submit" className={styles.rowAction}>
                        {entry.user.isAdmin ? "Admin entziehen" : "Admin gewähren"}
                      </button>
                    </form>
                  )}
                  {isSelf && (
                    <span className={styles.adminState}>
                      Admin: {entry.user?.isAdmin ? "Ja" : "Nein"}
                    </span>
                  )}
                </div>
                <div className={styles.entryBottom}>
                  <span className={styles.status}>
                    {entry.user
                      ? `${status} · Admin: ${entry.user.isAdmin ? "Ja" : "Nein"}`
                      : "Noch nie angemeldet · Admin erst nach erstem Login möglich"}
                  </span>
                  {!isSelf && (
                    // A link, not a form: revoking is a two-step flow, and this step only OPENS the
                    // confirmation sheet. encodeURIComponent because an email contains characters
                    // (+, @) that must not be reinterpreted as query syntax.
                    <Link
                      href={`/admin?revoke=${encodeURIComponent(entry.email)}`}
                      className={styles.rowActionDanger}
                    >
                      Zugang entziehen
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </Card>

        <div className={styles.spaced}>
          <SectionLabel>E-MAIL EINLADEN</SectionLabel>
        </div>
        <form action={inviteAction} className={styles.inviteRow}>
          <div className={styles.inviteField}>
            <TextField name="email" type="email" placeholder="E-Mail-Adresse" aria-label="E-Mail-Adresse" />
          </div>
          <Button type="submit">Einladen</Button>
        </form>
        {/* An invitation is a database row, nothing more: the project has no mail capability, so the
            person has to be told out of band (design §2). */}
        <p className={styles.hint}>
          Es wird keine Einladungs-E-Mail versendet — sag der Person selbst Bescheid.
        </p>
      </main>
    </>
  );
```

- [ ] **Step 4: Update the imports**

At the top of `src/app/admin/page.tsx`, add:

```ts
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField } from "@/components/ui/TextField";
import styles from "./page.module.css";
```

- [ ] **Step 5: Verify the build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 6: Verify in the browser**

Sign in as an admin, open `http://localhost:3000/admin`.
Check:
1. Header "Verwaltung" with an `ADMIN` pill on the right.
2. `ZUGANG` label, then one white card with a row per allowlist email; rows separated by a thin divider, **no divider under the last row**.
3. Your own row shows `(du)` in muted text and `Admin: Ja` — and **no** buttons.
4. Another signed-in user's row shows `Admin gewähren` (accent, top-right) and `Zugang entziehen` (red, bottom-right); the sub-line reads `<Name> · Admin: Nein`.
5. A never-signed-in email's sub-line reads `Noch nie angemeldet · Admin erst nach erstem Login möglich` and has **no** admin action.
6. `E-MAIL EINLADEN` label, input + accent `Einladen` button, and the hint sentence below.
7. Granting/revoking admin and inviting an email still work end-to-end.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/page.module.css
git commit -m "feat(ui): restyle Verwaltung access table per handoff 3k"
```

---

## Task 12: The two-way revoke bottom sheet

Handoff screen `3l` — the most consequence-heavy screen in the app and the first real customer of the `Sheet` primitive. The **flow is not changed**: `?revoke=<email>` still renders a server-loaded confirmation, both Server Actions stay exactly as they are, and the memberships are still read on the server. Only the presentation becomes a bottom sheet, which needs one small client component (the sheet owns Escape handling and a scroll lock).

Two content additions the design requires and Slice 9 did not have:
1. Each membership is listed with its **role** (`Mitglied` / `Owner`) as a pill row.
2. The owner hint — `Als Owner von „X“ behält … dort in jedem Fall Zugriff.` — is shown **before** the decision, not only after it.

**Files:**
- Create: `src/app/admin/RevokeSheet.tsx`, `src/app/admin/RevokeSheet.module.css`
- Test: `src/app/admin/RevokeSheet.test.tsx`
- Modify: `src/app/admin/page.tsx` (the `revokeParam` branch only)

**Interfaces:**
- Consumes: `Sheet` from `@/components/ui/Sheet`; the two Server Actions are passed in as props.
- Produces:
  ```ts
  export interface RevokeProject { projectId: string; name: string; role: "owner" | "member" }
  export function RevokeSheet(props: {
    email: string;
    userId: string | null;          // null = never signed in
    displayName: string;            // e.g. "Ben"; falls back to the email locally in page.tsx
    projects: RevokeProject[];
    revokeOnlyAction: (formData: FormData) => Promise<void>;
    revokeAndExcludeAction: (formData: FormData) => Promise<void>;
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `src/app/admin/RevokeSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RevokeSheet } from "./RevokeSheet";

const noop = async () => {};

function renderSheet(overrides: Partial<Parameters<typeof RevokeSheet>[0]> = {}) {
  return render(
    <RevokeSheet
      email="ben@gmail.com"
      userId="user-1"
      displayName="Ben"
      projects={[
        { projectId: "p1", name: "Haushalt", role: "member" },
        { projectId: "p2", name: "Camping", role: "owner" },
      ]}
      revokeOnlyAction={noop}
      revokeAndExcludeAction={noop}
      {...overrides}
    />,
  );
}

describe("RevokeSheet", () => {
  it("is an open dialog titled with the email", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Zugang entziehen: ben@gmail.com" })).toBeInTheDocument();
  });

  it("lists every project membership with its role", () => {
    renderSheet();

    expect(screen.getByText("Haushalt")).toBeInTheDocument();
    expect(screen.getByText("Mitglied")).toBeInTheDocument();
    expect(screen.getByText("Camping")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("offers both revocation paths when the person has signed in", () => {
    renderSheet();

    expect(screen.getByRole("button", { name: "Nur Zugang entziehen" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zugang entziehen und aus allen Projekten entfernen" }),
    ).toBeInTheDocument();
  });

  // The design's rule: a never-signed-in person cannot be in a project, so the
  // second, irreversible path must not even be offered.
  it("offers only the plain revoke when the person has never signed in", () => {
    renderSheet({ userId: null, projects: [] });

    expect(screen.getByRole("button", { name: "Zugang entziehen" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /aus allen Projekten entfernen/ }),
    ).not.toBeInTheDocument();
  });

  it("warns up front about projects the person owns", () => {
    renderSheet();
    expect(
      screen.getByText(/Als Owner von „Camping“ behält Ben dort in jedem Fall Zugriff\./),
    ).toBeInTheDocument();
  });

  it("omits the owner hint when the person owns nothing", () => {
    renderSheet({ projects: [{ projectId: "p1", name: "Haushalt", role: "member" }] });
    expect(screen.queryByText(/in jedem Fall Zugriff/)).not.toBeInTheDocument();
  });

  it("says so when the person is in no project at all", () => {
    renderSheet({ projects: [] });
    expect(screen.getByText("Diese Person ist in keinem Projekt.")).toBeInTheDocument();
  });

  it("carries the email and user id into the forms so the actions get their input", () => {
    const { container } = renderSheet();

    const emailInputs = container.querySelectorAll('input[name="email"]');
    expect(emailInputs.length).toBe(2);
    emailInputs.forEach((input) => expect(input).toHaveValue("ben@gmail.com"));
    expect(container.querySelector('input[name="userId"]')).toHaveValue("user-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/admin/RevokeSheet.test.tsx`
Expected: FAIL — `Failed to resolve import "./RevokeSheet"`.

- [ ] **Step 3: Write the styles**

Create `src/app/admin/RevokeSheet.module.css`:

```css
/* Handoff screen 3l. */
.lead {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  margin-top: 6px;
}

.projects {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 9px;
}

.project {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--color-bg-frozen);
  border-radius: 9px;
  padding: 9px 12px;
}

.projectName {
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.role {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Owner is the role that survives the exclusion, so it is the one that is
   emphasised — accent-dark, not muted. */
.roleOwner {
  composes: role;
  font-weight: 700;
  color: var(--color-accent-dark);
}

/* The two options are full-width cards, not buttons: the design gives each a
   title plus a consequence sentence, and the WHOLE card is the tap target. */
.option {
  display: block;
  width: 100%;
  text-align: left;
  border: 1.5px solid var(--color-border-strong);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  padding: 12px 14px;
  margin-top: 8px;
  cursor: pointer;
}

.optionFirst {
  composes: option;
  margin-top: 16px;
}

/* The dangerous option is tinted AND outlined AND red-titled — three signals,
   because this is the one action in the app that cannot be undone. */
.optionDanger {
  composes: option;
  border-color: var(--color-danger);
  background: var(--color-danger-tint);
}

/* display:block because these spans sit inside a <button> and must stack.
   The two Danger variants inherit it through `composes`. */
.optionTitle {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.optionTitleDanger {
  composes: optionTitle;
  color: var(--color-danger);
}

.optionText {
  display: block;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.optionTextDanger {
  composes: optionText;
  color: var(--color-danger-dark);
}

.ownerHint {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--color-text-muted);
  margin-top: 10px;
}

.cancel {
  display: block;
  width: 100%;
  text-align: center;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  /* 12px + line box clears 44px, and the extra bottom padding is the handoff's
     ~30px sheet gutter, plus the home-indicator inset. */
  padding: 12px 0 calc(18px + var(--safe-bottom));
  cursor: pointer;
}
```

- [ ] **Step 4: Write the component**

Create `src/app/admin/RevokeSheet.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import styles from "./RevokeSheet.module.css";

/** One project membership as the sheet lists it. */
export interface RevokeProject {
  projectId: string;
  name: string;
  role: "owner" | "member";
}

type RevokeSheetProps = {
  email: string;
  /** null = this person has never signed in, so they cannot be in any project. */
  userId: string | null;
  /** Display name if known, otherwise the email — used in the owner hint sentence. */
  displayName: string;
  projects: RevokeProject[];
  /** Server Actions, passed down from the page. They re-check admin rights themselves. */
  revokeOnlyAction: (formData: FormData) => Promise<void>;
  revokeAndExcludeAction: (formData: FormData) => Promise<void>;
};

/**
 * The two-way "Zugang entziehen" confirmation as a bottom sheet.
 *
 * Why a client component at all — the rest of /admin is server-rendered: the
 * Sheet primitive owns Escape handling and the body-scroll lock, both of which
 * need effects. This wrapper is the ONLY client code on the page.
 *
 * Why the data still comes from the server: the sheet is opened by navigating to
 * `?revoke=<email>`, so the page has already read the memberships when this
 * renders. That keeps the "no client-side data fetching" rule of the app intact
 * and means the sheet cannot show a stale membership list.
 *
 * Why closing is a router.push and not local state: the URL IS the open/closed
 * state. Local state would let the sheet close while `?revoke=` still sits in the
 * address bar, so a reload would re-open it.
 *
 * Why the actions are props: Server Actions are serialisable across the
 * client/server boundary, so the page keeps ownership of the mutations (and of
 * their requireAdmin re-checks) while this component only arranges the UI.
 */
export function RevokeSheet({
  email,
  userId,
  displayName,
  projects,
  revokeOnlyAction,
  revokeAndExcludeAction,
}: RevokeSheetProps) {
  const router = useRouter();

  // Projects the person OWNS survive the exclusion by design — that is the one
  // genuinely surprising outcome of this flow, so it is stated BEFORE the choice.
  const ownedProjects = projects.filter((project) => project.role === "owner");

  // Navigating back to the bare path both closes the sheet and drops the query.
  const close = () => router.push("/admin");

  return (
    <Sheet open onClose={close} title={`Zugang entziehen: ${email}`}>
      {userId === null ? (
        <p className={styles.lead}>
          Diese Person hat sich noch nie angemeldet und kann daher in keinem Projekt Mitglied sein.
        </p>
      ) : projects.length === 0 ? (
        <p className={styles.lead}>Diese Person ist in keinem Projekt.</p>
      ) : (
        <>
          <p className={styles.lead}>{displayName} ist Mitglied in diesen Projekten:</p>
          <div className={styles.projects}>
            {projects.map((project) => (
              <div key={project.projectId} className={styles.project}>
                <span className={styles.projectName}>{project.name}</span>
                <span className={project.role === "owner" ? styles.roleOwner : styles.role}>
                  {project.role === "owner" ? "Owner" : "Mitglied"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Option 1 — always available. For a never-signed-in person it is the only
          option and carries the plain label, because there is nothing to exclude. */}
      <form action={revokeOnlyAction}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" className={styles.optionFirst}>
          <span className={styles.optionTitle}>
            {userId === null ? "Zugang entziehen" : "Nur Zugang entziehen"}
          </span>
          <span className={styles.optionText}>
            Keine neuen Logins. Mitgliedschaften bleiben — erneutes Einladen stellt alles wieder
            her.
          </span>
        </button>
      </form>

      {/* Option 2 — only for someone who actually has memberships to remove. */}
      {userId !== null && (
        <form action={revokeAndExcludeAction}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="userId" value={userId} />
          <button type="submit" className={styles.optionDanger}>
            <span className={styles.optionTitleDanger}>
              Zugang entziehen und aus allen Projekten entfernen
            </span>
            <span className={styles.optionTextDanger}>
              Sofort und endgültig — erneutes Einladen bringt die Mitgliedschaften <b>nicht</b>{" "}
              zurück.
            </span>
          </button>
        </form>
      )}

      {ownedProjects.length > 0 && (
        <p className={styles.ownerHint}>
          Als Owner von {ownedProjects.map((project) => `„${project.name}“`).join(", ")} behält{" "}
          {displayName} dort in jedem Fall Zugriff.
        </p>
      )}

      <button type="button" className={styles.cancel} onClick={close}>
        Abbrechen
      </button>
    </Sheet>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/admin/RevokeSheet.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 6: Wire the sheet into the page**

The old `?revoke=` branch returned an **alternative page** instead of the table. A sheet does not replace its screen — it sits on top of it — so the branch goes away entirely and becomes a lookup above the single return.

**12a.** Delete the whole `if (revokeParam) { … }` block, from the `// --- Two-step revoke:` comment banner down to its closing `}`. Everything it did is re-expressed below.

**12b.** In its place, immediately after the `const entries = await listAccessEntries(prisma);` line, add the lookup:

```tsx
  // --- Two-step revoke: ?revoke=<email> opens the confirmation SHEET over the table ----------
  // A URL parameter rather than client state keeps the data loading on the server: by the time
  // the sheet renders, its membership list has already been read here. It also means a reload
  // re-opens the same sheet, and closing it is a navigation (see RevokeSheet).
  const revokeEntry = revokeParam
    ? (entries.find((e) => e.email === normalizeEmail(revokeParam)) ?? null)
    : null;

  // A Membership needs a user id, so somebody who has never signed in cannot be in any project —
  // the sheet then skips the project section and both intents collapse into one plain revoke.
  const revokeProjects = revokeEntry?.user
    ? await listProjectAccess(prisma, revokeEntry.user.id)
    : [];

  // Stale link, or already revoked in another tab: `revokeEntry` stays null and the page simply
  // renders the table with no sheet — which is exactly the right outcome, because the thing the
  // link pointed at no longer exists.
```

**12c.** Append the sheet after the closing `</main>` of the main-view return from Task 11, inside the same fragment:

```tsx
        {revokeEntry && (
          <RevokeSheet
            email={revokeEntry.email}
            userId={revokeEntry.user?.id ?? null}
            // displayName falls back to the email so the hint sentence never reads
            // "Als Owner von „X“ behält null dort …".
            displayName={revokeEntry.user?.displayName ?? revokeEntry.email}
            projects={revokeProjects.map((p) => ({
              projectId: p.projectId,
              name: p.name,
              role: p.role,
            }))}
            revokeOnlyAction={revokeOnlyAction}
            revokeAndExcludeAction={revokeAndExcludeAction}
          />
        )}
```

**12d.** Add the import at the top of the file:

```ts
import { RevokeSheet } from "./RevokeSheet";
```

**12e.** The two Server Actions (`revokeOnlyAction`, `revokeAndExcludeAction`) are **unchanged** — including their `redirect("/admin")` and `redirect("/admin?owned=…")` calls, which is what closes the sheet after a successful revoke. Do not touch them.

**12f.** Confirm nothing is left over from the deleted branch: `singleParam`, `revokeParam`, `normalizeEmail` and `listProjectAccess` must all still be referenced (they are, by 12b and by the `?owned=` notice), and `ownedParam` / `stillOwned` stay exactly as they are. Run `npm run lint` — an unused import here is the signal that something was deleted too eagerly.

- [ ] **Step 7: Verify the build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed. If Next.js complains that a Server Action cannot be passed to a client component, confirm both actions are declared with `"use server"` **as the first statement inside the function body** — they already are.

- [ ] **Step 8: Verify the whole revoke flow in the browser**

You need three allowlist entries: yourself, a second signed-in user who is a member of one project and owner of another, and one invited-but-never-signed-in email.

1. Click `Zugang entziehen` on the signed-in user. → The screen dims and a sheet slides up from the bottom titled `Zugang entziehen: <email>`.
2. The sheet lists both projects as grey pills with `Mitglied` / `Owner` on the right (Owner in accent-dark bold).
3. Below: a neutral outlined card `Nur Zugang entziehen` and a red-tinted card `Zugang entziehen und aus allen Projekten entfernen` with its warning sentence.
4. The owner hint reads `Als Owner von „<Projekt>“ behält <Name> dort in jedem Fall Zugriff.`
5. `Abbrechen`, the ✕-less overlay tap, and the `Escape` key each close the sheet **and** clear `?revoke=` from the URL.
6. Choose `Nur Zugang entziehen` → back on the table, the email is gone, and the other user's memberships still exist (check `/projects` as that user, or the DB).
7. Re-invite, re-open, choose the destructive option → the memberships are gone, and the blue banner at the top names the projects they still own.
8. Open the sheet for the never-signed-in email → the lead sentence explains they have never signed in, and **only one** option (`Zugang entziehen`) is offered.

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin/
git commit -m "feat(ui): two-way revoke as a bottom sheet per handoff 3l"
```

---

## Task 13: Slice verification, review document and meta-plan update

The Definition of Done for every slice (CLAUDE.md § Implementation review, and the meta plan's maintenance guide).

**Files:**
- Create: `docs/implementation-reviews/slice-14-restyle-built-screens.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–12.
- Produces: nothing code-facing.

- [ ] **Step 1: Run the full verification set and record the real output**

```bash
npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'
npm run lint
npm run build
```

Write down the actual file/test counts. Do **not** write "all tests pass" without the numbers in front of you (superpowers:verification-before-completion).

- [ ] **Step 2: Walk the manual checklist**

Run `npm run dev` and confirm all of the following, ticking each one:

1. `/login` (private window) — accent logo tile, real Google G, correct copy.
2. `/auth/error` — neutral lock circle, no red, working back link.
3. `/` — header without hairline, email top-right.
4. `/` — WEITERMACHEN card appears, counts are right, the bar is partly filled, tapping opens the list.
5. `/` — WEITERMACHEN section is **absent** when no active list exists anywhere.
6. `/` — PROJEKTE rows with 28px avatars and the list count; `Verwaltung` only for admins; `Abmelden` works.
7. `/projects` — row cards with avatar, `N Listen · M Mitglieder`, OWNER pill only on your own projects.
8. `/projects` — create row works; empty state `Noch kein Projekt` renders with the create row beneath it.
9. `/admin` — ADMIN pill, ZUGANG card, own row without buttons, admin grant/revoke works, invite works.
10. `/admin` — revoke sheet: both options, roles, owner hint, Escape/overlay/Abbrechen all close it and clear the URL.
11. Both revoke paths produce the correct DB outcome.
12. **No hydration error in the console on any screen**, including `/projects/[projectId]` and `/lists/[listId]` (the Task 1 fix).
13. `/dev/ui` still renders every primitive, now including `PageHeader` and `ProgressBar`.
14. Narrow the viewport to ~375px: no horizontal scroll on any of the five screens.

- [ ] **Step 3: Write the review document**

Create `docs/implementation-reviews/slice-14-restyle-built-screens.md` in English, covering the five mandatory sections from CLAUDE.md:

1. **What was achieved** — the slice goal (five screens in the new visual language + the Weitermachen capability + the hydration fix) and whether it was fully met.
2. **Steps taken** — one short paragraph per task above.
3. **Core components built** — `formatGermanDate`/`formatGermanNumber`, the plural helpers, `PageHeader`, `ProgressBar`, `listProjectSummaries`, `lastTouchedAt`/`pickContinueList`/`getContinueList`, `ContinueCard`, `GoogleLogo`, `RevokeSheet`, and the five restyled pages — one sentence each.
4. **Most important lines of code** — quote 5–10 blocks with an explanation. Strong candidates: the pinned `Intl.DateTimeFormat` time zone (why it kills the hydration mismatch); the `lastTouchedAt` reduce seeded with `createdAt` (why "touched" is derived, not stored); the `project: { memberships: { some: { userId } } }` predicate in `getContinueList` (access control inside the query, the app's first cross-project read); the filtered `_count` in `listProjectSummaries`; `role: row.memberships[0].role` (per-viewer role, not project ownership); `const close = () => router.push("/admin")` (the URL is the sheet's open/closed state); and passing Server Actions as props into a client component.
5. **Architecture contribution** — this slice turns the Slice 13 primitives into real screens for the first time and proves them on the app's most consequence-heavy flow; `PageHeader`'s `leading` slot is the seam Slice 11 fills with the drawer trigger; `listProjectSummaries` is the read model the drawer's project switcher will reuse; `formatGermanDate` is now the mandatory formatting path for the archive screen (Slice 11) and the list screen (Slice 12).

- [ ] **Step 4: Update the meta plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

1. In the slice table, set row **14**'s status to `✅ Done / verified` and replace `_to be created_` in its Plan column with a link to `2026-08-02-slice-14-restyle-built-screens.md`.
2. Change the trailing sentence of the UI-handoff note from `**Slice 14 is the next open slice** (plan still to be created).` to `**Slice 10 (Katalog-Verwaltung) is the next open slice** (plan still to be created).`
3. Prepend a new progress-log entry above the Slice 13 entry, using the template from the maintenance guide:

```markdown
### 2026-08-02 — Slice 14: Restyle the built screens — ✅ Done / verified
- **Delivered:** …
- **Tested:** … (the real numbers from Step 1 + the 14-item manual checklist)
- **Deviations from the plan:** …
- **Follow-up decisions for later slices:** …
- **Inherited open items:** …
- **Commit(s):** …
```

Fill in the real content. Items that belong under **Follow-up decisions** if they hold true after implementation:
- `PageHeader`'s `leading` slot is where Slice 11 mounts the ☰ drawer trigger.
- `src/lib/format/date.ts` is now the only sanctioned way to render a date or a decimal — `toLocaleDateString`/`toLocaleString` must not reappear (the grep in Task 1 Step 6 is the guard).
- "Last touched" is derived from `ListItem.updatedAt`, not stored on `List`. If a later slice ever needs list-level recency for renames too, that is the moment to add `List.updatedAt` — not before.
- `listProjectSummaries` is the read model Slice 11's project switcher should reuse.
- The revoke sheet keeps the URL (`?revoke=`) as its open/closed state; any future sheet on a server-rendered screen should follow that pattern rather than lifting data fetching to the client.

And under **Inherited open items**: Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0; overlapping polls; cancelled-before-JSON race) remain open.

- [ ] **Step 5: Commit**

```bash
git add docs/implementation-reviews/slice-14-restyle-built-screens.md \
        docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md \
        docs/superpowers/plans/2026-08-02-slice-14-restyle-built-screens.md
git commit -m "docs: Slice 14 implementation review + meta-plan progress log"
```

---

## Out of scope for this slice (deliberately)

State these in the review so the next agent does not go looking for them:

- **The ☰ drawer / sidebar** — Slice 11. `PageHeader` has the slot; nothing fills it yet, so the header renders without the hamburger on `/projects` and `/admin` even though the design shows one.
- **Projekt-Detail, Liste, Archiv, Favoriten, Katalog, Mitglieder screens** — Slices 10–12. Task 1 touches two of them for the hydration fix **only**; their markup stays as-is.
- **Quantity parsing** — Slice 15.
- **Per-row remote-change flash** — Slice 16 (optional).
- **PWA manifest / service worker** — Slice 8.
