# Slice 10 — Catalog Management: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the project's article catalog **visible and editable** — a `/projects/[projectId]/katalog` screen that lists every article the project has ever used, searches it, creates an article directly, renames it (with a normalized-name collision check), edits its default category/unit, and deletes it **only** when it appears in no list, active or archived.

**Architecture:** A new domain module `src/lib/catalog/manage.ts` carries all four write operations plus the screen's read model; every function takes an injected `PrismaClient` and throws German `ApiError`s, exactly like Slices 2–9. **No new REST endpoints** — the catalog screen is never polled and never merged offline, so the reason lists have an operations API does not apply here (the Slice 9 precedent; the existing `GET /api/projects/:id/catalog` autocomplete route stays untouched). The screen is a **Server Component** that reads the whole catalog and hands it, plus two Server Actions, to **one client component** (`CatalogBrowser`) which owns the live search filter and which row's edit panel is open. No client-side data fetching: the article list always arrives as props from the server.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions + `useActionState`), React 19, TypeScript, CSS Modules, `lucide-react` via `Icon`, Prisma 6 / Neon Postgres, Vitest (node + jsdom via `// @vitest-environment jsdom`), Testing Library.

## Global Constraints

- **In-app strings are German.** Code identifiers, comments and this plan are English (CLAUDE.md § Language convention). The German labels below are quoted **verbatim** from the design — copy them character for character, including „typografische Anführungszeichen“, the `·` U+00B7 middle dot and the `—` em dash.
- **Design source of truth:** `docs/design/2026-08-01-ui-handoff/README.md` § 8 (Katalog) plus the inline styles in `Smart Lists Optionen.dc.html` (screen `3h` Katalog, empty state `5f` "Leerer Katalog") and `Smart Lists Prototyp.dc.html` (the `KATALOG` block, binding for behaviour). Rebuild in React — **never paste the prototype markup**.
- **Product rules from the brief** (`docs/design/2026-08-01-ui-design-brief.md` § 6.8): renaming must never produce two articles with the same normalized name („Milch" vs. „ milch "); an article used by **any** list (active or archived) cannot be deleted and the reason is stated; the delete control is **absent**, never disabled.
- **Styling: CSS Modules only.** One `X.module.css` next to each component. No inline `style={{...}}` in shipped screens.
- **All colours, radii, shadows, motion come from the tokens in `src/app/globals.css`** (`var(--color-accent)`, `var(--radius-card)`, …). Never write a literal hex in a `.module.css` file. If a value is missing, add the token in `globals.css` **and** extend `src/test/design-tokens.test.ts` — that test pins the palette on purpose.
- **Desktop breakpoint is the literal `900px`** in every `@media` query (CSS custom properties cannot be used inside `@media`; see the note in `globals.css`).
- **Build screens out of the Slice 13 primitives** — `Button`, `TextField`/`FieldError`, `Card`, `RowLink`, `Avatar`, `Badge`, `SectionLabel`, `Chip`, `ChipTabs`, `EmptyState`, `Sheet`, `ConfirmSheet`, `InlineEdit`, `Banner`, `Icon`, `PageHeader`, `ProgressBar`. Do not restyle from scratch. The one documented exception in this slice is the edit panel's surface (Task 6) — the reason is written into the file.
- **Icons:** `lucide-react`, always through `<Icon icon={X} />` (stroke 1.75, default size 17).
- **Every mutation re-checks membership** (`requireMembership`) inside the Server Action, never only on render. Catalog upkeep is **member-level** (MVP design § 6: „Favoriten/Katalog pflegen" ✓ Owner ✓ Mitglied).
- **Component tests** put `// @vitest-environment jsdom` on line 1, use Testing Library, and assert **roles and text — never CSS-Module class names**.
- **Every function gets a comment explaining what it does and why it exists; every non-obvious block gets an inline comment** (CLAUDE.md § Code documentation standard). Do not thin out existing comments when editing a file.
- **Tap targets ≥ 44px**, safe areas respected via `var(--safe-top)` / `var(--safe-bottom)`.
- **Test command:** `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'` (DB tests need `.env.test` pointing at the Neon `test` branch). A single file: `npx vitest run <path>`.
- **Commit after every task.** German or English commit messages, consistent within the change.

---

## File Structure

**New — domain (node-tested against the Neon test branch):**
- `src/lib/catalog/manage.ts` — the catalog **management** core: `CatalogArticle` read model + `listCatalog`, `createCatalogArticle`, `updateCatalogArticle`, `deleteCatalogArticle`, `countListsUsingArticle`. Deliberately a **second** module next to `catalog.ts`: that file owns the *implicit* catalog path (get-or-create from typing an entry, defaults flowing back), this one owns the *explicit* management path where a duplicate is an error rather than a hit.
- `src/lib/catalog/manage.test.ts` — its tests.

**Modified — formatting:**
- `src/lib/format/plural.ts` — adds `formatArticleCount`, `formatUsedInLists`, `formatArticleDefaults`.
- `src/lib/format/plural.test.ts` — their tests.

**New — screen (`src/app/projects/[projectId]/katalog/`):**
- `page.tsx` — Server Component: membership guard, `listCatalog`, the two Server Actions, `PageHeader`.
- `page.module.css`
- `formState.ts` — `CatalogFormState` + `CATALOG_FORM_IDLE`, the one result shape both Server Actions return. A separate module so the client components can import it without importing the page.
- `CatalogBrowser.tsx` + `.module.css` + `CatalogBrowser.test.tsx` — client component: search filter, rows, create row, which panel is open, both `useActionState` hooks.
- `CatalogEditPanel.tsx` + `.module.css` + `CatalogEditPanel.test.tsx` — client component: the inline edit panel (name/category/unit, inline error, delete behind a `ConfirmSheet`).

**Modified — entry point:**
- `src/app/projects/[projectId]/page.tsx` — one link to the new screen. This page is still the un-restyled Slice 2/3 markup; **Slice 11 replaces the link with the drawer entry.** Keep the change to a single line.

**Not touched on purpose:** `src/lib/catalog/catalog.ts` (`getOrCreateCatalogItem`, `flowBackCatalogDefaults`), `src/lib/catalog/search.ts`, `src/app/api/projects/[projectId]/catalog/route.ts`, `src/app/dev/ui/Gallery.tsx` (this slice adds no new primitives).

---

## Task 1: German meta lines for the catalog screen

Three short German strings the screen and the delete guard both print. They go into the existing `src/lib/format/plural.ts` because that module already owns "the German meta lines the design specifies" and the delete-guard sentence must read identically whether it comes from the read model (the note in the panel) or from a thrown `ApiError` (the race where someone else adds the article to a list first).

**Files:**
- Modify: `src/lib/format/plural.ts`
- Test: `src/lib/format/plural.test.ts`

**Interfaces:**
- Consumes: the existing `formatListCount(count)` in the same file.
- Produces:
  - `formatArticleCount(count: number): string` → `"124 Artikel"`
  - `formatUsedInLists(count: number): string` → `"wird in 3 Listen verwendet"`
  - `formatArticleDefaults(category: string | null, unit: string | null): string` → `"Molkerei · l"`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/format/plural.test.ts` (keep the existing tests untouched; add the imports to the existing import statement):

```ts
describe("formatArticleCount", () => {
  it("counts articles for the Katalog header", () => {
    expect(formatArticleCount(124)).toBe("124 Artikel");
  });

  // "Artikel" is one of the German nouns whose plural equals its singular — this
  // test exists so nobody "fixes" it into "1 Artikeln" later.
  it("keeps the noun unchanged in the singular and at zero", () => {
    expect(formatArticleCount(1)).toBe("1 Artikel");
    expect(formatArticleCount(0)).toBe("0 Artikel");
  });
});

describe("formatUsedInLists", () => {
  it("uses the singular for exactly one list", () => {
    expect(formatUsedInLists(1)).toBe("wird in 1 Liste verwendet");
  });

  it("uses the plural for more than one list", () => {
    expect(formatUsedInLists(3)).toBe("wird in 3 Listen verwendet");
  });
});

describe("formatArticleDefaults", () => {
  it("joins category and unit with the middle dot", () => {
    expect(formatArticleDefaults("Molkerei", "l")).toBe("Molkerei · l");
  });

  it("prints just the one value that is set", () => {
    expect(formatArticleDefaults("Molkerei", null)).toBe("Molkerei");
    expect(formatArticleDefaults(null, "kg")).toBe("kg");
  });

  // A row with no defaults still needs a sub line — without it the rows in the
  // dense list would alternate between two heights.
  it("falls back to a filler when nothing is set", () => {
    expect(formatArticleDefaults(null, null)).toBe("Keine Vorgaben");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/format/plural.test.ts`
Expected: FAIL — `formatArticleCount is not a function` (and the same for the other two).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/format/plural.ts`:

```ts
/**
 * "124 Artikel" — the trailing count in the Katalog header (handoff § 8).
 *
 * "Artikel" is one of the German nouns whose plural equals its singular, so only
 * the number changes. It is still a function so no call site inlines the noun:
 * the day the header wants different wording, it changes in one place.
 */
export function formatArticleCount(count: number): string {
  return `${count} Artikel`;
}

/**
 * "wird in 3 Listen verwendet" — the reason a catalog article cannot be deleted.
 *
 * Why it is shared: the same sentence is printed twice from two different places
 * — as a note in the edit panel (from the read model) and inside the ApiError the
 * delete guard throws when someone else put the article on a list in the meantime.
 * They must read identically, so the wording lives here and nowhere else.
 */
export function formatUsedInLists(count: number): string {
  return `wird in ${formatListCount(count)} verwendet`;
}

/**
 * "Molkerei · l" — a catalog row's sub line (handoff § 8).
 *
 * Both defaults are nullable (unknown until someone sets them), so this collapses
 * to whichever values exist. The separator is U+00B7 MIDDLE DOT surrounded by
 * spaces, the same one formatProjectMeta uses.
 */
export function formatArticleDefaults(category: string | null, unit: string | null): string {
  // The type predicate is what narrows (string | null)[] to string[] for join().
  const parts = [category, unit].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return "Keine Vorgaben";
  return parts.join(" · ");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/format/plural.test.ts`
Expected: PASS (the pre-existing plural tests plus 7 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/plural.ts src/lib/format/plural.test.ts
git commit -m "feat(format): German meta lines for the catalog screen"
```

---

## Task 2: `listCatalog` — the screen's read model

The screen needs more than the raw `CatalogItem` row: for every article it must know **how many lists use it** (the delete guard and its note) and **whether it is a favourite** (the delete-consequence hint). Both are computed here, once, so the client component receives a flat, render-ready array and never asks a follow-up question.

**Files:**
- Create: `src/lib/catalog/manage.ts`
- Test: `src/lib/catalog/manage.test.ts`

**Interfaces:**
- Consumes: `compareArticleNames` from `src/lib/catalog/sort.ts`.
- Produces:
  - `interface CatalogArticle { id: string; name: string; defaultCategory: string | null; defaultUnit: string | null; usedInListCount: number; isFavorite: boolean }`
  - `listCatalog(db: PrismaClient, projectId: string): Promise<CatalogArticle[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalog/manage.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { listCatalog } from "./manage";

const db = new PrismaClient();
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  // A catalog item needs a project; the user is only needed as the project owner.
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  const project = await db.project.create({ data: { name: "Haushalt", ownerId: user.id } });
  projectId = project.id;
});

afterAll(async () => {
  await db.$disconnect();
});

// Test helpers: the catalog management core is tested against real rows, so these
// build the fixtures directly instead of going through the Slice 3 operations —
// that keeps a failure here pointing at THIS module and not at applyOperation.
async function makeArticle(name: string, defaults: { category?: string; unit?: string } = {}) {
  return db.catalogItem.create({
    data: {
      projectId,
      name,
      normalizedName: name.trim().toLowerCase(),
      defaultCategory: defaults.category ?? null,
      defaultUnit: defaults.unit ?? null,
    },
  });
}

async function makeList(name: string, completed = false) {
  return db.list.create({
    data: {
      projectId,
      name,
      status: completed ? "completed" : "active",
      completedAt: completed ? new Date() : null,
    },
  });
}

async function addEntry(listId: string, catalogItemId: string, sortIndex = 1) {
  return db.listItem.create({ data: { listId, catalogItemId, sortIndex } });
}

describe("listCatalog", () => {
  it("returns an empty array for a project without articles", async () => {
    expect(await listCatalog(db, projectId)).toEqual([]);
  });

  // The shared ordering rule (compareArticleNames) sorts under German rules, so
  // "Äpfel" belongs next to "Apfel" — not after "Zucker" where a code-point sort
  // would put it.
  it("sorts articles by display name under German rules", async () => {
    await makeArticle("Zucker");
    await makeArticle("Äpfel");
    await makeArticle("Butter");

    const articles = await listCatalog(db, projectId);
    expect(articles.map((a) => a.name)).toEqual(["Äpfel", "Butter", "Zucker"]);
  });

  it("surfaces the catalog defaults", async () => {
    await makeArticle("Milch", { category: "Molkerei", unit: "l" });

    const [milch] = await listCatalog(db, projectId);
    expect(milch.defaultCategory).toBe("Molkerei");
    expect(milch.defaultUnit).toBe("l");
  });

  // The delete guard counts LISTS, not entries: the same article twice on one
  // list is still one list, and the note must say "1 Liste".
  it("counts the distinct lists an article appears on, not the entries", async () => {
    const milch = await makeArticle("Milch");
    const einkauf = await makeList("Einkauf");
    const wochenende = await makeList("Wochenende");
    await addEntry(einkauf.id, milch.id, 1);
    await addEntry(einkauf.id, milch.id, 2); // same list again -> still one list
    await addEntry(wochenende.id, milch.id, 1);

    const [article] = await listCatalog(db, projectId);
    expect(article.usedInListCount).toBe(2);
  });

  // Completed lists count too: they feed the N-of-M suggestion statistic, which
  // is precisely what the delete guard protects.
  it("counts completed lists as usage", async () => {
    const nudeln = await makeArticle("Nudeln");
    const archiviert = await makeList("Letzte Woche", true);
    await addEntry(archiviert.id, nudeln.id);

    const [article] = await listCatalog(db, projectId);
    expect(article.usedInListCount).toBe(1);
  });

  it("reports zero usage for an article no list mentions", async () => {
    await makeArticle("Kerzen");
    const [article] = await listCatalog(db, projectId);
    expect(article.usedInListCount).toBe(0);
  });

  it("flags an article that is a project favourite", async () => {
    const milch = await makeArticle("Milch");
    await makeArticle("Kerzen");
    await db.favorite.create({ data: { projectId, catalogItemId: milch.id } });

    const articles = await listCatalog(db, projectId);
    expect(articles.find((a) => a.name === "Milch")!.isFavorite).toBe(true);
    expect(articles.find((a) => a.name === "Kerzen")!.isFavorite).toBe(false);
  });

  it("never returns another project's articles", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    await db.catalogItem.create({
      data: { projectId: otherProject.id, name: "Zelt", normalizedName: "zelt" },
    });
    await makeArticle("Milch");

    const articles = await listCatalog(db, projectId);
    expect(articles.map((a) => a.name)).toEqual(["Milch"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog/manage.test.ts`
Expected: FAIL — the module `./manage` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/lib/catalog/manage.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { compareArticleNames } from "./sort";

/**
 * Catalog MANAGEMENT (Slice 10) — the explicit path.
 *
 * Why this is a second module next to catalog.ts: that file owns the *implicit*
 * catalog, where typing an entry name resolves to an article and a name nobody
 * has used before quietly becomes a row (get-or-create), and where an entry edit
 * flows category/unit back into the defaults. Here the user is looking straight
 * at the catalog, so the rules invert: a duplicate name is an ERROR rather than a
 * hit, an emptied field is an explicit "clear this default" rather than "don't
 * touch it", and deleting is a real operation with a guard. Two files keep those
 * two contracts from bleeding into each other.
 *
 * Every function takes an injected PrismaClient (the project-wide test seam) and
 * throws German ApiErrors; permission (membership) is the caller's job, exactly
 * like every other core in this codebase.
 */

/**
 * One article as the Katalog screen renders it.
 *
 * The two derived fields are the reason this read model exists at all: the screen
 * cannot decide whether to offer "Löschen" without knowing how many lists use the
 * article, and it cannot warn about the favourite side effect without isFavorite.
 * Computing both here means the client component gets a flat, render-ready array
 * and never has to ask a follow-up question.
 */
export interface CatalogArticle {
  id: string;
  name: string;
  defaultCategory: string | null;
  defaultUnit: string | null;
  /** Distinct lists (active AND completed) that contain this article. */
  usedInListCount: number;
  /** True when the project has favourited this article. */
  isFavorite: boolean;
}

/**
 * The whole catalog of a project, alphabetically, with usage and favourite flags.
 *
 * Deliberately UNCAPPED, unlike searchCatalog's `take`: this is a management
 * screen, and an article silently cut off the end of the list would be one nobody
 * could ever rename or delete. A household project's catalog is a few hundred
 * rows (the brief expects 50–300), so the whole set is cheap to read and cheap to
 * hand to the client for live filtering.
 *
 * Because there is no `take`, sorting in JS with the shared comparator is safe
 * here — the caveat in sort.ts applies only to a truncated query.
 */
export async function listCatalog(db: PrismaClient, projectId: string): Promise<CatalogArticle[]> {
  const items = await db.catalogItem.findMany({
    where: { projectId }, // project-scoped: the catalog is per-project memory
    include: {
      // Only the listId is needed — the distinct count is computed below. Prisma
      // cannot express COUNT(DISTINCT list_id) per row, and pulling the ids is
      // cheaper than one extra query per article.
      listItems: { select: { listId: true } },
      // 0 or 1 row per project by the @@unique — presence is the whole answer.
      favorites: { select: { id: true } },
    },
  });

  return items
    .map((item) => ({
      id: item.id,
      name: item.name,
      defaultCategory: item.defaultCategory,
      defaultUnit: item.defaultUnit,
      // A Set is the distinct: the same article twice on one list is one list.
      usedInListCount: new Set(item.listItems.map((listItem) => listItem.listId)).size,
      isFavorite: item.favorites.length > 0,
    }))
    // Sort AFTER the projection so the comparator works on plain names — the
    // contract compareArticleNames declares (same order of operations as listFavorites).
    .sort((a, b) => compareArticleNames(a.name, b.name));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog/manage.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/manage.ts src/lib/catalog/manage.test.ts
git commit -m "feat(catalog): listCatalog read model with list usage and favourite flag"
```

---

## Task 3: `createCatalogArticle` — „Neuen Artikel anlegen…"

The design's create row makes an article without listing it first (handoff § 8: „legt an und öffnet direkt das Bearbeiten-Panel"). This is **not** `getOrCreateCatalogItem`: typing a name that already exists must fail loudly with „Artikel existiert bereits", because the user's intent was to add something new, and silently handing back the existing row would look like the create did nothing.

**Files:**
- Modify: `src/lib/catalog/manage.ts`
- Test: `src/lib/catalog/manage.test.ts`

**Interfaces:**
- Consumes: `normalizeName` (`src/lib/catalog/normalize.ts`), `MAX_ITEM_NAME_LENGTH` (`src/lib/catalog/catalog.ts`), `ApiError` (`src/lib/http/errors.ts`).
- Produces:
  - `const DUPLICATE_ARTICLE_MESSAGE = "Artikel existiert bereits"`
  - `createCatalogArticle(db: PrismaClient, input: { projectId: string; name: string }): Promise<CatalogItem>`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/catalog/manage.test.ts` (and extend the import to `import { createCatalogArticle, DUPLICATE_ARTICLE_MESSAGE, listCatalog } from "./manage";`):

```ts
describe("createCatalogArticle", () => {
  it("creates an article with a cleaned display name and a normalized identity", async () => {
    const article = await createCatalogArticle(db, { projectId, name: "  Rote   Paprika " });

    expect(article.projectId).toBe(projectId);
    expect(article.name).toBe("Rote Paprika"); // casing kept, whitespace cleaned
    expect(article.normalizedName).toBe("rote paprika"); // identity key
    expect(article.defaultCategory).toBeNull();
    expect(article.defaultUnit).toBeNull();
  });

  // The whole point of this function vs. getOrCreateCatalogItem: here a known
  // name is a failure, not a hit — and any spelling of it counts as known.
  it("refuses a different spelling of an article that already exists", async () => {
    await createCatalogArticle(db, { projectId, name: "Milch" });

    await expect(
      createCatalogArticle(db, { projectId, name: " MILCH " }),
    ).rejects.toMatchObject({ status: 409, message: DUPLICATE_ARTICLE_MESSAGE });
    expect(await db.catalogItem.count({ where: { projectId } })).toBe(1);
  });

  it("rejects a name that is empty after normalization with 400", async () => {
    await expect(createCatalogArticle(db, { projectId, name: "   " })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a name longer than 200 characters with 400", async () => {
    await expect(
      createCatalogArticle(db, { projectId, name: "x".repeat(201) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("allows the same name in a different project", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o2", email: "o2@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    await createCatalogArticle(db, { projectId, name: "Milch" });

    const other = await createCatalogArticle(db, { projectId: otherProject.id, name: "Milch" });
    expect(other.projectId).toBe(otherProject.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog/manage.test.ts`
Expected: FAIL — `createCatalogArticle is not a function`.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/catalog/manage.ts` (imports at the top, code below `listCatalog`):

```ts
import type { CatalogItem, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";
import { MAX_ITEM_NAME_LENGTH } from "./catalog";
import { normalizeName } from "./normalize";
import { compareArticleNames } from "./sort";
```

(`isUuid` is NOT imported yet — Task 4 is the first function that needs it, and an
unused import would fail `npm run lint`.)

```ts
/**
 * The one German sentence for a normalized-name collision, quoted verbatim from
 * the design (brief § 6.8, handoff § 8). Exported so the screen's tests and the
 * core agree on the wording instead of duplicating the string.
 */
export const DUPLICATE_ARTICLE_MESSAGE = "Artikel existiert bereits";

/** Message + limit shared by create and update, so both validate identically. */
function assertValidArticleName(name: string): string {
  const normalizedName = normalizeName(name);
  if (!normalizedName) throw new ApiError(400, "Name darf nicht leer sein");
  if (name.length > MAX_ITEM_NAME_LENGTH) {
    throw new ApiError(400, `Name darf höchstens ${MAX_ITEM_NAME_LENGTH} Zeichen lang sein`);
  }
  return normalizedName;
}

/** Display name as it is stored: user's casing, trimmed, inner whitespace collapsed. */
function toDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Turns Prisma's unique-constraint violation into the same 409 the pre-check
 * throws. Why both: the pre-check gives the nice error in the normal case, but
 * two members creating the same article in the same second would slip past it —
 * the DB constraint is the real guarantee, and P2002 is how it announces itself.
 */
function rethrowAsDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError(409, DUPLICATE_ARTICLE_MESSAGE);
  }
  throw error;
}

export interface CreateCatalogArticleInput {
  projectId: string;
  name: string;
}

/**
 * Creates an article directly from the Katalog screen's „Neuen Artikel anlegen…" row.
 *
 * Contrast with getOrCreateCatalogItem (catalog.ts), which is the implicit path
 * and deliberately returns the existing row for a known name: there the user was
 * typing a list entry and any article that matches is the right answer. Here the
 * user asked for a NEW article, so a known name is a 409 — otherwise the screen
 * would appear to do nothing.
 */
export async function createCatalogArticle(
  db: PrismaClient,
  input: CreateCatalogArticleInput,
): Promise<CatalogItem> {
  const normalizedName = assertValidArticleName(input.name);

  // Pre-check for the friendly error. The compound unique is what actually
  // guarantees uniqueness — see rethrowAsDuplicate for the concurrent case.
  const existing = await db.catalogItem.findUnique({
    where: { projectId_normalizedName: { projectId: input.projectId, normalizedName } },
  });
  if (existing) throw new ApiError(409, DUPLICATE_ARTICLE_MESSAGE);

  try {
    return await db.catalogItem.create({
      data: { projectId: input.projectId, name: toDisplayName(input.name), normalizedName },
    });
  } catch (error) {
    rethrowAsDuplicate(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog/manage.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/manage.ts src/lib/catalog/manage.test.ts
git commit -m "feat(catalog): createCatalogArticle with duplicate check"
```

---

## Task 4: `updateCatalogArticle` — rename + defaults in one write

The design's panel has three fields and **one** „Speichern" button, so the core gets one function. Doing name and defaults in a single `update` also removes the ugly partial state where the defaults were written and then the rename collided.

Two rules that are easy to get wrong and are therefore pinned by tests:
1. Re-spelling an article's own name („milch" → „Milch") is **not** a collision — the normalized name is unchanged, it is the same row.
2. An emptied field **clears** the default here. That is the opposite of `flowBackCatalogDefaults`, which ignores null on purpose (an entry-local clear must not wipe shared catalog memory). On this screen the user is looking straight at the value they just emptied, so the intent is explicit.

**Files:**
- Modify: `src/lib/catalog/manage.ts`
- Test: `src/lib/catalog/manage.test.ts`

**Interfaces:**
- Consumes: `assertValidArticleName`, `toDisplayName`, `rethrowAsDuplicate`, `DUPLICATE_ARTICLE_MESSAGE` (Task 3), `isUuid`.
- Produces: `updateCatalogArticle(db: PrismaClient, input: { projectId: string; catalogItemId: string; name: string; category: string | null; unit: string | null }): Promise<CatalogItem>`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/catalog/manage.test.ts` (extend the import with `updateCatalogArticle`):

```ts
describe("updateCatalogArticle", () => {
  it("renames the article and writes both defaults", async () => {
    const article = await makeArticle("Milch");

    const updated = await updateCatalogArticle(db, {
      projectId,
      catalogItemId: article.id,
      name: "Vollmilch",
      category: "Molkerei",
      unit: "l",
    });

    expect(updated.name).toBe("Vollmilch");
    expect(updated.normalizedName).toBe("vollmilch"); // identity follows the name
    expect(updated.defaultCategory).toBe("Molkerei");
    expect(updated.defaultUnit).toBe("l");
  });

  // Re-spelling the article's OWN name is not a collision: same normalized name,
  // same row. Without the `!==` guard below this would 409 against itself.
  it("accepts a pure re-spelling of the article's own name", async () => {
    const article = await makeArticle("milch");

    const updated = await updateCatalogArticle(db, {
      projectId,
      catalogItemId: article.id,
      name: "Milch",
      category: null,
      unit: null,
    });

    expect(updated.id).toBe(article.id);
    expect(updated.name).toBe("Milch");
    expect(updated.normalizedName).toBe("milch");
  });

  it("refuses a rename onto another article, in any spelling", async () => {
    await makeArticle("Butter");
    const milch = await makeArticle("Milch");

    await expect(
      updateCatalogArticle(db, {
        projectId,
        catalogItemId: milch.id,
        name: " BUTTER ",
        category: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ status: 409, message: DUPLICATE_ARTICLE_MESSAGE });

    // Nothing was written: the collision is checked before the update.
    const unchanged = await db.catalogItem.findUniqueOrThrow({ where: { id: milch.id } });
    expect(unchanged.name).toBe("Milch");
  });

  // The management screen is allowed to CLEAR a default — unlike the entry
  // flow-back, which ignores null so an entry-local clear cannot wipe the catalog.
  it("clears a default when the field arrives empty", async () => {
    const article = await makeArticle("Milch", { category: "Molkerei", unit: "l" });

    const updated = await updateCatalogArticle(db, {
      projectId,
      catalogItemId: article.id,
      name: "Milch",
      category: "   ",
      unit: "",
    });

    expect(updated.defaultCategory).toBeNull();
    expect(updated.defaultUnit).toBeNull();
  });

  // Entry category is a SNAPSHOT taken at add time (schema comment on ListItem):
  // editing the catalog default must never rewrite lists that already exist.
  it("leaves the category already snapshotted on existing entries untouched", async () => {
    const article = await makeArticle("Milch", { category: "Molkerei" });
    const list = await makeList("Einkauf");
    const entry = await db.listItem.create({
      data: { listId: list.id, catalogItemId: article.id, sortIndex: 1, category: "Molkerei" },
    });

    await updateCatalogArticle(db, {
      projectId,
      catalogItemId: article.id,
      name: "Milch",
      category: "Kühlregal",
      unit: null,
    });

    const stillThere = await db.listItem.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stillThere.category).toBe("Molkerei");
  });

  it("rejects an empty name with 400", async () => {
    const article = await makeArticle("Milch");
    await expect(
      updateCatalogArticle(db, {
        projectId,
        catalogItemId: article.id,
        name: "   ",
        category: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("hides another project's article behind a 404", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o3", email: "o3@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await db.catalogItem.create({
      data: { projectId: otherProject.id, name: "Zelt", normalizedName: "zelt" },
    });

    await expect(
      updateCatalogArticle(db, {
        projectId,
        catalogItemId: foreign.id,
        name: "Zeltplane",
        category: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("answers 404 for a malformed id instead of crashing", async () => {
    await expect(
      updateCatalogArticle(db, {
        projectId,
        catalogItemId: "not-a-uuid",
        name: "Milch",
        category: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog/manage.test.ts`
Expected: FAIL — `updateCatalogArticle is not a function`.

- [ ] **Step 3: Write the implementation**

Add the import `import { isUuid } from "@/lib/validate";` at the top of
`src/lib/catalog/manage.ts` (first use is here), then append:

```ts
/**
 * Normalizes a default coming from a form field. An empty or whitespace-only
 * string means "cleared" (null), because that is what an emptied input means on
 * a screen that shows the current value.
 */
function toDefaultValue(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export interface UpdateCatalogArticleInput {
  projectId: string;
  catalogItemId: string;
  name: string;
  category: string | null;
  unit: string | null;
}

/**
 * Saves the edit panel: rename plus both defaults, in ONE write.
 *
 * Why one function and not rename + setDefaults: the design's panel has a single
 * „Speichern". Two calls would mean the defaults could land while the rename
 * bounces off a collision, leaving the user with a half-applied edit and an error
 * message. Validating first and writing once makes that impossible.
 *
 * IMPORTANT: this CAN clear a default (see toDefaultValue), which is the exact
 * opposite of flowBackCatalogDefaults. Both are correct: there the null came from
 * an entry the user cleared locally and must not wipe shared memory; here the
 * user emptied the catalog's own field while looking at it.
 */
export async function updateCatalogArticle(
  db: PrismaClient,
  input: UpdateCatalogArticleInput,
): Promise<CatalogItem> {
  const { projectId, catalogItemId } = input;
  // Shape check first: a malformed id can never match a uuid column, and Prisma
  // would throw P2023 (a fake 500) instead of returning null. 404 = "not yours".
  if (!isUuid(catalogItemId)) throw new ApiError(404, "Artikel nicht gefunden");

  const normalizedName = assertValidArticleName(input.name);

  // findFirst scoped by projectId is the enforcement point: an article id from
  // another project must be indistinguishable from a non-existent one.
  const article = await db.catalogItem.findFirst({ where: { id: catalogItemId, projectId } });
  if (!article) throw new ApiError(404, "Artikel nicht gefunden");

  // Only a name that resolves to a DIFFERENT identity can collide. Skipping the
  // query when the normalized name is unchanged is what makes „milch" → „Milch"
  // (a pure display-name fix) work instead of 409-ing against itself.
  if (normalizedName !== article.normalizedName) {
    const collision = await db.catalogItem.findUnique({
      where: { projectId_normalizedName: { projectId, normalizedName } },
    });
    if (collision) throw new ApiError(409, DUPLICATE_ARTICLE_MESSAGE);
  }

  try {
    return await db.catalogItem.update({
      where: { id: catalogItemId },
      data: {
        name: toDisplayName(input.name),
        normalizedName,
        defaultCategory: toDefaultValue(input.category),
        defaultUnit: toDefaultValue(input.unit),
      },
    });
  } catch (error) {
    // Concurrent rename onto the same target name — the unique index catches it.
    rethrowAsDuplicate(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog/manage.test.ts`
Expected: PASS — 21 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/manage.ts src/lib/catalog/manage.test.ts
git commit -m "feat(catalog): updateCatalogArticle with normalized-name collision check"
```

---

## Task 5: `deleteCatalogArticle` — guarded by list usage

The guard is the load-bearing part of this slice. `CatalogItem.listItems` has `onDelete: Cascade`, so deleting an article that is on a list would **silently delete those entries** — including entries on completed lists, which is exactly the data the N-of-M suggestion statistic reads. The count is therefore re-checked at write time, not trusted from the render.

**Files:**
- Modify: `src/lib/catalog/manage.ts`
- Test: `src/lib/catalog/manage.test.ts`

**Interfaces:**
- Consumes: `formatUsedInLists` (Task 1), `isUuid`, `ApiError`.
- Produces:
  - `countListsUsingArticle(db: PrismaClient, projectId: string, catalogItemId: string): Promise<number>`
  - `deleteCatalogArticle(db: PrismaClient, input: { projectId: string; catalogItemId: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/catalog/manage.test.ts` (extend the import with `deleteCatalogArticle`):

```ts
describe("deleteCatalogArticle", () => {
  it("deletes an article that no list uses", async () => {
    const article = await makeArticle("Kerzen");

    await deleteCatalogArticle(db, { projectId, catalogItemId: article.id });

    expect(await db.catalogItem.count({ where: { projectId } })).toBe(0);
  });

  // The guard exists because CatalogItem.listItems cascades: without it, deleting
  // an article would quietly delete its entries from every list it is on.
  it("refuses an article that an active list uses, and says how many", async () => {
    const article = await makeArticle("Milch");
    const list = await makeList("Einkauf");
    await addEntry(list.id, article.id);

    await expect(
      deleteCatalogArticle(db, { projectId, catalogItemId: article.id }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Löschen nicht möglich — wird in 1 Liste verwendet.",
    });
    expect(await db.catalogItem.count({ where: { projectId } })).toBe(1);
  });

  // Completed lists are the input to the suggestion statistic — they protect the
  // article just as much as an active list does.
  it("refuses an article that only a completed list uses", async () => {
    const article = await makeArticle("Nudeln");
    const archiviert = await makeList("Letzte Woche", true);
    await addEntry(archiviert.id, article.id);

    await expect(
      deleteCatalogArticle(db, { projectId, catalogItemId: article.id }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("counts distinct lists in the refusal message", async () => {
    const article = await makeArticle("Milch");
    const einkauf = await makeList("Einkauf");
    const wochenende = await makeList("Wochenende");
    await addEntry(einkauf.id, article.id, 1);
    await addEntry(einkauf.id, article.id, 2);
    await addEntry(wochenende.id, article.id, 1);

    await expect(
      deleteCatalogArticle(db, { projectId, catalogItemId: article.id }),
    ).rejects.toMatchObject({
      message: "Löschen nicht möglich — wird in 2 Listen verwendet.",
    });
  });

  // A favourite is NOT a usage (the brief names list usage as the only guard),
  // so the delete goes through and the FK cascade takes the favourite with it.
  it("deletes an unused article that is a favourite, and its favourite row with it", async () => {
    const article = await makeArticle("Kerzen");
    await db.favorite.create({ data: { projectId, catalogItemId: article.id } });

    await deleteCatalogArticle(db, { projectId, catalogItemId: article.id });

    expect(await db.favorite.count({ where: { projectId } })).toBe(0);
  });

  it("hides another project's article behind a 404", async () => {
    const otherUser = await db.user.create({ data: { googleSub: "g-o4", email: "o4@example.com" } });
    const otherProject = await db.project.create({ data: { name: "Ferien", ownerId: otherUser.id } });
    const foreign = await db.catalogItem.create({
      data: { projectId: otherProject.id, name: "Zelt", normalizedName: "zelt" },
    });

    await expect(
      deleteCatalogArticle(db, { projectId, catalogItemId: foreign.id }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await db.catalogItem.count({ where: { projectId: otherProject.id } })).toBe(1);
  });

  it("answers 404 for a malformed id instead of crashing", async () => {
    await expect(
      deleteCatalogArticle(db, { projectId, catalogItemId: "not-a-uuid" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog/manage.test.ts`
Expected: FAIL — `deleteCatalogArticle is not a function`.

- [ ] **Step 3: Write the implementation**

Add the import `import { formatUsedInLists } from "@/lib/format/plural";` at the top of `src/lib/catalog/manage.ts` and append:

```ts
/**
 * How many DISTINCT lists of the project contain this article — active and
 * completed alike. This is the delete guard's input and the same number the
 * screen's note prints.
 *
 * `distinct: ["listId"]` does the de-duplication in the database, so an article
 * that appears three times on one list still counts as one list.
 */
export async function countListsUsingArticle(
  db: PrismaClient,
  projectId: string,
  catalogItemId: string,
): Promise<number> {
  const rows = await db.listItem.findMany({
    // The nested `list: { projectId }` filter keeps the count project-scoped even
    // if an id from elsewhere ever reached this function.
    where: { catalogItemId, list: { projectId } },
    select: { listId: true },
    distinct: ["listId"],
  });
  return rows.length;
}

export interface DeleteCatalogArticleInput {
  projectId: string;
  catalogItemId: string;
}

/**
 * Deletes an article from the project's catalog — but ONLY when no list uses it.
 *
 * Why the guard is not optional: ListItem.catalogItemId cascades on delete, so
 * without it, removing an article would silently strip that article's entries
 * from every list it appears on, including completed ones. Those completed lists
 * are exactly what the N-of-M suggestion statistic reads (MVP design § 4.3), so
 * an unguarded delete would quietly rewrite history and change future suggestions.
 *
 * The count is re-read HERE and not taken from the caller: the screen decided
 * whether to show the button from a render that may be seconds old, and in the
 * meantime another member may have put the article on a list.
 */
export async function deleteCatalogArticle(
  db: PrismaClient,
  input: DeleteCatalogArticleInput,
): Promise<void> {
  const { projectId, catalogItemId } = input;
  if (!isUuid(catalogItemId)) throw new ApiError(404, "Artikel nicht gefunden");

  // Project-scoped existence check first — a foreign id is a 404, never a delete.
  const article = await db.catalogItem.findFirst({ where: { id: catalogItemId, projectId } });
  if (!article) throw new ApiError(404, "Artikel nicht gefunden");

  const usedInListCount = await countListsUsingArticle(db, projectId, catalogItemId);
  if (usedInListCount > 0) {
    // Same sentence the panel prints from the read model — see formatUsedInLists.
    throw new ApiError(409, `Löschen nicht möglich — ${formatUsedInLists(usedInListCount)}.`);
  }

  // The article's Favorite row (0 or 1) goes with it via the FK cascade. That is
  // intended: an article that no longer exists cannot stay a favourite.
  await db.catalogItem.delete({ where: { id: catalogItemId } });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog/manage.test.ts`
Expected: PASS — 28 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/manage.ts src/lib/catalog/manage.test.ts
git commit -m "feat(catalog): deleteCatalogArticle guarded by list usage"
```

---

## Task 6: `CatalogEditPanel` — the inline edit panel

The panel the design opens in place of a tapped row (handoff § 8 / screen `3h`): NAME / STANDARD-KATEGORIE / EINHEIT, the inline collision error on the name field, „Speichern" / „Abbrechen", and „Löschen" **only** when the article is on no list — otherwise the reason instead of the button.

Deleting goes through the `ConfirmSheet` primitive, because the handoff's shared destructive pattern requires one („Bestätigung: Bottom-Sheet mit Konsequenz-Erklärung", handoff § Destruktive Aktionen). The panel is presentational: it owns only whether the confirm sheet is open. The form action and the delete callback come from the parent.

**Files:**
- Create: `src/app/projects/[projectId]/katalog/formState.ts`
- Create: `src/app/projects/[projectId]/katalog/CatalogEditPanel.tsx`
- Create: `src/app/projects/[projectId]/katalog/CatalogEditPanel.module.css`
- Test: `src/app/projects/[projectId]/katalog/CatalogEditPanel.test.tsx`

**Interfaces:**
- Consumes: `CatalogArticle` (Task 2), `formatUsedInLists` (Task 1), the primitives `Button`, `TextField`, `ConfirmSheet`.
- Produces:
  - `type CatalogFormState = { error: string | null; ok: boolean; createdId: string | null; articleId: string | null }`
  - `const CATALOG_FORM_IDLE: CatalogFormState`
  - `CatalogEditPanel(props: { article: CatalogArticle; error: string | null; formAction: (formData: FormData) => void; onConfirmDelete: () => void; onCancel: () => void })`

- [ ] **Step 1: Write the failing test**

Create `src/app/projects/[projectId]/katalog/CatalogEditPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogArticle } from "@/lib/catalog/manage";
import { CatalogEditPanel } from "./CatalogEditPanel";

const article: CatalogArticle = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milch",
  defaultCategory: "Molkerei",
  defaultUnit: "l",
  usedInListCount: 0,
  isFavorite: false,
};

function renderPanel(overrides: Partial<Parameters<typeof CatalogEditPanel>[0]> = {}) {
  const props = {
    article,
    error: null,
    formAction: vi.fn(),
    onConfirmDelete: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<CatalogEditPanel {...props} />), props };
}

describe("CatalogEditPanel", () => {
  it("shows the article's current name and defaults in editable fields", () => {
    renderPanel();

    expect(screen.getByLabelText("Name")).toHaveValue("Milch");
    expect(screen.getByLabelText("Standard-Kategorie")).toHaveValue("Molkerei");
    expect(screen.getByLabelText("Einheit")).toHaveValue("l");
  });

  it("renders empty fields for an article without defaults", () => {
    renderPanel({ article: { ...article, defaultCategory: null, defaultUnit: null } });

    expect(screen.getByLabelText("Standard-Kategorie")).toHaveValue("");
    expect(screen.getByLabelText("Einheit")).toHaveValue("");
  });

  it("puts the collision error on the name field", () => {
    renderPanel({ error: "Artikel existiert bereits" });

    expect(screen.getByText("Artikel existiert bereits")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("carries the article id into the form so the action knows its target", () => {
    const { container } = renderPanel();
    expect(container.querySelector('input[name="catalogItemId"]')).toHaveValue(article.id);
  });

  it("offers Löschen for an article no list uses", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Löschen" })).toBeInTheDocument();
  });

  // The handoff forbids disabling a forbidden control — it must not be rendered,
  // and the reason is stated instead.
  it("hides Löschen and states the reason for an article that is in use", () => {
    renderPanel({ article: { ...article, usedInListCount: 3 } });

    expect(screen.queryByRole("button", { name: "Löschen" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Löschen nicht möglich — wird in 3 Listen verwendet."),
    ).toBeInTheDocument();
  });

  it("warns that deleting a favourite also drops it from the favourites", () => {
    renderPanel({ article: { ...article, isFavorite: true } });

    expect(
      screen.getByText("Ist ein Favorit — wird beim Löschen auch aus den Favoriten entfernt."),
    ).toBeInTheDocument();
  });

  it("asks for confirmation before deleting", async () => {
    const { props } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(screen.getByRole("dialog", { name: "Artikel löschen: Milch" })).toBeInTheDocument();
    expect(props.onConfirmDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /^Artikel löschen/ }));
    expect(props.onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Abbrechen is clicked", async () => {
    const { props } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/projects/\[projectId\]/katalog/CatalogEditPanel.test.tsx`
Expected: FAIL — cannot resolve `./CatalogEditPanel`.

- [ ] **Step 3: Write the shared form-state module**

Create `src/app/projects/[projectId]/katalog/formState.ts`:

```ts
/**
 * The result shape BOTH catalog Server Actions return.
 *
 * Why the actions return a state object instead of throwing: the collision error
 * („Artikel existiert bereits") has to land inline on the name field, and a
 * thrown error on a Server Action produces Next.js's error overlay, not an inline
 * message. Returning state is what React 19's useActionState consumes.
 *
 * One shared shape for both actions keeps the two useActionState hooks in
 * CatalogBrowser identically typed; each action simply leaves the fields it has
 * no answer for at their idle values.
 */
export type CatalogFormState = {
  /** German inline error from the last attempt, or null. */
  error: string | null;
  /** True after an action SUCCEEDED — the panel closes on it. Distinguishing this
   *  from `error === null` matters because the idle state has no error either. */
  ok: boolean;
  /** Id of a freshly created article; the browser opens its panel straight away. */
  createdId: string | null;
  /** Which article the result belongs to, so a stale error can never be painted
   *  onto a different article's panel after the user cancels and opens another. */
  articleId: string | null;
};

/** The initial value both useActionState hooks start from. */
export const CATALOG_FORM_IDLE: CatalogFormState = {
  error: null,
  ok: false,
  createdId: null,
  articleId: null,
};
```

- [ ] **Step 4: Write the panel component**

Create `src/app/projects/[projectId]/katalog/CatalogEditPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { TextField } from "@/components/ui/TextField";
import type { CatalogArticle } from "@/lib/catalog/manage";
import { formatUsedInLists } from "@/lib/format/plural";
import styles from "./CatalogEditPanel.module.css";

type CatalogEditPanelProps = {
  article: CatalogArticle;
  /** German inline error from the last save attempt; sits on the NAME field. */
  error: string | null;
  /** The edit action's dispatch, owned by CatalogBrowser (useActionState). */
  formAction: (formData: FormData) => void;
  /** Fires the same action imperatively once the deletion is confirmed. */
  onConfirmDelete: () => void;
  onCancel: () => void;
};

/**
 * The inline edit panel that replaces a tapped catalog row (handoff § 8).
 *
 * Presentational on purpose: the only state it owns is whether the confirmation
 * sheet is open. The form's action and the delete callback are props, so the page
 * keeps ownership of the mutations (and of their membership re-checks) — the same
 * split Slice 14's RevokeSheet uses.
 *
 * The fields are UNCONTROLLED (defaultValue): the values are only read on submit,
 * and typing must not cost a re-render of the surrounding list. The panel is
 * mounted fresh whenever a different row opens, which is what re-seeds them.
 */
export function CatalogEditPanel({
  article,
  error,
  formAction,
  onConfirmDelete,
  onCancel,
}: CatalogEditPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The one product rule of this screen: an article on any list — active or
  // archived — cannot be deleted, because the suggestion statistic reads them.
  const deletable = article.usedInListCount === 0;

  return (
    // NOT the Card primitive: the design gives this panel an accent-tinted border
    // and its own shadow, and overriding Card's border across two CSS Modules
    // depends on stylesheet injection order, which Next.js does not guarantee.
    // The surface is therefore drawn here, deliberately and once.
    <div className={styles.panel}>
      <form action={formAction} className={styles.form}>
        {/* The action is a POST endpoint of its own — it must learn its target
            from the payload, never from component state. */}
        <input type="hidden" name="catalogItemId" value={article.id} />
        <TextField
          label="Name"
          name="name"
          defaultValue={article.name}
          error={error}
          fieldSize="sm"
        />
        <div className={styles.defaults}>
          <TextField
            label="Standard-Kategorie"
            name="category"
            defaultValue={article.defaultCategory ?? ""}
            fieldSize="sm"
          />
          <div className={styles.unitField}>
            <TextField
              label="Einheit"
              name="unit"
              defaultValue={article.defaultUnit ?? ""}
              fieldSize="sm"
            />
          </div>
        </div>
        <div className={styles.actions}>
          {/* name/value ride along in the FormData, which is how one action
              serves both intents without a second form. */}
          <Button type="submit" name="intent" value="save">
            Speichern
          </Button>
          <Button variant="text" onClick={onCancel}>
            Abbrechen
          </Button>
          <span className={styles.spacer} />
          {deletable && (
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Löschen
            </Button>
          )}
        </div>
      </form>

      {/* Not disabled — absent, per the handoff's destructive-action pattern. The
          note takes the button's place so the absence is explained. */}
      {!deletable && (
        <p className={styles.note}>
          Löschen nicht möglich — {formatUsedInLists(article.usedInListCount)}.
        </p>
      )}

      {/* A favourite is not a usage, so the delete goes through — but it takes the
          favourite with it (FK cascade), and that must never be a surprise. */}
      {deletable && article.isFavorite && (
        <p className={styles.note}>
          Ist ein Favorit — wird beim Löschen auch aus den Favoriten entfernt.
        </p>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Artikel löschen: ${article.name}`}
        options={[
          {
            label: "Artikel löschen",
            description: article.isFavorite
              ? "Der Artikel verschwindet aus dem Katalog und aus den Favoriten."
              : "Der Artikel verschwindet aus dem Katalog.",
            tone: "danger",
            onSelect: onConfirmDelete,
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 5: Write the stylesheet**

Create `src/app/projects/[projectId]/katalog/CatalogEditPanel.module.css`:

```css
/* Handoff screen 3h, opened row: white surface, accent-tinted border, soft
   accent shadow — visibly a different object from the flat rows around it. */
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border-active-panel);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-panel-active);
  padding: 12px 14px;
  margin: 8px 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Kategorie takes the room, Einheit is a narrow fixed column (design: 90px). */
.defaults {
  display: flex;
  gap: 8px;
}

.unitField {
  display: flex;
  width: 90px;
  flex: none;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 2px;
}

/* Pushes "Löschen" to the trailing edge, away from the confirming action. */
.spacer {
  flex: 1;
}

.note {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-muted);
  margin-top: 10px;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/app/projects/\[projectId\]/katalog/CatalogEditPanel.test.tsx`
Expected: PASS — 9 tests.

- [ ] **Step 7: Commit**

```bash
git add "src/app/projects/[projectId]/katalog/formState.ts" \
        "src/app/projects/[projectId]/katalog/CatalogEditPanel.tsx" \
        "src/app/projects/[projectId]/katalog/CatalogEditPanel.module.css" \
        "src/app/projects/[projectId]/katalog/CatalogEditPanel.test.tsx"
git commit -m "feat(ui): catalog edit panel with collision error and guarded delete"
```

---

## Task 7: `CatalogBrowser` — search, rows, create row, panel wiring

The screen's only stateful piece: it holds the search text and which row's panel is open, and it owns both `useActionState` hooks. Everything it renders comes from props — the article array arrives from the server on every render, so a mutation followed by `revalidatePath` refreshes the list while this component's local state (search text, open row) survives.

**Files:**
- Create: `src/app/projects/[projectId]/katalog/CatalogBrowser.tsx`
- Create: `src/app/projects/[projectId]/katalog/CatalogBrowser.module.css`
- Test: `src/app/projects/[projectId]/katalog/CatalogBrowser.test.tsx`

**Interfaces:**
- Consumes: `CatalogArticle` (Task 2), `formatArticleDefaults` (Task 1), `normalizeName` (`src/lib/catalog/normalize.ts`), `CatalogFormState`/`CATALOG_FORM_IDLE` (Task 6), `CatalogEditPanel` (Task 6), the primitives `Button`, `EmptyState`, `Icon`, `TextField`.
- Produces: `CatalogBrowser(props: { articles: CatalogArticle[]; createAction: CatalogAction; editAction: CatalogAction })` where `type CatalogAction = (prev: CatalogFormState, formData: FormData) => Promise<CatalogFormState>`.

- [ ] **Step 1: Write the failing test**

Create `src/app/projects/[projectId]/katalog/CatalogBrowser.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogArticle } from "@/lib/catalog/manage";
import { CatalogBrowser } from "./CatalogBrowser";
import { CATALOG_FORM_IDLE, type CatalogFormState } from "./formState";

const milch: CatalogArticle = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milch",
  defaultCategory: "Molkerei",
  defaultUnit: "l",
  usedInListCount: 0,
  isFavorite: false,
};

const nudeln: CatalogArticle = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Nudeln",
  defaultCategory: "Trockenwaren",
  defaultUnit: null,
  usedInListCount: 2,
  isFavorite: false,
};

const idle = async (): Promise<CatalogFormState> => CATALOG_FORM_IDLE;

function renderBrowser(overrides: Partial<Parameters<typeof CatalogBrowser>[0]> = {}) {
  const props = {
    articles: [milch, nudeln],
    createAction: idle,
    editAction: idle,
    ...overrides,
  };
  return { ...render(<CatalogBrowser {...props} />), props };
}

describe("CatalogBrowser", () => {
  it("lists every article with its defaults sub line", () => {
    renderBrowser();

    expect(screen.getByRole("button", { name: /Milch/ })).toBeInTheDocument();
    expect(screen.getByText("Molkerei · l")).toBeInTheDocument();
    // Only the category is set on Nudeln, so the middle dot must not appear.
    expect(screen.getByText("Trockenwaren")).toBeInTheDocument();
  });

  // Filtering reuses normalizeName, so casing and stray whitespace never matter —
  // the same identity rule the catalog itself uses.
  it("filters the list as the user types, ignoring case", async () => {
    renderBrowser();

    await userEvent.type(screen.getByLabelText("Artikel suchen"), "mil");

    expect(screen.getByRole("button", { name: /Milch/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nudeln/ })).not.toBeInTheDocument();
  });

  // Substring, not prefix: on a management screen "nudel" should find "Vollkorn-
  // nudeln". (searchCatalog stays prefix-only — that is autocomplete.)
  it("matches anywhere in the name, not only at the start", async () => {
    renderBrowser();

    await userEvent.type(screen.getByLabelText("Artikel suchen"), "udel");

    expect(screen.getByRole("button", { name: /Nudeln/ })).toBeInTheDocument();
  });

  it("says so when the search matches nothing", async () => {
    renderBrowser();

    await userEvent.type(screen.getByLabelText("Artikel suchen"), "Zelt");

    expect(screen.getByText("Keine Treffer für „Zelt“.")).toBeInTheDocument();
  });

  it("opens the edit panel when a row is tapped", async () => {
    renderBrowser();

    await userEvent.click(screen.getByRole("button", { name: /Milch/ }));

    expect(screen.getByLabelText("Name")).toHaveValue("Milch");
    expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });

  it("closes the panel again on Abbrechen", async () => {
    renderBrowser();

    await userEvent.click(screen.getByRole("button", { name: /Milch/ }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(screen.queryByRole("button", { name: "Speichern" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Milch/ })).toBeInTheDocument();
  });

  it("dispatches the edit action with the delete intent once deletion is confirmed", async () => {
    // Typed with both parameters so mock.calls[0][1] is a FormData to TypeScript.
    const editAction = vi.fn(
      async (_prev: CatalogFormState, _formData: FormData): Promise<CatalogFormState> =>
        CATALOG_FORM_IDLE,
    );
    renderBrowser({ editAction });

    await userEvent.click(screen.getByRole("button", { name: /Milch/ }));
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await userEvent.click(screen.getByRole("button", { name: /^Artikel löschen/ }));

    expect(editAction).toHaveBeenCalledTimes(1);
    const formData = editAction.mock.calls[0][1] as FormData;
    expect(formData.get("intent")).toBe("delete");
    expect(formData.get("catalogItemId")).toBe(milch.id);
  });

  it("shows the create error next to the create field", async () => {
    const createAction = async (): Promise<CatalogFormState> => ({
      error: "Artikel existiert bereits",
      ok: false,
      createdId: null,
      articleId: null,
    });
    renderBrowser({ createAction });

    await userEvent.type(screen.getByLabelText("Neuen Artikel anlegen"), "Milch");
    await userEvent.click(screen.getByRole("button", { name: "Artikel anlegen" }));

    expect(await screen.findByText("Artikel existiert bereits")).toBeInTheDocument();
  });

  // Handoff: creating „legt an und öffnet direkt das Bearbeiten-Panel".
  // The stub returns the id of an article ALREADY in `articles`, standing in for
  // the revalidated props a real create would produce — otherwise there would be
  // no row for the returned id to open.
  it("opens the panel of a freshly created article", async () => {
    const createAction = async (): Promise<CatalogFormState> => ({
      error: null,
      ok: true,
      createdId: nudeln.id,
      articleId: nudeln.id,
    });
    renderBrowser({ createAction });

    await userEvent.type(screen.getByLabelText("Neuen Artikel anlegen"), "Nudeln");
    await userEvent.click(screen.getByRole("button", { name: "Artikel anlegen" }));

    // The panel's presence is the assertion — not a display value, which would
    // also match the text still sitting in the create field.
    expect(await screen.findByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });

  it("shows the empty state and no search field for an empty catalog", () => {
    renderBrowser({ articles: [] });

    expect(screen.getByText("Der Katalog füllt sich von selbst")).toBeInTheDocument();
    expect(screen.getByLabelText("Neuen Artikel anlegen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Artikel suchen")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/projects/\[projectId\]/katalog/CatalogBrowser.test.tsx`
Expected: FAIL — cannot resolve `./CatalogBrowser`.

- [ ] **Step 3: Write the component**

Create `src/app/projects/[projectId]/katalog/CatalogBrowser.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import type { CatalogArticle } from "@/lib/catalog/manage";
import { normalizeName } from "@/lib/catalog/normalize";
import { formatArticleDefaults } from "@/lib/format/plural";
import { CatalogEditPanel } from "./CatalogEditPanel";
import { CATALOG_FORM_IDLE, type CatalogFormState } from "./formState";
import styles from "./CatalogBrowser.module.css";

/** Both Server Actions have the useActionState signature. */
type CatalogAction = (prev: CatalogFormState, formData: FormData) => Promise<CatalogFormState>;

type CatalogBrowserProps = {
  /** The WHOLE catalog, already sorted, straight from the server on every render. */
  articles: CatalogArticle[];
  createAction: CatalogAction;
  editAction: CatalogAction;
};

/**
 * The Katalog screen's interactive body.
 *
 * Why this is the only client component here: the design filters as you type and
 * opens a panel in place of the tapped row — both are pure view state, and both
 * would otherwise cost a server round-trip per keystroke or per tap. The DATA
 * still never comes from the client: `articles` is a prop, so after any mutation
 * the Server Action's revalidatePath re-renders the page and this component is
 * handed a fresh array while its own state (search text, open row) survives.
 *
 * Why two useActionState hooks instead of one: the create row and the edit panel
 * fail independently, and a collision while creating must not paint an error into
 * a panel (or vice versa).
 */
export function CatalogBrowser({ articles, createAction, editAction }: CatalogBrowserProps) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createState, createFormAction] = useActionState(createAction, CATALOG_FORM_IDLE);
  const [editState, editFormAction] = useActionState(editAction, CATALOG_FORM_IDLE);

  // „legt an und öffnet direkt das Bearbeiten-Panel" (handoff § 8): the new
  // article arrives via the revalidated props, and this opens its panel.
  // The dependency is the whole state object, which is a NEW object per action
  // result — that is what makes the effect fire once per successful create.
  useEffect(() => {
    if (createState.createdId) setOpenId(createState.createdId);
  }, [createState]);

  // A successful save or delete closes the panel. A failed one must NOT — the
  // user needs to see the error next to the field that caused it.
  useEffect(() => {
    if (editState.ok) setOpenId(null);
  }, [editState]);

  // Reusing normalizeName means the filter obeys the same identity rule as the
  // catalog ("MIL" finds "Milch"). Substring rather than prefix on purpose: this
  // is a management screen, not autocomplete — searchCatalog stays prefix-only.
  const needle = normalizeName(query);
  const visible = needle
    ? articles.filter((article) => normalizeName(article.name).includes(needle))
    : articles;

  // Built once: it appears inside the empty state AND above the list.
  const createRow = (
    <form action={createFormAction} className={styles.createRow}>
      <TextField
        name="name"
        placeholder="Neuen Artikel anlegen…"
        aria-label="Neuen Artikel anlegen"
        error={createState.error}
        fieldSize="sm"
      />
      <Button type="submit" aria-label="Artikel anlegen">
        <Icon icon={Plus} />
      </Button>
    </form>
  );

  // Empty state 5f. No search field: there is nothing to search, and the create
  // row belongs directly under the copy (handoff § Empty States).
  if (articles.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState
          icon={<Icon icon={Search} size={24} />}
          shape="square"
          title="Der Katalog füllt sich von selbst"
          description="Jeder Artikel, den du auf einer Liste verwendest, wird hier gesammelt — mit Standard-Kategorie und -Einheit."
        >
          {createRow}
        </EmptyState>
      </div>
    );
  }

  // The confirmed delete reuses the EDIT action rather than a third one: same
  // target, same guard, same result shape. FormData is built by hand because the
  // confirmation lives in a sheet, outside the panel's <form>.
  const deleteArticle = (article: CatalogArticle) => {
    const formData = new FormData();
    formData.set("catalogItemId", article.id);
    formData.set("intent", "delete");
    // startTransition keeps the dispatch off the synchronous click path, which is
    // what React expects for an action fired outside a form submission.
    startTransition(() => editFormAction(formData));
  };

  return (
    <div className={styles.browser}>
      {/* Deliberately NOT the TextField primitive: the design draws search as a
          filled pill with a leading glyph and no border — a different control
          from the bordered form field TextField owns. */}
      <div className={styles.search}>
        <Icon icon={Search} size={15} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Artikel suchen…"
          aria-label="Artikel suchen"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {createRow}

      {visible.length === 0 ? (
        <p className={styles.noHits}>Keine Treffer für „{query.trim()}“.</p>
      ) : (
        <ul className={styles.rows}>
          {visible.map((article) => (
            <li key={article.id}>
              {article.id === openId ? (
                <CatalogEditPanel
                  article={article}
                  // Only the error that belongs to THIS article — otherwise a
                  // failed save would follow the user to the next panel.
                  error={editState.articleId === article.id ? editState.error : null}
                  formAction={editFormAction}
                  onConfirmDelete={() => deleteArticle(article)}
                  onCancel={() => setOpenId(null)}
                />
              ) : (
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => setOpenId(article.id)}
                >
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{article.name}</span>
                    <span className={styles.rowMeta}>
                      {formatArticleDefaults(article.defaultCategory, article.defaultUnit)}
                    </span>
                  </span>
                  <Icon icon={ChevronRight} className={styles.chevron} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the stylesheet**

Create `src/app/projects/[projectId]/katalog/CatalogBrowser.module.css`:

```css
/* Handoff screen 3h (Katalog) + empty state 5f. */
.browser {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* The filled search pill. --color-hairline-weak carries exactly the #f1f1ee the
   design specifies for this surface. */
.search {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--color-hairline-weak);
  border-radius: var(--radius-control);
  padding: 0 13px;
  /* The design's pill is shorter; 44px is the project-wide tap-target floor. */
  min-height: 44px;
}

.searchIcon {
  color: var(--color-text-muted);
  flex: none;
}

.searchInput {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  padding: 10px 0;
  outline: none;
}

.createRow {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.rows {
  list-style: none;
  display: flex;
  flex-direction: column;
}

/* Dense row: 50–300 articles have to stay scannable, so the row is a hairline
   divider and two lines of text, never a card. */
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 11px 2px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-hairline-weak);
  text-align: left;
  cursor: pointer;
}

.rowText {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rowName {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rowMeta {
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  color: var(--color-control-border);
  flex: none;
}

.noHits {
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 12px 2px;
}

/* The empty state owns the vertical centre of the screen (same rule as /projects). */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/projects/\[projectId\]/katalog/CatalogBrowser.test.tsx`
Expected: PASS — 10 tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/projects/[projectId]/katalog/CatalogBrowser.tsx" \
        "src/app/projects/[projectId]/katalog/CatalogBrowser.module.css" \
        "src/app/projects/[projectId]/katalog/CatalogBrowser.test.tsx"
git commit -m "feat(ui): catalog browser with live search and inline panel"
```

---

## Task 8: The `/projects/[projectId]/katalog` screen

The Server Component that ties it together: membership guard, one read, two Server Actions, the header with the article count — plus the single link from the project page that makes the screen reachable at all.

**Files:**
- Create: `src/app/projects/[projectId]/katalog/page.tsx`
- Create: `src/app/projects/[projectId]/katalog/page.module.css`
- Modify: `src/app/projects/[projectId]/page.tsx` (one link, after the `<p>Deine Rolle: …</p>` line)

**Interfaces:**
- Consumes: `listCatalog`, `createCatalogArticle`, `updateCatalogArticle`, `deleteCatalogArticle` (Tasks 2–5), `formatArticleCount` (Task 1), `CatalogBrowser` (Task 7), `CATALOG_FORM_IDLE`/`CatalogFormState` (Task 6), `requireMembership`, `ApiError`, `PageHeader`, `Icon`.
- Produces: the route `/projects/[projectId]/katalog`. Nothing later imports from it.

- [ ] **Step 1: Write the page**

Create `src/app/projects/[projectId]/katalog/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import {
  createCatalogArticle,
  deleteCatalogArticle,
  listCatalog,
  updateCatalogArticle,
} from "@/lib/catalog/manage";
import { formatArticleCount } from "@/lib/format/plural";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { CatalogBrowser } from "./CatalogBrowser";
import { CATALOG_FORM_IDLE, type CatalogFormState } from "./formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * Turns a thrown domain error into the inline form state the screen renders.
 *
 * Only ApiError carries user-facing German copy. Anything else is a real bug and
 * is re-thrown on purpose: a crash disguised as a validation message next to a
 * text field is the worst of both worlds.
 */
function toFormState(error: unknown, articleId: string | null): CatalogFormState {
  if (error instanceof ApiError) {
    return { error: error.message, ok: false, createdId: null, articleId };
  }
  throw error;
}

/**
 * The Katalog screen (handoff § 8) — the project's memory, made visible.
 *
 * Server Component: it reads the session and calls the domain layer directly, no
 * HTTP round-trip (the pattern from every other screen in this app). This slice
 * ships NO REST endpoints for catalog management: the catalog screen is never
 * polled and never merged offline, so the reason lists have an operations API
 * does not apply. src/lib/catalog/manage.ts stays the seam if one is ever needed.
 */
export default async function CatalogPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  // A non-member must not learn that this project exists — same redirect as the
  // project detail page rather than an error screen.
  try {
    await requireMembership(prisma, projectId, userId);
  } catch {
    redirect("/projects");
  }

  const articles = await listCatalog(prisma, projectId);

  // --- Server Actions ---------------------------------------------------------
  // Both re-derive identity and re-check membership: a Server Action is an
  // individually addressable POST endpoint, so a crafted request could reach it
  // without ever rendering this page. Catalog upkeep is member-level (MVP design
  // § 6), so requireMembership — not requireOwner — is the right guard.
  // Both RETURN their error instead of throwing, because useActionState is what
  // puts the message inline on the field that caused it.

  async function createArticleAction(
    _prev: CatalogFormState,
    formData: FormData,
  ): Promise<CatalogFormState> {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const name = String(formData.get("name") ?? "").trim();
    // Empty submission: silent no-op, the convention every other form here uses.
    if (!name) return CATALOG_FORM_IDLE;

    try {
      const created = await createCatalogArticle(prisma, { projectId, name });
      revalidatePath(`/projects/${projectId}/katalog`);
      // createdId is what makes the browser open the new article's panel.
      return { error: null, ok: true, createdId: created.id, articleId: created.id };
    } catch (error) {
      return toFormState(error, null);
    }
  }

  async function editArticleAction(
    _prev: CatalogFormState,
    formData: FormData,
  ): Promise<CatalogFormState> {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const catalogItemId = String(formData.get("catalogItemId") ?? "");
    if (!catalogItemId) return CATALOG_FORM_IDLE;

    try {
      // One action, two intents — the submit button's name/value decides. Both
      // hit the same article, so they share the guard and the result shape.
      if (formData.get("intent") === "delete") {
        await deleteCatalogArticle(prisma, { projectId, catalogItemId });
      } else {
        await updateCatalogArticle(prisma, {
          projectId,
          catalogItemId,
          name: String(formData.get("name") ?? ""),
          // Empty strings are meaningful here: they CLEAR the default (see
          // updateCatalogArticle), which is why they are not filtered out.
          category: String(formData.get("category") ?? ""),
          unit: String(formData.get("unit") ?? ""),
        });
      }
      revalidatePath(`/projects/${projectId}/katalog`);
      return { error: null, ok: true, createdId: null, articleId: catalogItemId };
    } catch (error) {
      return toFormState(error, catalogItemId);
    }
  }

  return (
    <>
      <PageHeader
        title="Katalog"
        // Slice 11 replaces this back link with the ☰ drawer trigger; the slot is
        // the same one, which is why it exists.
        leading={
          <Link href={`/projects/${projectId}`} aria-label="Zum Projekt" className={styles.back}>
            <Icon icon={ChevronLeft} size={19} />
          </Link>
        }
        trailing={<span className={styles.count}>{formatArticleCount(articles.length)}</span>}
      />
      <main className={styles.content}>
        <CatalogBrowser
          articles={articles}
          createAction={createArticleAction}
          editAction={editArticleAction}
        />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `src/app/projects/[projectId]/katalog/page.module.css`:

```css
/* Handoff screen 3h. */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px var(--screen-padding) calc(24px + var(--safe-bottom));
}

/* The back link doubles as a tap target, hence the negative inline padding trick
   is avoided: it simply gets the 44px box the handoff's PWA section demands. */
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: -12px;
  color: var(--color-accent);
}

.count {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

@media (min-width: 900px) {
  .content {
    padding-left: var(--screen-padding-desktop);
    padding-right: var(--screen-padding-desktop);
    max-width: calc(var(--content-max-width) + 2 * var(--screen-padding-desktop));
  }
}
```

- [ ] **Step 3: Make the screen reachable**

In `src/app/projects/[projectId]/page.tsx`, directly after the `<p>Deine Rolle: …</p>` line, insert:

```tsx
      {/* Slice 10: the catalog screen. This page is still the un-restyled Slice 2/3
          markup — Slice 11 splits it into drawer screens and this link becomes the
          drawer's „Katalog" entry, so keep it to one line until then. */}
      <p>
        <Link href={`/projects/${projectId}/katalog`}>Katalog</Link>
      </p>
```

`Link` is already imported in that file — do not add a second import.

- [ ] **Step 4: Verify the route builds and renders**

Run: `npm run build`
Expected: build succeeds and the route list includes `/projects/[projectId]/katalog`.

Then start the dev server (`npm run dev`) and, signed in as a member of a project, open `/projects/<id>/katalog`. Expected: the header shows „Katalog" and the article count, the search pill and the create row are visible, and every article of that project is listed alphabetically with its defaults sub line. (If Google OAuth is unavailable in this environment, note it and defer to Task 9's checklist.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[projectId]/katalog/page.tsx" \
        "src/app/projects/[projectId]/katalog/page.module.css" \
        "src/app/projects/[projectId]/page.tsx"
git commit -m "feat(ui): Katalog screen with member-level catalog management actions"
```

---

## Task 9: Slice verification, review document and meta-plan update

**Files:**
- Create: `docs/implementation-reviews/slice-10-catalog-management.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

- [ ] **Step 1: Run the full suite, lint and build**

```bash
npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'
npm run lint
npm run build
```

Expected: all tests pass (~54 new: 7 plural + 28 in `manage.test.ts` + 9 panel + 10 browser, on top of the 328 from Slice 14 → roughly 382 in 50 files — record the REAL numbers). `npm run lint` must show no NEW findings in `src/`; the pre-existing errors in `docs/design/2026-08-01-ui-handoff/support.js` stay. `npm run build` succeeds.

- [ ] **Step 2: Manual browser pass**

`npm run dev`, signed in as a member of a project that has a catalog. Work through this list and record the result of each item:

1. `/projects/<id>` shows the „Katalog" link; it opens `/projects/<id>/katalog`.
2. The header reads „Katalog" with the correct „N Artikel" count; the back arrow returns to the project.
3. Articles are listed alphabetically (check an umlaut name — „Äpfel" must sort next to „Apfel", not after „Zucker"), each with „Kategorie · Einheit", „Kategorie", „Einheit" or „Keine Vorgaben".
4. Typing in the search field filters live; „MIL" finds „Milch"; a substring in the middle of a name matches; a nonsense query shows „Keine Treffer für „…"."
5. Tapping a row replaces it with the edit panel showing the current name and defaults.
6. Changing the name + both defaults and pressing „Speichern" closes the panel and shows the new values in the row.
7. Renaming an article to another article's name (in a different spelling, e.g. „ MILCH ") keeps the panel open, paints the name field red and shows „Artikel existiert bereits". The other article is unchanged.
8. Emptying „Standard-Kategorie" and saving clears it — the row's sub line drops that half.
9. „Abbrechen" closes the panel without saving.
10. For an article that is on at least one list (create one if needed): no „Löschen" button, and the note „Löschen nicht möglich — wird in N Listen verwendet." with the right count and the right singular/plural. Check that a **completed** list also counts.
11. For an article on no list: „Löschen" opens the confirmation sheet („Artikel löschen: <Name>"); Escape and „Abbrechen" both close it without deleting; confirming removes the article and the row disappears.
12. Favourite an unused article on the project page, return to the catalog: the panel shows „Ist ein Favorit — wird beim Löschen auch aus den Favoriten entfernt."; deleting it also removes it from Favoriten on the project page.
13. Creating a brand-new article with the ＋ button adds it and opens its panel immediately; creating one that already exists shows „Artikel existiert bereits" next to the create field and creates nothing.
14. In a project with an empty catalog: the empty state „Der Katalog füllt sich von selbst" with its sentence and the create row, and **no** search field. Creating the first article there switches the screen to the list view.
15. A member who is not in the project (or a made-up project id) is redirected to `/projects`.
16. Narrow the viewport to ~375px: no horizontal scroll; the panel's Kategorie/Einheit row still fits.
17. No hydration warning in the console on this route.

- [ ] **Step 3: Write the review document**

Create `docs/implementation-reviews/slice-10-catalog-management.md` in English, covering the five mandatory sections from CLAUDE.md:

1. **What was achieved** — the slice goal (the catalog becomes visible and editable: list, search, create, rename with collision check, edit defaults, guarded delete) and whether it was fully met.
2. **Steps taken** — one short paragraph per task above.
3. **Core components built** — `formatArticleCount`/`formatUsedInLists`/`formatArticleDefaults`, `CatalogArticle`/`listCatalog`, `createCatalogArticle`, `updateCatalogArticle`, `deleteCatalogArticle`/`countListsUsingArticle`, `formState.ts`, `CatalogEditPanel`, `CatalogBrowser`, the `katalog` page — one sentence each.
4. **Most important lines of code** — quote 5–10 blocks with an explanation. Strong candidates: the `new Set(item.listItems.map(...)).size` distinct count (why lists, not entries); `if (normalizedName !== article.normalizedName)` (why re-spelling one's own name is not a collision); `toDefaultValue` next to `flowBackCatalogDefaults` (why one clears and the other must not); the `usedInListCount > 0` guard together with the `onDelete: Cascade` on `ListItem.catalogItemId` (what it actually prevents); `rethrowAsDuplicate` (pre-check for the message, DB constraint for the truth); `error={editState.articleId === article.id ? editState.error : null}` (why an error is scoped to one article); and `toFormState`'s `throw error` for non-`ApiError`s (why a bug must not be disguised as a validation message).
5. **Architecture contribution** — this slice adds the first *explicit* catalog write path next to Slice 4's implicit one, and the first screen whose interactivity lives in a client component while the data still comes from the server; it delivers the catalog screen Slice 11's drawer will link to, and its `PageHeader` `leading` slot is where the drawer trigger replaces the back link.

- [ ] **Step 4: Update the meta plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

1. In the slice table, set row **10**'s status to `✅ Done / verified` and replace `_to be created_` in its Plan column with a link to `2026-08-02-slice-10-catalog-management.md`.
2. In the "UI handoff note (2026-08-01)", change the trailing sentence `**Slice 10 (Katalog-Verwaltung) is the next open slice** (plan still to be created).` to name **Slice 11 (App structure + navigation)**.
3. Prepend a new progress-log entry above the Slice 14 entry, using the maintenance guide's template:

```markdown
### 2026-08-02 — Slice 10: Catalog management — ✅ Done / verified
- **Delivered:** …
- **Tested:** … (the real numbers from Step 1 + the 17-item manual checklist)
- **Deviations from the plan:** …
- **Follow-up decisions for later slices:** …
- **Inherited open items:** …
- **Commit(s):** …
```

Fill in the real content. Items that belong under **Follow-up decisions** if they hold true after implementation:
- `src/lib/catalog/manage.ts` is the **explicit** catalog path (duplicate = error, empty field = clear, delete is guarded); `src/lib/catalog/catalog.ts` stays the **implicit** one (get-or-create, sparse flow-back). Do not merge them.
- Deleting a catalog article is guarded by **distinct list usage across active AND completed lists**, because `ListItem.catalogItemId` cascades and completed lists feed the suggestion statistic. Any future bulk-delete or project-cleanup feature must re-use `countListsUsingArticle`.
- The Katalog screen is the app's first **client component holding view state while the data stays server-owned** (`articles` as props + `revalidatePath`). Slices 11 and 12 should follow this split rather than fetching on the client.
- `PageHeader`'s `leading` slot on this screen currently holds a back link — **Slice 11 replaces it with the ☰ drawer trigger** and removes the „Katalog" link from the project page.
- Catalog management ships **no REST endpoints** (Slice 9 precedent). `src/lib/catalog/manage.ts` is the seam if one is ever needed.
- `formatUsedInLists` is the single source of the „wird in N Listen verwendet" wording, shared by the panel note and the delete guard's `ApiError`.

And under **Inherited open items**: Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0; overlapping polls; cancelled-before-JSON race) remain open. **Slice 11 (App structure + navigation) is next** (plan still to be created).

- [ ] **Step 5: Commit**

```bash
git add docs/implementation-reviews/slice-10-catalog-management.md \
        docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md \
        docs/superpowers/plans/2026-08-02-slice-10-catalog-management.md
git commit -m "docs: Slice 10 implementation review + meta-plan progress log"
```

---

## Out of scope for this slice (deliberately)

State these in the review so the next agent does not go looking for them:

- **The ☰ drawer / sidebar and the project switcher** — Slice 11. Until then the screen is reached through a plain link on the un-restyled project page, and its header carries a back link instead of the hamburger.
- **Restyling the project detail screen** — Slice 11. This slice adds exactly one line to it.
- **Merging two articles on a rename collision.** The design specifies an error, not a merge. Merging would have to move every `ListItem` of the losing article and reconcile favourites — its own capability with its own rules, if it is ever wanted at all.
- **Autocomplete changes.** `searchCatalog` keeps its prefix match and its `take` cap; the Katalog screen's substring filter is a separate, client-side rule and does not touch the `<datalist>` path or `GET /api/projects/:id/catalog`.
- **Editing `suggestionRuleN` / `suggestionRuleM`** — still not settable through any screen (noted in the Slice 5 log); this slice does not change that.
- **Quantity parsing** — Slice 15. **Per-row remote flash** — Slice 16. **PWA polish** — Slice 8.
