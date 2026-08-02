# Slice 12 — List interaction rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the list screen's four-field add form with a trailing empty input row, add a category filter chip row with auto-assignment, move Menge/Einheit/Kategorie into an entry detail bottom sheet, and add swipe-to-delete — all in the Slice 13 visual language, with Slice 7's polling untouched.

**Architecture:** The page stays a Server Component that owns every read and every mutation (Server Actions calling `applyOperation` — the same entry-level operations funnel Slice 3 built). What changes is that the list *body* becomes a client component (`ListBody`), because the chips, the trailing row and the swipe gesture are all view state that must not cost a server round-trip per keystroke or per pixel. Data still never originates on the client: entries, the catalog and the known categories arrive as props, and after every mutation `revalidatePath` hands the client component a fresh array while its own state (active chip, typed text, open sheet) survives. All the decision logic — category grouping, chip ordering, autocomplete matching, swipe thresholds, quantity parsing — is extracted into pure modules under `src/lib/`, tested in the node environment, so the React components stay thin.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), React 19 (`useActionState`, `startTransition`), TypeScript, Prisma/Neon, CSS Modules, `lucide-react` (always through `Icon`), Vitest (node for DB/lib tests, jsdom + Testing Library for component tests).

## Global Constraints

- **In-app user-facing strings are German.** Code identifiers, comments, docs are English.
- **Every German label is copied verbatim from the handoff** (`docs/design/2026-08-01-ui-handoff/README.md` and the two `.dc.html` prototypes). Do not paraphrase, do not "improve" wording. German quotes are `„…“` (the `CatalogBrowser` precedent).
- **Styling: CSS Modules only.** No inline styles except a computed value a CSS Module cannot express — in this slice that is exactly one thing: the swipe row's `transform: translateX(<px>)` and the delete surface's opacity (the `ProgressBar` fill precedent).
- **Icons: `lucide-react`, always through `@/components/ui/Icon`** (stroke 1.75, `aria-hidden`). Never import a Lucide glyph into markup directly.
- **Build screens out of the primitives in `src/components/ui/`.** Do not restyle from scratch: `Button`, `TextField`/`FieldError`, `Card`, `RowLink`, `Avatar`, `Badge`, `SectionLabel`, `Chip`, `ChipTabs`, `EmptyState`, `Sheet`, `ConfirmSheet`, `InlineEdit`, `Banner`, `PageHeader`, `ProgressBar`, `Toggle`, `Icon`.
- **Design tokens only.** Colours, radii, shadows, motion and layout come from the custom properties in `src/app/globals.css`. No new hex literals in a CSS Module. The desktop breakpoint is the literal `900px` in every media query.
- **Every mutation goes through `applyOperation`.** `add_item` / `update_item` / `check_item` / `remove_item` are the ONLY way entries change (MVP design §4.5). No new entry-mutation path, no direct `prisma.listItem.update` in a Server Action.
- **`update_item` is field-granular.** One operation per changed field, and **only for fields the user actually changed** — sending an unchanged field would clobber a concurrent remote edit under last-writer-wins.
- **Every Server Action re-derives identity via `auth()` and re-checks permission** (`requireListAccess` for everything on this screen — entry and list operations are member-level per the permission matrix). A Server Action is an individually addressable POST endpoint.
- **Destructive actions confirm through a bottom sheet** (`ConfirmSheet`) that spells out the consequence — **when the consequence is irreversible or cascading** (Projekt/Liste löschen, Mitglied entfernen, Zugang entziehen). A single entry is neither: it is re-added by typing the name, and the catalog keeps its category/unit. **Never nest a ConfirmSheet inside an open Sheet** — `Sheet` has no focus trap and its body-scroll cleanup is not stack-aware (two `aria-modal` dialogs, shared Escape handlers, overflow unlock on inner unmount). Entry delete (swipe threshold or the sheet's „Eintrag löschen") has no second confirmation; an Undo-banner for both paths is Slice 16 scope, not this slice. `ConfirmSheet` does not close itself: an `onSelect` fires the mutation *and* closes the sheet.
- **Every function gets a comment explaining what it does and why it exists; every non-obvious block gets an inline comment.** Named patterns are named. This is a learning project — see CLAUDE.md § Code documentation standard. Never thin out existing comments while editing a file.
- **Component tests** start with `// @vitest-environment jsdom`, use Testing Library, and assert **roles and text — never CSS-Module class names**.
- **Tests run with** `npx vitest run <path>` (needs `.env.test` with the Neon test-branch `DATABASE_URL`). DB tests call `resetDb(db)` in `beforeEach` and `db.$disconnect()` in `afterAll`.
- **Tap targets ≥ 44px; safe areas via `--safe-top` / `--safe-bottom`; `touch-action: pan-y` on swipeable rows.**
- **Commit after every task.** Conventional commits; either language, consistent within a change.

## What this slice deliberately does NOT do

State these in the review; do not silently expand scope.

- **No quantity parsing.** „1,5 l Milch" → Menge/Einheit is **Slice 15**. The trailing row is name-only: whatever the user types is the article name, and the catalog receives exactly that. The rule that must survive into Slice 15: **the catalog only ever receives the article name.**
- **No per-row remote-change flash.** That is optional **Slice 16**. This slice pays the cheap insurance the meta plan asked for — a `data-item-id` attribute on every entry row — and nothing more. Because this slice keeps entries server-rendered (props, not a client store), Slice 16 will take **Path B** (flash context, rows stay server-rendered); record that in the review.
- **`ListSyncPoller` is not touched.** It still renders `null`, still diffs cursor + id set + list metadata, still calls `router.refresh()`. `router.refresh()` preserves client component state, which is exactly why `ListBody`'s active chip and typed text survive a remote change.
- **No new REST endpoints.** `/api/lists/[listId]/ops` already exists and is unchanged; the screen uses Server Actions over the same `applyOperation` core (the Slice 10/11 precedent for screens).
- **No drawer on the list screen.** Handoff §10 specifies `←` (zum Projekt) in the header, and `/lists/[listId]` sits outside `src/app/projects/[projectId]/layout.tsx`, so there is no `DrawerContext` to read. (Empty-state mocks 5c/5d draw a `☰` there; §10 is the normative screen spec and wins. Note the conflict in the review.)
- **No drag-to-reorder.** `update_item` supports `sortIndex`, but the design never offers reordering.
- **No arrow-key navigation in the autocomplete dropdown.** See Task 5 for why, and what the accessible substitute is.

---

## File structure

**New — pure logic (node tests)**

| File | Responsibility |
|---|---|
| `src/lib/lists/categories.ts` | The category vocabulary of the screen: the two literal labels, the chip option order, the „Alle" grouping, and the set of categories the entry sheet offers. |
| `src/lib/lists/swipe.ts` | Swipe geometry: offset clamping, the "this is a swipe, not a tap" tolerance, the delete threshold. |
| `src/lib/format/quantity.ts` | German decimal parsing (`"1,5"` → `1.5`) and the row's trailing label (`"1,5 l"`). |
| `src/lib/catalog/autocomplete.ts` | Which articles the dropdown shows for a typed prefix, and whether to offer „…“ neu anlegen. |

**New — domain (DB test)**

| File | Responsibility |
|---|---|
| `src/lib/lists/addEntry.ts` | `addEntryFromRow` — the trailing row's whole server-side meaning: resolve the active chip to a category, add the entry, and report whether the sheet must open for a category choice. |

**New — primitive**

| File | Responsibility |
|---|---|
| `src/components/ui/Autocomplete.tsx` (+ `.module.css`, test) | The inline input with a dropdown above it. Used by the trailing entry row and (Task 12) the Favoriten add row. |

**New — list screen**

| File | Responsibility |
|---|---|
| `src/app/lists/[listId]/formState.ts` | The result shape both entry Server Actions return, for `useActionState`. |
| `src/app/lists/[listId]/EntryRow.tsx` (+ `.module.css`, test) | One entry: check circle, name, quantity label, tap-to-open, swipe-to-delete. |
| `src/app/lists/[listId]/EntrySheet.tsx` (+ `.module.css`, test) | The entry detail bottom sheet: Menge / Einheit / Kategorie + category chips + Fertig + Eintrag löschen. |
| `src/app/lists/[listId]/ListMenu.tsx` (+ `.module.css`, test) | The `⋮` header menu: Liste abschließen / Liste löschen (+ confirmation). |
| `src/app/lists/[listId]/ListBody.tsx` (+ `.module.css`, test) | The interactive body: chip row, groups, empty states, trailing row, sheet orchestration. |
| `src/app/lists/[listId]/page.module.css` | The screen's own layout (the page had no CSS Module at all). |

**Modified**

| File | Change |
|---|---|
| `src/app/lists/[listId]/page.tsx` | Rewritten: `PageHeader` + banners + Server Actions + `ListBody`. The four-field add form and the raw `<ul>` markup go away. |
| `src/lib/catalog/sort.ts` (+ test) | Extract `compareGermanText`; `compareArticleNames` delegates to it. |
| `src/app/projects/[projectId]/favoriten/FavoritesEditor.tsx` (+ test) | Native `<datalist>` → the new `Autocomplete` (retires an inherited Slice 11 open item). |
| `src/app/dev/ui/Gallery.tsx` | Add the `Autocomplete` primitive. |

**Untouched (verify, do not edit)**

`src/app/lists/[listId]/ListSyncPoller.tsx`, `src/lib/lists/operations.ts`, `src/lib/lists/delta.ts`, `src/app/api/lists/[listId]/*`.

---

## Task 1: Category vocabulary + German collation

**Files:**
- Modify: `src/lib/catalog/sort.ts`
- Test: `src/lib/catalog/sort.test.ts` (create — the module has no test today)
- Create: `src/lib/lists/categories.ts`
- Test: `src/lib/lists/categories.test.ts`

**Interfaces:**
- Consumes: `normalizeName` is *not* used here — category labels are compared as typed, only trimmed.
- Produces: `compareGermanText(a, b)`; `ALL_CATEGORIES_LABEL`, `UNCATEGORIZED_LABEL`, `categoryLabel(category)`, `categoryChipOptions(items, active?)`, `groupItemsByCategory(items)`, `knownCategories(catalogDefaults, itemCategories)`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/catalog/sort.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compareArticleNames, compareGermanText } from "./sort";

describe("compareGermanText", () => {
  // The whole reason this comparator exists: a code-point sort puts "Ä" after "Z".
  it("sorts umlauts next to their base letter, not after Z", () => {
    const sorted = ["Zucker", "Äpfel", "Apfel"].sort(compareGermanText);
    expect(sorted).toEqual(["Apfel", "Äpfel", "Zucker"]);
  });

  it("is case-insensitive in the German collation", () => {
    expect(compareGermanText("apfel", "Apfel")).toBeLessThan(0);
    expect(compareGermanText("Brot", "apfel")).toBeGreaterThan(0);
  });
});

describe("compareArticleNames", () => {
  // It must keep behaving exactly as before — it is now a named alias.
  it("still orders article names under German rules", () => {
    const sorted = ["Öl", "Nudeln", "Mehl"].sort(compareArticleNames);
    expect(sorted).toEqual(["Mehl", "Nudeln", "Öl"]);
  });
});
```

Create `src/lib/lists/categories.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ALL_CATEGORIES_LABEL,
  UNCATEGORIZED_LABEL,
  categoryChipOptions,
  categoryLabel,
  groupItemsByCategory,
  knownCategories,
} from "./categories";

// The shape every helper here works on: anything with a nullable category.
const item = (category: string | null, name = "x") => ({ category, name });

describe("categoryLabel", () => {
  it("maps null, empty and whitespace to the German uncategorized label", () => {
    expect(categoryLabel(null)).toBe(UNCATEGORIZED_LABEL);
    expect(categoryLabel("")).toBe(UNCATEGORIZED_LABEL);
    expect(categoryLabel("   ")).toBe(UNCATEGORIZED_LABEL);
  });

  it("trims a real category", () => {
    expect(categoryLabel("  Molkerei ")).toBe("Molkerei");
  });
});

describe("categoryChipOptions", () => {
  it("puts Alle first, real categories alphabetically, Ohne Kategorie last", () => {
    const options = categoryChipOptions([
      item(null),
      item("Molkerei"),
      item("Obst & Gemüse"),
      item("Äpfel & Co"),
    ]);
    expect(options).toEqual([
      ALL_CATEGORIES_LABEL,
      "Äpfel & Co",
      "Molkerei",
      "Obst & Gemüse",
      UNCATEGORIZED_LABEL,
    ]);
  });

  it("omits Ohne Kategorie when every entry has a category", () => {
    expect(categoryChipOptions([item("Molkerei")])).toEqual([ALL_CATEGORIES_LABEL, "Molkerei"]);
  });

  it("deduplicates categories that several entries share", () => {
    expect(categoryChipOptions([item("Molkerei"), item("Molkerei")])).toEqual([
      ALL_CATEGORIES_LABEL,
      "Molkerei",
    ]);
  });

  // The design's rule: the active chip survives its category going empty, and it
  // must stay in its sorted position rather than being appended at the end.
  it("keeps the active category in the row even when no entry has it", () => {
    expect(categoryChipOptions([item("Obst & Gemüse")], "Molkerei")).toEqual([
      ALL_CATEGORIES_LABEL,
      "Molkerei",
      "Obst & Gemüse",
    ]);
  });

  it("returns only Alle for an empty list", () => {
    expect(categoryChipOptions([])).toEqual([ALL_CATEGORIES_LABEL]);
  });
});

describe("groupItemsByCategory", () => {
  it("groups in chip order and drops Alle", () => {
    const milch = item("Molkerei", "Milch");
    const apfel = item("Obst & Gemüse", "Apfel");
    const dubel = item(null, "Dübel");
    const groups = groupItemsByCategory([dubel, milch, apfel]);
    expect(groups.map((g) => g.category)).toEqual([
      "Molkerei",
      "Obst & Gemüse",
      UNCATEGORIZED_LABEL,
    ]);
    expect(groups[0].items).toEqual([milch]);
    expect(groups[2].items).toEqual([dubel]);
  });

  it("preserves the incoming order inside a group (sortIndex order)", () => {
    const a = item("Molkerei", "Butter");
    const b = item("Molkerei", "Milch");
    expect(groupItemsByCategory([a, b])[0].items).toEqual([a, b]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupItemsByCategory([])).toEqual([]);
  });
});

