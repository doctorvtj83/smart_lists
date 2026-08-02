# Slice 11 — App structure + navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the overloaded project screen into five screens behind one shared navigation shell — a mobile overlay drawer and a desktop sidebar with a project switcher — and replace the two ad-hoc "create list" forms with a bottom sheet whose pre-fill preview can be de-selected article by article.

**Architecture:** A new Next.js layout at `src/app/projects/[projectId]/layout.tsx` owns the shell. It reads the nav data on the server (project name, the caller's projects for the switcher, the two counts) and hands it to a client `ProjectShell`, which holds the drawer's open/closed state and publishes it through a React context. Every screen underneath keeps its own `PageHeader`; the header's `leading` slot now carries a `DrawerTrigger` that reads that context. Data stays server-owned throughout — the screens are Server Components that pass props into small client components for view state only (the split Slice 10 established and the Slice 10 log recorded as the rule for this slice).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), React 19 (`useActionState`, `startTransition`), TypeScript, Prisma/Neon, CSS Modules, `lucide-react` (always through `Icon`), Vitest (node for DB/lib tests, jsdom + Testing Library for component tests).

## Global Constraints

- **In-app user-facing strings are German.** Code identifiers, comments, docs are English.
- **Every German label is copied verbatim from the handoff** (`docs/design/2026-08-01-ui-handoff/README.md` and the two `.dc.html` prototypes). Do not paraphrase, do not "improve" wording.
- **Styling: CSS Modules only.** No inline styles except a computed value a CSS Module cannot express (the `ProgressBar` fill precedent).
- **Icons: `lucide-react`, always through `@/components/ui/Icon`** (stroke 1.75, `aria-hidden`). Never import a Lucide glyph into markup directly.
- **Build screens out of the primitives in `src/components/ui/`.** Do not restyle from scratch: `Button`, `TextField`/`FieldError`, `Card`, `RowLink`, `Avatar`, `Badge`, `SectionLabel`, `Chip`, `ChipTabs`, `EmptyState`, `Sheet`, `ConfirmSheet`, `InlineEdit`, `Banner`, `PageHeader`, `ProgressBar`, `Icon`.
- **Design tokens only.** Colours, radii, shadows, motion and layout come from the custom properties in `src/app/globals.css`. No new hex literals in a CSS Module. The desktop breakpoint is the literal `900px` in every media query (custom properties cannot be used inside `@media`).
- **Every Server Action re-derives identity via `auth()` and re-checks permission** (`requireMembership` for member-level, `requireOwner` for owner-level). A Server Action is an individually addressable POST endpoint.
- **Owner-only controls are NOT rendered for members** — never disabled (handoff, § Destruktive Aktionen).
- **Destructive actions confirm through a bottom sheet** (`ConfirmSheet`) that spells out the consequence. `ConfirmSheet` does not close itself: an `onSelect` fires the mutation *and* closes the sheet (the Gallery / `CatalogEditPanel` pattern).
- **Every function gets a comment explaining what it does and why it exists; every non-obvious block gets an inline comment.** Named patterns are named. This is a learning project — see CLAUDE.md § Code documentation standard. Never thin out existing comments while editing a file.
- **Component tests** start with `// @vitest-environment jsdom`, use Testing Library, and assert **roles and text — never CSS-Module class names**.
- **Tests run with** `npx vitest run <path>` (needs `.env.test` with the Neon test-branch `DATABASE_URL`). DB tests call `resetDb(db)` in `beforeEach` and `db.$disconnect()` in `afterAll`.
- **Tap targets ≥ 44px; safe areas via `--safe-top` / `--safe-bottom`.**
- **Commit after every task.** Conventional commits; either language, consistent within a change.

## What this slice deliberately does NOT do

State these in the review; do not silently expand scope.

- **The list screen (`/lists/[listId]`) is untouched.** It keeps its `← Zum Projekt` link and its un-restyled markup. Slice 12 owns it. It sits outside this layout, so it gets no drawer.
- **The Favoriten add-row keeps the native `<datalist>` autocomplete** it has today, re-skinned. The handoff's dropdown with the „„X" neu anlegen" row is the same control Slice 12 builds for the trailing entry row; building it twice would guarantee drift. Reuse it here once Slice 12 ships it.
- **No REST endpoints are added.** These screens are never polled and never merged offline, so the reason lists have an operations API does not apply (the Slice 9 / Slice 10 precedent). The domain layer stays the seam.
- **Quantity parsing is Slice 15.** Nothing here parses typed text.

---

## File structure

**New — domain / read models**

| File | Responsibility |
|---|---|
| `src/lib/lists/summaries.ts` | Two UI read models: active lists with their open-entry count ("5 offen"), archived lists with their completion date. |
| `src/lib/projects/nav.ts` | `getProjectNav` — everything the navigation shell renders for one project, in one read. |

**New — primitives**

| File | Responsibility |
|---|---|
| `src/components/ui/Toggle.tsx` (+ `.module.css`) | The on/off switch. Its only customer today is the sheet's „Vorbefüllen". |

**New — navigation shell**

| File | Responsibility |
|---|---|
| `src/components/nav/DrawerContext.tsx` | The client context that lets a header button open the drawer its layout owns. |
| `src/components/nav/DrawerTrigger.tsx` | The ☰ button that every screen puts in its `PageHeader` `leading` slot. |
| `src/components/nav/ProjectNavPanel.tsx` (+ `.module.css`) | The nav content itself — switcher card, dropdown, nav rows, footer. Shared by drawer and sidebar. |
| `src/components/nav/ProjectShell.tsx` (+ `.module.css`) | Desktop sidebar + mobile overlay drawer + the context provider. |

**New — screens**

| File | Responsibility |
|---|---|
| `src/app/projects/[projectId]/layout.tsx` | Server layout: guard, nav read, `ProjectShell`. |
| `src/app/projects/[projectId]/ProjectTitle.tsx` (+ `.module.css`) | Inline-editable project name (owner) / plain text (member). |
| `src/app/projects/[projectId]/DeleteProjectButton.tsx` (+ `.module.css`) | „Projekt löschen…" + its confirmation sheet. |
| `src/app/projects/[projectId]/NewListSheet.tsx` (+ `.module.css`) | The hero card and the „Neue Liste" sheet with the de-selectable pre-fill preview. |
| `src/app/projects/[projectId]/archiv/page.tsx` (+ `.module.css`) | Archiv screen. |
| `src/app/projects/[projectId]/favoriten/page.tsx` (+ `.module.css`) | Favoriten screen. |
| `src/app/projects/[projectId]/favoriten/FavoritesEditor.tsx` (+ `.module.css`) | Favourite chips + add row (client view state only). |
| `src/app/projects/[projectId]/mitglieder/page.tsx` (+ `.module.css`) | Mitglieder screen. |
| `src/app/projects/[projectId]/mitglieder/InviteForm.tsx` (+ `.module.css`) | Owner-only invite with an inline German error. |
| `src/app/projects/[projectId]/mitglieder/RemoveMemberButton.tsx` (+ `.module.css`) | „Entfernen" + its confirmation sheet. |

**Modified**

| File | Change |
|---|---|
| `src/app/projects/[projectId]/page.tsx` | Rewritten: only Listen. Members / Favoriten / Archiv move out. |
| `src/app/projects/[projectId]/page.module.css` | New file (the page had none). |
| `src/app/projects/[projectId]/katalog/page.tsx` | `leading` back-link → `<DrawerTrigger />`. |
| `src/app/projects/[projectId]/katalog/page.module.css` | Drop the now-unused `.back` rule. |
| `src/lib/suggestions/suggestions.ts` | Add `createListWithArticles`; `createPrefilledList` delegates to it. |
| `src/lib/format/plural.ts` (+ test) | Add `formatNewListLabel`. |
| `src/app/dev/ui/Gallery.tsx` | Add the `Toggle`. |

---

## Task 1: List read models for the project and archive screens

**Files:**
- Create: `src/lib/lists/summaries.ts`
- Test: `src/lib/lists/summaries.test.ts`

**Interfaces:**
- Consumes: `listLists` conventions from `src/lib/lists/lists.ts` (active = newest-created first, completed = newest-completed first). Nothing from earlier tasks.
- Produces:
  - `interface ActiveListSummary { id: string; name: string; openCount: number }`
  - `interface ArchivedListSummary { id: string; name: string; completedAt: Date | null }`
  - `listActiveListSummaries(db: PrismaClient, projectId: string): Promise<ActiveListSummary[]>`
  - `listArchivedListSummaries(db: PrismaClient, projectId: string): Promise<ArchivedListSummary[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/summaries.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "@/lib/projects/projects";
import { listActiveListSummaries, listArchivedListSummaries } from "./summaries";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const project = await createProject(db, { name: "Haushalt", ownerId: owner.id });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

// Adds one entry to a list. The catalog item is created inline because a ListItem
// cannot exist without one (article identity, MVP design §3.1).
async function addEntry(listId: string, name: string, checked: boolean, sortIndex: number) {
  const catalogItem = await db.catalogItem.create({
    data: { projectId, name, normalizedName: name.toLowerCase() },
  });
  await db.listItem.create({
    data: { listId, catalogItemId: catalogItem.id, checked, sortIndex },
  });
}

describe("listActiveListSummaries", () => {
  it("returns an empty array for a project without lists", async () => {
    expect(await listActiveListSummaries(db, projectId)).toEqual([]);
  });

  it("counts only UNCHECKED entries as open", async () => {
    const list = await db.list.create({ data: { projectId, name: "Einkauf" } });
    await addEntry(list.id, "Milch", false, 0);
    await addEntry(list.id, "Brot", false, 1);
    await addEntry(list.id, "Butter", true, 2);

    const [summary] = await listActiveListSummaries(db, projectId);
    expect(summary).toEqual({ id: list.id, name: "Einkauf", openCount: 2 });
  });

  it("reports 0 open for a list with no entries at all", async () => {
    const list = await db.list.create({ data: { projectId, name: "Leer" } });
    const [summary] = await listActiveListSummaries(db, projectId);
    expect(summary.id).toBe(list.id);
    expect(summary.openCount).toBe(0);
  });

  it("excludes completed lists — the archive is a different screen", async () => {
    await db.list.create({ data: { projectId, name: "Offen" } });
    await db.list.create({
      data: { projectId, name: "Fertig", status: "completed", completedAt: new Date() },
    });

    const summaries = await listActiveListSummaries(db, projectId);
    expect(summaries.map((s) => s.name)).toEqual(["Offen"]);
  });

  it("orders newest-created first, like listLists('active')", async () => {
    await db.list.create({ data: { projectId, name: "Zuerst" } });
    await db.list.create({ data: { projectId, name: "Danach" } });

    const summaries = await listActiveListSummaries(db, projectId);
    expect(summaries.map((s) => s.name)).toEqual(["Danach", "Zuerst"]);
  });
});

describe("listArchivedListSummaries", () => {
  it("returns an empty array for a project that never completed a list", async () => {
    await db.list.create({ data: { projectId, name: "Offen" } });
    expect(await listArchivedListSummaries(db, projectId)).toEqual([]);
  });

  it("returns completed lists newest-completed first, with their date", async () => {
    const older = new Date("2026-07-01T10:00:00Z");
    const newer = new Date("2026-07-29T10:00:00Z");
    await db.list.create({
      data: { projectId, name: "Alt", status: "completed", completedAt: older },
    });
    await db.list.create({
      data: { projectId, name: "Neu", status: "completed", completedAt: newer },
    });

    const summaries = await listArchivedListSummaries(db, projectId);
    expect(summaries.map((s) => s.name)).toEqual(["Neu", "Alt"]);
    expect(summaries[0].completedAt?.toISOString()).toBe(newer.toISOString());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/lists/summaries.test.ts`
Expected: FAIL — `Failed to resolve import "./summaries"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/lists/summaries.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

/**
 * An active list as the project screen's row card renders it: the list plus the
 * „5 offen" counter (handoff screen 3e).
 *
 * Why a read model and not `List`: the row needs a count that lives on ListItem,
 * and `listLists` deliberately returns the plain rows the REST layer serialises.
 * A different consumer gets a different shape — the same reasoning as
 * ProjectSummary next to listProjectsForUser.
 */
export interface ActiveListSummary {
  id: string;
  name: string;
  /** UNCHECKED entries only. 0 for a list nobody has typed into yet. */
  openCount: number;
}

/** An archived list as the Archiv screen renders it (handoff screen 3f). */
export interface ArchivedListSummary {
  id: string;
  name: string;
  /**
   * Nullable because the column is: `completeList` always stamps it, but a
   * seeded/imported row could be `completed` without one. The screen prints the
   * „Abgeschlossen am …" line only when it exists.
   */
  completedAt: Date | null;
}

/**
 * The project's open lists with their open-entry count.
 *
 * The count is done by the DATABASE via a filtered relation count, so no entry
 * rows travel over the wire — the same technique listProjectSummaries uses for
 * its two counts. A project with 20 lists therefore still costs one query, not 21.
 *
 * Ordering is `createdAt: "desc"`, identical to `listLists(db, id, "active")`, so
 * the project screen and the REST collection never disagree about the order.
 */
export async function listActiveListSummaries(
  db: PrismaClient,
  projectId: string,
): Promise<ActiveListSummary[]> {
  const rows = await db.list.findMany({
    where: { projectId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      // Filtered relation count: "how many of this list's items are unchecked".
      _count: { select: { items: { where: { checked: false } } } },
    },
  });

  // Flatten Prisma's `_count` nesting into the lean shape the UI renders, so no
  // screen has to know how the count was produced.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    openCount: row._count.items,
  }));
}

/**
 * The project's completed lists, newest-completed first.
 *
 * A different sort key from the active list on purpose: for an archived list the
 * meaningful recency is when it was CLOSED, not when it was created (the rule
 * `listLists` already encodes for `status === "completed"`).
 *
 * `nulls: "last"` is deliberate — Postgres sorts NULLs FIRST on DESC, so a
 * completed row without a `completedAt` would otherwise sit above genuinely
 * recent lists. Same guard as computeSuggestions' window query.
 */
export async function listArchivedListSummaries(
  db: PrismaClient,
  projectId: string,
): Promise<ArchivedListSummary[]> {
  return db.list.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: { sort: "desc", nulls: "last" } },
    select: { id: true, name: true, completedAt: true },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/lists/summaries.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/summaries.ts src/lib/lists/summaries.test.ts
git commit -m "feat(lists): read models for active list open counts and the archive"
```

---

## Task 2: Create a list from an explicit article selection

The sheet lets the user drop individual suggestions before creating the list, so the server needs a "create with exactly these articles" entry point. `createPrefilledList` (Slice 5, still used by `POST /api/projects/:id/lists` with `prefill: true`) becomes a thin wrapper over it, so both paths keep the compensating-delete behaviour.

**Files:**
- Modify: `src/lib/suggestions/suggestions.ts`
- Test: `src/lib/suggestions/suggestions.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: `CreateListInput` from `@/lib/lists/lists`, `applyOperation` from `@/lib/lists/operations`, `computeSuggestions` (same file).
- Produces: `createListWithArticles(db: PrismaClient, input: CreateListInput & { articleNames: string[] }): Promise<List>` — creates the list, then adds one entry per name, in the given order, through `applyOperation`. On any failure the list is deleted and the original error rethrown.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/suggestions/suggestions.test.ts` (keep the file's existing imports; add `createListWithArticles` to the import from `./suggestions`):

```ts
describe("createListWithArticles", () => {
  it("creates the list and adds exactly the given articles, in order", async () => {
    const list = await createListWithArticles(db, {
      projectId,
      name: "Einkauf",
      articleNames: ["Milch", "Brot"],
    });

    const created = await db.list.findUniqueOrThrow({
      where: { id: list.id },
      include: { items: { orderBy: { sortIndex: "asc" }, include: { catalogItem: true } } },
    });
    expect(created.name).toBe("Einkauf");
    expect(created.items.map((item) => item.catalogItem.name)).toEqual(["Milch", "Brot"]);
  });

  it("creates a plain empty list when the selection is empty", async () => {
    const list = await createListWithArticles(db, {
      projectId,
      name: "Leer",
      articleNames: [],
    });

    const items = await db.listItem.findMany({ where: { listId: list.id } });
    expect(items).toEqual([]);
  });

  it("rejects an invalid name and creates nothing", async () => {
    await expect(
      createListWithArticles(db, { projectId, name: "   ", articleNames: ["Milch"] }),
    ).rejects.toThrow("Name darf nicht leer sein");

    expect(await db.list.count({ where: { projectId } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts`
Expected: FAIL — `createListWithArticles is not exported` / `is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/lib/suggestions/suggestions.ts`, **replace** the body of `createPrefilledList` and add the new function above it. Keep every existing comment on the file's other functions.

```ts
/**
 * Creates a list and seeds it with exactly the given articles, in the given order.
 *
 * Why this exists next to createPrefilledList: Slice 11's „Neue Liste" sheet lets
 * the user de-select individual suggestions before creating, so the surviving
 * selection — not "whatever computeSuggestions returns right now" — is the truth.
 * Recomputing on the server would silently re-add the articles the user just
 * dropped.
 *
 * Only the NAME is passed to add_item: it resolves the name to the project's
 * catalog row and INHERITS its category/unit defaults, so the inheritance logic
 * is never duplicated and can never go stale. Sequential (not Promise.all)
 * because each add_item derives the next sortIndex from the current maximum, so
 * the writes must not race each other.
 */
export async function createListWithArticles(
  db: PrismaClient,
  input: CreateListInput & { articleNames: string[] },
): Promise<List> {
  // createList enforces the name rules and the optional client-supplied UUID, so
  // an invalid request fails BEFORE anything is written.
  const list = await createList(db, input);

  try {
    for (const name of input.articleNames) {
      await applyOperation(db, list, {
        op: "add_item",
        itemId: randomUUID(), // stable entry identity, generated caller-side by convention
        name,
      });
    }
  } catch (error) {
    // Pattern: COMPENSATING ACTION. A half-filled list is an artifact the user
    // never asked for — it would appear under "AKTIVE LISTEN" with an arbitrary
    // subset and no sign that anything went wrong. Delete it, then rethrow the
    // ORIGINAL error so the caller still sees the real cause.
    //
    // WHY NOT db.$transaction: applyOperation/createList/getOrCreateCatalogItem
    // all declare their first parameter as PrismaClient, while an interactive
    // transaction hands back Omit<PrismaClient, ITXClientDenyList> — not
    // assignable. Widening those signatures is a far larger change than this
    // failure mode justifies.
    //
    // .catch(): the cleanup is best-effort. If the delete ALSO fails the caller
    // must still see the original cause, not a secondary rollback error.
    await db.list.delete({ where: { id: list.id } }).catch(() => undefined);
    throw error;
  }

  return list;
}

// Creates a new list and pre-fills it from the project's suggestion set (MVP design §4.3, step 3).
// Slice 11 made this a thin wrapper: computing the set is this function's job, writing the list is
// createListWithArticles'. Both callers (REST `prefill: true` and the older UI path) therefore
// inherit the same ordering, the same single mutation path and the same compensating delete.
export async function createPrefilledList(
  db: PrismaClient,
  input: CreateListInput,
): Promise<List> {
  const suggestions = await computeSuggestions(db, input.projectId);
  return createListWithArticles(db, {
    ...input,
    articleNames: suggestions.map((article) => article.name),
  });
}
```

> Note for the implementer: `computeSuggestions` now runs *before* the list is created, where it used to run after. That is a behaviour improvement, not a regression — a failing suggestion read no longer leaves an empty list behind. Verify the existing `createPrefilledList` tests in this file still pass unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/suggestions/suggestions.test.ts`
Expected: PASS — the three new tests plus every pre-existing one in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/suggestions/suggestions.ts src/lib/suggestions/suggestions.test.ts
git commit -m "feat(lists): createListWithArticles for an explicit pre-fill selection"
```

---

## Task 3: The `Toggle` primitive

**Files:**
- Create: `src/components/ui/Toggle.tsx`, `src/components/ui/Toggle.module.css`
- Test: `src/components/ui/Toggle.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string })` — a `role="switch"` button whose accessible name is `label`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Toggle.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("is a switch carrying its German label as the accessible name", () => {
    render(<Toggle checked={false} onChange={() => {}} label="Vorbefüllen" />);

    expect(screen.getByRole("switch", { name: "Vorbefüllen" })).toBeInTheDocument();
  });

  it("reports its state through aria-checked", () => {
    const { rerender } = render(<Toggle checked={false} onChange={() => {}} label="Vorbefüllen" />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

    rerender(<Toggle checked onChange={() => {}} label="Vorbefüllen" />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("reports the NEXT state on click, not a toggle command", async () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} label="Vorbefüllen" />);

    await userEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ui/Toggle.test.tsx`
Expected: FAIL — `Failed to resolve import "./Toggle"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/Toggle.tsx`:

```tsx
"use client";

import styles from "./Toggle.module.css";

type ToggleProps = {
  checked: boolean;
  /** Receives the NEXT state, not a toggle command — see the note below. */
  onChange: (next: boolean) => void;
  /** German accessible name, e.g. "Vorbefüllen". A bare switch says nothing. */
  label: string;
};

/**
 * The pill switch (handoff, „Neue Liste"-Sheet: Vorbefüllen an/aus).
 *
 * Why role="switch" on a <button> and not a checkbox: the design draws a track
 * with a sliding knob, and a checkbox would have to be visually hidden and
 * re-created in CSS anyway. `role="switch"` + `aria-checked` is exactly the
 * semantic a screen reader needs, and a button gives keyboard activation for free.
 *
 * Why onChange receives the next VALUE rather than being a bare onToggle: the
 * caller usually keeps the state, and `onChange={setPrefill}` reads better than a
 * callback that has to re-derive the inverse. It also makes the control usable in
 * a controlled form where the next value is sent somewhere else.
 *
 * "use client" because it has a click handler.
 */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      // The state lives in a data attribute rather than a second class name so
      // the CSS Module can style track and knob from one selector each.
      data-checked={checked ? "true" : "false"}
      className={styles.track}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
```

Create `src/components/ui/Toggle.module.css` (measurements verbatim from the prototype's `toggleStyle` / `knobStyle`):

```css
/* Handoff: „Neue Liste"-Sheet — 42×25 track, 20px knob, 15ms-class transitions. */
.track {
  position: relative;
  flex: none;
  width: 42px;
  height: 25px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--color-border-strong);
  cursor: pointer;
  transition: background 150ms ease-out;
}

.track[data-checked="true"] {
  background: var(--color-accent);
}

.knob {
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-surface);
  transition: left 150ms ease-out;
}

.track[data-checked="true"] .knob {
  left: 19.5px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/Toggle.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Toggle.tsx src/components/ui/Toggle.module.css src/components/ui/Toggle.test.tsx
git commit -m "feat(ui): Toggle switch primitive"
```

---

## Task 4: Drawer context and the ☰ trigger

The drawer's open state lives in the layout, but the button that opens it is rendered by each *page* (inside its own `PageHeader`). A React context is what bridges that: the layout's client shell provides it, and page-level client components consume it — server-rendered children of a client provider are still inside its tree.

**Files:**
- Create: `src/components/nav/DrawerContext.tsx`, `src/components/nav/DrawerTrigger.tsx`, `src/components/nav/DrawerTrigger.module.css`
- Test: `src/components/nav/DrawerTrigger.test.tsx`

**Interfaces:**
- Consumes: `Icon` from `@/components/ui/Icon`.
- Produces:
  - `interface DrawerControls { isOpen: boolean; open: () => void; close: () => void }`
  - `DrawerContext: React.Context<DrawerControls | null>`
  - `useDrawer(): DrawerControls` — throws outside a provider.
  - `DrawerTrigger()` — a `<button aria-label="Menü öffnen">` with the `Menu` glyph.

- [ ] **Step 1: Write the failing test**

Create `src/components/nav/DrawerTrigger.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DrawerContext, type DrawerControls } from "./DrawerContext";
import { DrawerTrigger } from "./DrawerTrigger";

function renderTrigger(controls: Partial<DrawerControls> = {}) {
  const value: DrawerControls = {
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
    ...controls,
  };
  render(
    <DrawerContext.Provider value={value}>
      <DrawerTrigger />
    </DrawerContext.Provider>,
  );
  return value;
}

describe("DrawerTrigger", () => {
  it("is a button named „Menü öffnen“", () => {
    renderTrigger();

    expect(screen.getByRole("button", { name: "Menü öffnen" })).toBeInTheDocument();
  });

  it("opens the drawer when tapped", async () => {
    const open = vi.fn();
    renderTrigger({ open });

    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  // A trigger rendered outside the shell is a wiring bug, and a silent no-op
  // button is the worst way to find out.
  it("throws when rendered without a provider", () => {
    // React logs the thrown error; silence it so the suite output stays readable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<DrawerTrigger />)).toThrow(/DrawerContext/);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/nav/DrawerTrigger.test.tsx`
Expected: FAIL — `Failed to resolve import "./DrawerContext"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/nav/DrawerContext.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";

/** What a consumer may do with the drawer. */
export interface DrawerControls {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * The drawer's open/closed state, published by ProjectShell.
 *
 * Why a context rather than props: the ☰ button lives inside each SCREEN's
 * PageHeader, while the drawer itself belongs to the layout that wraps those
 * screens. There is no prop path between them — a layout passes `children`, it
 * cannot reach into them. A context is the one mechanism that crosses that gap,
 * and it works across the server/client boundary because the pages are rendered
 * INSIDE the client provider's subtree.
 *
 * Default `null` (not a no-op object) so `useDrawer` can tell "no provider" from
 * "provider with a closed drawer".
 */
export const DrawerContext = createContext<DrawerControls | null>(null);

/**
 * Reads the drawer controls, failing loudly outside the shell.
 *
 * A missing provider means a screen was mounted outside the project layout — a
 * wiring mistake. Throwing surfaces it during development instead of shipping a
 * ☰ button that silently does nothing.
 */
export function useDrawer(): DrawerControls {
  const controls = useContext(DrawerContext);
  if (!controls) {
    throw new Error("useDrawer must be used inside a DrawerContext provider (ProjectShell).");
  }
  return controls;
}
```

Create `src/components/nav/DrawerTrigger.tsx`:

```tsx
"use client";

import { Menu } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { useDrawer } from "./DrawerContext";
import styles from "./DrawerTrigger.module.css";

/**
 * The ☰ button in every project screen's PageHeader `leading` slot.
 *
 * It is its own component (rather than a prop on PageHeader) because PageHeader
 * is a Server Component used by screens outside the project layout too — Home,
 * Projekte, Verwaltung have no drawer. Keeping the client code in the slot means
 * only the screens that HAVE a drawer pay for it.
 *
 * The button is hidden on desktop: there the sidebar is permanently visible, so
 * a trigger for it would open a drawer nobody needs.
 */
export function DrawerTrigger() {
  const { open } = useDrawer();

  return (
    <button type="button" aria-label="Menü öffnen" className={styles.trigger} onClick={open}>
      <Icon icon={Menu} size={19} />
    </button>
  );
}
```

Create `src/components/nav/DrawerTrigger.module.css`:

```css
/* 44px box: the handoff's PWA rule for tap targets. The negative margin pulls
   the glyph back to the header's 16px padding edge without shrinking the box. */
.trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: -12px;
  border: 0;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
}

/* Desktop shows the permanent sidebar (900px — see globals.css). */
@media (min-width: 900px) {
  .trigger {
    display: none;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/nav/DrawerTrigger.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/DrawerContext.tsx src/components/nav/DrawerTrigger.tsx src/components/nav/DrawerTrigger.module.css src/components/nav/DrawerTrigger.test.tsx
git commit -m "feat(nav): drawer context and the ☰ trigger"
```

---

## Task 5: `ProjectNavPanel` — the shared navigation content

Identical content in the mobile drawer and the desktop sidebar (handoff § Navigation): switcher card on top, Listen / Archiv, a `PROJEKT` section with Favoriten / Katalog / Mitglieder, and Verwaltung / Abmelden pinned to the bottom.

**Files:**
- Create: `src/components/nav/ProjectNavPanel.tsx`, `src/components/nav/ProjectNavPanel.module.css`
- Test: `src/components/nav/ProjectNavPanel.test.tsx`

**Interfaces:**
- Consumes: `Avatar`, `Icon` from `@/components/ui/`; `usePathname` from `next/navigation`.
- Produces:
  - `interface NavProject { id: string; name: string }`
  - `ProjectNavPanel(props: { projectId: string; projectName: string; projects: NavProject[]; activeListCount: number; memberCount: number; isAdmin: boolean; signOutAction: () => Promise<void>; onNavigate?: () => void })`

- [ ] **Step 1: Write the failing test**

Create `src/components/nav/ProjectNavPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { ProjectNavPanel } from "./ProjectNavPanel";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

const noop = async () => {};

function renderPanel(overrides: Partial<Parameters<typeof ProjectNavPanel>[0]> = {}) {
  const props = {
    projectId: "p1",
    projectName: "Haushalt",
    projects: [
      { id: "p1", name: "Haushalt" },
      { id: "p2", name: "Camping" },
    ],
    activeListCount: 3,
    memberCount: 4,
    isAdmin: false,
    signOutAction: noop,
    ...overrides,
  };
  return { ...render(<ProjectNavPanel {...props} />), props };
}

describe("ProjectNavPanel", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/projects/p1");
  });

  it("links to all five project screens with their counts", () => {
    renderPanel();

    expect(screen.getByRole("link", { name: /Listen/ })).toHaveAttribute("href", "/projects/p1");
    expect(screen.getByRole("link", { name: /Archiv/ })).toHaveAttribute(
      "href",
      "/projects/p1/archiv",
    );
    expect(screen.getByRole("link", { name: /Favoriten/ })).toHaveAttribute(
      "href",
      "/projects/p1/favoriten",
    );
    expect(screen.getByRole("link", { name: /Katalog/ })).toHaveAttribute(
      "href",
      "/projects/p1/katalog",
    );
    expect(screen.getByRole("link", { name: /Mitglieder/ })).toHaveAttribute(
      "href",
      "/projects/p1/mitglieder",
    );
    // The two counts the design puts on the right of a nav row.
    expect(screen.getByRole("link", { name: /Listen/ })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /Mitglieder/ })).toHaveTextContent("4");
  });

  // aria-current is how the "white pill" active state is exposed to assistive
  // tech — the class name itself is never asserted.
  it("marks the current screen, and only that one", () => {
    vi.mocked(usePathname).mockReturnValue("/projects/p1/katalog");
    renderPanel();

    expect(screen.getByRole("link", { name: /Katalog/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Listen/ })).not.toHaveAttribute("aria-current");
  });

  it("treats the bare project path as Listen, not as a prefix of every screen", () => {
    vi.mocked(usePathname).mockReturnValue("/projects/p1");
    renderPanel();

    expect(screen.getByRole("link", { name: /Listen/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Archiv/ })).not.toHaveAttribute("aria-current");
  });

  it("opens the project switcher and lists every project, ticking the active one", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /Projekt wechseln/ }));

    const camping = screen.getByRole("link", { name: /Camping/ });
    expect(camping).toHaveAttribute("href", "/projects/p2");
    // The ✓ is on the project you are already in.
    expect(screen.getByRole("link", { name: /Haushalt/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Neues Projekt…" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("hides Verwaltung from non-admins and shows it to admins", () => {
    const { unmount } = renderPanel({ isAdmin: false });
    expect(screen.queryByRole("link", { name: "Verwaltung" })).not.toBeInTheDocument();
    unmount();

    renderPanel({ isAdmin: true });
    expect(screen.getByRole("link", { name: "Verwaltung" })).toHaveAttribute("href", "/admin");
  });

  it("always offers Abmelden", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
  });

  // The mobile drawer must close behind a tapped link; the desktop sidebar passes
  // no callback and therefore stays put.
  it("reports a navigation so the drawer can close itself", async () => {
    const onNavigate = vi.fn();
    renderPanel({ onNavigate });

    await userEvent.click(screen.getByRole("link", { name: /Archiv/ }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/nav/ProjectNavPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProjectNavPanel"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/nav/ProjectNavPanel.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  Library,
  ListChecks,
  LogOut,
  Plus,
  Shield,
  Star,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import styles from "./ProjectNavPanel.module.css";

/** The minimum the switcher needs about a project the user belongs to. */
export interface NavProject {
  id: string;
  name: string;
}

type ProjectNavPanelProps = {
  /** The project whose screens this panel navigates. */
  projectId: string;
  projectName: string;
  /** Every project the caller is a member of — the switcher's dropdown. */
  projects: NavProject[];
  activeListCount: number;
  memberCount: number;
  /** Drives the „Verwaltung" entry. Visibility only — /admin re-checks for real. */
  isAdmin: boolean;
  /** Server Action; passed down so the panel never touches auth itself. */
  signOutAction: () => Promise<void>;
  /** The mobile drawer passes its close(); the desktop sidebar passes nothing. */
  onNavigate?: () => void;
};

/** One nav row's data, before it is turned into a link. */
type NavEntry = {
  label: string;
  href: string;
  glyph: LucideIcon;
  /** Rendered right-aligned. Omitted (not "0") when the design shows no count. */
  count?: number;
};

/**
 * The navigation content shared by the mobile drawer and the desktop sidebar
 * (handoff § Navigation: „Gleicher Inhalt").
 *
 * Why one component for both: the two differ only in their container — an
 * overlay panel versus a fixed column. Building them separately would guarantee
 * that the next nav entry lands in one and not the other.
 *
 * Why it is a client component: the active row is derived from usePathname, and
 * the project switcher is a dropdown with local open state. The DATA is still
 * server-owned — everything arrives as props from the layout, so a project rename
 * shows up here through revalidation, not through a client fetch.
 */
export function ProjectNavPanel({
  projectId,
  projectName,
  projects,
  activeListCount,
  memberCount,
  isAdmin,
  signOutAction,
  onNavigate,
}: ProjectNavPanelProps) {
  const pathname = usePathname();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Exact comparison, not startsWith: „/projects/p1" is a prefix of every other
  // screen's path, so a prefix test would light up „Listen" everywhere.
  const isCurrent = (href: string) => pathname === href;

  const mainEntries: NavEntry[] = [
    { label: "Listen", href: `/projects/${projectId}`, glyph: ListChecks, count: activeListCount },
    { label: "Archiv", href: `/projects/${projectId}/archiv`, glyph: Archive },
  ];

  const projectEntries: NavEntry[] = [
    { label: "Favoriten", href: `/projects/${projectId}/favoriten`, glyph: Star },
    { label: "Katalog", href: `/projects/${projectId}/katalog`, glyph: Library },
    { label: "Mitglieder", href: `/projects/${projectId}/mitglieder`, glyph: Users, count: memberCount },
  ];

  // Every nav row is built here so the active styling, the icon size and the
  // drawer-closing callback can never drift between the two groups.
  const renderEntry = (entry: NavEntry) => {
    const active = isCurrent(entry.href);
    return (
      <Link
        key={entry.href}
        href={entry.href}
        // aria-current is the semantic half of the design's "white pill"; the
        // CSS Module hangs off the same attribute so the two cannot disagree.
        aria-current={active ? "page" : undefined}
        className={styles.entry}
        onClick={onNavigate}
      >
        <Icon icon={entry.glyph} size={17} className={styles.entryIcon} />
        <span className={styles.entryLabel}>{entry.label}</span>
        {entry.count === undefined ? null : (
          <span className={styles.entryCount}>{entry.count}</span>
        )}
      </Link>
    );
  };

  return (
    // <nav> gives the navigation landmark; the German label distinguishes it from
    // any other nav a screen might add later.
    <nav className={styles.panel} aria-label="Projektnavigation">
      <div className={styles.switcher}>
        <button
          type="button"
          className={styles.switcherCard}
          aria-expanded={switcherOpen}
          aria-label={`Projekt wechseln: ${projectName}`}
          onClick={() => setSwitcherOpen((open) => !open)}
        >
          <Avatar name={projectName} size={30} />
          <span className={styles.switcherName}>{projectName}</span>
          <Icon icon={ChevronDown} size={13} className={styles.switcherChevron} />
        </button>

        {switcherOpen && (
          <div className={styles.dropdown}>
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                // aria-current="true" (not "page"): from the switcher's point of
                // view this marks the SELECTED item of a list, which is what the
                // design's ✓ means — the page itself may be any of the five.
                aria-current={project.id === projectId ? "true" : undefined}
                className={styles.dropdownRow}
                onClick={() => {
                  setSwitcherOpen(false);
                  onNavigate?.();
                }}
              >
                <Avatar name={project.name} size={24} />
                <span className={styles.dropdownName}>{project.name}</span>
                {project.id === projectId && (
                  <Icon icon={Check} size={14} className={styles.dropdownCheck} />
                )}
              </Link>
            ))}
            {/* „＋ Neues Projekt…" goes to /projects, which is where the create
                row lives. A create form inside the dropdown would be a second
                place to maintain the same action. */}
            <Link
              href="/projects"
              className={styles.dropdownRow}
              onClick={() => {
                setSwitcherOpen(false);
                onNavigate?.();
              }}
            >
              <span className={styles.dropdownPlus} aria-hidden="true">
                <Icon icon={Plus} size={13} />
              </span>
              <span className={styles.dropdownNewLabel}>Neues Projekt…</span>
            </Link>
          </div>
        )}
      </div>

      <div className={styles.group}>{mainEntries.map(renderEntry)}</div>

      {/* Not a SectionLabel: that primitive is an <h2> for screen content, and a
          caption inside a nav landmark must not enter the document outline. */}
      <p className={styles.groupLabel}>PROJEKT</p>
      <div className={styles.group}>{projectEntries.map(renderEntry)}</div>

      <div className={styles.spacer} />

      {isAdmin && (
        <Link href="/admin" className={styles.entry} onClick={onNavigate}>
          <Icon icon={Shield} size={17} className={styles.entryIcon} />
          <span className={styles.entryLabel}>Verwaltung</span>
        </Link>
      )}

      {/* A form, not a link: signing out is a mutation, and the Server Action
          keeps the session handling on the server. */}
      <form action={signOutAction}>
        <button type="submit" className={styles.signOut}>
          <Icon icon={LogOut} size={17} className={styles.entryIcon} />
          <span className={styles.entryLabel}>Abmelden</span>
        </button>
      </form>
    </nav>
  );
}
```

Create `src/components/nav/ProjectNavPanel.module.css`:

```css
/* Handoff § Navigation + Optionen 4a. Drawer and sidebar share this content, so
   only the container (ProjectShell) differs between mobile and desktop. */
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px 12px;
  background: var(--color-bg-sidebar);
}

.switcher {
  position: relative;
}

.switcherCard {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  text-align: left;
}

.switcherName {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.switcherChevron {
  flex: none;
  color: var(--color-text-muted);
}

.dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 5;
  margin-top: 6px;
  overflow: hidden;
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-dropdown);
}

.dropdownRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--color-hairline-weak);
}

.dropdownRow:last-child {
  border-bottom: 0;
}

.dropdownName {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.dropdownCheck {
  flex: none;
  color: var(--color-accent);
}

/* The dashed square marks „Neues Projekt…" as the create affordance — the same
   dashed language the inline-edit rest state uses. */
.dropdownPlus {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 1.5px dashed var(--color-control-border);
  border-radius: 7px;
  color: var(--color-text-muted);
}

.dropdownNewLabel {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 14px;
}

.groupLabel {
  padding: 16px 12px 6px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  color: var(--color-text-muted);
}

/* One row shape for links and the sign-out button, so the two never drift. */
.entry,
.signOut {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  /* 10px + 17px glyph + 10px = 37px; min-height lifts it to the 44px tap rule. */
  min-height: 44px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--radius-control);
  background: none;
  cursor: pointer;
  text-align: left;
}

/* The design's active state: a white pill with the card shadow. */
.entry[aria-current="page"] {
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.entryIcon {
  flex: none;
  color: var(--color-control-border);
}

.entry[aria-current="page"] .entryIcon {
  color: var(--color-accent);
  opacity: 0.85;
}

.entryLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14.5px;
  color: var(--color-text-secondary);
}

.entry[aria-current="page"] .entryLabel {
  font-weight: 700;
  color: var(--color-text-primary);
}

.entryCount {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
}

/* Pushes Verwaltung / Abmelden to the foot of the panel. */
.spacer {
  flex: 1;
}

.signOut .entryLabel {
  color: var(--color-text-muted);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/nav/ProjectNavPanel.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/ProjectNavPanel.tsx src/components/nav/ProjectNavPanel.module.css src/components/nav/ProjectNavPanel.test.tsx
git commit -m "feat(nav): shared project navigation panel with project switcher"
```

---

## Task 6: `ProjectShell` — overlay drawer on mobile, fixed sidebar on desktop

**Files:**
- Create: `src/components/nav/ProjectShell.tsx`, `src/components/nav/ProjectShell.module.css`
- Test: `src/components/nav/ProjectShell.test.tsx`

**Interfaces:**
- Consumes: `DrawerContext` (Task 4), `ProjectNavPanel` + `NavProject` (Task 5).
- Produces: `ProjectShell(props: { nav: ProjectNavPanelData; signOutAction: () => Promise<void>; children: ReactNode })` where
  `interface ProjectNavPanelData { projectId: string; projectName: string; projects: NavProject[]; activeListCount: number; memberCount: number; isAdmin: boolean }`
  (exported from `ProjectShell.tsx` for the layout to type its read).

- [ ] **Step 1: Write the failing test**

Create `src/components/nav/ProjectShell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { DrawerTrigger } from "./DrawerTrigger";
import { ProjectShell } from "./ProjectShell";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

const noop = async () => {};

function renderShell() {
  return render(
    <ProjectShell
      nav={{
        projectId: "p1",
        projectName: "Haushalt",
        projects: [{ id: "p1", name: "Haushalt" }],
        activeListCount: 3,
        memberCount: 4,
        isAdmin: false,
      }}
      signOutAction={noop}
    >
      {/* Stands in for a screen: a page's PageHeader leading slot. */}
      <DrawerTrigger />
      <p>Screen-Inhalt</p>
    </ProjectShell>,
  );
}

describe("ProjectShell", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/projects/p1");
  });

  it("renders the screen and the permanent sidebar navigation", () => {
    renderShell();

    expect(screen.getByText("Screen-Inhalt")).toBeInTheDocument();
    // The sidebar is always in the DOM; CSS hides it below 900px.
    expect(screen.getByRole("navigation", { name: "Projektnavigation" })).toBeInTheDocument();
  });

  it("opens a second, modal navigation when the trigger is tapped", async () => {
    renderShell();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(drawer).toBeInTheDocument();
    // Sidebar + drawer now both render the panel.
    expect(screen.getAllByRole("navigation", { name: "Projektnavigation" })).toHaveLength(2);
  });

  it("closes the drawer on Escape", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the drawer when the dim overlay is tapped", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    await userEvent.click(screen.getByTestId("drawer-overlay"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Tapping a nav entry navigates; leaving the drawer open over the new screen
  // would hide the very thing the user asked for.
  it("closes the drawer when a nav entry inside it is tapped", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    const archiv = within(drawer).getByRole("link", { name: /Archiv/ });
    await userEvent.click(archiv);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/nav/ProjectShell.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProjectShell"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/nav/ProjectShell.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DrawerContext, type DrawerControls } from "./DrawerContext";
import { ProjectNavPanel, type NavProject } from "./ProjectNavPanel";
import styles from "./ProjectShell.module.css";

/** Everything the navigation renders, read once by the layout on the server. */
export interface ProjectNavPanelData {
  projectId: string;
  projectName: string;
  projects: NavProject[];
  activeListCount: number;
  memberCount: number;
  isAdmin: boolean;
}

type ProjectShellProps = {
  nav: ProjectNavPanelData;
  /** Server Action, forwarded to the panel's „Abmelden" form. */
  signOutAction: () => Promise<void>;
  /** The screen (a Server Component) rendered inside the shell. */
  children: ReactNode;
};

/**
 * The navigation shell wrapping every project screen: a permanent 250px sidebar
 * from 900px up, an overlay drawer below it (handoff § Navigation).
 *
 * Why the sidebar is always in the DOM and hidden with CSS rather than rendered
 * conditionally on a measured width: a JS-measured breakpoint cannot run during
 * the server render, so the first paint would either miss the sidebar or show a
 * drawer that instantly disappears. A media query has no such moment.
 *
 * Why the shell owns the drawer state instead of each screen: the drawer must
 * survive a navigation between screens... it does not, actually — a link click
 * closes it on purpose (see onNavigate). It lives here because the OVERLAY is a
 * sibling of the content, which only the layout can express.
 *
 * Escape handling and the body-scroll lock are duplicated from Sheet rather than
 * extracted: the drawer slides in from the left with its own animation and no
 * grabber or title bar, so sharing an implementation would mean a Sheet with two
 * mutually exclusive halves.
 */
export function ProjectShell({ nav, signOutAction, children }: ProjectShellProps) {
  const [isOpen, setIsOpen] = useState(false);

  // useCallback keeps the context value stable so consumers do not re-render on
  // every shell render (the value object is memoised below for the same reason).
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const controls = useMemo<DrawerControls>(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );

  useEffect(() => {
    // Nothing to wire up while closed — and the early return keeps the cleanup
    // from clearing an overflow lock a sheet on the screen might own.
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    // On document, not on the panel: Escape must work wherever focus sits.
    document.addEventListener("keydown", handleKeyDown);
    // Stops the screen behind the drawer scrolling under the user's thumb.
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <DrawerContext.Provider value={controls}>
      <div className={styles.shell}>
        {/* Desktop sidebar. No onNavigate: it is permanent, so there is nothing
            to close after a tap. */}
        <aside className={styles.sidebar}>
          <ProjectNavPanel {...nav} signOutAction={signOutAction} />
        </aside>

        {/* The screen. It is a column so a page's PageHeader can stay pinned
            while its <main> grows — the layout every screen already assumes. */}
        <div className={styles.content}>{children}</div>

        {isOpen && (
          <>
            {/* A plain div, not a button: it duplicates Escape and the nav links,
                so a nameless tab stop would only add noise (Sheet precedent). */}
            <div className={styles.overlay} data-testid="drawer-overlay" onClick={close} />
            <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Navigation">
              {/* onNavigate={close}: tapping an entry navigates, and a drawer
                  left open would cover the screen the user just asked for. */}
              <ProjectNavPanel {...nav} signOutAction={signOutAction} onNavigate={close} />
            </div>
          </>
        )}
      </div>
    </DrawerContext.Provider>
  );
}
```

Create `src/components/nav/ProjectShell.module.css`:

```css
/* The shell fills the body column that globals.css sets up. */
.shell {
  display: flex;
  flex: 1;
  min-height: 0;
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

/* Mobile: no sidebar at all — the drawer is the navigation. */
.sidebar {
  display: none;
}

/* Desktop breakpoint is 900px (see globals.css — custom properties cannot be
   used inside a media query). */
@media (min-width: 900px) {
  .sidebar {
    display: block;
    flex: none;
    width: var(--sidebar-width);
    border-right: 1px solid #e7e8e4;
  }
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: var(--color-overlay-strong);
  animation: sl-fade var(--motion-fade) ease-out;
}

.drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 21;
  width: 276px;
  max-width: 84vw;
  /* The safe-area padding sits on the drawer, not the panel, so the desktop
     sidebar (same panel) is unaffected. */
  padding-top: var(--safe-top);
  padding-bottom: var(--safe-bottom);
  background: var(--color-bg-sidebar);
  box-shadow: 4px 0 24px rgba(35, 35, 34, 0.18);
  animation: sl-drawer var(--motion-drawer) ease-out;
}

/* The drawer is navigation, and the desktop sidebar already provides it. */
@media (min-width: 900px) {
  .overlay,
  .drawer {
    display: none;
  }
}
```

> `#e7e8e4` (sidebar border) and the drawer shadow are the only literals the token file does not carry. Add them to `globals.css` as `--color-sidebar-border` and `--shadow-drawer` **only if** `src/test/design-tokens.test.ts` is extended in the same commit; otherwise leave them here with this comment. Prefer adding the tokens — check the test file first and follow whichever keeps it green.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/nav/ProjectShell.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/ProjectShell.tsx src/components/nav/ProjectShell.module.css src/components/nav/ProjectShell.test.tsx
git commit -m "feat(nav): project shell with overlay drawer and desktop sidebar"
```

---

## Task 7: The project layout — nav read model, guard, and the ☰ in Katalog

**Files:**
- Create: `src/lib/projects/nav.ts`, `src/app/projects/[projectId]/layout.tsx`
- Test: `src/lib/projects/nav.test.ts`
- Modify: `src/app/projects/[projectId]/katalog/page.tsx`, `src/app/projects/[projectId]/katalog/page.module.css`

**Interfaces:**
- Consumes: `listProjectSummaries` from `@/lib/projects/summaries`; `ProjectShell` + `ProjectNavPanelData` (Task 6); `DrawerTrigger` (Task 4).
- Produces: `getProjectNav(db: PrismaClient, projectId: string, userId: string): Promise<ProjectNavData | null>` where
  `interface ProjectNavData { projectId: string; projectName: string; role: Role; activeListCount: number; memberCount: number; projects: { id: string; name: string }[] }`.
  `null` means "not a member" (or unknown project) — the layout redirects.

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/nav.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "./projects";
import { getProjectNav } from "./nav";

const db = new PrismaClient();
let ownerId: string;
let outsiderId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const outsider = await db.user.create({
    data: { googleSub: "g-out", email: "out@example.com" },
  });
  ownerId = owner.id;
  outsiderId = outsider.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("getProjectNav", () => {
  it("returns the project, its counts, the caller's role and all their projects", async () => {
    const haushalt = await createProject(db, { name: "Haushalt", ownerId });
    await createProject(db, { name: "Camping", ownerId });
    await db.list.create({ data: { projectId: haushalt.id, name: "Einkauf" } });
    await db.list.create({
      data: {
        projectId: haushalt.id,
        name: "Fertig",
        status: "completed",
        completedAt: new Date(),
      },
    });

    const nav = await getProjectNav(db, haushalt.id, ownerId);

    expect(nav).not.toBeNull();
    expect(nav!.projectName).toBe("Haushalt");
    expect(nav!.role).toBe("owner");
    // Only ACTIVE lists — the archive is its own screen.
    expect(nav!.activeListCount).toBe(1);
    expect(nav!.memberCount).toBe(1);
    // The switcher lists every project of the caller, oldest first.
    expect(nav!.projects.map((p) => p.name)).toEqual(["Haushalt", "Camping"]);
  });

  it("returns null for a project the caller is not a member of", async () => {
    const project = await createProject(db, { name: "Fremd", ownerId });

    expect(await getProjectNav(db, project.id, outsiderId)).toBeNull();
  });

  it("returns null for an unknown project id", async () => {
    expect(await getProjectNav(db, "11111111-1111-4111-8111-111111111111", ownerId)).toBeNull();
  });

  // A malformed id arrives straight from the URL segment and must not reach a
  // uuid column (Prisma P2023 → a fake 500).
  it("returns null for a malformed project id", async () => {
    expect(await getProjectNav(db, "not-a-uuid", ownerId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/projects/nav.test.ts`
Expected: FAIL — `Failed to resolve import "./nav"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/projects/nav.ts`:

```ts
import type { PrismaClient, Role } from "@prisma/client";
import { listProjectSummaries } from "./summaries";

/** Everything the navigation shell renders for one project. */
export interface ProjectNavData {
  projectId: string;
  projectName: string;
  /** The CALLER's role — the project screen prints "Deine Rolle: …" from it. */
  role: Role;
  activeListCount: number;
  memberCount: number;
  /** Every project the caller belongs to — the switcher's dropdown. */
  projects: { id: string; name: string }[];
}

/**
 * The navigation read: current project, its two counts, the caller's role, and
 * the project list for the switcher — in ONE query.
 *
 * Why it is built on listProjectSummaries rather than a fresh query: that read
 * model already returns every project the caller is a member of, each with the
 * active-list and member counts and the caller's role. The current project is
 * simply the row whose id matches — so the switcher and the counts cost the same
 * single round-trip.
 *
 * Why `null` instead of throwing: the membership predicate is baked into the
 * query (`memberships: { some: { userId } }`), so "no matching row" covers the
 * unknown project, the malformed id and the non-member alike. All three mean the
 * same thing to the layout — "this project does not exist for you" — and it
 * answers with the redirect to /projects that Slice 2 established, never a 403.
 */
export async function getProjectNav(
  db: PrismaClient,
  projectId: string,
  userId: string,
): Promise<ProjectNavData | null> {
  const summaries = await listProjectSummaries(db, userId);
  const current = summaries.find((summary) => summary.id === projectId);
  if (!current) return null;

  return {
    projectId: current.id,
    projectName: current.name,
    role: current.role,
    activeListCount: current.activeListCount,
    memberCount: current.memberCount,
    // Only id + name: the switcher shows an avatar and a name, nothing else.
    projects: summaries.map((summary) => ({ id: summary.id, name: summary.name })),
  };
}
```

Create `src/app/projects/[projectId]/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getProjectNav } from "@/lib/projects/nav";
import { ProjectShell } from "@/components/nav/ProjectShell";

// Next.js 16: a layout's dynamic params are a Promise and MUST be awaited.
type Props = {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
};

/**
 * The shell around all five project screens (Listen, Archiv, Favoriten, Katalog,
 * Mitglieder).
 *
 * Why the navigation lives in a LAYOUT and not in each page: a layout is not
 * re-rendered when you navigate between its children, so the drawer's open state
 * and the sidebar survive a screen change. Repeating the nav per page would also
 * repeat the read that feeds it.
 *
 * Why each page still runs its own membership guard: a layout guards the
 * RENDER, not the Server Actions the pages define. Those are individually
 * addressable POST endpoints, so the pages re-check for themselves — the
 * defense-in-depth rule this codebase applies everywhere.
 */
export default async function ProjectLayout({ children, params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  // One read covers the guard AND the nav: the membership predicate is inside
  // the query, so `null` already means "not a member / unknown / malformed id".
  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  // Server Action defined here rather than inside the panel: signOut must run on
  // the server, and Server Actions are serialisable across the boundary — so the
  // client panel arranges the UI while the server keeps the session handling.
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <ProjectShell
      nav={{
        projectId: nav.projectId,
        projectName: nav.projectName,
        projects: nav.projects,
        activeListCount: nav.activeListCount,
        memberCount: nav.memberCount,
        // The session flag decides VISIBILITY only; /admin re-reads isAdmin live
        // from the database, so a stale token gets redirected there (Slice 9).
        isAdmin: Boolean(session!.user.isAdmin),
      }}
      signOutAction={signOutAction}
    >
      {children}
    </ProjectShell>
  );
}
```

Modify `src/app/projects/[projectId]/katalog/page.tsx` — replace the `leading` back-link with the drawer trigger, and drop the now-unused imports (`Link` stays only if still used elsewhere in the file; `ChevronLeft` and the `styles.back` reference go):

```tsx
// Remove: import Link from "next/link";
// Remove: import { ChevronLeft } from "lucide-react";
// Remove: import { Icon } from "@/components/ui/Icon";   (only if no other use remains)
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
```

```tsx
      <PageHeader
        title="Katalog"
        // Slice 11: the ☰ drawer trigger replaces Slice 10's back link — the
        // project layout now supplies navigation on every project screen.
        leading={<DrawerTrigger />}
        trailing={<span className={styles.count}>{formatArticleCount(articles.length)}</span>}
      />
```

Delete the `.back` rule from `src/app/projects/[projectId]/katalog/page.module.css` (the 44px box now lives in `DrawerTrigger.module.css`).

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run src/lib/projects/nav.test.ts`
Expected: PASS — 4 tests.

Run: `npm run build`
Expected: succeeds; `/projects/[projectId]` and `/projects/[projectId]/katalog` still compile.

Run: `npm run lint`
Expected: no NEW errors in `src/` (the two pre-existing errors in `docs/design/2026-08-01-ui-handoff/support.js` remain and still exit 1).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/nav.ts src/lib/projects/nav.test.ts src/app/projects/\[projectId\]/layout.tsx src/app/projects/\[projectId\]/katalog/
git commit -m "feat(nav): project layout with the navigation shell; Katalog gets the ☰"
```

---

## Task 8: Project title (inline rename) and the delete-project confirmation

Two small client components the project screen composes. Built together because both are owner-only controls on the same screen and neither is worth its own review gate.

**Files:**
- Create: `src/app/projects/[projectId]/ProjectTitle.tsx`, `ProjectTitle.module.css`, `DeleteProjectButton.tsx`, `DeleteProjectButton.module.css`
- Test: `src/app/projects/[projectId]/ProjectTitle.test.tsx`, `src/app/projects/[projectId]/DeleteProjectButton.test.tsx`

**Interfaces:**
- Consumes: `InlineEdit`, `Button`, `ConfirmSheet` from `@/components/ui/`.
- Produces:
  - `ProjectTitle({ name, editable, renameAction }: { name: string; editable: boolean; renameAction: (name: string) => Promise<void> })`
  - `DeleteProjectButton({ projectName, deleteAction }: { projectName: string; deleteAction: () => Promise<void> })`

- [ ] **Step 1: Write the failing tests**

Create `src/app/projects/[projectId]/ProjectTitle.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectTitle } from "./ProjectTitle";

describe("ProjectTitle", () => {
  it("renames on Enter and reports the new name", async () => {
    const renameAction = vi.fn(async () => {});
    render(<ProjectTitle name="Haushalt" editable renameAction={renameAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Haushalt" }));
    const field = screen.getByLabelText("Projektname");
    await userEvent.clear(field);
    await userEvent.type(field, "Wohnung{Enter}");

    expect(renameAction).toHaveBeenCalledWith("Wohnung");
  });

  // Owner-only controls are NOT rendered for members (handoff § Destruktive
  // Aktionen / Inline-Editing: "nur wo editierbar").
  it("shows a member plain text with no editing affordance", () => {
    render(<ProjectTitle name="Haushalt" editable={false} renameAction={async () => {}} />);

    expect(screen.getByText("Haushalt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Haushalt" })).not.toBeInTheDocument();
  });
});
```

Create `src/app/projects/[projectId]/DeleteProjectButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteProjectButton } from "./DeleteProjectButton";

describe("DeleteProjectButton", () => {
  it("does not delete before the sheet is confirmed", async () => {
    const deleteAction = vi.fn(async () => {});
    render(<DeleteProjectButton projectName="Haushalt" deleteAction={deleteAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Projekt löschen…" }));

    expect(screen.getByRole("dialog", { name: /Projekt löschen: Haushalt/ })).toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it("deletes once the destructive option is chosen", async () => {
    const deleteAction = vi.fn(async () => {});
    render(<DeleteProjectButton projectName="Haushalt" deleteAction={deleteAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Projekt löschen…" }));
    await userEvent.click(screen.getByRole("button", { name: /^Projekt endgültig löschen/ }));

    expect(deleteAction).toHaveBeenCalledTimes(1);
  });

  it("closes again on Abbrechen without deleting", async () => {
    const deleteAction = vi.fn(async () => {});
    render(<DeleteProjectButton projectName="Haushalt" deleteAction={deleteAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Projekt löschen…" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/projects/[projectId]/ProjectTitle.test.tsx" "src/app/projects/[projectId]/DeleteProjectButton.test.tsx"`
Expected: FAIL — both imports unresolved.

- [ ] **Step 3: Write the implementations**

Create `src/app/projects/[projectId]/ProjectTitle.tsx`:

```tsx
"use client";

import { InlineEdit } from "@/components/ui/InlineEdit";
import styles from "./ProjectTitle.module.css";

type ProjectTitleProps = {
  name: string;
  /** true only for the owner — a member sees plain text (handoff screen 3e). */
  editable: boolean;
  /** Server Action; receives the trimmed, actually-changed name. */
  renameAction: (name: string) => Promise<void>;
};

/**
 * The project name in the screen header, inline-editable for the owner.
 *
 * Why a wrapper around InlineEdit rather than using it directly in the page:
 * the page is a Server Component, and InlineEdit needs a client callback. This
 * component is the boundary — it holds no state of its own, it only forwards.
 *
 * InlineEdit already decides what "no change" means (trim + compare), so an
 * unchanged rename never reaches the server and never becomes a sync delta for
 * the other members.
 */
export function ProjectTitle({ name, editable, renameAction }: ProjectTitleProps) {
  return (
    <span className={styles.title}>
      <InlineEdit
        value={name}
        label="Projektname"
        editable={editable}
        onSave={(next) => renameAction(next)}
      />
    </span>
  );
}
```

Create `src/app/projects/[projectId]/ProjectTitle.module.css`:

```css
/* The header title size (handoff: Screen-Titel 18px/700). InlineEdit draws the
   dashed rest state and the focused field; only the type scale belongs here. */
.title {
  min-width: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
}

@media (min-width: 900px) {
  .title {
    font-size: 21px;
    font-weight: 800;
  }
}
```

Create `src/app/projects/[projectId]/DeleteProjectButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import styles from "./DeleteProjectButton.module.css";

type DeleteProjectButtonProps = {
  projectName: string;
  /** Server Action; it re-checks ownership and redirects to /projects. */
  deleteAction: () => Promise<void>;
};

/**
 * „Projekt löschen…" plus its confirmation sheet (handoff screen 3e + the shared
 * destructive pattern).
 *
 * The trigger is a text button, never a filled one — the design reserves filled
 * destructive surfaces for the confirmation itself.
 *
 * The only state here is whether the sheet is open; the mutation is a Server
 * Action prop, so the page keeps ownership of it and of its requireOwner check.
 */
export function DeleteProjectButton({ projectName, deleteAction }: DeleteProjectButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setConfirmOpen(true)}>
        Projekt löschen…
      </button>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Projekt löschen: ${projectName}`}
        options={[
          {
            label: "Projekt endgültig löschen",
            description:
              "Alle Listen, der Katalog und die Favoriten dieses Projekts verschwinden mit. Das lässt sich nicht rückgängig machen.",
            tone: "danger",
            // ConfirmSheet does not close itself on select — same Gallery pattern
            // as CatalogEditPanel: fire the mutation, then drop the sheet.
            onSelect: () => {
              void deleteAction();
              setConfirmOpen(false);
            },
          },
        ]}
      />
    </>
  );
}
```

Create `src/app/projects/[projectId]/DeleteProjectButton.module.css`:

```css
/* Handoff § Destruktive Aktionen: 12.5–13px/600 in the destructive colour, never
   a filled button inside a screen's content flow. */
.trigger {
  align-self: flex-start;
  padding: 14px 2px 0;
  border: 0;
  background: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-danger);
  cursor: pointer;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/projects/[projectId]/ProjectTitle.test.tsx" "src/app/projects/[projectId]/DeleteProjectButton.test.tsx"`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[projectId]/ProjectTitle.tsx" "src/app/projects/[projectId]/ProjectTitle.module.css" "src/app/projects/[projectId]/ProjectTitle.test.tsx" "src/app/projects/[projectId]/DeleteProjectButton.tsx" "src/app/projects/[projectId]/DeleteProjectButton.module.css" "src/app/projects/[projectId]/DeleteProjectButton.test.tsx"
git commit -m "feat(ui): inline project rename and guarded project deletion"
```

---

## Task 9: The „Neue Liste" sheet with a de-selectable pre-fill preview

The signature interaction of the slice: the hero card opens a bottom sheet showing exactly which articles the new list will start with, each one droppable, with a live count in the button label.

**Files:**
- Modify: `src/lib/format/plural.ts`, `src/lib/format/plural.test.ts`
- Create: `src/app/projects/[projectId]/NewListSheet.tsx`, `src/app/projects/[projectId]/NewListSheet.module.css`
- Test: `src/app/projects/[projectId]/NewListSheet.test.tsx`

**Interfaces:**
- Consumes: `Sheet`, `TextField`, `Button`, `Chip`, `Toggle` (Task 3); `SuggestedArticle` from `@/lib/suggestions/suggestions`.
- Produces:
  - `formatNewListLabel(count: number): string` — the whole button label: `"Leere Liste anlegen"` / `"Liste mit 1 Eintrag anlegen"` / `"Liste mit 7 Einträgen anlegen"`.
  - `NewListSheet({ suggestions, favoriteIds, heroTitle, heroSubtitle, createAction }: { suggestions: SuggestedArticle[]; favoriteIds: string[]; heroTitle: string; heroSubtitle: string; createAction: (formData: FormData) => void | Promise<void> })`.
  - The form it submits carries `name` (string) and zero or more `articleName` entries, read server-side with `formData.getAll("articleName")`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/format/plural.test.ts`:

```ts
describe("formatNewListLabel", () => {
  it("names the empty case without a number", () => {
    expect(formatNewListLabel(0)).toBe("Leere Liste anlegen");
  });

  it("uses the DATIVE singular for exactly one", () => {
    expect(formatNewListLabel(1)).toBe("Liste mit 1 Eintrag anlegen");
  });

  // "mit" governs the dative, so the plural is "Einträgen", not "Einträge" —
  // the exact trap this helper exists to keep out of the call site.
  it("uses the dative plural for many", () => {
    expect(formatNewListLabel(7)).toBe("Liste mit 7 Einträgen anlegen");
  });
});
```

(Add `formatNewListLabel` to the file's existing import from `./plural`.)

Create `src/app/projects/[projectId]/NewListSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SuggestedArticle } from "@/lib/suggestions/suggestions";
import { NewListSheet } from "./NewListSheet";

const milch: SuggestedArticle = {
  catalogItemId: "c1",
  name: "Milch",
  defaultCategory: "Molkerei",
  defaultUnit: "l",
};
const brot: SuggestedArticle = {
  catalogItemId: "c2",
  name: "Brot",
  defaultCategory: null,
  defaultUnit: null,
};
const nudeln: SuggestedArticle = {
  catalogItemId: "c3",
  name: "Nudeln",
  defaultCategory: null,
  defaultUnit: null,
};

function renderSheet(overrides: Partial<Parameters<typeof NewListSheet>[0]> = {}) {
  const props = {
    suggestions: [milch, brot, nudeln],
    favoriteIds: [milch.catalogItemId],
    heroTitle: "Vorbefüllte Liste anlegen",
    heroSubtitle: "Startet mit Favoriten + häufigen Artikeln",
    createAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<NewListSheet {...props} />), props };
}

describe("NewListSheet", () => {
  it("opens the sheet from the hero card", async () => {
    renderSheet();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    expect(screen.getByRole("dialog", { name: "Neue Liste" })).toBeInTheDocument();
  });

  it("counts every suggestion in the button label by default", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    expect(screen.getByRole("button", { name: "Liste mit 3 Einträgen anlegen" })).toBeInTheDocument();
  });

  it("drops a single article from the selection and recounts", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.click(screen.getByRole("button", { name: /Brot/ }));

    expect(screen.getByRole("button", { name: "Liste mit 2 Einträgen anlegen" })).toBeInTheDocument();
  });

  it("puts a dropped article back when tapped again", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.click(screen.getByRole("button", { name: /Brot/ }));
    await userEvent.click(screen.getByRole("button", { name: /Brot/ }));

    expect(screen.getByRole("button", { name: "Liste mit 3 Einträgen anlegen" })).toBeInTheDocument();
  });

  // Switching pre-fill off is a different intent from de-selecting everything:
  // it also hides the preview.
  it("turns the whole pre-fill off and relabels the button", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.click(screen.getByRole("switch", { name: "Vorbefüllen" }));

    expect(screen.getByRole("button", { name: "Leere Liste anlegen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Milch/ })).not.toBeInTheDocument();
  });

  it("says „Leere Liste anlegen“ when every suggestion was dropped", async () => {
    renderSheet({ suggestions: [milch], favoriteIds: [] });
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.click(screen.getByRole("button", { name: /Milch/ }));

    expect(screen.getByRole("button", { name: "Leere Liste anlegen" })).toBeInTheDocument();
  });

  // The hidden fields ARE the contract with the Server Action, so they are
  // asserted through the submitted FormData rather than through the DOM.
  it("submits the name and exactly the surviving articles", async () => {
    const createAction = vi.fn();
    renderSheet({ createAction });
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.type(screen.getByLabelText("Listenname"), "Einkauf");
    await userEvent.click(screen.getByRole("button", { name: /Brot/ }));
    await userEvent.click(screen.getByRole("button", { name: "Liste mit 2 Einträgen anlegen" }));

    expect(createAction).toHaveBeenCalledTimes(1);
    const formData = createAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Einkauf");
    expect(formData.getAll("articleName")).toEqual(["Milch", "Nudeln"]);
  });

  it("submits no articles at all when pre-fill is off", async () => {
    const createAction = vi.fn();
    renderSheet({ createAction });
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.type(screen.getByLabelText("Listenname"), "Baumarkt");
    await userEvent.click(screen.getByRole("switch", { name: "Vorbefüllen" }));
    await userEvent.click(screen.getByRole("button", { name: "Leere Liste anlegen" }));

    const formData = createAction.mock.calls[0][0] as FormData;
    expect(formData.getAll("articleName")).toEqual([]);
  });

  // With nothing to pre-fill there is no preview and no switch — the sheet
  // collapses to "name a list".
  it("hides the pre-fill controls when the project has no suggestions yet", async () => {
    renderSheet({ suggestions: [], favoriteIds: [] });
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leere Liste anlegen" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/format/plural.test.ts "src/app/projects/[projectId]/NewListSheet.test.tsx"`
Expected: FAIL — `formatNewListLabel is not a function`, and the `NewListSheet` import unresolved.

- [ ] **Step 3: Write the implementations**

Append to `src/lib/format/plural.ts`:

```ts
/**
 * The „Neue Liste"-Sheet's submit label, which counts live as the user drops
 * suggestions (handoff § State Management).
 *
 * Why the helper returns the WHOLE sentence rather than just "N Einträge": the
 * label reads „Liste mit N Einträgen anlegen", and the preposition „mit" governs
 * the dative — so the plural is „Einträgen", not the nominative „Einträge", while
 * the singular „Eintrag" is unchanged. Handing the call site a nominative count
 * to concatenate is exactly how that ungrammatical string gets shipped.
 *
 * 0 is not "Liste mit 0 Einträgen": the design switches to „Leere Liste anlegen",
 * because an empty pre-fill is a different intent, not a degenerate count.
 */
export function formatNewListLabel(count: number): string {
  if (count === 0) return "Leere Liste anlegen";
  return `Liste mit ${count} ${count === 1 ? "Eintrag" : "Einträgen"} anlegen`;
}
```

Create `src/app/projects/[projectId]/NewListSheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { Toggle } from "@/components/ui/Toggle";
import type { SuggestedArticle } from "@/lib/suggestions/suggestions";
import { formatNewListLabel } from "@/lib/format/plural";
import styles from "./NewListSheet.module.css";

type NewListSheetProps = {
  /** The project's suggestion set, computed on the SERVER (favorites ∪ statistic). */
  suggestions: SuggestedArticle[];
  /** Which of them are favourites — they get the ★ and sort first. */
  favoriteIds: string[];
  /** Hero card copy; the empty project uses a different pair (handoff 5b). */
  heroTitle: string;
  heroSubtitle: string;
  /** Server Action. Reads `name` and every `articleName` from the FormData. */
  createAction: (formData: FormData) => void | Promise<void>;
};

/**
 * The hero card plus the „Neue Liste" bottom sheet — the project screen's
 * signature action (handoff screen 3e + § State Management).
 *
 * Why the suggestions arrive as PROPS instead of a GET /suggestions fetch: the
 * page that renders this is a Server Component and has already read them. A
 * client fetch would add a round-trip, a loading state and a second source of
 * truth for data the server just held in its hand. (The meta plan's phrasing
 * "reads GET /suggestions first" describes the behaviour, not the transport; the
 * Slice 10 log fixed the transport as "server-owned data, client view state".)
 *
 * Why the selection is expressed as an EXCLUSION set: the design's default is
 * "everything is in", and a set of ids the user removed keeps that default true
 * even when the suggestion list changes between renders — an inclusion set would
 * silently drop newly-suggested articles.
 *
 * Why hidden inputs rather than JSON: the sheet is a plain <form> posting to a
 * Server Action, so the surviving selection travels as repeated `articleName`
 * fields — no serialisation format to agree on, and it degrades gracefully.
 */
export function NewListSheet({
  suggestions,
  favoriteIds,
  heroTitle,
  heroSubtitle,
  createAction,
}: NewListSheetProps) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState(true);
  // Ids the user tapped away. Set (not array) because the only operations are
  // membership tests and toggles.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const favorites = new Set(favoriteIds);

  // Favourites first (they carry the ★ and are the "always" half of the rule),
  // each half keeping computeSuggestions' alphabetical order.
  const ordered = [
    ...suggestions.filter((article) => favorites.has(article.catalogItemId)),
    ...suggestions.filter((article) => !favorites.has(article.catalogItemId)),
  ];

  // What the list will actually start with. Empty when the toggle is off — that
  // is the difference between "pre-fill nothing" and "pre-fill an empty set".
  const selected = prefill
    ? ordered.filter((article) => !excluded.has(article.catalogItemId))
    : [];

  const toggleArticle = (catalogItemId: string) => {
    setExcluded((current) => {
      // A new Set on every change: mutating state in place would not re-render.
      const next = new Set(current);
      if (next.has(catalogItemId)) next.delete(catalogItemId);
      else next.add(catalogItemId);
      return next;
    });
  };

  // Re-open with a clean slate, so a cancelled attempt never leaks its
  // de-selections into the next list.
  const openSheet = () => {
    setPrefill(true);
    setExcluded(new Set());
    setOpen(true);
  };

  return (
    <>
      {/* The visually heaviest action on the screen — the signature feature gets
          the accent surface and the hero shadow. */}
      <button type="button" className={styles.hero} onClick={openSheet}>
        <span className={styles.heroTitle}>{heroTitle}</span>
        <span className={styles.heroSubtitle}>{heroSubtitle}</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Neue Liste">
        <form action={createAction} className={styles.form}>
          <TextField name="name" aria-label="Listenname" placeholder="Listenname" autoFocus />

          {/* No suggestions means nothing to preview and nothing to switch off —
              a young project simply names its list. */}
          {suggestions.length > 0 && (
            <>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Vorbefüllen</span>
                <span className={styles.toggleHint}>Favoriten + häufige Artikel</span>
                <Toggle checked={prefill} onChange={setPrefill} label="Vorbefüllen" />
              </div>

              {prefill && (
                <>
                  <div className={styles.chips}>
                    {ordered.map((article) => {
                      const dropped = excluded.has(article.catalogItemId);
                      const favorite = favorites.has(article.catalogItemId);
                      return (
                        <Chip
                          key={article.catalogItemId}
                          tone={favorite ? "accent" : "neutral"}
                          struck={dropped}
                          onClick={() => toggleArticle(article.catalogItemId)}
                        >
                          {favorite ? `★ ${article.name}` : article.name}
                        </Chip>
                      );
                    })}
                  </div>
                  <p className={styles.legend}>
                    ★ Favoriten · übrige aus den letzten abgeschlossenen Listen
                  </p>
                </>
              )}
            </>
          )}

          {/* The selection travels as repeated fields; the action reads them with
              formData.getAll("articleName"). Only names — the catalog resolves
              them and supplies the defaults (see createListWithArticles). */}
          {selected.map((article) => (
            <input
              key={article.catalogItemId}
              type="hidden"
              name="articleName"
              value={article.name}
            />
          ))}

          <div className={styles.submit}>
            {/* One helper owns the whole label, dative plural included. */}
            <Button type="submit" fullWidth>
              {formatNewListLabel(selected.length)}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
```

Create `src/app/projects/[projectId]/NewListSheet.module.css`:

```css
/* Handoff screen 3e: the hero card is the visually heaviest element of the
   project screen — accent fill, 14px radius, the accent-tinted shadow. */
.hero {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 15px 16px;
  border: 0;
  border-radius: var(--radius-panel);
  background: var(--color-accent);
  box-shadow: var(--shadow-hero);
  cursor: pointer;
  text-align: left;
}

.heroTitle {
  font-size: 15px;
  font-weight: 800;
  color: var(--color-on-accent);
}

.heroSubtitle {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--color-on-accent);
  opacity: 0.9;
}

.form {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}

.toggleRow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.toggleLabel {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.toggleHint {
  flex: 1;
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 11px;
}

.legend {
  margin-top: 9px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.submit {
  margin-top: 16px;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/format/plural.test.ts "src/app/projects/[projectId]/NewListSheet.test.tsx"`
Expected: PASS — 2 new plural tests + 10 sheet tests, plus every pre-existing plural test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/plural.ts src/lib/format/plural.test.ts "src/app/projects/[projectId]/NewListSheet.tsx" "src/app/projects/[projectId]/NewListSheet.module.css" "src/app/projects/[projectId]/NewListSheet.test.tsx"
git commit -m "feat(ui): Neue-Liste sheet with a de-selectable pre-fill preview"
```

---

## Task 10: The project screen — only Listen

Rewrites `src/app/projects/[projectId]/page.tsx`. Members, favourites, archive and the two create forms leave; the hero card, the secondary „Leere Liste" row and „AKTIVE LISTEN" arrive.

**Files:**
- Modify: `src/app/projects/[projectId]/page.tsx`
- Create: `src/app/projects/[projectId]/page.module.css`

**Interfaces:**
- Consumes: `listActiveListSummaries` (Task 1), `createListWithArticles` (Task 2), `DrawerTrigger` (Task 4), `ProjectTitle` + `DeleteProjectButton` (Task 8), `NewListSheet` (Task 9), `computeSuggestions` + `listFavorites`, `formatOpenCount`.
- Produces: the `/projects/[projectId]` screen. No new exported API.

- [ ] **Step 1: Write the new page**

Replace the whole of `src/app/projects/[projectId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ListChecks } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { deleteProject, renameProject } from "@/lib/projects/projects";
import { requireMembership, requireOwner } from "@/lib/projects/guard";
import { getProjectNav } from "@/lib/projects/nav";
import { listActiveListSummaries } from "@/lib/lists/summaries";
import { listFavorites } from "@/lib/favorites/favorites";
import { computeSuggestions, createListWithArticles } from "@/lib/suggestions/suggestions";
import { formatOpenCount } from "@/lib/format/plural";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowLink } from "@/components/ui/RowLink";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField } from "@/components/ui/TextField";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { ProjectTitle } from "./ProjectTitle";
import { DeleteProjectButton } from "./DeleteProjectButton";
import { NewListSheet } from "./NewListSheet";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The project screen, reduced to ONE concern: the project's open lists
 * (handoff screen 3e).
 *
 * Slice 11 moved members, favourites, the archive and the catalog link out into
 * their own screens behind the drawer. What is left is the working surface: name
 * the list, create it (pre-filled or empty), open one.
 *
 * Server Component: it reads the session and calls the domain layer directly,
 * no HTTP round-trip. The three client components it renders (ProjectTitle,
 * NewListSheet, DeleteProjectButton) receive Server Actions as props, so every
 * mutation stays server-owned.
 */
export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  // The layout already guarded the render, but this page defines Server Actions
  // — individually addressable POST endpoints — so it re-checks for itself.
  // getProjectNav answers null for non-member / unknown / malformed alike.
  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  const isOwner = nav.role === "owner";

  // Three independent reads → Promise.all: one round-trip of latency, not three.
  // The suggestions and the favourite ids feed the sheet's preview; the summaries
  // feed the list rows.
  const [activeLists, suggestions, favorites] = await Promise.all([
    listActiveListSummaries(prisma, projectId),
    computeSuggestions(prisma, projectId),
    listFavorites(prisma, projectId),
  ]);

  // The sheet needs to know WHICH suggestions are favourites (for the ★ and the
  // ordering). Favourites are a subset of the suggestion set, so an id list is
  // all that has to cross the boundary.
  const favoriteIds = favorites.map((favorite) => favorite.catalogItemId);

  // --- Server Actions ---------------------------------------------------------
  // Each re-derives identity and re-checks permission (defense in depth).

  /**
   * Creates a list from the sheet's surviving selection and jumps into it.
   * Member-level: per the permission matrix every member may create lists.
   */
  async function createFromSheetAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (the convention across this app).

    // getAll: the sheet posts one `articleName` field per surviving chip. An
    // empty result is the legitimate "Leere Liste anlegen" case.
    const articleNames = formData.getAll("articleName").map((value) => String(value));

    const list = await createListWithArticles(prisma, { projectId, name, articleNames });
    // redirect() throws a special Next.js error internally — it must not be
    // wrapped in try/catch, and nothing may run after it.
    redirect(`/lists/${list.id}`);
  }

  /** The secondary „Leere Liste" row next to the hero card. Member-level. */
  async function createEmptyListAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    await createListWithArticles(prisma, { projectId, name, articleNames: [] });
    revalidatePath(`/projects/${projectId}`);
  }

  /** Inline rename. Owner-only (handoff: members see plain text). */
  async function renameAction(name: string) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);

    const trimmed = name.trim();
    if (!trimmed) return;

    await renameProject(prisma, projectId, trimmed);
    // "layout" scope, not the default: the drawer and the sidebar print the
    // project name too, and they live in the layout above this page.
    revalidatePath(`/projects/${projectId}`, "layout");
  }

  /** Deletes the project and leaves. Owner-only. */
  async function deleteAction() {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    await deleteProject(prisma, projectId);
    redirect("/projects");
  }

  // The hero copy differs between a project with lists and one without: the
  // empty state invites a FIRST list and does not promise pre-fill yet, because
  // there is no history to pre-fill from (handoff 5b).
  const hasLists = activeLists.length > 0;
  const newListSheet = (
    <NewListSheet
      suggestions={suggestions}
      favoriteIds={favoriteIds}
      heroTitle={hasLists ? "Vorbefüllte Liste anlegen" : "Erste Liste anlegen"}
      heroSubtitle={
        hasLists
          ? "Startet mit Favoriten + häufigen Artikeln"
          : "Später auch vorbefüllt mit deinen Favoriten"
      }
      createAction={createFromSheetAction}
    />
  );

  return (
    <>
      {/* No hairline: the hero card carries the visual weight right below
          (handoff screen 3e). */}
      <PageHeader
        title={nav.projectName}
        hairline={false}
        leading={<DrawerTrigger />}
        trailing={
          <span className={styles.role}>Deine Rolle: {isOwner ? "Owner" : "Mitglied"}</span>
        }
      />
      {/* PageHeader renders the name as its <h1>; the editable version replaces
          it visually. Rendering both would duplicate the heading, so the header's
          title stays the accessible name and ProjectTitle sits in the content. */}
      <main className={styles.content}>
        <div className={styles.titleRow}>
          <ProjectTitle name={nav.projectName} editable={isOwner} renameAction={renameAction} />
        </div>

        {hasLists ? (
          <>
            {newListSheet}

            {/* The quiet alternative to the hero: name it, get an empty list. */}
            <form action={createEmptyListAction} className={styles.emptyRow}>
              <div className={styles.emptyField}>
                <TextField name="name" aria-label="Listenname" placeholder="Listenname…" />
              </div>
              <Button type="submit" variant="secondary">
                Leere Liste
              </Button>
            </form>

            <div className={styles.section}>
              <SectionLabel>AKTIVE LISTEN</SectionLabel>
            </div>
            {activeLists.map((list) => (
              <RowLink
                key={list.id}
                href={`/lists/${list.id}`}
                title={list.name}
                trailing={<span className={styles.openCount}>{formatOpenCount(list.openCount)}</span>}
              />
            ))}
          </>
        ) : (
          // Empty state 5b: the hero card IS the action, directly under the copy.
          <div className={styles.empty}>
            <EmptyState
              icon={<Icon icon={ListChecks} size={22} />}
              title="Noch keine Liste"
              description="Sobald Listen abgeschlossen sind, kann Smart Lists neue Listen vorbefüllen."
            >
              {newListSheet}
            </EmptyState>
          </div>
        )}

        {/* Owner-only, and NOT rendered for members — never merely disabled. */}
        {isOwner && (
          <DeleteProjectButton projectName={nav.projectName} deleteAction={deleteAction} />
        )}
      </main>
    </>
  );
}
```

Create `src/app/projects/[projectId]/page.module.css`:

```css
/* Handoff screen 3e / Optionen 4b. */
.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 8px var(--screen-padding) calc(24px + var(--safe-bottom));
}

.role {
  flex: none;
  font-size: 11.5px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.titleRow {
  display: flex;
  align-items: center;
  min-width: 0;
}

.emptyRow {
  display: flex;
  gap: 8px;
}

/* The field must be allowed to shrink, or the button is pushed off a 375px
   screen (min-width:0 defeats the flex item's automatic min-content floor). */
.emptyField {
  flex: 1;
  min-width: 0;
}

.section {
  margin-top: 6px;
}

.openCount {
  flex: none;
  font-size: 12.5px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

/* Lets the empty state centre itself in the remaining height instead of
   hugging the header (the fix Slice 14 applied to /projects). */
.empty {
  display: flex;
  flex: 1;
}

@media (min-width: 900px) {
  .content {
    padding-left: var(--screen-padding-desktop);
    padding-right: var(--screen-padding-desktop);
    max-width: calc(var(--content-max-width) + 2 * var(--screen-padding-desktop));
  }
}
```

- [ ] **Step 2: Verify the whole suite still passes**

Run: `npx vitest run`
Expected: PASS — everything, including the pre-existing suites. No test targets this page directly (Server Components are not rendered in this suite); the safety net is the domain tests plus the build below.

- [ ] **Step 3: Build and lint**

Run: `npm run build`
Expected: succeeds; `/projects/[projectId]` compiles as a dynamic route.

Run: `npm run lint`
Expected: no NEW findings under `src/`.

- [ ] **Step 4: Manual smoke check**

Run `npm run dev`, sign in, open a project. Confirm: ☰ opens the drawer; the hero card opens the sheet; „Liste mit N Einträgen anlegen" navigates into a pre-filled list; „Leere Liste" creates an empty one; the owner sees the dashed rename affordance and „Projekt löschen…", a member sees neither.

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[projectId]/page.tsx" "src/app/projects/[projectId]/page.module.css"
git commit -m "feat(ui): project screen reduced to Listen, with the new-list sheet"
```

---

## Task 11: The Archiv screen

**Files:**
- Create: `src/app/projects/[projectId]/archiv/page.tsx`, `src/app/projects/[projectId]/archiv/page.module.css`

**Interfaces:**
- Consumes: `listArchivedListSummaries` (Task 1), `getProjectNav` (Task 7), `DrawerTrigger`, `formatGermanDate`, `EmptyState`, `PageHeader`, `Icon`.
- Produces: the `/projects/[projectId]/archiv` screen.

- [ ] **Step 1: Write the screen**

Create `src/app/projects/[projectId]/archiv/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getProjectNav } from "@/lib/projects/nav";
import { listArchivedListSummaries } from "@/lib/lists/summaries";
import { formatGermanDate } from "@/lib/format/date";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The Archiv screen (handoff screen 3f / empty state 5g).
 *
 * Read-only by design: a completed list is reopened from the list screen itself,
 * not from here. That keeps the archive a calm surface — the design deliberately
 * drops the card look for quiet rows.
 *
 * No Server Actions, so the membership check is purely about the render; it is
 * still explicit rather than inherited from the layout, so the page is safe on
 * its own if it is ever moved.
 */
export default async function ArchivePage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  const lists = await listArchivedListSummaries(prisma, projectId);

  return (
    <>
      <PageHeader title="Archiv" leading={<DrawerTrigger />} />
      <main className={styles.content}>
        {lists.length === 0 ? (
          <div className={styles.empty}>
            <EmptyState
              icon={<Icon icon={Check} size={22} />}
              title="Noch nichts abgeschlossen"
              description="Abgeschlossene Listen landen hier — und machen die Vorschläge für neue Listen schlauer."
            />
          </div>
        ) : (
          <>
            <ul className={styles.rows}>
              {lists.map((list) => (
                <li key={list.id}>
                  {/* A plain link, not RowLink: the design explicitly drops the
                      card look here ("Ruhige Zeilen (kein Karten-Look)"). */}
                  <Link href={`/lists/${list.id}`} className={styles.row}>
                    <span className={styles.check} aria-hidden="true">
                      <Icon icon={Check} size={12} />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.name}>{list.name}</span>
                      {/* The date is only printed when the column holds one —
                          see ArchivedListSummary on why it is nullable. */}
                      {list.completedAt && (
                        <span className={styles.meta}>
                          Abgeschlossen am {formatGermanDate(list.completedAt)}
                        </span>
                      )}
                    </span>
                    <Icon icon={ChevronRight} size={16} className={styles.chevron} />
                  </Link>
                </li>
              ))}
            </ul>
            {/* Explains WHY the archive is kept — it feeds the N-of-M statistic. */}
            <p className={styles.footnote}>
              Abgeschlossene Listen speisen die Vorschläge für neue Listen.
            </p>
          </>
        )}
      </main>
    </>
  );
}
```

Create `src/app/projects/[projectId]/archiv/page.module.css`:

```css
/* Handoff screen 3f: quiet rows, no card look. */
.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 8px var(--screen-padding) calc(24px + var(--safe-bottom));
}

.rows {
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--color-hairline-weak);
}

/* The 20px desaturated check circle — the archive's visual signature. */
.check {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-success-tint);
  color: var(--color-text-tertiary);
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.meta {
  font-size: 12px;
  color: var(--color-text-muted);
}

.chevron {
  flex: none;
  color: var(--color-control-border);
}

.footnote {
  padding-top: 14px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

.empty {
  display: flex;
  flex: 1;
}

@media (min-width: 900px) {
  .content {
    padding-left: var(--screen-padding-desktop);
    padding-right: var(--screen-padding-desktop);
    max-width: calc(var(--content-max-width) + 2 * var(--screen-padding-desktop));
  }
}
```

- [ ] **Step 2: Build and check the route exists**

Run: `npm run build`
Expected: succeeds and lists `/projects/[projectId]/archiv` among the routes.

- [ ] **Step 3: Run the suite**

Run: `npx vitest run`
Expected: PASS — unchanged count from Task 10.

- [ ] **Step 4: Manual smoke check**

`npm run dev` → drawer → „Archiv". Confirm completed lists appear newest-first with „Abgeschlossen am DD.MM.YYYY", the footnote is present, and a project with no completed lists shows the centred empty state.

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[projectId]/archiv"
git commit -m "feat(ui): Archiv screen per handoff 3f"
```

---

## Task 12: The Favoriten screen

**Files:**
- Create: `src/app/projects/[projectId]/favoriten/page.tsx`, `page.module.css`, `FavoritesEditor.tsx`, `FavoritesEditor.module.css`
- Test: `src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx`

**Interfaces:**
- Consumes: `listFavorites`, `addFavorite`, `removeFavorite`, `getOrCreateCatalogItem`, `searchCatalog` + `CATALOG_DATALIST_LIMIT`, `Banner`, `Chip`, `TextField`, `Button`, `EmptyState`.
- Produces:
  - `FavoritesEditor({ favorites, catalogNames, addAction, removeAction }: { favorites: FavoriteArticle[]; catalogNames: string[]; addAction: (formData: FormData) => void | Promise<void>; removeAction: (formData: FormData) => void | Promise<void> })`
  - the `/projects/[projectId]/favoriten` screen.

- [ ] **Step 1: Write the failing test**

Create `src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FavoriteArticle } from "@/lib/favorites/favorites";
import { FavoritesEditor } from "./FavoritesEditor";

const milch: FavoriteArticle = {
  catalogItemId: "c1",
  name: "Milch",
  defaultCategory: "Molkerei",
  defaultUnit: "l",
};
const brot: FavoriteArticle = {
  catalogItemId: "c2",
  name: "Brot",
  defaultCategory: null,
  defaultUnit: null,
};

function renderEditor(overrides: Partial<Parameters<typeof FavoritesEditor>[0]> = {}) {
  const props = {
    favorites: [milch, brot],
    catalogNames: ["Milch", "Brot", "Butter"],
    addAction: vi.fn(),
    removeAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<FavoritesEditor {...props} />), props };
}