describe("knownCategories", () => {
  it("unions catalog defaults with entry categories, sorted and deduplicated", () => {
    expect(knownCategories(["Molkerei", null, "Backwaren"], ["Molkerei", "Obst & Gemüse"])).toEqual([
      "Backwaren",
      "Molkerei",
      "Obst & Gemüse",
    ]);
  });

  it("ignores empty and whitespace-only values and never returns the placeholder", () => {
    expect(knownCategories(["", "  ", null], [null])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/catalog/sort.test.ts src/lib/lists/categories.test.ts`
Expected: FAIL — `compareGermanText` is not exported, `./categories` does not resolve.

- [ ] **Step 3: Implement**

Edit `src/lib/catalog/sort.ts` — keep every existing comment, add the general comparator and make the article one delegate:

```ts
// The German collation rule itself, for any user-visible text this app sorts.
//
// WHY it was pulled out of compareArticleNames: Slice 12 sorts CATEGORY names
// ("Äpfel & Co" before "Molkerei") and the same umlaut rule has to apply. Two
// comparators would be two places to get "Ä" wrong; one named rule with a
// domain-specific alias keeps the vocabulary while sharing the behaviour.
export function compareGermanText(a: string, b: string): number {
  return a.localeCompare(b, ARTICLE_NAME_LOCALE);
}

// Comparator for Array.prototype.sort over article DISPLAY names (CatalogItem.name — never
// normalizedName, which is a lowercase identity key and not meant for humans).
//
// NOTE: searchCatalog deliberately does NOT use this and keeps its Postgres `orderBy: { name: "asc" }`.
// It applies `take: limit` in the query, so sorting in JS afterwards would only reorder an
// already-truncated page — and worse, it could change WHICH articles survive the cut. Fixing that
// properly means moving the cut client-side (a Slice 8 concern, when the datalist is replaced by a
// fetch-on-keystroke dropdown). Do not "unify" it by adding this comparator there.
export function compareArticleNames(a: string, b: string): number {
  return compareGermanText(a, b);
}
```

Create `src/lib/lists/categories.ts`:

```ts
import { compareGermanText } from "@/lib/catalog/sort";

/**
 * The category vocabulary of the list screen.
 *
 * Category is a nullable free-text field on ListItem. The UI, however, needs a
 * total function: every entry belongs to exactly one visible bucket, and the
 * bucket for "no category" is a German label the user can tap like any other.
 * These helpers are the one place that translation happens, so the filter chips,
 * the „Alle" grouping and the entry sheet can never disagree about what a
 * category is.
 *
 * All pure and synchronous: they take already-loaded entries, so the client
 * component can call them on every render and they are testable without a DB.
 */

/** The filter chip that shows everything. Never a real category value. */
export const ALL_CATEGORIES_LABEL = "Alle";

/** The bucket for entries whose category is null/blank. Always sorts last. */
export const UNCATEGORIZED_LABEL = "Ohne Kategorie";

/** The minimum an item must have for these helpers to bucket it. */
export interface CategorizedItem {
  category: string | null;
}

/**
 * The visible bucket for one entry: its trimmed category, or the German
 * placeholder. This is what makes „Ohne Kategorie" behave like a category
 * everywhere else in the screen without ever being stored as one.
 */
export function categoryLabel(category: string | null): string {
  const trimmed = category?.trim();
  return trimmed ? trimmed : UNCATEGORIZED_LABEL;
}

/**
 * The filter chip row, in display order (handoff §10): „Alle" first, real
 * categories alphabetically under German rules, „Ohne Kategorie" always last.
 *
 * `active` is passed in so the currently selected chip survives its category
 * going empty — the design's explicit rule ("aktiver Chip überlebt das
 * Leerwerden"). It is inserted before sorting, so it keeps its alphabetical
 * position instead of being appended at the end; `ChipTabs` has a fallback that
 * appends an unknown active value, and this is what stops that fallback from
 * ever firing with a visibly wrong order.
 */
export function categoryChipOptions(
  items: CategorizedItem[],
  active: string = ALL_CATEGORIES_LABEL,
): string[] {
  const present = new Set(items.map((item) => categoryLabel(item.category)));
  // "Alle" is not a bucket, so only a real active chip is worth preserving.
  if (active !== ALL_CATEGORIES_LABEL) present.add(active);

  const named = [...present]
    .filter((category) => category !== UNCATEGORIZED_LABEL)
    .sort(compareGermanText);

  const options = [ALL_CATEGORIES_LABEL, ...named];
  if (present.has(UNCATEGORIZED_LABEL)) options.push(UNCATEGORIZED_LABEL);
  return options;
}

/** One rendered section in the „Alle" view: its label and the entries under it. */
export interface CategoryGroup<T> {
  category: string;
  items: T[];
}

/**
 * The „Alle" view's sections. Same order as the chips (minus „Alle" itself), and
 * empty sections are dropped so a category never shows an empty heading.
 *
 * The entries keep their incoming order inside a group — that is sortIndex, the
 * single source of ordering truth (getListWithItems orders by it). Grouping is
 * purely a render-time view, exactly as it was before this slice.
 */
export function groupItemsByCategory<T extends CategorizedItem>(items: T[]): CategoryGroup<T>[] {
  return categoryChipOptions(items)
    .filter((category) => category !== ALL_CATEGORIES_LABEL)
    .map((category) => ({
      category,
      items: items.filter((item) => categoryLabel(item.category) === category),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Every category the entry sheet offers as a chip: the project's catalog
 * defaults unioned with the categories currently on this list.
 *
 * WHY both sources: the catalog is the project's memory (a category the user set
 * months ago on another list must still be one tap away), while the current list
 * may hold a category typed just now that has not flowed back yet. The
 * placeholder is deliberately absent — the sheet clears a category by tapping the
 * selected chip off, not by picking „Ohne Kategorie".
 */
export function knownCategories(
  catalogDefaults: (string | null)[],
  itemCategories: (string | null)[],
): string[] {
  const categories = new Set<string>();
  for (const value of [...catalogDefaults, ...itemCategories]) {
    const trimmed = value?.trim();
    if (trimmed) categories.add(trimmed);
  }
  return [...categories].sort(compareGermanText);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/catalog/sort.test.ts src/lib/lists/categories.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/sort.ts src/lib/catalog/sort.test.ts src/lib/lists/categories.ts src/lib/lists/categories.test.ts
git commit -m "feat(lists): category vocabulary for the filter chips and the Alle grouping"
```

---

## Task 2: German quantity parsing and the row label

**Files:**
- Create: `src/lib/format/quantity.ts`
- Test: `src/lib/format/quantity.test.ts`

**Interfaces:**
- Consumes: `formatGermanNumber` from `src/lib/format/date.ts`.
- Produces: `parseGermanDecimal(raw: string): number | null`, `formatQuantityLabel(quantity: number | null, unit: string | null): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/format/quantity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatQuantityLabel, parseGermanDecimal } from "./quantity";

describe("parseGermanDecimal", () => {
  it("reads a German decimal comma", () => {
    expect(parseGermanDecimal("1,5")).toBe(1.5);
  });

  it("also accepts a dot, because both keyboards exist", () => {
    expect(parseGermanDecimal("1.5")).toBe(1.5);
  });

  it("reads a plain integer", () => {
    expect(parseGermanDecimal("3")).toBe(3);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseGermanDecimal("  2,25  ")).toBe(2.25);
  });

  // null is "the user cleared the field", which is a legal update_item value.
  it("maps an empty or whitespace-only field to null", () => {
    expect(parseGermanDecimal("")).toBeNull();
    expect(parseGermanDecimal("   ")).toBeNull();
  });

  // NaN is deliberate: applyOperation's Number.isFinite guard rejects it with the
  // German message, so garbage never silently becomes 0 or clears the field.
  it("returns NaN for text that is not a number", () => {
    expect(parseGermanDecimal("viel")).toBeNaN();
    expect(parseGermanDecimal("1,5,5")).toBeNaN();
  });
});

describe("formatQuantityLabel", () => {
  it("joins quantity and unit with a space", () => {
    expect(formatQuantityLabel(1.5, "l")).toBe("1,5 l");
  });

  it("prints the quantity alone when there is no unit", () => {
    expect(formatQuantityLabel(3, null)).toBe("3");
  });

  it("prints the unit alone when there is no quantity", () => {
    expect(formatQuantityLabel(null, "Packung")).toBe("Packung");
  });

  it("is empty when the entry carries neither", () => {
    expect(formatQuantityLabel(null, null)).toBe("");
    expect(formatQuantityLabel(null, "  ")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/format/quantity.test.ts`
Expected: FAIL — cannot resolve `./quantity`.

- [ ] **Step 3: Implement**

Create `src/lib/format/quantity.ts`:

```ts
import { formatGermanNumber } from "./date";

/**
 * The entry quantity, in both directions.
 *
 * Why its own module rather than more functions in `date.ts`: this pair is the
 * round-trip of ONE field — what the entry sheet reads out of a text input and
 * what the entry row prints back. Keeping them together means the day the unit
 * handling changes, both halves are in front of you.
 */

/**
 * Reads the entry sheet's MENGE field.
 *
 * Returns `null` for an empty field — that is a real value: it CLEARS the
 * quantity via `update_item`, which is different from "leave it alone".
 *
 * Returns `NaN` for text that is not a number, deliberately and without
 * throwing. `applyOperation`'s `assertValidQuantity` already rejects non-finite
 * values with the German message „Menge muss eine positive Zahl sein", so
 * letting NaN travel gives the user that exact message inline instead of a
 * second, divergent validation rule here. Do not "fix" this by returning null:
 * that would silently erase the quantity when the user fat-fingers a letter.
 */
export function parseGermanDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // German keyboards produce "1,5". Number() only understands "1.5", so the
  // comma is swapped first; a second comma survives the swap and yields NaN,
  // which is what we want for "1,5,5".
  return Number(trimmed.replace(",", "."));
}

/**
 * The entry row's trailing label, e.g. "1,5 l" (handoff §10).
 *
 * Both halves are optional and independently missing, so this collapses to
 * whichever exists and to "" when neither does — the row then renders nothing
 * rather than a stray separator.
 */
export function formatQuantityLabel(quantity: number | null, unit: string | null): string {
  const parts: string[] = [];
  if (quantity !== null) parts.push(formatGermanNumber(quantity));
  // A blank unit is stored as null in practice, but trim defensively: the column
  // is free text and a legacy row could hold spaces.
  const trimmedUnit = unit?.trim();
  if (trimmedUnit) parts.push(trimmedUnit);
  return parts.join(" ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/format/quantity.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/quantity.ts src/lib/format/quantity.test.ts
git commit -m "feat(format): German quantity parsing and the entry row label"
```

---

## Task 3: Swipe geometry

**Files:**
- Create: `src/lib/lists/swipe.ts`
- Test: `src/lib/lists/swipe.test.ts`

**Interfaces:**
- Produces: `SWIPE_DELETE_THRESHOLD_PX`, `SWIPE_START_TOLERANCE_PX`, `swipeOffset(startX, currentX)`, `isSwipeStarted(offset)`, `shouldDeleteOnRelease(offset)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/swipe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SWIPE_DELETE_THRESHOLD_PX,
  isSwipeStarted,
  shouldDeleteOnRelease,
  swipeOffset,
} from "./swipe";

describe("swipeOffset", () => {
  it("is negative when the finger moves left", () => {
    expect(swipeOffset(200, 140)).toBe(-60);
  });

  // Right-swipe is not a gesture in this design, so the row must not follow the
  // finger to the right at all — clamping is what keeps the delete surface hidden.
  it("clamps a rightward move to zero", () => {
    expect(swipeOffset(200, 260)).toBe(0);
  });

  it("is zero when the finger has not moved", () => {
    expect(swipeOffset(200, 200)).toBe(0);
  });
});

describe("isSwipeStarted", () => {
  it("ignores the jitter of a tap", () => {
    expect(isSwipeStarted(-3)).toBe(false);
    expect(isSwipeStarted(0)).toBe(false);
  });

  it("recognises a deliberate drag", () => {
    expect(isSwipeStarted(-12)).toBe(true);
  });
});

describe("shouldDeleteOnRelease", () => {
  it("deletes past the threshold", () => {
    expect(shouldDeleteOnRelease(-81)).toBe(true);
  });

  // Exactly at the threshold must snap back: the boundary belongs to the safe
  // side, because the destructive outcome is the irreversible one.
  it("snaps back at and above the threshold", () => {
    expect(shouldDeleteOnRelease(SWIPE_DELETE_THRESHOLD_PX)).toBe(false);
    expect(shouldDeleteOnRelease(-40)).toBe(false);
    expect(shouldDeleteOnRelease(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/lists/swipe.test.ts`
Expected: FAIL — cannot resolve `./swipe`.

- [ ] **Step 3: Implement**

Create `src/lib/lists/swipe.ts`:

```ts
/**
 * The geometry of swipe-to-delete (handoff §10).
 *
 * Why the numbers live here instead of inside the row component: they are the
 * only part of the gesture that has a right and a wrong answer, and jsdom is a
 * poor place to argue about pixels. The component keeps the pointer plumbing;
 * this module keeps the decisions, unit-tested in the node environment.
 */

/** Release further left than this deletes the row. Verbatim from the prototype. */
export const SWIPE_DELETE_THRESHOLD_PX = -80;

/**
 * Below this much movement the gesture is still a tap. Without the tolerance the
 * tiny drift of a finger tap would arm the swipe and swallow the tap that opens
 * the entry sheet.
 */
export const SWIPE_START_TOLERANCE_PX = 5;

/**
 * How far the row should be translated, given where the pointer went down and
 * where it is now. Clamped at 0 because this design has no right-swipe action —
 * an unclamped value would drag the row off its own delete surface.
 */
export function swipeOffset(startX: number, currentX: number): number {
  return Math.min(0, currentX - startX);
}

/** Has the pointer moved far enough that this is a drag rather than a tap? */
export function isSwipeStarted(offset: number): boolean {
  return Math.abs(offset) > SWIPE_START_TOLERANCE_PX;
}

/**
 * On release: delete, or snap back? Strictly past the threshold, so a release
 * exactly at −80px is a snap-back. The asymmetry is on purpose: the destructive
 * outcome is the one that cannot be undone, so the boundary belongs to the safe
 * side.
 */
export function shouldDeleteOnRelease(offset: number): boolean {
  return offset < SWIPE_DELETE_THRESHOLD_PX;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/lists/swipe.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/swipe.ts src/lib/lists/swipe.test.ts
git commit -m "feat(lists): swipe-to-delete geometry as a pure module"
```

---

## Task 4: Autocomplete option builder

**Files:**
- Create: `src/lib/catalog/autocomplete.ts`
- Test: `src/lib/catalog/autocomplete.test.ts`

**Interfaces:**
- Consumes: `normalizeName` from `src/lib/catalog/normalize.ts`.
- Produces: `AUTOCOMPLETE_LIMIT`, `AutocompleteArticle` (`{ id, name, defaultCategory }`), `AutocompleteOption` (`{ id, name, hint }`), `AutocompleteResult` (`{ options, createName }`), `buildAutocomplete(articles, query, limit?)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalog/autocomplete.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAutocomplete, type AutocompleteArticle } from "./autocomplete";

const article = (id: string, name: string, defaultCategory: string | null = null): AutocompleteArticle => ({
  id,
  name,
  defaultCategory,
});

const catalog = [
  article("a1", "Milch", "Molkerei"),
  article("a2", "Milchreis"),
  article("a3", "Buttermilch", "Molkerei"),
  article("a4", "Brot", "Backwaren"),
];

describe("buildAutocomplete", () => {
  it("shows nothing at all while the field is empty", () => {
    expect(buildAutocomplete(catalog, "")).toEqual({ options: [], createName: null });
    expect(buildAutocomplete(catalog, "   ")).toEqual({ options: [], createName: null });
  });

  // Substring, not prefix: the design's dropdown finds "Buttermilch" for "milch".
  // searchCatalog stays prefix-only — see the implementation comment.
  it("matches anywhere in the name, case-insensitively", () => {
    const { options } = buildAutocomplete(catalog, "MILCH");
    expect(options.map((option) => option.name)).toEqual(["Milch", "Milchreis", "Buttermilch"]);
  });

  it("carries the default category as the dropdown's sub-label", () => {
    const { options } = buildAutocomplete(catalog, "Milch");
    expect(options[0].hint).toBe("· Molkerei");
    expect(options[1].hint).toBe("");
  });

  it("caps the dropdown", () => {
    expect(buildAutocomplete(catalog, "milch", 2).options).toHaveLength(2);
  });

  it("offers to create the article when nothing matches exactly", () => {
    expect(buildAutocomplete(catalog, "Milc").createName).toBe("Milc");
  });

  // An exact hit means the row would create a duplicate — the catalog resolves
  // it to the same article anyway, so offering it is noise.
  it("does not offer creation when the typed name already exists", () => {
    expect(buildAutocomplete(catalog, "milch").createName).toBeNull();
    expect(buildAutocomplete(catalog, "  Milch  ").createName).toBeNull();
  });

  it("offers creation when the catalog is empty", () => {
    expect(buildAutocomplete([], "Dübel")).toEqual({ options: [], createName: "Dübel" });
  });

  it("collapses inner whitespace in the offered name, like the catalog does", () => {
    expect(buildAutocomplete([], "Rote   Bete").createName).toBe("Rote Bete");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog/autocomplete.test.ts`
Expected: FAIL — cannot resolve `./autocomplete`.

- [ ] **Step 3: Implement**

Create `src/lib/catalog/autocomplete.ts`:

```ts
import { normalizeName } from "./normalize";

/**
 * What the trailing entry row's dropdown offers for a typed prefix
 * (handoff §10: "Autocomplete-Dropdown über der Zeile").
 *
 * WHY this filters in the browser instead of calling GET /catalog per keystroke:
 * the screen already has the project's whole catalog as a prop (the page reads it
 * with CATALOG_DATALIST_LIMIT), a household catalog is at most a few hundred
 * articles, and a request per keystroke on a phone is the one thing this row
 * cannot afford. The server endpoint stays for any future caller.
 *
 * WHY substring matching while `searchCatalog` uses a prefix: they answer
 * different questions. searchCatalog pages the catalog in the database and must
 * use an indexable prefix; this function ranks an already-loaded array, where
 * "milch" finding "Buttermilch" is exactly what the design's dropdown shows.
 * (`CatalogBrowser`'s search made the same call for the same reason.)
 */

/** How many articles the dropdown shows. Three, per the prototype. */
export const AUTOCOMPLETE_LIMIT = 3;

/** The catalog subset this needs — a lean shape so callers can pass anything. */
export interface AutocompleteArticle {
  id: string;
  name: string;
  defaultCategory: string | null;
}

/** One dropdown row: the article name plus its muted sub-label. */
export interface AutocompleteOption {
  id: string;
  name: string;
  /** "· Molkerei", or "" when the article has no default category. */
  hint: string;
}

export interface AutocompleteResult {
  options: AutocompleteOption[];
  /**
   * The name for the „…“ neu anlegen row, or null when the typed text already
   * names an existing article (or the field is empty).
   */
  createName: string | null;
}

/**
 * Pure: same catalog + same query → same dropdown. Called on every keystroke.
 */
export function buildAutocomplete(
  articles: AutocompleteArticle[],
  query: string,
  limit: number = AUTOCOMPLETE_LIMIT,
): AutocompleteResult {
  // normalizeName is the catalog's identity rule (lowercase + trim + collapse
  // spaces). Reusing it is what makes the dropdown agree with what the server
  // will actually resolve the typed name to.
  const needle = normalizeName(query);
  // Nothing typed yet: the design shows no dropdown at all, not the whole catalog.
  if (!needle) return { options: [], createName: null };

  const matches = articles.filter((article) => normalizeName(article.name).includes(needle));

  const options = matches.slice(0, limit).map((article) => ({
    id: article.id,
    name: article.name,
    // The middle dot is the same separator formatArticleDefaults uses.
    hint: article.defaultCategory ? `· ${article.defaultCategory}` : "",
  }));

  // An EXACT normalized hit means picking a suggestion and "creating" would end
  // up at the same catalog row, so the create affordance would be a lie.
  const exists = matches.some((article) => normalizeName(article.name) === needle);

  return {
    options,
    // Presented with the same cleanup getOrCreateCatalogItem applies to the
    // display name, so the row shows the name the user will actually get.
    createName: exists ? null : query.trim().replace(/\s+/g, " "),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog/autocomplete.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/autocomplete.ts src/lib/catalog/autocomplete.test.ts
git commit -m "feat(catalog): pure autocomplete option builder for the entry row"
```

---

## Task 5: The `Autocomplete` primitive

**Files:**
- Create: `src/components/ui/Autocomplete.tsx`
- Create: `src/components/ui/Autocomplete.module.css`
- Test: `src/components/ui/Autocomplete.test.tsx`
- Modify: `src/app/dev/ui/Gallery.tsx`

**Interfaces:**
- Consumes: `AutocompleteOption` from Task 4.
- Produces: `<Autocomplete value onChange onSubmit options createName placeholder inputLabel leading? disabled? inputRef? />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Autocomplete.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Autocomplete } from "./Autocomplete";

const options = [
  { id: "a1", name: "Milch", hint: "· Molkerei" },
  { id: "a2", name: "Milchreis", hint: "" },
];

function renderField(overrides: Partial<Parameters<typeof Autocomplete>[0]> = {}) {
  const props = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    options: [],
    createName: null,
    placeholder: "Eintrag hinzufügen",
    inputLabel: "Eintrag hinzufügen",
    ...overrides,
  };
  return { ...render(<Autocomplete {...props} />), props };
}

describe("Autocomplete", () => {
  it("shows no dropdown while there is nothing to suggest", () => {
    renderField();
    expect(screen.queryByRole("button", { name: /Milch/ })).not.toBeInTheDocument();
  });

  it("reports every keystroke to the caller", async () => {
    const onChange = vi.fn();
    renderField({ onChange });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "M");

    expect(onChange).toHaveBeenCalledWith("M");
  });

  it("submits the typed text on Enter", async () => {
    const onSubmit = vi.fn();
    renderField({ value: "Dübel", onSubmit });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("Dübel");
  });

  it("submits the article name when a suggestion is tapped", async () => {
    const onSubmit = vi.fn();
    renderField({ value: "Mil", options, onSubmit });

    await userEvent.click(screen.getByRole("button", { name: /Milchreis/ }));

    expect(onSubmit).toHaveBeenCalledWith("Milchreis");
  });

  it("shows the create row and submits the offered name", async () => {
    const onSubmit = vi.fn();
    renderField({ value: "Dübel", createName: "Dübel", onSubmit });

    await userEvent.click(screen.getByRole("button", { name: "„Dübel“ neu anlegen" }));

    expect(onSubmit).toHaveBeenCalledWith("Dübel");
  });

  it("hides the dropdown on Escape and brings it back on the next keystroke", async () => {
    const { rerender, props } = renderField({ value: "Mil", options });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "{Escape}");
    expect(screen.queryByRole("button", { name: /Milchreis/ })).not.toBeInTheDocument();

    rerender(<Autocomplete {...props} value="Milc" options={options} />);
    expect(screen.getByRole("button", { name: /Milchreis/ })).toBeInTheDocument();
  });

  it("renders the leading slot next to the input", () => {
    renderField({ leading: <span>＋</span> });
    expect(screen.getByText("＋")).toBeInTheDocument();
  });

  it("does not submit an empty field", async () => {
    const onSubmit = vi.fn();
    renderField({ value: "   ", onSubmit });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ui/Autocomplete.test.tsx`
Expected: FAIL — cannot resolve `./Autocomplete`.

- [ ] **Step 3: Implement the component**

Create `src/components/ui/Autocomplete.tsx`:

```tsx
"use client";

import { useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import type { AutocompleteOption } from "@/lib/catalog/autocomplete";
import styles from "./Autocomplete.module.css";

type AutocompleteProps = {
  /** Controlled: the caller owns the text, because the caller clears it on submit. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Enter on the field, or a tap on a dropdown row. Receives the NAME to use —
   * the typed text, the picked article, or the offered create name.
   */
  onSubmit: (name: string) => void;
  /** Already filtered and capped by `buildAutocomplete`. */
  options: AutocompleteOption[];
  /** The „…“ neu anlegen row, or null. */
  createName: string | null;
  placeholder: string;
  /** German accessible name for the input, e.g. „Eintrag hinzufügen". */
  inputLabel: string;
  /** Optional glyph before the field — the entry row's ＋. */
  leading?: ReactNode;
  disabled?: boolean;
  /** Lets a parent keep focus in the field after a submit. */
  inputRef?: RefObject<HTMLInputElement | null>;
};

/**
 * An inline text field with a suggestion dropdown floating ABOVE it (handoff
 * §10). The trailing entry row is its first customer; the Favoriten add row
 * adopts it in the same slice, which is why it is a primitive and not a piece of
 * the list screen.
 *
 * Why the dropdown sits above: the row is the LAST thing on the screen, so a
 * dropdown below it would open under the keyboard on a phone.
 *
 * Why the rows are plain <button>s rather than an ARIA listbox: a real combobox
 * needs `aria-activedescendant` plus arrow-key navigation, and the design offers
 * neither an active-row highlight nor keyboard traversal. A listbox whose
 * options cannot be traversed is worse than no listbox — and interactive
 * children inside `role="option"` are invalid anyway. Buttons are individually
 * reachable by Tab, and Enter in the field always submits the typed text, so
 * nothing here is keyboard-only-inaccessible. Revisit if the design ever grows a
 * highlighted row.
 */
export function Autocomplete({
  value,
  onChange,
  onSubmit,
  options,
  createName,
  placeholder,
  inputLabel,
  leading,
  disabled = false,
  inputRef,
}: AutocompleteProps) {
  // useId keeps the label association stable across server render and hydration.
  const inputId = useId();
  // Escape hides the dropdown without clearing the field — a way out that does
  // not throw away what the user typed.
  const [dismissed, setDismissed] = useState(false);

  // Any change to the query re-arms the dropdown: dismissing is about THIS query,
  // not about the field forever.
  useEffect(() => {
    setDismissed(false);
  }, [value]);

  const hasDropdown = !dismissed && (options.length > 0 || createName !== null);

  // Shared by Enter and by the create row: never submit whitespace.
  const submit = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className={styles.field}>
      <div className={styles.row}>
        {leading}
        <input
          id={inputId}
          ref={inputRef}
          className={styles.input}
          type="text"
          value={value}
          placeholder={placeholder}
          aria-label={inputLabel}
          // The browser's own autofill dropdown would fight ours for the space.
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // The row lives inside no <form>, but a parent might; stop the
              // keystroke from submitting anything else.
              event.preventDefault();
              submit(value);
            }
            if (event.key === "Escape") setDismissed(true);
          }}
        />
      </div>

      {hasDropdown && (
        <ul className={styles.dropdown}>
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={styles.option}
                // A pointerdown that blurs the input would tear the dropdown down
                // before the click lands; preventing the default keeps focus.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => submit(option.name)}
              >
                {option.name}
                {option.hint ? <span className={styles.hint}> {option.hint}</span> : null}
              </button>
            </li>
          ))}
          {createName !== null && (
            <li>
              <button
                type="button"
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => submit(createName)}
              >
                {`„${createName}“ neu anlegen`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
```

Create `src/components/ui/Autocomplete.module.css` (measurements verbatim from the prototype's trailing row + dropdown):

```css
/* Handoff §10: an inline row, and a dropdown floating above it. */
.field {
  position: relative;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  /* ≥44px total so the row is a comfortable tap target on a phone. */
  min-height: 44px;
  padding: 12px 0 2px;
}

.input {
  flex: 1;
  min-width: 0;
  font-size: 15.5px;
  color: var(--color-text-primary);
  background: transparent;
  /* The trailing row is deliberately not a bordered field — it reads as the
     next, still-empty list row. */
  border: none;
  outline: none;
  padding: 4px 0;
}

.input:disabled {
  color: var(--color-text-placeholder);
}

.dropdown {
  position: absolute;
  /* Aligned with the text, not with the ＋ glyph (21px + 12px gap = 33px). */
  left: 33px;
  right: 0;
  bottom: 100%;
  margin-bottom: 4px;
  list-style: none;
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-control);
  box-shadow: var(--shadow-dropdown);
  overflow: hidden;
  z-index: 5;
}

.option {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 14px;
  color: var(--color-text-primary);
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-hairline-weak);
  padding: 10px 14px;
  cursor: pointer;
}

.dropdown li:last-child .option {
  border-bottom: none;
}

.option:hover,
.option:focus-visible {
  background: var(--color-hairline-weak);
}

.hint {
  font-size: 11.5px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/Autocomplete.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Add it to the dev gallery**

In `src/app/dev/ui/Gallery.tsx`, add the import next to the other primitives:

```tsx
import { Autocomplete } from "@/components/ui/Autocomplete";
import { buildAutocomplete } from "@/lib/catalog/autocomplete";
```

Add local state next to the existing `useState` calls:

```tsx
  // Autocomplete demo: a tiny fixed catalog so the dropdown has something to show.
  const [entryText, setEntryText] = useState("");
  const demoCatalog = [
    { id: "a1", name: "Milch", defaultCategory: "Molkerei" },
    { id: "a2", name: "Milchreis", defaultCategory: null },
    { id: "a3", name: "Butter", defaultCategory: "Molkerei" },
  ];
  const demoSuggestions = buildAutocomplete(demoCatalog, entryText);
```

And a section before the closing `</main>`:

```tsx
      <SectionLabel>Autocomplete</SectionLabel>
      {/* Extra bottom room: the dropdown opens upwards, so an empty row above it
          is what makes it visible in the gallery. */}
      <div style={{ paddingTop: 90 }}>
        <Autocomplete
          value={entryText}
          onChange={setEntryText}
          onSubmit={() => setEntryText("")}
          options={demoSuggestions.options}
          createName={demoSuggestions.createName}
          placeholder="Eintrag hinzufügen"
          inputLabel="Eintrag hinzufügen"
          leading={<span aria-hidden="true">＋</span>}
        />
      </div>
```

- [ ] **Step 6: Verify the gallery still compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Autocomplete.tsx src/components/ui/Autocomplete.module.css src/components/ui/Autocomplete.test.tsx src/app/dev/ui/Gallery.tsx
git commit -m "feat(ui): Autocomplete primitive with a dropdown above the field"
```

---

## Task 6: `addEntryFromRow` — the trailing row's server-side meaning

**Files:**
- Create: `src/lib/lists/addEntry.ts`
- Test: `src/lib/lists/addEntry.test.ts`

**Interfaces:**
- Consumes: `applyOperation` (`src/lib/lists/operations.ts`), `normalizeName` (`src/lib/catalog/normalize.ts`), `UNCATEGORIZED_LABEL` (Task 1).
- Produces: `addEntryFromRow(db, list, { itemId, name, activeCategory }): Promise<{ item: ListItem; needsCategory: boolean }>`.

**Category rule** (handoff §10, verbatim): the active chip overrides the catalog default; in „Alle" the catalog default applies; a new, unknown article that ends up with no category opens the entry sheet straight away.

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/addEntry.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { addEntryFromRow } from "./addEntry";
import { UNCATEGORIZED_LABEL } from "./categories";

const db = new PrismaClient();

// One project + one list, rebuilt for every test so cases cannot leak into each other.
async function seed() {
  const user = await db.user.create({
    data: { email: `owner-${randomUUID()}@example.com`, name: "Owner" },
  });
  const project = await db.project.create({ data: { name: "Haushalt" } });
  await db.membership.create({
    data: { projectId: project.id, userId: user.id, role: "owner" },
  });
  const list = await db.list.create({ data: { projectId: project.id, name: "Einkauf" } });
  return { project, list };
}

beforeEach(async () => {
  await resetDb(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("addEntryFromRow", () => {
  it("creates the entry with the client-generated id", async () => {
    const { list } = await seed();
    const itemId = randomUUID();

    const { item } = await addEntryFromRow(db, list, { itemId, name: "Milch", activeCategory: null });

    expect(item.id).toBe(itemId);
    expect(item.listId).toBe(list.id);
  });

  it("creates the catalog article on first use", async () => {
    const { project, list } = await seed();

    await addEntryFromRow(db, list, { itemId: randomUUID(), name: "Milch", activeCategory: null });

    const article = await db.catalogItem.findFirst({ where: { projectId: project.id } });
    expect(article?.name).toBe("Milch");
  });

  // "Alle" is expressed as null: inherit whatever the catalog remembers.
  it("inherits the catalog default category in the Alle view", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Milch", normalizedName: "milch", defaultCategory: "Molkerei" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: null,
    });

    expect(item.category).toBe("Molkerei");
  });

  it("lets the active chip override the catalog default", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Milch", normalizedName: "milch", defaultCategory: "Molkerei" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: "Kühlregal",
    });

    expect(item.category).toBe("Kühlregal");
  });

  // Flow-back is the product rule (CLAUDE.md § architecture): adding under a chip
  // IS setting the category explicitly, so the catalog learns it.
  it("flows an active chip back into the catalog default", async () => {
    const { project, list } = await seed();

    await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: "Molkerei",
    });

    const article = await db.catalogItem.findFirst({ where: { projectId: project.id } });
    expect(article?.defaultCategory).toBe("Molkerei");
  });

  it("adds without a category when the Ohne-Kategorie chip is active", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Milch", normalizedName: "milch", defaultCategory: "Molkerei" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Milch",
      activeCategory: UNCATEGORIZED_LABEL,
    });

    expect(item.category).toBeNull();
    // Clearing on the entry must NOT erase the shared catalog memory.
    const article = await db.catalogItem.findFirst({ where: { projectId: project.id } });
    expect(article?.defaultCategory).toBe("Molkerei");
  });

  it("asks for a category when a brand-new article lands without one", async () => {
    const { list } = await seed();

    const { needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Dübel",
      activeCategory: null,
    });

    expect(needsCategory).toBe(true);
  });

  it("does not ask when the new article got a category from the active chip", async () => {
    const { list } = await seed();

    const { needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Dübel",
      activeCategory: "Werkzeug",
    });

    expect(needsCategory).toBe(false);
  });

  // A known article without a default is a deliberate choice the user already
  // made once — nagging again on every add would be noise.
  it("does not ask for a known article, even without a category", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Dübel", normalizedName: "dübel" },
    });

    const { needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "Dübel",
      activeCategory: null,
    });

    expect(needsCategory).toBe(false);
  });

  it("rejects an empty name with the German message", async () => {
    const { list } = await seed();

    await expect(
      addEntryFromRow(db, list, { itemId: randomUUID(), name: "   ", activeCategory: null }),
    ).rejects.toThrow("Name darf nicht leer sein");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/lists/addEntry.test.ts`
Expected: FAIL — cannot resolve `./addEntry`.

- [ ] **Step 3: Implement**

Create `src/lib/lists/addEntry.ts`:

```ts
import type { List, ListItem, PrismaClient } from "@prisma/client";
import { normalizeName } from "@/lib/catalog/normalize";
import { UNCATEGORIZED_LABEL } from "./categories";
import { applyOperation } from "./operations";

/**
 * The trailing entry row's whole server-side meaning, in one function.
 *
 * The row itself only knows a name and which chip is active. Turning that into
 * an `add_item` operation involves two decisions the UI must not make on its
 * own, because both depend on catalog state:
 *
 *  1. WHICH CATEGORY the entry gets (handoff §10: the active chip overrides the
 *     catalog default; „Alle" inherits it).
 *  2. WHETHER THE ENTRY SHEET MUST OPEN — the design's „Neuer, unbekannter
 *     Artikel ohne Kategorie → Eintrag-Sheet öffnet sich direkt". "Unbekannt"
 *     has to be read BEFORE the add, because add_item creates the article as a
 *     side effect and afterwards everything looks known.
 *
 * Deliberately a thin wrapper around `applyOperation` rather than its own write:
 * the operations funnel stays the only way entries are created, so idempotent
 * replay, catalog get-or-create and flow-back all still apply (MVP design §4.5).
 */

export interface AddEntryFromRowInput {
  /** Client-generated UUID — the entry's stable identity (MVP design §3). */
  itemId: string;
  /** Exactly what the user typed. The catalog only ever receives the NAME. */
  name: string;
  /**
   * The active filter chip, or `null` for „Alle". `UNCATEGORIZED_LABEL` means the
   * user is filtered to the uncategorized bucket and wants the entry to stay
   * there — which is an explicit "no category", not "inherit".
   */
  activeCategory: string | null;
}

export interface AddEntryFromRowResult {
  item: ListItem;
  /** The cue for the UI to open the entry sheet on the category chips. */
  needsCategory: boolean;
}

export async function addEntryFromRow(
  db: PrismaClient,
  list: List,
  input: AddEntryFromRowInput,
): Promise<AddEntryFromRowResult> {
  // Read the article BEFORE adding: add_item creates it on first use, so after
  // the write there is no way left to tell a new article from an old one.
  const normalizedName = normalizeName(input.name);
  const knownArticle = normalizedName
    ? await db.catalogItem.findUnique({
        where: { projectId_normalizedName: { projectId: list.projectId, normalizedName } },
      })
    : null;

  // The three-way category rule. `undefined` is meaningful in add_item: it means
  // "not supplied", which is what makes the entry inherit the catalog default.
  const category =
    input.activeCategory === null
      ? undefined
      : input.activeCategory === UNCATEGORIZED_LABEL
        ? null
        : input.activeCategory;

  const item = await applyOperation(db, list, {
    op: "add_item",
    itemId: input.itemId,
    name: input.name,
    category,
  });

  // applyOperation returns null only for remove_item. Asserting it loudly beats
  // a non-null assertion, which would hide a future contract change.
  if (!item) throw new Error("add_item must return the created entry");

  return {
    item,
    // Both halves matter: a KNOWN article without a category is a choice the user
    // already made, and a new article that inherited a chip needs no prompt.
    needsCategory: knownArticle === null && item.category === null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/lists/addEntry.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/addEntry.ts src/lib/lists/addEntry.test.ts
git commit -m "feat(lists): addEntryFromRow resolves the chip category and the sheet cue"
```

---

## Task 7: `EntryRow`

**Files:**
- Create: `src/app/lists/[listId]/EntryRow.tsx`
- Create: `src/app/lists/[listId]/EntryRow.module.css`
- Test: `src/app/lists/[listId]/EntryRow.test.tsx`

**Interfaces:**
- Consumes: `formatQuantityLabel` (Task 2); `swipeOffset`, `isSwipeStarted`, `shouldDeleteOnRelease` (Task 3); `Icon`.
- Produces: `<EntryRow entry frozen onToggle onOpen onDelete />` where `entry` is `ListEntry` (`{ id, name, quantity, unit, category, checked }`) — the same type `ListBody` exports in Task 10. Declare it here and re-export from `ListBody` to avoid a circular import: **define `ListEntry` in `EntryRow.tsx`.**

- [ ] **Step 1: Write the failing test**

Create `src/app/lists/[listId]/EntryRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntryRow, type ListEntry } from "./EntryRow";

const milch: ListEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milch",
  quantity: 1.5,
  unit: "l",
  category: "Molkerei",
  checked: false,
};

function renderRow(overrides: Partial<Parameters<typeof EntryRow>[0]> = {}) {
  const props = {
    entry: milch,
    frozen: false,
    onToggle: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<ul>{<EntryRow {...props} />}</ul>), props };
}

// The swipe is a pointer gesture; jsdom needs the coordinates supplied explicitly.
function swipe(row: HTMLElement, distance: number) {
  fireEvent.pointerDown(row, { clientX: 200, pointerId: 1 });
  fireEvent.pointerMove(row, { clientX: 200 + distance, pointerId: 1 });
  fireEvent.pointerUp(row, { clientX: 200 + distance, pointerId: 1 });
}

describe("EntryRow", () => {
  it("shows the name and the German quantity label", () => {
    renderRow();
    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.getByText("1,5 l")).toBeInTheDocument();
  });

  it("carries the entry id for tests and the future row flash", () => {
    const { container } = renderRow();
    expect(container.querySelector(`[data-item-id="${milch.id}"]`)).not.toBeNull();
  });

  it("reports the TARGET checked state, not a toggle", async () => {
    const onToggle = vi.fn();
    renderRow({ onToggle });

    await userEvent.click(screen.getByRole("button", { name: "Milch abhaken" }));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("reports unchecking a checked entry", async () => {
    const onToggle = vi.fn();
    renderRow({ entry: { ...milch, checked: true }, onToggle });

    await userEvent.click(screen.getByRole("button", { name: "Milch abhaken" }));

    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("marks a checked entry as pressed", () => {
    renderRow({ entry: { ...milch, checked: true } });
    expect(screen.getByRole("button", { name: "Milch abhaken" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens the entry sheet when the row body is tapped", async () => {
    const onOpen = vi.fn();
    renderRow({ onOpen });

    await userEvent.click(screen.getByRole("button", { name: /Milch bearbeiten/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("deletes when a swipe passes the threshold", () => {
    const { props, container } = renderRow();
    const row = container.querySelector(`[data-item-id="${milch.id}"]`) as HTMLElement;

    swipe(row, -120);

    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("snaps back instead of deleting on a short swipe", () => {
    const { props, container } = renderRow();
    const row = container.querySelector(`[data-item-id="${milch.id}"]`) as HTMLElement;

    swipe(row, -30);

    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("does not open the sheet when the gesture was a swipe", () => {
    const { props, container } = renderRow();
    const row = container.querySelector(`[data-item-id="${milch.id}"]`) as HTMLElement;

    swipe(row, -120);
    fireEvent.click(screen.getByRole("button", { name: /Milch bearbeiten/ }));

    expect(props.onOpen).not.toHaveBeenCalled();
  });

  // A completed list is read-only (handoff §10: "kein Abhaken", no input row).
  it("renders a frozen entry without any controls", () => {
    renderRow({ entry: { ...milch, checked: true }, frozen: true });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Milch")).toBeInTheDocument();
  });

  it("does not delete a frozen entry on swipe", () => {
    const { props, container } = renderRow({ frozen: true });
    const row = container.querySelector(`[data-item-id="${milch.id}"]`) as HTMLElement;

    swipe(row, -200);

    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/lists/[listId]/EntryRow.test.tsx"`
Expected: FAIL — cannot resolve `./EntryRow`.

- [ ] **Step 3: Implement the component**

Create `src/app/lists/[listId]/EntryRow.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { formatQuantityLabel } from "@/lib/format/quantity";
import { isSwipeStarted, shouldDeleteOnRelease, swipeOffset } from "@/lib/lists/swipe";
import styles from "./EntryRow.module.css";

/**
 * One entry as the client sees it — the flattened shape the page hands down.
 * Defined here (not in ListBody) because ListBody imports this component, and
 * the type has to travel the other way without a circular import.
 */
export interface ListEntry {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
}

type EntryRowProps = {
  entry: ListEntry;
  /** A completed list is read-only: desaturated, no checking, no swipe, no sheet. */
  frozen: boolean;
  /** Receives the TARGET state, matching check_item's idempotent semantics. */
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
};

/**
 * One list entry (handoff §10): check circle · name · quantity, tap to open the
 * detail sheet, swipe left to delete.
 *
 * Two tap targets, two buttons: the circle checks, the rest of the row opens the
 * sheet. Splitting them into real <button>s (rather than one div with an onClick
 * and a stopPropagation) is what makes both reachable by keyboard and correctly
 * announced — the design's "Check-Kreis (größtes Tap-Target)" and "Tap auf Zeile
 * (nicht Checkbox) öffnet das Eintrag-Sheet", expressed in HTML.
 *
 * The swipe is a POINTER gesture on the wrapper, so it works for mouse and touch
 * alike and needs no library. It is deliberately not the only way to delete: the
 * entry sheet's „Eintrag löschen" is the keyboard- and screen-reader-accessible
 * path, because a swipe cannot be one.
 */
export function EntryRow({ entry, frozen, onToggle, onOpen, onDelete }: EntryRowProps) {
  // How far the row currently follows the finger. null = not swiping, so the CSS
  // transition (snap-back) is only active when the finger is off the glass.
  const [offset, setOffset] = useState<number | null>(null);
  // Where the gesture started, and whether it ever became a real drag. A ref, not
  // state: changing it must not re-render mid-gesture.
  const gesture = useRef<{ startX: number; moved: boolean } | null>(null);
  // Set for a moment after a swipe so the click that follows a drag does not open
  // the sheet. The prototype uses the same 150ms guard.
  const justSwiped = useRef(false);

  const quantityLabel = formatQuantityLabel(entry.quantity, entry.unit);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (frozen) return;
    gesture.current = { startX: event.clientX, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const current = gesture.current;
    if (!current) return;
    // A mouse that left the row with the button released is not a drag any more.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      gesture.current = null;
      setOffset(null);
      return;
    }
    const next = swipeOffset(current.startX, event.clientX);
    // Only commit to the gesture past the tolerance, so a tap's jitter never
    // nudges the row.
    if (current.moved || isSwipeStarted(next)) {
      gesture.current = { ...current, moved: true };
      setOffset(next);
    }
  };

  const handlePointerUp = () => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;

    if (current.moved) {
      justSwiped.current = true;
      window.setTimeout(() => {
        justSwiped.current = false;
      }, 150);
    }

    const released = offset ?? 0;
    // Drop the offset first: the row snaps back under the CSS transition even in
    // the delete case, which is what it does while the server round-trip runs.
    setOffset(null);
    if (shouldDeleteOnRelease(released)) onDelete();
  };

  const openSheet = () => {
    // A drag that ended over the row body still fires a click; swallow it.
    if (justSwiped.current) return;
    onOpen();
  };

  return (
    <li className={styles.wrap} data-item-id={entry.id}>
      {/* The red surface the row slides off. aria-hidden: the accessible way to
          delete is the sheet's button, and announcing a decorative layer would
          only add noise. */}
      <span
        className={styles.deleteSurface}
        aria-hidden="true"
        style={{ opacity: (offset ?? 0) < 0 ? 1 : 0 }}
      >
        Löschen
      </span>

      <div
        className={[styles.row, offset === null ? styles.settling : ""].filter(Boolean).join(" ")}
        // The only inline style in this component: a per-pixel transform no CSS
        // Module can express (the ProgressBar precedent).
        style={{ transform: `translateX(${offset ?? 0}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {frozen ? (
          // Frozen: the circle is decoration, not a control.
          <span className={[styles.check, styles.checkArchived].join(" ")}>
            <Icon icon={Check} size={12} />
          </span>
        ) : (
          <button
            type="button"
            className={[styles.check, entry.checked ? styles.checked : ""].filter(Boolean).join(" ")}
            // A stable label plus aria-pressed: the label names WHAT, the state
            // says whether it is on — a label that flips wording would re-announce
            // the whole control on every tap.
            aria-label={`${entry.name} abhaken`}
            aria-pressed={entry.checked}
            onClick={() => onToggle(!entry.checked)}
          >
            {entry.checked ? <Icon icon={Check} size={12} /> : null}
          </button>
        )}

        {frozen ? (
          <>
            <span className={[styles.name, styles.nameChecked].join(" ")}>{entry.name}</span>
            {quantityLabel ? <span className={styles.quantity}>{quantityLabel}</span> : null}
          </>
        ) : (
          <button
            type="button"
            className={styles.body}
            aria-label={`${entry.name} bearbeiten`}
            onClick={openSheet}
          >
            <span className={[styles.name, entry.checked ? styles.nameChecked : ""].filter(Boolean).join(" ")}>
              {entry.name}
            </span>
            {quantityLabel ? <span className={styles.quantity}>{quantityLabel}</span> : null}
          </button>
        )}
      </div>
    </li>
  );
}
```

Create `src/app/lists/[listId]/EntryRow.module.css`:

```css
/* Handoff §10: padding 9px 4px, gap 12px, 1px hairline between rows. */
.wrap {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
}

.deleteSurface {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 16px;
  background: var(--color-danger);
  color: var(--color-on-accent);
  font-size: 13px;
  font-weight: 700;
  border-radius: 6px;
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  /* ≥44px tap target, per the handoff's note on the check circle. */
  min-height: 44px;
  padding: 9px 4px;
  /* Opaque, so the red surface only shows where the row has moved away. */
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-hairline-weak);
  border-radius: 6px;
  /* Let the page scroll vertically while horizontal drags stay ours. */
  touch-action: pan-y;
}

/* Only while the finger is OFF: dragging must follow the pointer with no lag. */
.settling {
  transition: transform 0.18s ease-out;
}

.check {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  border: 2px solid var(--color-control-border);
  background: none;
  color: var(--color-on-accent);
  cursor: pointer;
  padding: 0;
}

.checked {
  border-color: var(--color-accent);
  background: var(--color-accent);
  animation: sl-pop 0.2s ease-out;
}

.checkArchived {
  border-color: var(--color-checked-archived);
  background: var(--color-checked-archived);
}

.body {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 12px;
  min-width: 0;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 15.5px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nameChecked {
  color: var(--color-text-checked);
  text-decoration: line-through;
}

.quantity {
  flex: none;
  font-size: 13px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/lists/[listId]/EntryRow.test.tsx"`
Expected: PASS (11 tests).

If the swipe tests fail because jsdom does not construct `PointerEvent`, replace `fireEvent.pointerDown/Move/Up` in the helper with `fireEvent(row, new MouseEvent("pointerdown", { clientX: 200, bubbles: true }))` etc. — React attaches pointer handlers to the corresponding native event names, so a `MouseEvent` with the right type and `clientX` drives them. Do not change the component to accommodate the test.

- [ ] **Step 5: Commit**

```bash
git add "src/app/lists/[listId]/EntryRow.tsx" "src/app/lists/[listId]/EntryRow.module.css" "src/app/lists/[listId]/EntryRow.test.tsx"
git commit -m "feat(lists): entry row with check circle, tap-to-open and swipe-to-delete"
```

---

## Task 8: `EntrySheet`

**Files:**
- Create: `src/app/lists/[listId]/EntrySheet.tsx`
- Create: `src/app/lists/[listId]/EntrySheet.module.css`
- Test: `src/app/lists/[listId]/EntrySheet.test.tsx`

**Interfaces:**
- Consumes: `Sheet`, `Button`, `Chip`, `TextField` primitives; `parseGermanDecimal`, `formatGermanNumber`; `ListEntry` from `EntryRow.tsx`.
- Produces: `EntryChanges` (`{ quantity?: number | null; unit?: string | null; category?: string | null }`) and `<EntrySheet entry categories error onClose onSave onDelete />`.

- [ ] **Step 1: Write the failing test**

Create `src/app/lists/[listId]/EntrySheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ListEntry } from "./EntryRow";
import { EntrySheet } from "./EntrySheet";

const milch: ListEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milch",
  quantity: 1.5,
  unit: "l",
  category: "Molkerei",
  checked: false,
};

function renderSheet(overrides: Partial<Parameters<typeof EntrySheet>[0]> = {}) {
  const props = {
    entry: milch,
    categories: ["Backwaren", "Molkerei", "Obst & Gemüse"],
    error: null,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<EntrySheet {...props} />), props };
}

describe("EntrySheet", () => {
  it("is titled with the article name", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Milch" })).toBeInTheDocument();
  });

  it("prefills the three fields from the entry, quantity with a German comma", () => {
    renderSheet();
    expect(screen.getByLabelText("Menge")).toHaveValue("1,5");
    expect(screen.getByLabelText("Einheit")).toHaveValue("l");
    expect(screen.getByLabelText("Kategorie")).toHaveValue("Molkerei");
  });

  it("marks the entry's category chip as selected", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Molkerei" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Backwaren" })).toHaveAttribute("aria-pressed", "false");
  });

  it("names the catalog flow-back explicitly", () => {
    renderSheet();
    expect(
      screen.getByText("Kategorie und Einheit werden als neuer Standard im Katalog gemerkt."),
    ).toBeInTheDocument();
  });

  // THE load-bearing test of this slice's merge behaviour: an unchanged field must
  // not be sent, or it would overwrite a concurrent remote edit (LWW).
  it("saves only the fields that actually changed", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.clear(screen.getByLabelText("Menge"));
    await userEvent.type(screen.getByLabelText("Menge"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onSave).toHaveBeenCalledWith({ quantity: 2 });
  });

  it("saves nothing at all when nothing changed", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onSave).toHaveBeenCalledWith({});
  });

  it("clears a field with null rather than an empty string", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.clear(screen.getByLabelText("Einheit"));
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onSave).toHaveBeenCalledWith({ unit: null });
  });

  it("writes a tapped chip into the category field", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.click(screen.getByRole("button", { name: "Backwaren" }));

    expect(screen.getByLabelText("Kategorie")).toHaveValue("Backwaren");

    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(onSave).toHaveBeenCalledWith({ category: "Backwaren" });
  });

  it("clears the category when the selected chip is tapped again", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.click(screen.getByRole("button", { name: "Molkerei" }));
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onSave).toHaveBeenCalledWith({ category: null });
  });

  it("deletes the entry from the sheet", async () => {
    const onDelete = vi.fn();
    renderSheet({ onDelete });

    await userEvent.click(screen.getByRole("button", { name: "Eintrag löschen" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows a German error next to the quantity field", () => {
    renderSheet({ error: "Menge muss eine positive Zahl sein" });
    expect(screen.getByText("Menge muss eine positive Zahl sein")).toBeInTheDocument();
  });

  it("renders no chip row when the project knows no categories yet", () => {
    renderSheet({ categories: [] });
    expect(screen.queryByRole("button", { name: "Molkerei" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Kategorie")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/lists/[listId]/EntrySheet.test.tsx"`
Expected: FAIL — cannot resolve `./EntrySheet`.

- [ ] **Step 3: Implement the component**

Create `src/app/lists/[listId]/EntrySheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { formatGermanNumber } from "@/lib/format/date";
import { parseGermanDecimal } from "@/lib/format/quantity";
import type { ListEntry } from "./EntryRow";
import styles from "./EntrySheet.module.css";

/**
 * The fields the user actually changed. A key that is ABSENT means "do not touch
 * this field"; a key set to null means "clear it". That distinction is the whole
 * point of the type — see the comment on `collectChanges`.
 */
export interface EntryChanges {
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
}

type EntrySheetProps = {
  /** The entry being edited. The sheet is only rendered when there is one. */
  entry: ListEntry;
  /** Every category the project knows, for the chip row. */
  categories: string[];
  /** German error from the last save attempt, e.g. an invalid quantity. */
  error: string | null;
  onClose: () => void;
  onSave: (changes: EntryChanges) => void;
  onDelete: () => void;
};

/**
 * The entry detail bottom sheet (handoff §10) — where Menge, Einheit and
 * Kategorie live now that the list screen has no add form.
 *
 * IMPORTANT for the caller: this component seeds its draft state from `entry`
 * once. Render it with `key={entry.id}` so switching entries remounts it — that
 * is the React idiom for "derive state from props on identity change", and it is
 * far more robust than syncing with an effect.
 */
export function EntrySheet({ entry, categories, error, onClose, onSave, onDelete }: EntrySheetProps) {
  // Drafts are strings, because that is what a text input holds. Converting only
  // on save keeps "1," mid-typing from being interpreted as a number.
  const [quantity, setQuantity] = useState(
    entry.quantity === null ? "" : formatGermanNumber(entry.quantity),
  );
  const [unit, setUnit] = useState(entry.unit ?? "");
  const [category, setCategory] = useState(entry.category ?? "");

  /**
   * Diffs the drafts against the entry and returns ONLY what changed.
   *
   * Why not just send all three: each field becomes its own `update_item`
   * operation, and the merge rule is per-field last-writer-wins. Sending an
   * untouched field would overwrite whatever another member changed on it while
   * this sheet was open — the exact conflict the field-granular operation model
   * exists to avoid (MVP design §4.5).
   */
  const collectChanges = (): EntryChanges => {
    const changes: EntryChanges = {};

    // NaN never equals the stored value, so invalid text is always "changed" and
    // travels to the server, which answers with the German validation message.
    const nextQuantity = parseGermanDecimal(quantity);
    if (!Object.is(nextQuantity, entry.quantity)) changes.quantity = nextQuantity;

    // Empty input means "clear", which is null on the column — never "".
    const nextUnit = unit.trim() || null;
    if (nextUnit !== entry.unit) changes.unit = nextUnit;

    const nextCategory = category.trim() || null;
    if (nextCategory !== entry.category) changes.category = nextCategory;

    return changes;
  };

  // Tapping the selected chip clears the category — the prototype's toggle
  // behaviour, and the only way to un-categorize an entry from the sheet.
  const pickCategory = (name: string) => {
    setCategory((current) => (current.trim() === name ? "" : name));
  };

  return (
    <Sheet open onClose={onClose} title={entry.name}>
      <div className={styles.fields}>
        <div className={styles.quantityField}>
          <TextField
            label="Menge"
            aria-label="Menge"
            placeholder="1,5"
            // Brings up the numeric keypad on iPhone; the comma still arrives as text.
            inputMode="decimal"
            fieldSize="sm"
            value={quantity}
            error={error}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
        <div className={styles.unitField}>
          <TextField
            label="Einheit"
            aria-label="Einheit"
            placeholder="l"
            fieldSize="sm"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          />
        </div>
        <div className={styles.categoryField}>
          <TextField
            label="Kategorie"
            aria-label="Kategorie"
            placeholder="Ohne Kategorie"
            fieldSize="sm"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
      </div>

      {/* No chips at all in a young project: an empty row would just be a gap. */}
      {categories.length > 0 && (
        <div className={styles.chips}>
          {categories.map((name) => (
            <Chip
              key={name}
              tone="neutral"
              selected={category.trim() === name}
              onClick={() => pickCategory(name)}
            >
              {name}
            </Chip>
          ))}
        </div>
      )}

      {/* Naming the flow-back is a deliberate design choice: the user is editing
          shared project memory, not just this one entry. */}
      <p className={styles.hint}>
        Kategorie und Einheit werden als neuer Standard im Katalog gemerkt.
      </p>

      <div className={styles.actions}>
        <Button fullWidth onClick={() => onSave(collectChanges())}>
          Fertig
        </Button>
        {/* No second confirmation: the sheet IS the deliberate surface, and this
            is the accessible counterpart of the swipe gesture. */}
        <Button variant="danger" onClick={onDelete}>
          Eintrag löschen
        </Button>
      </div>
    </Sheet>
  );
}
```

Create `src/app/lists/[listId]/EntrySheet.module.css`:

```css
/* Handoff §10: MENGE 100px · EINHEIT 90px · KATEGORIE fills the rest. */
.fields {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.quantityField {
  width: 100px;
}

.unitField {
  width: 90px;
}

.categoryField {
  flex: 1;
  min-width: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.hint {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--color-text-muted);
  margin-top: 9px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/lists/[listId]/EntrySheet.test.tsx"`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/lists/[listId]/EntrySheet.tsx" "src/app/lists/[listId]/EntrySheet.module.css" "src/app/lists/[listId]/EntrySheet.test.tsx"
git commit -m "feat(lists): entry detail sheet sending only the fields that changed"
```

---

## Task 9: `ListMenu`

**Files:**
- Create: `src/app/lists/[listId]/ListMenu.tsx`
- Create: `src/app/lists/[listId]/ListMenu.module.css`
- Test: `src/app/lists/[listId]/ListMenu.test.tsx`

**Interfaces:**
- Consumes: `ConfirmSheet`, `Icon`.
- Produces: `<ListMenu listName isCompleted completeAction deleteAction />` where both actions are `() => void | Promise<void>` (Server Actions bound by the page).

- [ ] **Step 1: Write the failing test**

Create `src/app/lists/[listId]/ListMenu.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListMenu } from "./ListMenu";

function renderMenu(overrides: Partial<Parameters<typeof ListMenu>[0]> = {}) {
  const props = {
    listName: "Einkauf Samstag",
    isCompleted: false,
    completeAction: vi.fn(),
    deleteAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<ListMenu {...props} />), props };
}

describe("ListMenu", () => {
  it("keeps the menu closed until the trigger is tapped", () => {
    renderMenu();
    expect(screen.queryByRole("menuitem", { name: "Liste löschen" })).not.toBeInTheDocument();
  });

  it("opens the menu from the ⋮ trigger", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(screen.getByRole("menuitem", { name: "Liste abschließen" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Liste löschen" })).toBeInTheDocument();
  });

  it("completes the list and closes the menu", async () => {
    const completeAction = vi.fn();
    renderMenu({ completeAction });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Liste abschließen" }));

    expect(completeAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  // A completed list is reopened from the green banner, not from here.
  it("hides „Liste abschließen“ on a completed list", async () => {
    renderMenu({ isCompleted: true });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(screen.queryByRole("menuitem", { name: "Liste abschließen" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Liste löschen" })).toBeInTheDocument();
  });

  it("asks before deleting and names the list", async () => {
    const deleteAction = vi.fn();
    renderMenu({ deleteAction });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Liste löschen" }));

    expect(
      screen.getByRole("dialog", { name: "Liste löschen: Einkauf Samstag" }),
    ).toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it("deletes only after the confirmation is chosen", async () => {
    const deleteAction = vi.fn();
    renderMenu({ deleteAction });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Liste löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Liste endgültig löschen" }));

    expect(deleteAction).toHaveBeenCalledTimes(1);
  });

  it("closes the menu when the backdrop is tapped", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByTestId("menu-backdrop"));

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/lists/[listId]/ListMenu.test.tsx"`
Expected: FAIL — cannot resolve `./ListMenu`.

- [ ] **Step 3: Implement the component**

Create `src/app/lists/[listId]/ListMenu.tsx`:

```tsx
"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { Icon } from "@/components/ui/Icon";
import styles from "./ListMenu.module.css";

type ListMenuProps = {
  /** Named in the confirmation so the user sees WHICH list is at stake. */
  listName: string;
  /** A completed list has nothing to complete; it reopens from the green banner. */
  isCompleted: boolean;
  /** Server Actions, bound by the page. Both are member-level. */
  completeAction: () => void | Promise<void>;
  deleteAction: () => void | Promise<void>;
};

/**
 * The list header's ⋮ menu (handoff §10): Liste abschließen / Liste löschen.
 *
 * Why a hand-rolled menu instead of a Sheet: the design draws a small dropdown
 * anchored under the ⋮, not a bottom sheet — the sheet is reserved for decisions
 * with consequences, which is exactly why DELETING still opens one.
 *
 * The backdrop is a plain div rather than a button: it duplicates the trigger and
 * Escape, so putting a nameless stop in the tab order would only cost keyboard
 * users a step (the same reasoning as `Sheet`'s overlay).
 */
export function ListMenu({ listName, isCompleted, completeAction, deleteAction }: ListMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Listenmenü"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon icon={MoreVertical} size={19} />
      </button>

      {open && (
        <>
          <div
            className={styles.backdrop}
            data-testid="menu-backdrop"
            onClick={() => setOpen(false)}
          />
          <div className={styles.menu} role="menu">
            {!isCompleted && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  void completeAction();
                  setOpen(false);
                }}
              >
                Liste abschließen
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={[styles.item, styles.danger].join(" ")}
              onClick={() => {
                // Close the menu first: the confirmation sheet is the surface the
                // user should now be looking at, and two overlays would fight.
                setOpen(false);
                setConfirmOpen(true);
              }}
            >
              Liste löschen
            </button>
          </div>
        </>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Liste löschen: ${listName}`}
        options={[
          {
            label: "Liste endgültig löschen",
            description:
              "Alle Einträge dieser Liste verschwinden mit. Das lässt sich nicht rückgängig machen.",
            tone: "danger",
            // ConfirmSheet does not close itself: fire, then drop the sheet.
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

Create `src/app/lists/[listId]/ListMenu.module.css`:

```css
.trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  /* ≥44px tap target even though the glyph is 19px. */
  width: 44px;
  height: 44px;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
}

/* Invisible catcher: one tap anywhere closes the menu. */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 19;
}

/* Handoff §10: anchored under the header, right-aligned. */
.menu {
  position: absolute;
  top: calc(48px + var(--safe-top));
  right: 14px;
  min-width: 190px;
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-dropdown);
  overflow: hidden;
  z-index: 20;
  animation: sl-fade 0.15s ease-out;
}

.item {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 14px;
  color: var(--color-text-primary);
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-hairline-weak);
  padding: 12px 16px;
  cursor: pointer;
}

.menu .item:last-child {
  border-bottom: none;
}

.danger {
  color: var(--color-danger);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/lists/[listId]/ListMenu.test.tsx"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/lists/[listId]/ListMenu.tsx" "src/app/lists/[listId]/ListMenu.module.css" "src/app/lists/[listId]/ListMenu.test.tsx"
git commit -m "feat(lists): ⋮ list menu with a guarded delete"
```

---

## Task 10: `ListBody` — chips, groups, trailing row, sheet orchestration

**Files:**
- Create: `src/app/lists/[listId]/formState.ts`
- Create: `src/app/lists/[listId]/ListBody.tsx`
- Create: `src/app/lists/[listId]/ListBody.module.css`
- Test: `src/app/lists/[listId]/ListBody.test.tsx`

**Interfaces:**
- Consumes: `ChipTabs`, `SectionLabel`; `EntryRow` + `ListEntry`; `EntrySheet` + `EntryChanges`; `Autocomplete`; `buildAutocomplete` + `AutocompleteArticle`; `categoryChipOptions`, `groupItemsByCategory`, `ALL_CATEGORIES_LABEL`, `UNCATEGORIZED_LABEL`.
- Produces: `EntryFormState` / `ENTRY_FORM_IDLE`; `<ListBody entries articles categories frozen addAction updateAction checkAction removeAction />`.

**Server Action contract this component depends on (Task 11 implements it):**

| Action | Signature | FormData it reads |
|---|---|---|
| `addAction` | `(prev: EntryFormState, formData: FormData) => Promise<EntryFormState>` | `itemId`, `name`, `category` (absent = „Alle") |
| `updateAction` | `(prev: EntryFormState, formData: FormData) => Promise<EntryFormState>` | `itemId`, plus any of `quantity`, `unit`, `category` — **presence means "change this field"** |
| `checkAction` | `(formData: FormData) => void \| Promise<void>` | `itemId`, `checked` (`"true"`/`"false"`) |
| `removeAction` | `(formData: FormData) => void \| Promise<void>` | `itemId` |

- [ ] **Step 1: Write the failing test**

Create `src/app/lists/[listId]/ListBody.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ListEntry } from "./EntryRow";
import { ListBody } from "./ListBody";
import { ENTRY_FORM_IDLE } from "./formState";

const entry = (id: string, name: string, category: string | null): ListEntry => ({
  id,
  name,
  quantity: null,
  unit: null,
  category,
  checked: false,
});

const milch = entry("11111111-1111-4111-8111-111111111111", "Milch", "Molkerei");
const butter = entry("22222222-2222-4222-8222-222222222222", "Butter", "Molkerei");
const apfel = entry("33333333-3333-4333-8333-333333333333", "Apfel", "Obst & Gemüse");
const duebel = entry("44444444-4444-4444-8444-444444444444", "Dübel", null);

function renderBody(overrides: Partial<Parameters<typeof ListBody>[0]> = {}) {
  const props = {
    entries: [milch, butter, apfel, duebel],
    articles: [
      { id: "a1", name: "Milch", defaultCategory: "Molkerei" },
      { id: "a2", name: "Milchreis", defaultCategory: null },
    ],
    categories: ["Molkerei", "Obst & Gemüse"],
    frozen: false,
    addAction: vi.fn(async () => ENTRY_FORM_IDLE),
    updateAction: vi.fn(async () => ENTRY_FORM_IDLE),
    checkAction: vi.fn(),
    removeAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<ListBody {...props} />), props };
}

describe("ListBody — chips", () => {
  it("derives the chip row from the entries, Alle first and Ohne Kategorie last", () => {
    renderBody();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Alle", "Molkerei", "Obst & Gemüse", "Ohne Kategorie"]);
  });

  it("groups under uppercase section labels in the Alle view", () => {
    renderBody();
    expect(screen.getByRole("heading", { name: "Molkerei" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ohne Kategorie" })).toBeInTheDocument();
  });

  it("shows only the picked category and drops the section labels", async () => {
    renderBody();

    await userEvent.click(screen.getByRole("tab", { name: "Molkerei" }));

    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.queryByText("Apfel")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Molkerei" })).not.toBeInTheDocument();
  });

  // The design is explicit: the user stays in the emptied filter.
  it("keeps the active chip and explains the empty category", async () => {
    const { rerender, props } = renderBody();

    await userEvent.click(screen.getByRole("tab", { name: "Obst & Gemüse" }));
    // The entry is gone on the next server render.
    rerender(<ListBody {...props} entries={[milch, butter, duebel]} />);

    expect(screen.getByRole("tab", { name: "Obst & Gemüse" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Nichts mehr in „Obst & Gemüse“")).toBeInTheDocument();
  });
});

describe("ListBody — trailing row", () => {
  it("invites the first entry on an empty list", () => {
    renderBody({ entries: [] });
    expect(screen.getByLabelText("Eintrag hinzufügen")).toBeInTheDocument();
    expect(
      screen.getByText("Einfach lostippen — jeder Eintrag mit ↵ legt gleich die nächste Zeile an."),
    ).toBeInTheDocument();
  });

  it("names the active category in the placeholder", async () => {
    renderBody();

    await userEvent.click(screen.getByRole("tab", { name: "Molkerei" }));

    expect(screen.getByLabelText("Neu in „Molkerei“")).toBeInTheDocument();
  });

  it("adds the typed name with a client-generated id", async () => {
    const addAction = vi.fn(async () => ENTRY_FORM_IDLE);
    renderBody({ addAction });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "Dübel{Enter}");

    expect(addAction).toHaveBeenCalledTimes(1);
    const formData = addAction.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("Dübel");
    expect(String(formData.get("itemId"))).toMatch(/^[0-9a-f-]{36}$/i);
    // "Alle" is active, so no category is posted — the catalog default wins.
    expect(formData.get("category")).toBeNull();
  });

  it("posts the active chip as the category", async () => {
    const addAction = vi.fn(async () => ENTRY_FORM_IDLE);
    renderBody({ addAction });

    await userEvent.click(screen.getByRole("tab", { name: "Molkerei" }));
    await userEvent.type(screen.getByLabelText("Neu in „Molkerei“"), "Quark{Enter}");

    const formData = addAction.mock.calls[0][1] as FormData;
    expect(formData.get("category")).toBe("Molkerei");
  });

  it("clears the field after adding", async () => {
    renderBody();

    const field = screen.getByLabelText("Eintrag hinzufügen");
    await userEvent.type(field, "Dübel{Enter}");

    expect(field).toHaveValue("");
  });

  it("suggests catalog articles while typing", async () => {
    renderBody();

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "Milc");

    expect(screen.getByRole("button", { name: /Milchreis/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "„Milc“ neu anlegen" })).toBeInTheDocument();
  });
});

describe("ListBody — entry interaction", () => {
  it("checks an entry through the action", async () => {
    const checkAction = vi.fn();
    renderBody({ checkAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch abhaken" }));

    const formData = checkAction.mock.calls[0][0] as FormData;
    expect(formData.get("itemId")).toBe(milch.id);
    expect(formData.get("checked")).toBe("true");
  });

  it("opens the entry sheet from a row", async () => {
    renderBody();

    await userEvent.click(screen.getByRole("button", { name: "Milch bearbeiten" }));

    expect(screen.getByRole("dialog", { name: "Milch" })).toBeInTheDocument();
  });

  it("sends one field per change and closes the sheet", async () => {
    const updateAction = vi.fn(async () => ENTRY_FORM_IDLE);
    renderBody({ updateAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch bearbeiten" }));
    await userEvent.type(screen.getByLabelText("Einheit"), "l");
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    const formData = updateAction.mock.calls[0][1] as FormData;
    expect(formData.get("itemId")).toBe(milch.id);
    expect(formData.get("unit")).toBe("l");
    expect(formData.has("quantity")).toBe(false);
    expect(formData.has("category")).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes an entry from the sheet", async () => {
    const removeAction = vi.fn();
    renderBody({ removeAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch bearbeiten" }));
    await userEvent.click(screen.getByRole("button", { name: "Eintrag löschen" }));

    const formData = removeAction.mock.calls[0][0] as FormData;
    expect(formData.get("itemId")).toBe(milch.id);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The design's "neuer, unbekannter Artikel ohne Kategorie" rule.
  it("opens the sheet on the entry the action asks for", async () => {
    const addAction = vi.fn(async () => ({
      ...ENTRY_FORM_IDLE,
      openEntryId: duebel.id,
    }));
    renderBody({ addAction });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "Dübel{Enter}");

    expect(await screen.findByRole("dialog", { name: "Dübel" })).toBeInTheDocument();
  });
});

describe("ListBody — completed list", () => {
  it("shows neither chips nor an input row", () => {
    renderBody({ frozen: true });

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Eintrag hinzufügen")).not.toBeInTheDocument();
  });

  it("still lists every entry, grouped", () => {
    renderBody({ frozen: true });

    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Molkerei" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/lists/[listId]/ListBody.test.tsx"`
Expected: FAIL — cannot resolve `./ListBody`.

- [ ] **Step 3: Implement the form state**

Create `src/app/lists/[listId]/formState.ts`:

```ts
/**
 * The result shape both entry Server Actions return.
 *
 * Why the actions return state instead of throwing: „Menge muss eine positive
 * Zahl sein" has to land inline in the entry sheet, and a thrown error on a
 * Server Action produces Next.js's error overlay, not an inline message. Returning
 * state is what React 19's useActionState consumes. (Same reasoning, same shape
 * family as the Katalog screen's CatalogFormState.)
 */
export type EntryFormState = {
  /** German inline error from the last attempt, or null. */
  error: string | null;
  /** True after an action SUCCEEDED. The idle state has no error either, so
   *  `error === null` alone cannot tell "nothing happened" from "it worked". */
  ok: boolean;
  /**
   * Entry whose detail sheet should open right away — the design's „Neuer,
   * unbekannter Artikel ohne Kategorie → Eintrag-Sheet öffnet sich direkt".
   * null in every other case.
   */
  openEntryId: string | null;
};

/** The initial value both useActionState hooks start from. */
export const ENTRY_FORM_IDLE: EntryFormState = {
  error: null,
  ok: false,
  openEntryId: null,
};
```

- [ ] **Step 4: Implement `ListBody`**

Create `src/app/lists/[listId]/ListBody.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { ChipTabs } from "@/components/ui/ChipTabs";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { buildAutocomplete, type AutocompleteArticle } from "@/lib/catalog/autocomplete";
import {
  ALL_CATEGORIES_LABEL,
  categoryChipOptions,
  categoryLabel,
  groupItemsByCategory,
} from "@/lib/lists/categories";
import { EntryRow, type ListEntry } from "./EntryRow";
import { EntrySheet, type EntryChanges } from "./EntrySheet";
import { ENTRY_FORM_IDLE, type EntryFormState } from "./formState";
import styles from "./ListBody.module.css";

/** The two entry actions have the useActionState signature; see formState.ts. */
type EntryAction = (prev: EntryFormState, formData: FormData) => Promise<EntryFormState>;
/** Check and remove need no inline error, so they stay plain Server Actions. */
type FireAndForgetAction = (formData: FormData) => void | Promise<void>;

type ListBodyProps = {
  /** Every entry, in sortIndex order, straight from the server on every render. */
  entries: ListEntry[];
  /** The project's catalog, for the trailing row's autocomplete. */
  articles: AutocompleteArticle[];
  /** Every category the project knows, for the entry sheet's chips. */
  categories: string[];
  /** A completed list: read-only, no chips, no input row (handoff §10). */
  frozen: boolean;
  addAction: EntryAction;
  updateAction: EntryAction;
  checkAction: FireAndForgetAction;
  removeAction: FireAndForgetAction;
};

/**
 * The interactive body of the list screen (handoff §10) — the piece Slice 12 is
 * really about.
 *
 * WHY this is a client component when nothing else on the screen is: the filter
 * chips, the typed text in the trailing row and the swipe gesture are all view
 * state that changes many times per second. A server round-trip per keystroke is
 * exactly what the design's "trailing empty row" cannot afford. The DATA is still
 * server-owned: `entries`, `articles` and `categories` are props, so after every
 * mutation `revalidatePath` hands this component a fresh array while its own
 * state (active chip, typed text, open sheet) survives — the same split
 * `CatalogBrowser` established, and the reason `ListSyncPoller`'s
 * `router.refresh()` keeps working untouched.
 *
 * WHY the mutations are Server Actions rather than fetches to /api/.../ops: both
 * funnel into the same `applyOperation` core, and a Server Action re-derives
 * identity server-side without a client-held session. The REST endpoint stays for
 * the Phase 2 offline queue, which is what it was built for.
 */
export function ListBody({
  entries,
  articles,
  categories,
  frozen,
  addAction,
  updateAction,
  checkAction,
  removeAction,
}: ListBodyProps) {
  const [activeChip, setActiveChip] = useState(ALL_CATEGORIES_LABEL);
  const [draft, setDraft] = useState("");
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  // Keeps the cursor in the trailing row after a submit — "Enter legt an und
  // fokussiert die nächste leere Zeile" (handoff §10). There is only ever one
  // trailing row, so "the next empty row" IS this input, cleared.
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Wrapping the action lets us open the sheet in the same async turn that
  // produced the new state — after the await, so it is not a setState cascade
  // inside an effect (the React Compiler lint rule CatalogBrowser ran into).
  const [addState, dispatchAdd] = useActionState(async (prev: EntryFormState, formData: FormData) => {
    const next = await addAction(prev, formData);
    if (next.openEntryId) setOpenEntryId(next.openEntryId);
    return next;
  }, ENTRY_FORM_IDLE);

  const [updateState, dispatchUpdate] = useActionState(
    async (prev: EntryFormState, formData: FormData) => {
      const next = await updateAction(prev, formData);
      // A FAILED save must keep the sheet open — the user has to see the message
      // next to the field that caused it.
      if (next.ok) setOpenEntryId(null);
      return next;
    },
    ENTRY_FORM_IDLE,
  );

  // Chips are derived from the entries; `activeChip` is passed in so the selected
  // one survives its category going empty.
  const chipOptions = categoryChipOptions(entries, activeChip);
  const visible =
    activeChip === ALL_CATEGORIES_LABEL
      ? entries
      : entries.filter((item) => categoryLabel(item.category) === activeChip);
  const groups = activeChip === ALL_CATEGORIES_LABEL ? groupItemsByCategory(visible) : [];

  const suggestions = buildAutocomplete(articles, draft);
  const openEntry = entries.find((item) => item.id === openEntryId) ?? null;

  /** The trailing row's submit: one add_item with a client-generated identity. */
  const addEntry = (name: string) => {
    const formData = new FormData();
    // Client-generated UUID (MVP design §3): stable identity across retries, and
    // it is what lets the action tell us WHICH entry to open the sheet on.
    formData.set("itemId", crypto.randomUUID());
    formData.set("name", name);
    // Absent means „Alle" — inherit the catalog default (see addEntryFromRow).
    if (activeChip !== ALL_CATEGORIES_LABEL) formData.set("category", activeChip);

    setDraft("");
    inputRef.current?.focus();
    // startTransition is what React expects for an action dispatched outside a
    // <form> submission.
    startTransition(() => dispatchAdd(formData));
  };

  const toggleEntry = (entry: ListEntry, checked: boolean) => {
    const formData = new FormData();
    formData.set("itemId", entry.id);
    // The TARGET state, not a toggle — check_item is idempotent by construction.
    formData.set("checked", String(checked));
    startTransition(() => void checkAction(formData));
  };

  const removeEntry = (entryId: string) => {
    const formData = new FormData();
    formData.set("itemId", entryId);
    setOpenEntryId(null);
    startTransition(() => void removeAction(formData));
  };

  /** Only the fields the sheet reports as changed are put on the wire. */
  const saveEntry = (entryId: string, changes: EntryChanges) => {
    // Nothing changed: closing without a request is the honest outcome.
    if (Object.keys(changes).length === 0) {
      setOpenEntryId(null);
      return;
    }
    const formData = new FormData();
    formData.set("itemId", entryId);
    // A PRESENT key means "change this field"; null becomes "" and the action
    // maps it back to null. An absent key is never touched — that is what keeps
    // a concurrent remote edit to another field intact under last-writer-wins.
    if ("quantity" in changes) formData.set("quantity", changes.quantity === null ? "" : String(changes.quantity));
    if ("unit" in changes) formData.set("unit", changes.unit ?? "");
    if ("category" in changes) formData.set("category", changes.category ?? "");
    startTransition(() => dispatchUpdate(formData));
  };

  // The trailing input row, built once: it appears above the hint on an empty
  // list (mock 5c) and below it in an emptied filter (mock 5d).
  const trailingRow = (
    <Autocomplete
      value={draft}
      onChange={setDraft}
      onSubmit={addEntry}
      options={suggestions.options}
      createName={suggestions.createName}
      placeholder={
        activeChip === ALL_CATEGORIES_LABEL ? "Eintrag hinzufügen" : `Neu in „${activeChip}“`
      }
      inputLabel={
        activeChip === ALL_CATEGORIES_LABEL ? "Eintrag hinzufügen" : `Neu in „${activeChip}“`
      }
      inputRef={inputRef}
      leading={<span className={styles.plus} aria-hidden="true">＋</span>}
    />
  );

  const isEmptyList = entries.length === 0;
  const isEmptyFilter = !isEmptyList && visible.length === 0;

  return (
    <div className={styles.body}>
      {/* A completed list has no filter row at all (handoff §10). */}
      {!frozen && (
        <div className={styles.chips}>
          <ChipTabs
            options={chipOptions}
            value={activeChip}
            onChange={setActiveChip}
            label="Kategorien"
          />
        </div>
      )}

      <div className={styles.content}>
        {activeChip === ALL_CATEGORIES_LABEL
          ? groups.map((group) => (
              <section key={group.category}>
                <div className={styles.groupLabel}>
                  <SectionLabel>{group.category}</SectionLabel>
                </div>
                <ul className={styles.rows}>
                  {group.items.map((item) => (
                    <EntryRow
                      key={item.id}
                      entry={item}
                      frozen={frozen}
                      onToggle={(checked) => toggleEntry(item, checked)}
                      onOpen={() => setOpenEntryId(item.id)}
                      onDelete={() => removeEntry(item.id)}
                    />
                  ))}
                </ul>
              </section>
            ))
          : // Inside a filter the section labels would repeat the active chip.
            visible.length > 0 && (
              <ul className={styles.rows}>
                {visible.map((item) => (
                  <EntryRow
                    key={item.id}
                    entry={item}
                    frozen={frozen}
                    onToggle={(checked) => toggleEntry(item, checked)}
                    onOpen={() => setOpenEntryId(item.id)}
                    onDelete={() => removeEntry(item.id)}
                  />
                ))}
              </ul>
            )}

        {/* Empty state 5c: the input row IS the empty state, the sentence sits
            below it. */}
        {!frozen && isEmptyList && (
          <>
            {trailingRow}
            <p className={styles.emptyHint}>
              Einfach lostippen — jeder Eintrag mit ↵ legt gleich die nächste Zeile an.
            </p>
          </>
        )}

        {/* Empty state 5d: the explanation fills the space, the row stays at the
            bottom — and the user stays in the filter. */}
        {!frozen && isEmptyFilter && (
          <>
            <div className={styles.emptyFilter}>
              <p className={styles.emptyFilterTitle}>{`Nichts mehr in „${activeChip}“`}</p>
              <p className={styles.emptyFilterText}>
                Der letzte Eintrag wurde gerade entfernt. Du bleibst hier — oder zurück zu „Alle“.
              </p>
            </div>
            {trailingRow}
          </>
        )}

        {/* The normal case: the row trails the entries. */}
        {!frozen && !isEmptyList && !isEmptyFilter && trailingRow}

        {/* An add that failed validation (an empty name reaching the server, a
            name over the length cap) reports here — the row itself has no room. */}
        {addState.error ? <p className={styles.addError}>{addState.error}</p> : null}
      </div>

      {openEntry && (
        // key: remount on a different entry, so the sheet's drafts re-seed from
        // props instead of being synced by an effect.
        <EntrySheet
          key={openEntry.id}
          entry={openEntry}
          categories={categories}
          error={updateState.error}
          onClose={() => setOpenEntryId(null)}
          onSave={(changes) => saveEntry(openEntry.id, changes)}
          onDelete={() => removeEntry(openEntry.id)}
        />
      )}
    </div>
  );
}
```

Create `src/app/lists/[listId]/ListBody.module.css`:

```css
.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

/* Handoff §10: the chip row sits under the header, on its own hairline. */
.chips {
  flex: none;
  padding: 11px var(--screen-padding) 0;
  border-bottom: 1px solid var(--color-hairline);
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
  padding: 6px var(--screen-padding) calc(24px + var(--safe-bottom));
}

.groupLabel {
  padding: 12px 0 4px;
}

.rows {
  list-style: none;
}

.plus {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 21px;
  height: 21px;
  font-size: 19px;
  font-weight: 600;
  color: var(--color-accent);
}

/* Empty state 5c: quiet, centred, below the input row. */
.emptyHint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 28px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--color-text-muted);
}

/* Empty state 5d: fills the space so the input row is pushed to the bottom. */
.emptyFilter {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 28px;
}

.emptyFilterTitle {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.emptyFilterText {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.addError {
  font-size: 12.5px;
  color: var(--color-danger);
  padding: 4px 0 0 33px;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "src/app/lists/[listId]/ListBody.test.tsx"`
Expected: PASS (16 tests).

If `crypto.randomUUID` is missing in the jsdom environment, add `globalThis.crypto ??= (await import("node:crypto")).webcrypto as Crypto;` to the TEST file only — never a polyfill in the component.

- [ ] **Step 6: Commit**

```bash
git add "src/app/lists/[listId]/formState.ts" "src/app/lists/[listId]/ListBody.tsx" "src/app/lists/[listId]/ListBody.module.css" "src/app/lists/[listId]/ListBody.test.tsx"
git commit -m "feat(lists): list body with category chips, trailing row and entry sheet"
```

---

## Task 11: Rewrite the list screen

**Files:**
- Modify (rewrite): `src/app/lists/[listId]/page.tsx`
- Create: `src/app/lists/[listId]/page.module.css`
- Verify untouched: `src/app/lists/[listId]/ListSyncPoller.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–10, plus `requireListAccess`, `getListWithItems`, `allItemsChecked`, `completeList`, `reopenList`, `deleteList`, `applyOperation`, `computeCursor`, `searchCatalog`, `formatGermanDate`, `parseGermanDecimal`, `ApiError`.
- Produces: the finished screen. Nothing imports from it.

- [ ] **Step 1: Write the page's CSS Module**

Create `src/app/lists/[listId]/page.module.css`:

```css
/* Handoff §10: the screen is a column — header, chips, scrolling body. */
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  /* The dropdown menu is positioned against this. */
  position: relative;
}

/* A completed list is visibly frozen (handoff §10). */
.frozen {
  background: var(--color-bg-frozen);
}

.back {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  /* ≥44px tap target around an 18px glyph. */
  width: 44px;
  height: 44px;
  margin-left: -10px;
  color: var(--color-accent);
}

.banner {
  flex: none;
  padding: 12px var(--screen-padding) 0;
}

/* The banner's trailing control: accent text, never a filled button. */
.bannerAction {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-accent);
  background: none;
  border: none;
  white-space: nowrap;
  cursor: pointer;
  padding: 0;
}
```

- [ ] **Step 2: Rewrite the page**

Replace the entire contents of `src/app/lists/[listId]/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Check } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { CATALOG_DATALIST_LIMIT, searchCatalog } from "@/lib/catalog/search";
import { requireListAccess } from "@/lib/lists/access";
import {
  allItemsChecked,
  completeList,
  deleteList,
  getListWithItems,
  reopenList,
} from "@/lib/lists/lists";
import { addEntryFromRow } from "@/lib/lists/addEntry";
import { knownCategories } from "@/lib/lists/categories";
import { computeCursor } from "@/lib/lists/delta";
import { applyOperation } from "@/lib/lists/operations";
import { formatGermanDate } from "@/lib/format/date";
import { parseGermanDecimal } from "@/lib/format/quantity";
import { Banner } from "@/components/ui/Banner";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import ListSyncPoller from "./ListSyncPoller";
import { ListBody } from "./ListBody";
import { ListMenu } from "./ListMenu";
import type { ListEntry } from "./EntryRow";
import { ENTRY_FORM_IDLE, type EntryFormState } from "./formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components — must be awaited.
type Props = { params: Promise<{ listId: string }> };

/**
 * Turns a thrown domain error into the inline state the entry sheet renders.
 *
 * Only ApiError carries user-facing German copy. Anything else is a real bug and
 * is re-thrown on purpose: a crash disguised as a validation message next to a
 * text field is the worst of both worlds. (Same helper shape as the Katalog screen.)
 */
function toEntryFormState(error: unknown): EntryFormState {
  if (error instanceof ApiError) return { error: error.message, ok: false, openEntryId: null };
  throw error;
}

/**
 * The list screen (handoff §10) — the core screen of the product.
 *
 * Server Component: it reads the session and calls the domain layer directly, no
 * HTTP round-trip. Everything interactive lives in `ListBody`, which receives
 * these Server Actions as props — so the mutation model (entry-level operations
 * through `applyOperation`) stays entirely server-owned, exactly as it was
 * before this slice replaced the add form.
 *
 * Slice 12 changed the interaction, not the data flow: `ListSyncPoller` below is
 * untouched, and its `router.refresh()` still re-pulls server truth. That works
 * because `router.refresh()` preserves client component state — `ListBody` keeps
 * its active chip and its half-typed entry while the entries around it change.
 */
export default async function ListDetailPage({ params }: Props) {
  const { listId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route; user.id is safe to assert.
  const userId = session!.user.id;

  // Guard: same rule as the REST routes. requireListAccess throws (404-style) for
  // non-members, unknown ids and malformed ids — all of them land back on the
  // projects overview. We KEEP its result: it carries projectId, which the
  // catalog read needs (no second list lookup).
  let projectId: string;
  try {
    ({
      list: { projectId },
    } = await requireListAccess(prisma, listId, userId));
  } catch {
    redirect("/projects");
  }

  // Two independent reads → Promise.all: one round-trip of latency, not two.
  const [list, catalog] = await Promise.all([
    getListWithItems(prisma, listId),
    // "" = browse mode with the large cap: the trailing row filters this array in
    // the browser (buildAutocomplete), so anything not sent here is never
    // suggestable. See CATALOG_DATALIST_LIMIT.
    searchCatalog(prisma, projectId, "", CATALOG_DATALIST_LIMIT),
  ]);
  // Deleted between guard and read (rare race) — same redirect as an unknown list.
  if (!list) redirect("/projects");

  // Flatten to the client shape. The display NAME lives on the catalog item
  // (article identity, MVP design §3.1), so it is resolved here — the same
  // mapping the delta endpoint does for the wire.
  const entries: ListEntry[] = list.items.map((item) => ({
    id: item.id,
    name: item.catalogItem.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    checked: item.checked,
  }));

  // The entry sheet's chips: what the catalog remembers ∪ what this list uses.
  const categories = knownCategories(
    catalog.map((article) => article.defaultCategory),
    entries.map((entry) => entry.category),
  );

  // Sync baseline for the poller (Slice 7): the cursor (newest entry updatedAt)
  // and the id set AS RENDERED. computeCursor is the SAME function the delta
  // endpoint uses, so the client starts from a cursor consistent with the
  // server's — any change between this render and the first poll is seen.
  const initialCursor = computeCursor(list.items);
  const initialItemIds = list.items.map((item) => item.id);

  // Completion UI state. Both are derived, not stored (MVP design §4.6).
  const isCompleted = list.status === "completed";
  const suggestComplete = !isCompleted && allItemsChecked(list.items);

  // --- Server Actions ---------------------------------------------------------
  // Each re-derives identity and re-runs the guard (defense in depth: a Server
  // Action is an individually addressable POST endpoint). Every entry mutation
  // goes through applyOperation — the SAME operations core as the REST endpoint,
  // so the mutation model holds no matter the transport.

  /** The trailing row. Returns state so an invalid name lands inline. */
  async function addEntryAction(
    _prev: EntryFormState,
    formData: FormData,
  ): Promise<EntryFormState> {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const itemId = String(formData.get("itemId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    // Empty submission: silent no-op, the convention every form in this app uses.
    if (!itemId || !name) return ENTRY_FORM_IDLE;

    // An ABSENT category field means „Alle" is active → inherit the catalog
    // default. A present one is the active chip (possibly „Ohne Kategorie").
    const rawCategory = formData.get("category");
    const activeCategory = rawCategory === null ? null : String(rawCategory);

    try {
      const { item, needsCategory } = await addEntryFromRow(prisma, l, {
        itemId,
        name,
        activeCategory,
      });
      revalidatePath(`/lists/${listId}`);
      // The design's rule: a brand-new article with no category opens its sheet.
      return { error: null, ok: true, openEntryId: needsCategory ? item.id : null };
    } catch (error) {
      return toEntryFormState(error);
    }
  }

  /**
   * The entry sheet's „Fertig". ONE update_item per changed field — the field
   * granularity Slice 7's per-field last-writer-wins depends on. A field the
   * sheet did not send is not touched, so a concurrent remote edit survives.
   */
  async function updateEntryAction(
    _prev: EntryFormState,
    formData: FormData,
  ): Promise<EntryFormState> {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const itemId = String(formData.get("itemId") ?? "");
    if (!itemId) return ENTRY_FORM_IDLE;

    try {
      // Presence, not truthiness: "" is a meaningful value here — it CLEARS the
      // field, which is a legal update_item value (null on the column).
      if (formData.has("quantity")) {
        await applyOperation(prisma, l, {
          op: "update_item",
          itemId,
          field: "quantity",
          // NaN survives on purpose: applyOperation answers with the German
          // „Menge muss eine positive Zahl sein" rather than silently clearing.
          value: parseGermanDecimal(String(formData.get("quantity"))),
        });
      }
      if (formData.has("unit")) {
        await applyOperation(prisma, l, {
          op: "update_item",
          itemId,
          field: "unit",
          value: String(formData.get("unit")).trim() || null,
        });
      }
      if (formData.has("category")) {
        await applyOperation(prisma, l, {
          op: "update_item",
          itemId,
          field: "category",
          value: String(formData.get("category")).trim() || null,
        });
      }
      revalidatePath(`/lists/${listId}`);
      return { error: null, ok: true, openEntryId: null };
    } catch (error) {
      return toEntryFormState(error);
    }
  }

  /** The check circle. Carries the TARGET state, so replaying it is idempotent. */
  async function checkEntryAction(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const itemId = String(formData.get("itemId") ?? "");
    if (!itemId) return;

    await applyOperation(prisma, l, {
      op: "check_item",
      itemId,
      checked: String(formData.get("checked")) === "true",
    });
    revalidatePath(`/lists/${listId}`);
    // The project screen prints "N offen" per list and the drawer badge counts
    // active lists — both live above this route, so "layout" scope is required.
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /** Swipe-to-delete and the sheet's „Eintrag löschen". Idempotent by design. */
  async function removeEntryAction(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const itemId = String(formData.get("itemId") ?? "");
    if (!itemId) return;

    await applyOperation(prisma, l, { op: "remove_item", itemId });
    revalidatePath(`/lists/${listId}`);
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /** Complete the list — from the ⋮ menu or the all-checked banner. Idempotent. */
  async function completeListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await completeList(prisma, l.id);
    revalidatePath(`/lists/${listId}`);
    // The list leaves the project's active list and enters the archive.
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /** Reopen — the "undo" of completion (MVP design §4.6, "mit Undo"). */
  async function reopenListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await reopenList(prisma, l.id);
    revalidatePath(`/lists/${listId}`);
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /** Delete the whole list (member-level per the permission matrix). */
  async function deleteListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await deleteList(prisma, l.id);
    // redirect() throws internally — do not wrap it in try/catch.
    redirect(`/projects/${l.projectId}`);
  }

  return (
    <div className={[styles.screen, isCompleted ? styles.frozen : ""].filter(Boolean).join(" ")}>
      {/* Slice 7 background sync: renders nothing. Every ~2s it asks the delta
          endpoint whether the list changed (another member's edit, a deletion, a
          rename/completion) and, if so, refreshes this server component to show
          the merged truth. Server-side LWW already resolved conflicts. */}
      <ListSyncPoller
        listId={listId}
        initialCursor={initialCursor}
        initialItemIds={initialItemIds}
        initialList={{
          name: list.name,
          status: list.status,
          completedAt: list.completedAt ? list.completedAt.getTime() : null,
        }}
      />

      <PageHeader
        title={list.name}
        // No drawer here: /lists/[listId] sits outside the project layout, so
        // handoff §10's back arrow is the navigation (see the plan's scope note).
        leading={
          <Link href={`/projects/${list.projectId}`} className={styles.back} aria-label="Zum Projekt">
            <Icon icon={ArrowLeft} size={18} />
          </Link>
        }
        trailing={
          <ListMenu
            listName={list.name}
            isCompleted={isCompleted}
            completeAction={completeListAction}
            deleteAction={deleteListAction}
          />
        }
      />

      {/* „Bewusst leise, kein Konfetti": one quiet banner, never both. */}
      {isCompleted ? (
        <div className={styles.banner}>
          <Banner
            tone="success"
            icon={<Icon icon={Check} size={14} />}
            action={
              <form action={reopenListAction}>
                <button type="submit" className={styles.bannerAction}>
                  Wieder öffnen
                </button>
              </form>
            }
          >
            {list.completedAt
              ? `Abgeschlossen am ${formatGermanDate(list.completedAt)}`
              : "Abgeschlossen"}
          </Banner>
        </div>
      ) : (
        suggestComplete && (
          <div className={styles.banner}>
            <Banner
              tone="info"
              icon={<Icon icon={Check} size={14} />}
              action={
                <form action={completeListAction}>
                  <button type="submit" className={styles.bannerAction}>
                    Abschließen
                  </button>
                </form>
              }
            >
              Alle Einträge sind abgehakt.
            </Banner>
          </div>
        )
      )}

      <ListBody
        entries={entries}
        articles={catalog}
        categories={categories}
        frozen={isCompleted}
        addAction={addEntryAction}
        updateAction={updateEntryAction}
        checkAction={checkEntryAction}
        removeAction={removeEntryAction}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If `searchCatalog`'s `CatalogSuggestion[]` does not satisfy `AutocompleteArticle[]`, that is a real mismatch — `CatalogSuggestion` has `id`, `name`, `defaultCategory` and one extra field, which is structurally assignable. Do not add a mapping step unless the compiler asks for one.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS. The old add-form assertions do not exist (the page was never unit-tested), so nothing should need updating. If a Slice 7 or Slice 3 test referenced the page's markup, fix the TEST only if the behaviour it protects still holds; otherwise report it rather than deleting it.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: success. A "client component cannot receive a function prop" style error means a Server Action was defined outside the page module — keep them all inside `ListDetailPage`.

- [ ] **Step 6: Manual browser check (record the result in the review)**

Run `npm run dev`, sign in, open a list, and walk this checklist:

1. Trailing row: type a known article, Enter → row appears, field clears, cursor stays.
2. Type an unknown article in „Alle" → the entry sheet opens on it for a category.
3. Pick a category chip in the sheet, Fertig → the row moves into that group, and `/projects/[id]/katalog` shows the new default.
4. Activate a category chip → placeholder reads „Neu in „X“"; add an entry → it lands in that category.
5. Check the last open entry → the accent banner slides in; „Abschließen" freezes the screen.
6. „Wieder öffnen" → chips and the input row come back.
7. Swipe a row left past ~80px → it deletes; a short swipe snaps back.
8. Tap a row → sheet opens; change only the unit → the quantity is untouched.
9. Type „viel" into Menge → the German error appears under the field and the sheet stays open.
10. Empty every entry of the active category → „Nichts mehr in „X“" and the chip stays selected.
11. Second browser/session: add an entry there → it appears here within ~2s, and your typed text and active chip survive.

- [ ] **Step 7: Commit**

```bash
git add "src/app/lists/[listId]/page.tsx" "src/app/lists/[listId]/page.module.css"
git commit -m "feat(lists): rebuild the list screen on the trailing row, chips and entry sheet"
```

---

## Task 12: Adopt `Autocomplete` in the Favoriten add row

Retires the inherited Slice 11 item: "The Favoriten autocomplete is still a native `<datalist>`; Slice 12's trailing-row autocomplete should be built as a reusable component and adopted here."

**Files:**
- Modify: `src/app/projects/[projectId]/favoriten/FavoritesEditor.tsx`
- Modify: `src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx`
- Modify: `src/app/projects/[projectId]/favoriten/page.tsx` (prop shape: names → articles)
- Modify: `src/app/projects/[projectId]/favoriten/FavoritesEditor.module.css` (drop the now-unused add-row field rule if it becomes dead)

- [ ] **Step 1: Update the test first**

In `src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx`, replace the `catalogNames` prop in the render helper with:

```tsx
    articles: [
      { id: "c1", name: "Milch", defaultCategory: "Molkerei" },
      { id: "c2", name: "Milchreis", defaultCategory: null },
    ],
```

and add these cases:

```tsx
  it("suggests catalog articles while typing a favourite", async () => {
    renderEditor();

    await userEvent.type(screen.getByLabelText("Artikelname"), "Milc");

    expect(screen.getByRole("button", { name: /Milchreis/ })).toBeInTheDocument();
  });

  it("adds the picked article as a favourite", async () => {
    const addAction = vi.fn();
    renderEditor({ addAction });

    await userEvent.type(screen.getByLabelText("Artikelname"), "Milc");
    await userEvent.click(screen.getByRole("button", { name: /Milchreis/ }));

    const formData = addAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Milchreis");
  });

  it("offers to create an unknown article as a favourite", async () => {
    const addAction = vi.fn();
    renderEditor({ addAction });

    await userEvent.type(screen.getByLabelText("Artikelname"), "Dinkelmehl");
    await userEvent.click(screen.getByRole("button", { name: "„Dinkelmehl“ neu anlegen" }));

    const formData = addAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Dinkelmehl");
  });
```

Delete the existing `it("offers the catalog as native autocomplete options", …)` case and its `<datalist>` / `<option>` assertions — that control no longer exists.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx"`
Expected: FAIL — the component still takes `catalogNames` and renders a datalist.

- [ ] **Step 3: Update the component**

In `src/app/projects/[projectId]/favoriten/FavoritesEditor.tsx`:

- Replace the `catalogNames: string[]` prop with `articles: AutocompleteArticle[]`.
- Replace the `useId`/`<datalist>`/`TextField` add row with the shared control, and dispatch the Server Action by hand (the row is no longer a `<form>` submit):

```tsx
  // Typed text lives here now: Autocomplete is controlled, and picking a
  // suggestion must be able to submit a name the field never held.
  const [draft, setDraft] = useState("");
  const suggestions = buildAutocomplete(articles, draft);

  // The add row is no longer a <form>, so the Server Action is dispatched with a
  // hand-built FormData — the same shape it already reads (`name`).
  const addFavorite = (name: string) => {
    const formData = new FormData();
    formData.set("name", name);
    setDraft("");
    void addAction(formData);
  };

  // Built once: it appears inside the empty state AND under the chips.
  const addRow = (
    <div className={styles.addRow}>
      <Autocomplete
        value={draft}
        onChange={setDraft}
        onSubmit={addFavorite}
        options={suggestions.options}
        createName={suggestions.createName}
        placeholder="Artikelname"
        inputLabel="Artikelname"
      />
    </div>
  );
```

Update the header comment: replace the paragraph beginning "Autocomplete is a native `<datalist>`…" with:

```
 * Autocomplete is the shared `Autocomplete` primitive — the same control the
 * list screen's trailing entry row uses. Slice 11 shipped a native <datalist>
 * here and deliberately deferred this swap so the richer dropdown (with the
 * „…“ neu anlegen row) would exist exactly once. Enter and a picked suggestion
 * both dispatch the same Server Action.
```

Remove the now-unused `TextField`, `Button` and `useId` imports **only if** nothing else in the file uses them.

- [ ] **Step 4: Update the page that renders it**

In `src/app/projects/[projectId]/favoriten/page.tsx`, pass the fuller shape instead of names:

```tsx
        <FavoritesEditor
          favorites={favorites}
          // The whole catalog row, not just the name: the dropdown shows each
          // article's default category as its sub-label.
          articles={catalogItems}
          addAction={addFavoriteAction}
          removeAction={removeFavoriteAction}
        />
```

That is the only change needed there: the page already reads `catalogItems` via `searchCatalog(..., CATALOG_DATALIST_LIMIT)`, and today it passes `catalogNames={catalogItems.map((item) => item.name)}` — drop the `.map(...)` and pass the rows themselves. Update the neighbouring comment, which still explains the `<datalist>` cap, to say the array is filtered in the browser by `buildAutocomplete`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx" && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/projects/[projectId]/favoriten/"
git commit -m "refactor(ui): Favoriten add row uses the shared Autocomplete"
```

---

## Task 13: Implementation review + meta plan update

**Files:**
- Create: `docs/implementation-reviews/slice-12-list-interaction-rework.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

- [ ] **Step 1: Run the full suite and the build one more time**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Record the exact test count in the review — do not estimate it.

- [ ] **Step 2: Write the review**

Create `docs/implementation-reviews/slice-12-list-interaction-rework.md` in English, following the five-part structure in CLAUDE.md § Implementation review:

1. **What was achieved** — the four deliverables (trailing row, category chips with auto-assignment, entry detail sheet, swipe-to-delete) and whether each was fully met.
2. **Steps taken** — one line per task above.
3. **Core components built** — every new file with a sentence on its role (use the File structure table).
4. **Most important lines of code** — quote and explain at least these:
   - `needsCategory: knownArticle === null && item.category === null` (`addEntry.ts`) — why the catalog is read *before* the add.
   - `if (!Object.is(nextQuantity, entry.quantity)) changes.quantity = nextQuantity;` (`EntrySheet.tsx`) — why only changed fields travel, and what LWW would do otherwise.
   - `if (formData.has("quantity")) { … }` (`page.tsx`) — presence, not truthiness, because `""` means "clear".
   - `formData.set("itemId", crypto.randomUUID())` (`ListBody.tsx`) — client-generated identity, and how it makes the sheet-auto-open possible.
   - `categoryChipOptions(entries, activeChip)` — how the active chip survives its category emptying.
   - `shouldDeleteOnRelease` strict `<` — why the boundary belongs to the safe side.
5. **Architecture contribution** — the server→client split of the list body, and what it settles for the slices that follow.

Also record explicitly:

- **Slice 16 is now decided: Path B** (flash context, rows stay server-rendered). Entries are props, not a client store, so nothing was pulled client-side that would make Path A cheaper. `data-item-id` is on every row.
- **Slice 15's seam:** the trailing row submits `name` as typed. The parser goes between `Autocomplete.onSubmit` and `addEntry`'s FormData, and must keep `name` = the article name only.
- **Accepted consequence:** adding an entry while a category chip is active flows that category back into the catalog default. This follows the product rule ("editing an entry's category flows back") and is covered by a test.
- **Design conflict resolved:** empty-state mocks 5c/5d draw `☰` in the list header; §10 specifies `←`. `←` shipped, because `/lists/[listId]` is outside the project layout.
- **Known gap:** the autocomplete dropdown has no arrow-key navigation (design shows no active-row highlight); rows are individually Tab-reachable and Enter always submits the typed text.
- **Inherited open items:** Slice 7's minor non-blocking notes; the `PageHeader`/nav hydration overlay if still present; the Toggle <44px item; the member-path browser smoke. The Slice 11 item "adopt the Autocomplete in Favoriten" is **closed** by Task 12.

- [ ] **Step 3: Update the meta plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- Row 12 of the slice table: set `Plan` to `[2026-08-02-slice-12-list-interaction-rework.md](2026-08-02-slice-12-list-interaction-rework.md)` and `Status` to `✅ Done / verified`.
- Add a dated progress-log entry (newest first, matching the existing format) covering: what shipped, the decisions above, and **"Slice 15 (Quantity parsing in the entry row) is the next open slice"**.
- In the Slice 16 note, mark the Path A / Path B question **answered: Path B**, and record that `data-item-id` shipped.

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-12-list-interaction-rework.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: Slice 12 implementation review + meta-plan progress log"
```

---

## Self-review notes (author's pass over this plan)

- **Spec coverage.** Handoff §10 item by item: header ← / title / ⋮ (Tasks 9, 11); category chips incl. ordering and survival (Tasks 1, 10); grouped vs. filtered entries (Tasks 1, 10); row layout + tap targets (Task 7); swipe-to-delete (Tasks 3, 7); trailing row with both placeholders, Enter behaviour, dropdown, chip-override category logic and the sheet-auto-open (Tasks 4, 5, 6, 10); entry sheet with the three fields, chips, flow-back hint, Fertig, Eintrag löschen (Task 8); all-checked banner (Task 11); completed-list frozen state (Tasks 7, 10, 11); live sync unchanged (Task 11 verify step). Empty states 5c and 5d (Task 10). Quantity parsing is explicitly Slice 15; the row flash is explicitly Slice 16.
- **Naming consistency.** `ListEntry` is defined once (`EntryRow.tsx`) and imported everywhere; `EntryFormState` / `ENTRY_FORM_IDLE` are defined once (`formState.ts`); `EntryChanges` is defined in `EntrySheet.tsx` and consumed by `ListBody`; `AutocompleteArticle` / `AutocompleteOption` come from `src/lib/catalog/autocomplete.ts` and are used by both the primitive and both screens.
- **Known risk.** Pointer events in jsdom are the one place this plan may need a local adjustment; Task 7 Step 4 states the fallback and forbids changing the component to suit the test.