describe("FavoritesEditor", () => {
  it("explains what favourites do", () => {
    renderEditor();

    expect(screen.getByRole("status")).toHaveTextContent(
      /Favoriten landen automatisch in jeder vorbefüllten Liste dieses Projekts/,
    );
  });

  it("shows one chip per favourite with its own remove control", () => {
    renderEditor();

    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Milch entfernen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Brot entfernen" })).toBeInTheDocument();
  });

  it("submits the article id when a favourite is removed", async () => {
    const removeAction = vi.fn();
    renderEditor({ removeAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch entfernen" }));

    expect(removeAction).toHaveBeenCalledTimes(1);
    const formData = removeAction.mock.calls[0][0] as FormData;
    expect(formData.get("catalogItemId")).toBe(milch.catalogItemId);
  });

  it("adds a favourite by name", async () => {
    const addAction = vi.fn();
    renderEditor({ addAction });

    await userEvent.type(screen.getByLabelText("Artikelname"), "Butter");
    await userEvent.click(screen.getByRole("button", { name: "Als Favorit" }));

    const formData = addAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Butter");
  });

  // Zero-JS autocomplete: the catalog is pre-rendered as <datalist> options, so
  // the browser filters them without a round-trip per keystroke.
  it("offers the catalog as native autocomplete options", () => {
    renderEditor();

    const field = screen.getByLabelText("Artikelname");
    const listId = field.getAttribute("list");
    expect(listId).toBeTruthy();
    const datalist = document.getElementById(listId!);
    expect(datalist?.querySelectorAll("option")).toHaveLength(3);
  });

  it("shows the empty state with the add row when there are no favourites", () => {
    renderEditor({ favorites: [] });

    expect(screen.getByText("Noch keine Favoriten")).toBeInTheDocument();
    expect(screen.getByLabelText("Artikelname")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx"`
Expected: FAIL — `Failed to resolve import "./FavoritesEditor"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/projects/[projectId]/favoriten/FavoritesEditor.tsx`:

```tsx
"use client";

import { useId } from "react";
import { Star } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import type { FavoriteArticle } from "@/lib/favorites/favorites";
import styles from "./FavoritesEditor.module.css";

type FavoritesEditorProps = {
  /** Already sorted by the German comparator, straight from the server. */
  favorites: FavoriteArticle[];
  /** Catalog article names for the native autocomplete. */
  catalogNames: string[];
  /** Server Actions. `add` reads `name`, `remove` reads `catalogItemId`. */
  addAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
};

/**
 * The Favoriten screen's body (handoff screen 3g / empty state 5e).
 *
 * Why a client component when it holds no state: `Chip`'s remove control is a
 * callback, not a form submit — a <button> inside a chip inside a form would
 * submit the ADD form. Wrapping each removal in its own tiny form and dispatching
 * it from the callback keeps the mutation a Server Action while the chip stays
 * the primitive the design asks for.
 *
 * Autocomplete is a native <datalist> (the Slice 4/5 pattern): the browser
 * filters the pre-rendered options client-side with zero JS and zero requests.
 * The handoff's richer dropdown with a „„X" neu anlegen" row is the SAME control
 * Slice 12 builds for the trailing entry row — it is reused here once it exists,
 * rather than implemented twice.
 */
export function FavoritesEditor({
  favorites,
  catalogNames,
  addAction,
  removeAction,
}: FavoritesEditorProps) {
  // useId keeps the datalist id unique and stable across server render and
  // hydration — a hard-coded id would collide if this screen ever renders twice.
  const datalistId = useId();

  // Removal without nesting a button inside the add form: build the FormData by
  // hand and hand it to the Server Action directly.
  const removeFavorite = (catalogItemId: string) => {
    const formData = new FormData();
    formData.set("catalogItemId", catalogItemId);
    void removeAction(formData);
  };

  // Built once: it appears inside the empty state AND under the chips.
  const addRow = (
    <form action={addAction} className={styles.addRow}>
      <div className={styles.addField}>
        <TextField
          name="name"
          aria-label="Artikelname"
          placeholder="Artikelname"
          list={datalistId}
          autoComplete="off"
        />
      </div>
      <Button type="submit">Als Favorit</Button>
    </form>
  );

  return (
    <div className={styles.editor}>
      {/* One <datalist> for both branches — it is referenced by id, so it does
          not matter where in the tree it sits. */}
      <datalist id={datalistId}>
        {catalogNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {favorites.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState
            icon={<Icon icon={Star} size={22} />}
            tone="accent"
            title="Noch keine Favoriten"
            description="Favoriten landen automatisch in jeder vorbefüllten Liste — perfekt für Milch, Brot & Co."
          >
            {addRow}
          </EmptyState>
        </div>
      ) : (
        <>
          <Banner tone="info" icon={<Icon icon={Star} size={14} />}>
            Favoriten landen automatisch in <b>jeder</b> vorbefüllten Liste dieses Projekts.
          </Banner>

          <div className={styles.chips}>
            {favorites.map((favorite) => (
              <Chip
                key={favorite.catalogItemId}
                tone="outline"
                onRemove={() => removeFavorite(favorite.catalogItemId)}
                removeLabel={`${favorite.name} entfernen`}
              >
                {favorite.name}
              </Chip>
            ))}
          </div>

          {addRow}
        </>
      )}
    </div>
  );
}
```

Create `src/app/projects/[projectId]/favoriten/FavoritesEditor.module.css`:

```css
/* Handoff screen 3g. */
.editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.addRow {
  display: flex;
  gap: 8px;
}

/* min-width:0 defeats the flex item's min-content floor, so the button survives
   on a 375px screen. */
.addField {
  flex: 1;
  min-width: 0;
}

.empty {
  display: flex;
  flex: 1;
}
```

Create `src/app/projects/[projectId]/favoriten/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getProjectNav } from "@/lib/projects/nav";
import { requireMembership } from "@/lib/projects/guard";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/favorites/favorites";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { CATALOG_DATALIST_LIMIT, searchCatalog } from "@/lib/catalog/search";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { FavoritesEditor } from "./FavoritesEditor";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The Favoriten screen (handoff screen 3g) — the always-suggested half of the
 * pre-fill set, moved out of the old six-in-one project screen.
 *
 * Member-level throughout: favourites and catalog upkeep are allowed for every
 * member (permission matrix, MVP design § 6), so both actions use
 * requireMembership rather than requireOwner.
 */
export default async function FavoritesPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  // Two independent reads → one round-trip of latency. CATALOG_DATALIST_LIMIT
  // (not searchCatalog's short default) because a native <datalist> filters
  // client-side over exactly the options we pre-render.
  const [favorites, catalogItems] = await Promise.all([
    listFavorites(prisma, projectId),
    searchCatalog(prisma, projectId, "", CATALOG_DATALIST_LIMIT),
  ]);

  /**
   * Favourites by NAME, not by id: it is friendlier, and it lets a member
   * favourite an article nobody has listed yet — getOrCreateCatalogItem resolves
   * the name to the project's catalog row (creating it on first use), then
   * addFavorite pins it.
   */
  async function addFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (the convention across this app).

    const catalogItem = await getOrCreateCatalogItem(prisma, { projectId, name });
    await addFavorite(prisma, { projectId, catalogItemId: catalogItem.id });
    revalidatePath(`/projects/${projectId}/favoriten`);
  }

  /** Idempotent: removeFavorite tolerates an already-missing row. */
  async function removeFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const catalogItemId = String(formData.get("catalogItemId") ?? "");
    if (!catalogItemId) return;

    await removeFavorite(prisma, { projectId, catalogItemId });
    revalidatePath(`/projects/${projectId}/favoriten`);
  }

  return (
    <>
      <PageHeader title="Favoriten" leading={<DrawerTrigger />} />
      <main className={styles.content}>
        <FavoritesEditor
          favorites={favorites}
          catalogNames={catalogItems.map((item) => item.name)}
          addAction={addFavoriteAction}
          removeAction={removeFavoriteAction}
        />
      </main>
    </>
  );
}
```

Create `src/app/projects/[projectId]/favoriten/page.module.css`:

```css
.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 12px var(--screen-padding) calc(24px + var(--safe-bottom));
}

@media (min-width: 900px) {
  .content {
    padding-left: var(--screen-padding-desktop);
    padding-right: var(--screen-padding-desktop);
    max-width: calc(var(--content-max-width) + 2 * var(--screen-padding-desktop));
  }
}
```

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run "src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx"`
Expected: PASS — 6 tests.

Run: `npm run build`
Expected: succeeds, `/projects/[projectId]/favoriten` present.

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[projectId]/favoriten"
git commit -m "feat(ui): Favoriten screen with chips and catalog autocomplete"
```

---

## Task 13: The Mitglieder screen

**Files:**
- Create: `src/app/projects/[projectId]/mitglieder/page.tsx`, `page.module.css`, `InviteForm.tsx`, `InviteForm.module.css`, `RemoveMemberButton.tsx`, `RemoveMemberButton.module.css`
- Test: `src/app/projects/[projectId]/mitglieder/InviteForm.test.tsx`, `src/app/projects/[projectId]/mitglieder/RemoveMemberButton.test.tsx`

**Interfaces:**
- Consumes: `listMembers`, `addMember`, `removeMember`, `ApiError`, `Card`, `Avatar`, `Badge`, `TextField`, `Button`, `ConfirmSheet`, `SectionLabel`.
- Produces:
  - `interface InviteFormState { error: string | null }` and `INVITE_FORM_IDLE: InviteFormState` (exported from `InviteForm.tsx`).
  - `InviteForm({ action }: { action: (prev: InviteFormState, formData: FormData) => Promise<InviteFormState> })`
  - `RemoveMemberButton({ memberLabel, userId, removeAction }: { memberLabel: string; userId: string; removeAction: (formData: FormData) => void | Promise<void> })`

- [ ] **Step 1: Write the failing tests**

Create `src/app/projects/[projectId]/mitglieder/InviteForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteForm, INVITE_FORM_IDLE, type InviteFormState } from "./InviteForm";

describe("InviteForm", () => {
  it("submits the typed email", async () => {
    const action = vi.fn(async (): Promise<InviteFormState> => INVITE_FORM_IDLE);
    render(<InviteForm action={action} />);

    await userEvent.type(screen.getByLabelText("E-Mail-Adresse"), "anna@web.de");
    await userEvent.click(screen.getByRole("button", { name: "Einladen" }));

    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("email")).toBe("anna@web.de");
  });

  // The domain throws "Nutzer nicht gefunden – …" for someone who has never
  // signed in. That must land next to the field, not as a crash overlay.
  it("paints the German error next to the field", async () => {
    const action = async (): Promise<InviteFormState> => ({
      error: "Nutzer nicht gefunden – die Person muss sich zuerst einmal anmelden.",
    });
    render(<InviteForm action={action} />);

    await userEvent.type(screen.getByLabelText("E-Mail-Adresse"), "niemand@web.de");
    await userEvent.click(screen.getByRole("button", { name: "Einladen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nutzer nicht gefunden/);
  });

  it("explains the allowlist rule", () => {
    render(<InviteForm action={async () => INVITE_FORM_IDLE} />);

    expect(
      screen.getByText("Nur freigeschaltete E-Mail-Adressen können eingeladen werden."),
    ).toBeInTheDocument();
  });
});
```

Create `src/app/projects/[projectId]/mitglieder/RemoveMemberButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemoveMemberButton } from "./RemoveMemberButton";

function renderButton(removeAction = vi.fn()) {
  render(<RemoveMemberButton memberLabel="Ben" userId="u2" removeAction={removeAction} />);
  return removeAction;
}

describe("RemoveMemberButton", () => {
  it("names the member it would remove", async () => {
    renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));

    expect(screen.getByRole("dialog", { name: "Mitglied entfernen: Ben" })).toBeInTheDocument();
  });

  it("does not remove before the sheet is confirmed", async () => {
    const removeAction = renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));

    expect(removeAction).not.toHaveBeenCalled();
  });

  it("submits the user id once confirmed", async () => {
    const removeAction = renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    await userEvent.click(screen.getByRole("button", { name: /^Aus dem Projekt entfernen/ }));

    expect(removeAction).toHaveBeenCalledTimes(1);
    const formData = removeAction.mock.calls[0][0] as FormData;
    expect(formData.get("userId")).toBe("u2");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/projects/[projectId]/mitglieder"`
Expected: FAIL — both imports unresolved.

- [ ] **Step 3: Write the implementations**

Create `src/app/projects/[projectId]/mitglieder/InviteForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField } from "@/components/ui/TextField";
import styles from "./InviteForm.module.css";

/** What the invite action reports back to the field. */
export interface InviteFormState {
  /** A German message, or null when the last attempt succeeded. */
  error: string | null;
}

/** The state before anything has been submitted. */
export const INVITE_FORM_IDLE: InviteFormState = { error: null };

type InviteFormProps = {
  /** Server Action with the useActionState signature. */
  action: (prev: InviteFormState, formData: FormData) => Promise<InviteFormState>;
};

/**
 * The owner-only „MITGLIED EINLADEN" block (handoff screen 3i).
 *
 * Why useActionState instead of letting the action throw: inviting somebody who
 * has never signed in is a NORMAL outcome here (the domain answers "Nutzer nicht
 * gefunden – die Person muss sich zuerst einmal anmelden."), and a crash overlay
 * is the wrong way to deliver a sentence the user is meant to act on. This is the
 * inline-error pattern the design specifies and Slice 10's catalog screen
 * established.
 */
export function InviteForm({ action }: InviteFormProps) {
  const [state, formAction] = useActionState(action, INVITE_FORM_IDLE);

  return (
    <div className={styles.block}>
      <SectionLabel>MITGLIED EINLADEN</SectionLabel>
      <form action={formAction} className={styles.row}>
        <div className={styles.field}>
          <TextField
            type="email"
            name="email"
            aria-label="E-Mail-Adresse"
            placeholder="E-Mail-Adresse"
            error={state.error}
          />
        </div>
        <Button type="submit">Einladen</Button>
      </form>
      {/* States the closed-access rule up front, so a failed invite is not the
          first time the owner hears about the allowlist. */}
      <p className={styles.hint}>Nur freigeschaltete E-Mail-Adressen können eingeladen werden.</p>
    </div>
  );
}
```

Create `src/app/projects/[projectId]/mitglieder/InviteForm.module.css`:

```css
.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.row {
  display: flex;
  gap: 8px;
}

.field {
  flex: 1;
  min-width: 0;
}

.hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-muted);
}
```

Create `src/app/projects/[projectId]/mitglieder/RemoveMemberButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import styles from "./RemoveMemberButton.module.css";

type RemoveMemberButtonProps = {
  /** Display name or email — whatever the row shows, so the sheet matches it. */
  memberLabel: string;
  userId: string;
  /** Server Action; reads `userId` from the FormData. */
  removeAction: (formData: FormData) => void | Promise<void>;
};

/**
 * „Entfernen" on a member row, plus its confirmation sheet.
 *
 * Removing a member revokes their access to every list in the project, so it
 * takes the shared destructive pattern rather than a bare button: the sheet
 * spells the consequence out and the dangerous option carries the destructive
 * surface.
 *
 * The row itself never renders this for the owner (the owner cannot be removed)
 * or for a member's view — the page decides that, so this component stays a dumb
 * trigger.
 */
export function RemoveMemberButton({
  memberLabel,
  userId,
  removeAction,
}: RemoveMemberButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmRemoval = () => {
    // FormData built by hand: the confirmation lives in a sheet, outside any
    // <form> (the CatalogEditPanel precedent).
    const formData = new FormData();
    formData.set("userId", userId);
    void removeAction(formData);
    // ConfirmSheet does not close itself on select — fire, then close.
    setConfirmOpen(false);
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setConfirmOpen(true)}>
        Entfernen
      </button>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Mitglied entfernen: ${memberLabel}`}
        options={[
          {
            label: "Aus dem Projekt entfernen",
            description:
              "Die Person verliert sofort den Zugriff auf alle Listen dieses Projekts. Du kannst sie jederzeit wieder einladen.",
            tone: "danger",
            onSelect: confirmRemoval,
          },
        ]}
      />
    </>
  );
}
```

Create `src/app/projects/[projectId]/mitglieder/RemoveMemberButton.module.css`:

```css
/* Handoff § Destruktive Aktionen: 12.5px/600 destructive text, never a filled
   button inside a list row. */
.trigger {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-danger);
  white-space: nowrap;
  cursor: pointer;
}
```

Create `src/app/projects/[projectId]/mitglieder/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { getProjectNav } from "@/lib/projects/nav";
import { requireOwner } from "@/lib/projects/guard";
import { addMember, listMembers, removeMember } from "@/lib/projects/membership";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { InviteForm, INVITE_FORM_IDLE, type InviteFormState } from "./InviteForm";
import { RemoveMemberButton } from "./RemoveMemberButton";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The Mitglieder screen (handoff screen 3i).
 *
 * Read-only for members: the design says the owner-only controls are simply not
 * rendered, never disabled — so a member sees the roster and nothing else.
 */
export default async function MembersPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  const isOwner = nav.role === "owner";
  const members = await listMembers(prisma, projectId);

  /**
   * Invite by email. Owner-only.
   *
   * RETURNS its error instead of throwing, because useActionState is what puts
   * the message inline on the field that caused it. Only ApiError carries
   * user-facing German copy — anything else is a real bug and is re-thrown on
   * purpose (the toFormState rule from the catalog screen).
   */
  async function inviteAction(
    _prev: InviteFormState,
    formData: FormData,
  ): Promise<InviteFormState> {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);

    const email = String(formData.get("email") ?? "").trim();
    if (!email) return INVITE_FORM_IDLE; // Silent no-op on an empty submission.

    try {
      await addMember(prisma, { projectId, email });
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message };
      throw error;
    }

    // "layout" scope: the drawer prints the member count too.
    revalidatePath(`/projects/${projectId}/mitglieder`, "layout");
    return INVITE_FORM_IDLE;
  }

  /**
   * Remove a member. Owner-only. removeMember refuses to remove the owner
   * (403) — the button is not rendered for the owner row anyway, but the guard
   * is what actually enforces it.
   */
  async function removeMemberAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);

    const memberUserId = String(formData.get("userId") ?? "");
    if (!memberUserId) return;

    await removeMember(prisma, { projectId, userId: memberUserId });
    revalidatePath(`/projects/${projectId}/mitglieder`, "layout");
  }

  return (
    <>
      <PageHeader title="Mitglieder" leading={<DrawerTrigger />} />
      <main className={styles.content}>
        <Card>
          <ul className={styles.rows}>
            {members.map((membership) => {
              // The display name only exists after the first login; the email is
              // always there, so it is the fallback for both the row and the
              // confirmation sheet.
              const label = membership.user.displayName ?? membership.user.email;
              const isSelf = membership.userId === userId;
              return (
                <li key={membership.id} className={styles.row}>
                  <Avatar name={label} size={30} />
                  <span className={styles.text}>
                    <span className={styles.name}>
                      {label}
                      {isSelf ? " (du)" : ""}
                    </span>
                    <span className={styles.email}>{membership.user.email}</span>
                  </span>
                  {membership.role === "owner" && <Badge>OWNER</Badge>}
                  {/* Never for the owner (they cannot be removed) and never in a
                      member's view — not rendered, not disabled. */}
                  {isOwner && membership.role !== "owner" && (
                    <RemoveMemberButton
                      memberLabel={label}
                      userId={membership.userId}
                      removeAction={removeMemberAction}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {isOwner && <InviteForm action={inviteAction} />}
      </main>
    </>
  );
}
```

Create `src/app/projects/[projectId]/mitglieder/page.module.css`:

```css
/* Handoff screen 3i. */
.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 12px var(--screen-padding) calc(24px + var(--safe-bottom));
}

.rows {
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-hairline-weak);
}

.row:last-child {
  border-bottom: 0;
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
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

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run "src/app/projects/[projectId]/mitglieder"`
Expected: PASS — 6 tests.

Run: `npm run build`
Expected: succeeds, `/projects/[projectId]/mitglieder` present.

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[projectId]/mitglieder"
git commit -m "feat(ui): Mitglieder screen with inline invite errors and guarded removal"
```

---

## Task 14: Gallery entry, full verification, review and progress log

**Files:**
- Modify: `src/app/dev/ui/Gallery.tsx`
- Create: `docs/implementation-reviews/slice-11-app-structure-navigation.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

- [x] **Step 1: Add the `Toggle` to the dev gallery**

In `src/app/dev/ui/Gallery.tsx`: import `Toggle` from `@/components/ui/Toggle`, add `const [prefill, setPrefill] = useState(true);` beside the other state, and add a section after „Chips":

```tsx
      <SectionLabel>Schalter</SectionLabel>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Vorbefüllen</span>
        <Toggle checked={prefill} onChange={setPrefill} label="Vorbefüllen" />
      </div>
```

The nav components are deliberately NOT added: they require a `DrawerContext` provider and a route, so the drawer is verified on a real screen instead.

- [x] **Step 2: Run the full suite, lint and build**

Run: `npx vitest run`
Expected: PASS — every file. Record the file/test counts for the review.

Run: `npm run lint`
Expected: no findings under `src/`. (The two pre-existing errors + eight warnings in `docs/design/2026-08-01-ui-handoff/support.js` remain and still make the command exit 1 — note this in the review, do not "fix" the design bundle.)

Run: `npm run build`
Expected: succeeds. All five project routes present.

- [x] **Step 3: Manual browser checklist**

`npm run dev`, sign in, then confirm on **one project as owner** and (if a second account is available) **as a member**:

1. ☰ opens the drawer on a narrow window; the dim overlay, Escape and a nav tap all close it.
2. At ≥900px the drawer is gone and the sidebar is permanently visible.
3. The active nav row is the white pill on each of Listen / Archiv / Favoriten / Katalog / Mitglieder — and only one at a time.
4. The switcher lists every project, ✓ on the current one, and „Neues Projekt…" lands on `/projects`.
5. „Listen" shows the active count, „Mitglieder" the member count; both update after a create/invite.
6. Hero card → sheet: name, toggle off/on, drop and restore chips, watch the button label count; „Liste mit N Einträgen anlegen" lands in a list holding exactly those entries.
7. „Leere Liste" creates an empty list without leaving the screen.
8. Owner: dashed project name renames inline (the drawer's name updates too); „Projekt löschen…" confirms and lands on `/projects`. Member: neither control is in the DOM.
9. Archiv: newest-completed first, „Abgeschlossen am DD.MM.YYYY", the footnote; empty archive shows the centred empty state.
10. Favoriten: banner, chips with ✕, add by name with the datalist; empty project shows empty state 5e.
11. Mitglieder: OWNER badge, „(du)", „Entfernen" only in the owner's view and never on the owner row; inviting an unknown address paints the German error next to the field instead of crashing.
12. Katalog: the header now shows ☰ instead of the back arrow, and everything Slice 10 verified still works.
13. 375px width: no horizontal scroll on any of the five screens.
14. Verwaltung appears in the drawer only for an admin.

Record PASS/FAIL per item; a FAIL that is not a product-rule violation goes in the review as inherited debt, with a note.

- [x] **Step 4: Write the implementation review**

Create `docs/implementation-reviews/slice-11-app-structure-navigation.md` in English, following the five required sections from CLAUDE.md § Implementation review:

1. **What was achieved** — the slice goal and whether it was fully met.
2. **Steps taken** — one paragraph per task.
3. **Core components built** — every new file with a sentence on its role.
4. **Most important lines of code** — 5–10 quoted blocks with why each carries conceptual weight. Strong candidates: `DrawerContext` + the "a layout passes children, it cannot reach into them" reasoning; `pathname === href` (why exact, not prefix); `getProjectNav` returning `null` for three different failures; the exclusion-set in `NewListSheet`; the repeated `articleName` hidden fields as the client→server contract; `revalidatePath(..., "layout")`.
5. **Architecture contribution** — the app now has a navigation shell and five separate project screens; Slice 12 reworks the list screen underneath it, and Slice 15 follows.

Also state explicitly: the four deferrals from this plan's "What this slice deliberately does NOT do", and the deviation that the sheet's suggestions arrive as server props rather than through `GET /suggestions`.

- [x] **Step 5: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

1. Set row 11 to ✅ and link `[2026-08-02-slice-11-app-structure-navigation.md](2026-08-02-slice-11-app-structure-navigation.md)` in the Plan column.
2. Add a progress-log entry at the TOP of the log using the file's template: Delivered / Tested (command + result) / Deviations from the plan / Follow-up decisions for later slices / Inherited open items / Commit(s).
   Follow-up decisions worth recording:
   - Project screens live under a layout with a `ProjectShell`; **any new project screen must put `<DrawerTrigger />` in its `PageHeader` `leading` slot** and guard itself with `getProjectNav`.
   - `getProjectNav` is the single membership+nav read for project screens; `null` means redirect to `/projects`.
   - `createListWithArticles` is the explicit create path; `createPrefilledList` is now a wrapper and stays the REST `prefill: true` entry point.
   - The Favoriten autocomplete is still a native `<datalist>`; **Slice 12's trailing-row autocomplete should be built as a reusable component and adopted here.**
   - The list screen keeps its `← Zum Projekt` link and gets no drawer until Slice 12.
3. Note that **Slice 12 (List interaction rework) is the next open slice** (plan still to be created).

- [x] **Step 6: Commit**

```bash
git add src/app/dev/ui/Gallery.tsx docs/implementation-reviews/slice-11-app-structure-navigation.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md docs/superpowers/plans/2026-08-02-slice-11-app-structure-navigation.md
git commit -m "docs: Slice 11 implementation review + meta-plan progress log"
```

---

## Self-review notes (for the executor)

Checked against the handoff and the meta plan; three things worth carrying in your head while implementing:

- **`PageHeader` renders the project name as `<h1>` while `ProjectTitle` renders it again in the content.** That is deliberate (the header keeps the accessible name; the editable copy sits where the design draws it) but it means the name appears twice on screen at desktop widths. If it looks wrong in the browser, the fix is to give the project screen a `PageHeader` with a non-duplicating title — decide it in the browser, in Task 10, and record the choice in the review.
- **`revalidatePath(path, "layout")`** is what refreshes the drawer's project name and member count. A plain `revalidatePath(path)` only re-renders the page and leaves a stale name in the sidebar.
- **The `ProjectShell` test asserts two `navigation` landmarks when the drawer is open** (sidebar + drawer). That is correct for the DOM even though CSS hides one of them; if you change the shell to render the sidebar conditionally, that test must change with it.
