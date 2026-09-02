# Slice 15 — Quantity parsing in the entry row — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing „1,5 l Milch" or „3 Joghurt" into the trailing entry row creates an entry with Menge **1,5** / Einheit **l** / Artikel **Milch** — while the project catalog only ever learns the article name.

**Architecture:** A pure, catalog-blind parser (`parseEntryInput`) peels a leading quantity and a known unit off the typed text. The parse runs **on the server**, inside `addEntryFromRow`, so it is the single source of truth for every transport (Server Action today, the Phase 2 offline queue later). Two rules make it safe: a **catalog escape hatch** — text that already names an existing article („7 Zwerge Bier") is never parsed — and a **flow-back suppression** — a *guessed* unit sets the entry but must never rewrite the project's catalog memory, which stays reserved for a unit the user chose in the entry sheet. The client re-uses the same pure function for one cosmetic job only: stripping the quantity prefix before querying the autocomplete dropdown.

**Tech Stack:** Next.js App Router (Server Actions), TypeScript, Prisma / Neon Postgres, Vitest (+ jsdom & Testing Library for the component task). No new dependencies.

## Global Constraints

- **Implementation docs, code identifiers and code comments: English. In-app user-facing strings stay German.** (CLAUDE.md § Language convention.)
- **Meticulous inline comments are mandatory.** Every function gets a comment saying what it does *and why it exists*; every non-obvious block gets a *why* comment. Do not remove or thin out existing comments when editing a file. (CLAUDE.md § Code documentation standard.)
- **The catalog only ever receives the article name** — never the parsed quantity. This is the rule the meta plan says "must survive" this slice.
- **A parsed unit never flows back into `CatalogItem.defaultUnit`.** Flow-back stays reserved for an explicit edit in the entry sheet, where the user sees the hint „Kategorie und Einheit werden als neuer Standard im Katalog gemerkt."
- **Mutations stay entry/field-granular and go through `applyOperation`.** No new write path, no direct `listItem.update` outside the operations funnel. (MVP design §4.5.)
- **Styling: CSS Modules only. Icons: `lucide-react` through `Icon`.** No new UI primitives are needed in this slice.
- **Component tests** start with `// @vitest-environment jsdom`, use Testing Library, and assert roles and text — never CSS-Module class names.
- **Tests run against the Neon `test` branch via `.env.test`.** Never copy `.env`'s `DATABASE_URL` into `.env.test`.
- **German decimal comma** everywhere the user sees or types a number (`1,5`), per handoff §2.
- Commit after every task with a Conventional-Commits message.

## Decisions locked before writing this plan

The handoff specifies the feature in one sentence and two examples, so four open questions were answered by the owner on 2026-09-02:

| # | Question | Ruling |
|---|----------|--------|
| 1 | Where does the parse run? | **Server, in `addEntryFromRow`.** One source of truth, survives a future offline-queue replay. The client imports the same pure function only to strip the prefix before querying autocomplete. |
| 2 | What counts as a known unit? | **Fixed German base list ∪ the project's own `defaultUnit` values.** A project that already says „Kiste" gets it recognised for free. |
| 3 | Does a parsed unit flow back? | **No.** A guess must not rewrite the project's shared memory. |
| 4 | How is ambiguity handled? | **Conservative.** Parse only when an article name survives; a raw text that already names a catalog article is never parsed. |

Rule 4 in full, as a table the parser tests mirror exactly:

```
"1,5 l Milch"   → 1.5 · "l"  · "Milch"
"500g Mehl"     → 500 · "g"  · "Mehl"      (no space needed)
"2 Liter Milch" → 2   · "l"  · "Milch"     (alias canonicalised)
"3 Joghurt"     → 3   · null · "Joghurt"   (leading number, no known unit)
"3 l"           → null· null · "3 l"       (nothing left to name the article)
"3"             → null· null · "3"
"0 Milch"       → null· null · "0 Milch"   (quantity must be > 0)
"1,5,5 Milch"   → null· null · "1,5,5 Milch"
"Milch"         → null· null · "Milch"
"7 Zwerge Bier" → 7   · null · "Zwerge Bier"  — UNLESS the raw text already names
                                                a catalog article, which the SERVER
                                                checks (the parser is catalog-blind)
```

**Known, deliberate cuts** (document them, do not implement them):
- Plural handling is limited to the aliases hardcoded in `BASE_UNIT_ALIASES` („Dosen" → „Dose"). An unlisted plural simply yields a bare count, which is a harmless outcome.
- `„2x Milch"` is not special-cased; the `x` becomes part of the name.
- The „7 Zwerge Bier" escape hatch only fires once the article **exists**. The very first time that name is typed it is parsed into `7 · "Zwerge Bier"`; the user fixes it in the entry sheet, and every later add is then protected.

---

## File Structure

| File | Responsibility |
|------|----------------|
| **Create** `src/lib/lists/parseEntryInput.ts` | The whole heuristic: `BASE_UNIT_ALIASES`, `buildUnitLookup`, `parseEntryInput`. Pure and DB-free, so both the server action and the client component can import it. Lives in `lib/lists/` (not `lib/format/`) because it is list-domain vocabulary — the sibling of `categories.ts`'s `knownCategories`. |
| **Create** `src/lib/lists/parseEntryInput.test.ts` | The rule table above, one `it` per row. Node environment, no DB. |
| **Modify** `src/lib/lists/operations.ts` | `AddItemOperation` gains the in-process-only `unitIsGuess` flag; the `add_item` branch suppresses unit flow-back when it is set. |
| **Modify** `src/lib/lists/operations.test.ts` | Guessed-vs-chosen unit flow-back, and proof the flag cannot arrive over the wire. |
| **Modify** `src/lib/lists/addEntry.ts` | Wires the parser in: catalog escape hatch, project unit lookup, parsed name/quantity/unit into `add_item`. |
| **Modify** `src/lib/lists/addEntry.test.ts` | The server-side behaviour of the whole feature. |
| **Modify** `src/app/lists/[listId]/ListBody.tsx` | Widens the `articles` prop with `defaultUnit`; strips the prefix for the autocomplete query; re-attaches it when the user taps a dropdown row. |
| **Modify** `src/app/lists/[listId]/ListBody.test.tsx` | Updates the article fixture, adds the four client behaviours. |
| **Create** `docs/implementation-reviews/slice-15-quantity-parsing.md` | Definition of Done (CLAUDE.md § Implementation review). |
| **Modify** `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` | Status row + progress-log entry. |

`src/app/lists/[listId]/page.tsx` needs **no change**: it already passes `catalog` (a `CatalogSuggestion[]`, which carries `defaultUnit`) into `ListBody`, and `addEntryAction` already forwards the raw typed text as `name`. Task 4 verifies this rather than editing it.

---

## Task 1: The pure parser

**Files:**
- Create: `src/lib/lists/parseEntryInput.ts`
- Test: `src/lib/lists/parseEntryInput.test.ts`

**Interfaces:**
- Consumes: `parseGermanDecimal(raw: string): number | null` from `@/lib/format/quantity`.
- Produces:
  - `type UnitLookup = Record<string, string>` — lowercase alias → canonical display unit.
  - `buildUnitLookup(catalogUnits: (string | null)[]): UnitLookup`
  - `interface ParsedEntryInput { quantity: number | null; unit: string | null; name: string }`
  - `parseEntryInput(raw: string, units: UnitLookup): ParsedEntryInput`

- [ ] **Step 1: Write the failing test**

Create `src/lib/lists/parseEntryInput.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildUnitLookup, parseEntryInput } from "./parseEntryInput";

// The base vocabulary alone — most cases need no project units at all.
const units = buildUnitLookup([]);

describe("buildUnitLookup", () => {
  it("resolves a base alias to its canonical display form", () => {
    expect(units["liter"]).toBe("l");
    expect(units["stück"]).toBe("Stk");
  });

  it("adds the project's own catalog units and ignores blanks", () => {
    const lookup = buildUnitLookup(["Kiste", null, "   "]);
    expect(lookup["kiste"]).toBe("Kiste");
  });

  // A project whose catalog happens to hold „Liter" must still render „1,5 l" (handoff §2).
  it("lets the base list win over a project unit with the same spelling", () => {
    expect(buildUnitLookup(["Liter"])["liter"]).toBe("l");
  });
});

describe("parseEntryInput", () => {
  it("splits a decimal quantity, a known unit and the article name", () => {
    expect(parseEntryInput("1,5 l Milch", units)).toEqual({
      quantity: 1.5,
      unit: "l",
      name: "Milch",
    });
  });

  it("parses a unit glued to the number", () => {
    expect(parseEntryInput("500g Mehl", units)).toEqual({
      quantity: 500,
      unit: "g",
      name: "Mehl",
    });
  });

  it("accepts a dot decimal as well as the German comma", () => {
    expect(parseEntryInput("1.5 l Milch", units)).toEqual({
      quantity: 1.5,
      unit: "l",
      name: "Milch",
    });
  });

  it("canonicalises the unit's spelling and case", () => {
    expect(parseEntryInput("2 Liter Milch", units)).toEqual({
      quantity: 2,
      unit: "l",
      name: "Milch",
    });
    expect(parseEntryInput("250G Butter", units)).toEqual({
      quantity: 250,
      unit: "g",
      name: "Butter",
    });
  });

  it("takes a leading number without a known unit as a bare count", () => {
    expect(parseEntryInput("3 Joghurt", units)).toEqual({
      quantity: 3,
      unit: null,
      name: "Joghurt",
    });
  });

  it("recognises a unit the project's own catalog contributed", () => {
    expect(parseEntryInput("2 Kisten Wasser", buildUnitLookup(["Kisten"]))).toEqual({
      quantity: 2,
      unit: "Kisten",
      name: "Wasser",
    });
  });

  it("trims and collapses whitespace like the catalog's name rule", () => {
    expect(parseEntryInput("  2   kg   Rote  Paprika ", units)).toEqual({
      quantity: 2,
      unit: "kg",
      name: "Rote Paprika",
    });
  });

  // --- the conservative refusals -------------------------------------------

  it("does not parse when nothing would be left to name the article", () => {
    expect(parseEntryInput("3 l", units)).toEqual({ quantity: null, unit: null, name: "3 l" });
  });

  it("does not parse a bare number", () => {
    expect(parseEntryInput("3", units)).toEqual({ quantity: null, unit: null, name: "3" });
  });

  it("does not parse a zero or negative quantity", () => {
    expect(parseEntryInput("0 Milch", units)).toEqual({
      quantity: null,
      unit: null,
      name: "0 Milch",
    });
    expect(parseEntryInput("-3 Milch", units)).toEqual({
      quantity: null,
      unit: null,
      name: "-3 Milch",
    });
  });

  it("does not parse a malformed decimal", () => {
    expect(parseEntryInput("1,5,5 Milch", units)).toEqual({
      quantity: null,
      unit: null,
      name: "1,5,5 Milch",
    });
  });

  it("leaves a plain name untouched", () => {
    expect(parseEntryInput("Milch", units)).toEqual({
      quantity: null,
      unit: null,
      name: "Milch",
    });
  });

  it("leaves an empty input empty rather than inventing a name", () => {
    expect(parseEntryInput("   ", units)).toEqual({ quantity: null, unit: null, name: "" });
  });

  // The escape hatch for „7 Zwerge Bier" lives in addEntryFromRow (Task 3), not here:
  // this function is deliberately catalog-blind so it stays pure and DB-free.
  it("still splits a number off a name that only looks like an article", () => {
    expect(parseEntryInput("7 Zwerge Bier", units)).toEqual({
      quantity: 7,
      unit: null,
      name: "Zwerge Bier",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/lists/parseEntryInput.test.ts`
Expected: FAIL — `Failed to resolve import "./parseEntryInput"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/lists/parseEntryInput.ts`:

```ts
import { parseGermanDecimal } from "@/lib/format/quantity";

/**
 * The trailing entry row's quantity heuristic (handoff §10: „Mengen-Parsing
 * ‚1,5 l Milch' / ‚3 Joghurt': führende Zahl + bekannte Einheit werden in
 * Menge/Einheit gelöst, der Katalog bekommt nur den Artikelnamen").
 *
 * WHY a pure function with the unit vocabulary passed IN rather than a module
 * that reads the catalog itself: the vocabulary is per-project (ruling 2), but
 * the splitting rule is not. Keeping the DB read at the caller makes every rule
 * below testable as a table without a database, and lets the client component
 * re-use the exact same rule for its dropdown query (Task 4).
 *
 * WHY conservative (ruling 4): this heuristic runs on EVERY add, and a wrong
 * split silently renames the user's article. Every ambiguous case therefore
 * falls back to "the whole string is the name", which is never wrong, only
 * unhelpful — the user can still set Menge/Einheit in the entry sheet.
 */

/**
 * Lowercase alias → canonical display unit.
 *
 * The values are what the entry row will print („1,5 l"), so they carry the
 * spelling and case the design asks for; the keys are every spelling a German
 * household actually types. Common plurals are listed explicitly rather than
 * stemmed: a lookup table is obvious and cheap, while a stemmer would guess.
 */
const BASE_UNIT_ALIASES: Record<string, string> = {
  // Weight
  g: "g",
  gramm: "g",
  kg: "kg",
  kilo: "kg",
  kilogramm: "kg",
  // Volume
  ml: "ml",
  milliliter: "ml",
  cl: "cl",
  l: "l",
  liter: "l",
  // Packaging and count
  stk: "Stk",
  stück: "Stk",
  stueck: "Stk",
  pck: "Packung",
  pkg: "Packung",
  packung: "Packung",
  packungen: "Packung",
  dose: "Dose",
  dosen: "Dose",
  flasche: "Flasche",
  flaschen: "Flasche",
  glas: "Glas",
  gläser: "Glas",
  becher: "Becher",
  bund: "Bund",
  beutel: "Beutel",
  tüte: "Tüte",
  tüten: "Tüte",
  rolle: "Rolle",
  rollen: "Rolle",
  tafel: "Tafel",
  tafeln: "Tafel",
  scheibe: "Scheibe",
  scheiben: "Scheibe",
  kiste: "Kiste",
  kisten: "Kiste",
  karton: "Karton",
  // Cooking
  tl: "TL",
  el: "EL",
  prise: "Prise",
  // Length
  m: "m",
  cm: "cm",
};

/** Lowercase alias → the unit as it should be stored and displayed. */
export type UnitLookup = Record<string, string>;

/**
 * The unit vocabulary for ONE project: the base list above unioned with every
 * `defaultUnit` the project's catalog already uses (ruling 2).
 *
 * WHY the project's own units join in: the catalog is the project's memory
 * (MVP design §4.4). A household that has been writing „Kiste" for months has
 * already taught the app that word, and the parser should not need a code
 * change to hear it.
 *
 * WHY the base list is spread LAST, i.e. wins a collision: a project whose
 * catalog holds „Liter" must still render the design's „1,5 l" (handoff §2).
 * Project units therefore only ever ADD keys, they never re-spell a known one.
 */
export function buildUnitLookup(catalogUnits: (string | null)[]): UnitLookup {
  const fromCatalog: UnitLookup = {};
  for (const raw of catalogUnits) {
    // The column is nullable free text, so blanks and stray spaces are real.
    const trimmed = raw?.trim();
    if (trimmed) fromCatalog[trimmed.toLowerCase()] = trimmed;
  }
  return { ...fromCatalog, ...BASE_UNIT_ALIASES };
}

/** What the typed text resolves to. `name` is the ONLY part the catalog sees. */
export interface ParsedEntryInput {
  quantity: number | null;
  unit: string | null;
  /** The article name. Trimmed and space-collapsed, never empty unless the input was. */
  name: string;
}

/**
 * A leading number, optionally glued to what follows.
 *
 * The lookahead is the load-bearing part: it forbids another digit, comma or dot
 * right after the number, so „1,5,5 Milch" fails to match instead of yielding a
 * quantity of 1,5 and an article named „,5 Milch". `\s*` makes the space
 * optional so „500g Mehl" parses exactly like „500 g Mehl".
 */
const LEADING_NUMBER = /^(\d+(?:[.,]\d+)?)\s*(?=[^\d.,]|$)(.*)$/;

/**
 * Splits typed text into quantity, unit and article name.
 *
 * Never throws and never returns an empty name for a non-empty input: every
 * refusal returns the cleaned-up original as the name, which is exactly what the
 * row did before this slice existed.
 */
export function parseEntryInput(raw: string, units: UnitLookup): ParsedEntryInput {
  // Same cleanup the catalog applies to a display name (normalizeName's visible
  // half), so the name this returns is already the one the catalog will store.
  const text = raw.trim().replace(/\s+/g, " ");
  // The "refused" answer, built once: every early return below is this value.
  const unparsed: ParsedEntryInput = { quantity: null, unit: null, name: text };

  const match = LEADING_NUMBER.exec(text);
  if (!match) return unparsed;
  const [, numberText, rest] = match;

  // parseGermanDecimal is the SAME reader the entry sheet's MENGE field uses, so
  // „1,5" means one-and-a-half in both places (DRY, and no second comma rule).
  const quantity = parseGermanDecimal(numberText);
  // `applyOperation`'s assertValidQuantity rejects <= 0 with a German message.
  // Refusing here instead means „0 Ahnung" becomes an article, not an error.
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) return unparsed;
  // „3" alone: a number is not an entry, and an empty name would be rejected
  // downstream anyway. The user most likely has not finished typing.
  if (!rest) return unparsed;

  // The unit can only be the FIRST token of the remainder — „1,5 Milch l" is not
  // a thing anyone types, and scanning further would invite false positives.
  const [firstToken, ...others] = rest.split(" ");
  const unit = units[firstToken.toLowerCase()] ?? null;

  // No known unit → a bare count („3 Joghurt"). The rest is the article name.
  if (unit === null) return { quantity, unit: null, name: rest };

  const name = others.join(" ");
  // „3 l": the unit consumed everything, so there is no article left to name.
  // Refusing entirely is better than creating an article called „l".
  if (!name) return unparsed;

  return { quantity, unit, name };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/lists/parseEntryInput.test.ts`
Expected: PASS — 17 tests (3 for `buildUnitLookup`, 14 for `parseEntryInput`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/parseEntryInput.ts src/lib/lists/parseEntryInput.test.ts
git commit -m "feat(lists): pure quantity parser for the trailing entry row"
```

---

## Task 2: A guessed unit must not rewrite catalog memory

Today `add_item` flows an explicitly supplied `unit` back into `CatalogItem.defaultUnit`. Task 3 will supply a *parsed* unit, and ruling 3 says a guess must not become the project's default. This task adds the opt-out — independently testable, and worth its own commit because it changes the meaning of an operation field.

**Files:**
- Modify: `src/lib/lists/operations.ts` (the `AddItemOperation` interface ~line 19–26, and the flow-back call in the `add_item` branch ~line 258–262)
- Test: `src/lib/lists/operations.test.ts` (append to the existing `describe("catalog flow-back", …)` block at the end of the file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AddItemOperation` gains `unitIsGuess?: boolean`. Semantics: when `true`, `unit` is still written to the entry, but the unit half of the catalog flow-back is skipped. `parseOperation` never sets it, so it cannot arrive over the wire.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/lists/operations.test.ts`, inside the existing `describe("catalog flow-back", …)` block (add the `AddItemOperation` type import at the top of the file: `import { applyOperation, parseOperation, type AddItemOperation } from "./operations";`):

```ts
  // Slice 15: „1,5 l Milch" guesses the unit. The entry gets it, the project's
  // shared memory does not — flow-back stays reserved for a user's own choice.
  it("sets a GUESSED unit on the entry without touching the catalog default", async () => {
    const item = await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Milch",
      quantity: 1.5,
      unit: "l",
      unitIsGuess: true,
    });

    expect(item!.unit).toBe("l");
    expect(item!.quantity).toBe(1.5);
    const article = await db.catalogItem.findFirstOrThrow({ where: { projectId } });
    expect(article.defaultUnit).toBeNull();
  });

  it("still flows a user-CHOSEN unit back into the catalog default", async () => {
    await applyOperation(db, list, {
      op: "add_item",
      itemId: randomUUID(),
      name: "Milch",
      unit: "l",
    });

    const article = await db.catalogItem.findFirstOrThrow({ where: { projectId } });
    expect(article.defaultUnit).toBe("l");
  });

  // The flag is an in-process hint, not part of the wire contract: a client must
  // not be able to write a unit that quietly skips the project's catalog memory.
  it("never accepts unitIsGuess from an untrusted body", () => {
    const op = parseOperation({
      op: "add_item",
      itemId: randomUUID(),
      name: "Milch",
      unit: "l",
      unitIsGuess: true,
    }) as AddItemOperation;

    expect(op.unitIsGuess).toBeUndefined();
    expect(op.unit).toBe("l");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/lists/operations.test.ts -t "GUESSED"`
Expected: FAIL — TypeScript rejects `unitIsGuess` as an unknown property on `AddItemOperation` (and, once that is silenced, `defaultUnit` would be `"l"` rather than `null`).

- [ ] **Step 3: Write the implementation**

In `src/lib/lists/operations.ts`, extend the interface:

```ts
export interface AddItemOperation {
  op: "add_item";
  itemId: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  /**
   * Slice 15: the unit was GUESSED by the entry-row parser, not chosen by the
   * user. The entry still gets it, but the catalog flow-back skips the unit —
   * the project's shared default may only be rewritten by a deliberate edit in
   * the entry sheet, where the user reads „…werden als neuer Standard im
   * Katalog gemerkt".
   *
   * IN-PROCESS ONLY: `parseOperation` builds its result from a fixed set of
   * fields and never copies this one, so an untrusted body cannot set it. That
   * is deliberate — over the wire, a supplied unit means "the user chose it".
   */
  unitIsGuess?: boolean;
}
```

Then, in the `add_item` branch of `applyOperation`, change the flow-back call (keep the whole existing comment above it and extend it):

```ts
      // Flow-back (Slice 4, MVP design §4.4): a category/unit the user supplied EXPLICITLY at add
      // time becomes the catalog default, so future lists inherit it. Inherited values arrive as
      // undefined; explicit clears arrive as null — both are skipped by the helper (`!= null`),
      // so this never writes a default back onto itself or erases shared catalog memory. Runs only
      // on first creation (replays returned early above), keeping add idempotent.
      await flowBackCatalogDefaults(db, catalogItem.id, {
        category: operation.category,
        // Slice 15: a PARSED unit is a guess about text, not a decision. Passing
        // `undefined` makes the helper treat it exactly like an inherited value
        // and leave the catalog default alone.
        unit: operation.unitIsGuess ? undefined : operation.unit,
      });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/lists/operations.test.ts`
Expected: PASS — the whole file, including the three new cases and every pre-existing flow-back test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lists/operations.ts src/lib/lists/operations.test.ts
git commit -m "feat(lists): add_item can mark a unit as guessed and skip flow-back"
```

---

## Task 3: Wire the parser into `addEntryFromRow`

**Files:**
- Modify: `src/lib/lists/addEntry.ts` (the whole `addEntryFromRow` body, lines 44–84)
- Test: `src/lib/lists/addEntry.test.ts` (append a new `describe` block; the existing 10 tests must keep passing untouched)

**Interfaces:**
- Consumes: `parseEntryInput`, `buildUnitLookup` (Task 1); `AddItemOperation.unitIsGuess` (Task 2); the existing `normalizeName`, `applyOperation`, `UNCATEGORIZED_LABEL`.
- Produces: no signature change. `addEntryFromRow(db, list, { itemId, name, activeCategory })` still returns `{ item, needsCategory }` — the parse is entirely internal, which is why `page.tsx` needs no edit.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/lists/addEntry.test.ts`:

```ts
describe("addEntryFromRow — quantity parsing (Slice 15)", () => {
  it("splits a leading quantity and unit out of the typed text", async () => {
    const { project, list } = await seed();

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1,5 l Milch",
      activeCategory: null,
    });

    expect(item.quantity).toBe(1.5);
    expect(item.unit).toBe("l");
    // THE rule of this slice: the catalog only ever receives the article NAME.
    const article = await db.catalogItem.findFirstOrThrow({ where: { projectId: project.id } });
    expect(article.name).toBe("Milch");
  });

  it("does not write a parsed unit back into the catalog default", async () => {
    const { project, list } = await seed();

    await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1,5 l Milch",
      activeCategory: null,
    });

    const article = await db.catalogItem.findFirstOrThrow({ where: { projectId: project.id } });
    expect(article.defaultUnit).toBeNull();
  });

  it("takes a leading number without a unit as a bare count", async () => {
    const { project, list } = await seed();

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "3 Joghurt",
      activeCategory: null,
    });

    expect(item.quantity).toBe(3);
    expect(item.unit).toBeNull();
    const article = await db.catalogItem.findFirstOrThrow({ where: { projectId: project.id } });
    expect(article.name).toBe("Joghurt");
  });

  // No parsed unit means "not supplied", which is what lets the catalog default
  // through — the same `undefined` vs `null` distinction add_item already uses.
  it("inherits the catalog's default unit when the text carries no unit", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: {
        projectId: project.id,
        name: "Joghurt",
        normalizedName: "joghurt",
        defaultUnit: "Becher",
      },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "3 Joghurt",
      activeCategory: null,
    });

    expect(item.quantity).toBe(3);
    expect(item.unit).toBe("Becher");
  });

  it("recognises a unit the project's own catalog contributed", async () => {
    const { project, list } = await seed();
    // „Kiste" is not in the base vocabulary — the project taught it.
    await db.catalogItem.create({
      data: { projectId: project.id, name: "Bier", normalizedName: "bier", defaultUnit: "Kiste" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "2 Kiste Wasser",
      activeCategory: null,
    });

    expect(item.quantity).toBe(2);
    expect(item.unit).toBe("Kiste");
    const article = await db.catalogItem.findFirstOrThrow({
      where: { projectId: project.id, normalizedName: "wasser" },
    });
    expect(article.name).toBe("Wasser");
  });

  // The escape hatch (ruling 4): an article that ALREADY exists under a name
  // starting with a number must never be shredded by the parser.
  it("leaves a known article that starts with a number intact", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: { projectId: project.id, name: "7 Zwerge Bier", normalizedName: "7 zwerge bier" },
    });

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "7 Zwerge Bier",
      activeCategory: null,
    });

    expect(item.quantity).toBeNull();
    expect(item.unit).toBeNull();
    // No second article was invented for „Zwerge Bier".
    expect(await db.catalogItem.count({ where: { projectId: project.id } })).toBe(1);
  });

  // needsCategory has to read the article for the PARSED name, not the raw text.
  it("asks for a category using the parsed article name", async () => {
    const { list } = await seed();

    const { needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "2 kg Dübel",
      activeCategory: null,
    });

    expect(needsCategory).toBe(true);
  });

  it("does not ask when the parsed article is already known", async () => {
    const { project, list } = await seed();
    await db.catalogItem.create({
      data: {
        projectId: project.id,
        name: "Milch",
        normalizedName: "milch",
        defaultCategory: "Molkerei",
      },
    });

    const { item, needsCategory } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1,5 l Milch",
      activeCategory: null,
    });

    expect(needsCategory).toBe(false);
    // The catalog default still reaches the entry through the parsed name.
    expect(item.category).toBe("Molkerei");
  });

  // An active chip still wins over everything the parser found.
  it("keeps the active chip's category when the text carries a quantity", async () => {
    const { list } = await seed();

    const { item } = await addEntryFromRow(db, list, {
      itemId: randomUUID(),
      name: "1,5 l Milch",
      activeCategory: "Molkerei",
    });

    expect(item.category).toBe("Molkerei");
    expect(item.unit).toBe("l");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/lists/addEntry.test.ts`
Expected: FAIL — the new cases report `item.quantity` `null` and the catalog article named „1,5 l Milch"; the 10 pre-existing cases still pass.

- [ ] **Step 3: Write the implementation**

Replace the body of `addEntryFromRow` in `src/lib/lists/addEntry.ts`. Keep the existing file-level doc comment and extend its numbered list to three decisions:

```ts
import type { List, ListItem, PrismaClient } from "@prisma/client";
import { normalizeName } from "@/lib/catalog/normalize";
import { UNCATEGORIZED_LABEL } from "./categories";
import { applyOperation } from "./operations";
import { buildUnitLookup, parseEntryInput } from "./parseEntryInput";
```

```ts
export async function addEntryFromRow(
  db: PrismaClient,
  list: List,
  input: AddEntryFromRowInput,
): Promise<AddEntryFromRowResult> {
  const rawNormalized = normalizeName(input.name);

  // Two independent reads → Promise.all: the add path runs on a phone, so this
  // stays ONE round-trip rather than two sequential ones.
  const [rawArticle, catalogUnits] = await Promise.all([
    // The RAW text may itself name an article („7 Zwerge Bier"). Reading this
    // BEFORE anything else serves two purposes: it is the parser's escape hatch,
    // and it is the "was this article known?" answer add_item would destroy by
    // creating the article as a side effect.
    rawNormalized
      ? db.catalogItem.findUnique({
          where: { projectId_normalizedName: { projectId: list.projectId, normalizedName: rawNormalized } },
        })
      : null,
    // The project's own unit vocabulary (Slice 15 ruling 2). `distinct` keeps
    // this proportional to the number of DIFFERENT units, not to catalog size.
    db.catalogItem.findMany({
      where: { projectId: list.projectId, defaultUnit: { not: null } },
      select: { defaultUnit: true },
      distinct: ["defaultUnit"],
    }),
  ]);

  // ESCAPE HATCH: if the raw text already names an article, the user is adding
  // THAT article — parsing it would shred „7 Zwerge Bier" into 7 × „Zwerge Bier"
  // and quietly split the project's catalog in two.
  const parsed = rawArticle
    ? { quantity: null, unit: null, name: input.name }
    : parseEntryInput(input.name, buildUnitLookup(catalogUnits.map((row) => row.defaultUnit)));

  // The article that decides `needsCategory` is the one for the EFFECTIVE name.
  // When the parser changed nothing, the lookup above already answered this —
  // re-querying the identical key would be a wasted round-trip on the hot path.
  const parsedNormalized = normalizeName(parsed.name);
  const knownArticle =
    rawArticle ??
    (parsedNormalized === rawNormalized || !parsedNormalized
      ? null
      : await db.catalogItem.findUnique({
          where: { projectId_normalizedName: { projectId: list.projectId, normalizedName: parsedNormalized } },
        }));

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
    // ONLY the article name reaches the catalog — the rule this slice exists to
    // preserve. An empty name still travels: getOrCreateCatalogItem owns that
    // error („Name darf nicht leer sein"), and duplicating it here would drift.
    name: parsed.name,
    // `undefined` = "not supplied" → inherit the catalog default. `null` from the
    // parser means "found nothing", which is the same thing, so both collapse to
    // undefined rather than to an explicit clear.
    quantity: parsed.quantity ?? undefined,
    unit: parsed.unit ?? undefined,
    // A parsed unit is a guess about text, so it must not become the project's
    // default (Slice 15 ruling 3; the flag is Task 2's).
    unitIsGuess: parsed.unit !== null,
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

Also update the doc comment above `AddEntryFromRowInput.name` — it currently reads „Exactly what the user typed. The catalog only ever receives the NAME."; extend it to note that this text may still carry a leading quantity, which this function resolves.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/lists/addEntry.test.ts`
Expected: PASS — 19 tests (10 pre-existing + 9 new).

- [ ] **Step 5: Run the neighbouring suites for regressions**

Run: `npx vitest run src/lib/lists src/lib/catalog`
Expected: PASS. `addEntryFromRow` is the trailing row's only server path, so a break here would show up in the list and catalog suites first.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lists/addEntry.ts src/lib/lists/addEntry.test.ts
git commit -m "feat(lists): resolve Menge/Einheit from the typed entry text"
```

---

## Task 4: The trailing row's dropdown and submit

Two client-side jobs, both cosmetic-but-necessary consequences of a server-side parser:

1. **Search the article part.** Typing „1,5 l Mil" must still offer „Milch", and the „…neu anlegen" row must offer *Milch*, not *1,5 l Milch* — otherwise the row promises a catalog article that will never be created under that name.
2. **Keep the quantity when a suggestion is tapped.** The dropdown hands back a bare article name; without re-attaching the typed prefix, tapping „Milch" after typing „1,5 l Mil" would silently drop the 1,5 l. The prefix is re-attached **as text**, so the server stays the only parser.

**Files:**
- Modify: `src/app/lists/[listId]/ListBody.tsx`
- Test: `src/app/lists/[listId]/ListBody.test.tsx`
- Verify (no edit expected): `src/app/lists/[listId]/page.tsx`

**Interfaces:**
- Consumes: `parseEntryInput`, `buildUnitLookup` (Task 1); the existing `formatQuantityLabel` from `@/lib/format/quantity`; `buildAutocomplete` and `AutocompleteArticle` from `@/lib/catalog/autocomplete`.
- Produces: `ListBody`'s `articles` prop type becomes `ListBodyArticle[]` where `type ListBodyArticle = AutocompleteArticle & { defaultUnit: string | null }`. `page.tsx` already passes `CatalogSuggestion[]`, which satisfies it.

- [ ] **Step 1: Update the existing fixture, then write the failing tests**

First, in `src/app/lists/[listId]/ListBody.test.tsx`, add `defaultUnit` to the two fixture articles inside `renderBody` (lines 26–29) — the widened prop type makes it required:

```tsx
    articles: [
      { id: "a1", name: "Milch", defaultCategory: "Molkerei", defaultUnit: null },
      { id: "a2", name: "Milchreis", defaultCategory: null, defaultUnit: null },
    ],
```

Then append a new describe block at the end of the file:

```tsx
describe("ListBody — quantity prefix (Slice 15)", () => {
  it("searches the catalog with the quantity prefix stripped", async () => {
    renderBody();

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "1,5 l Mil");

    // The dropdown found the ARTICLE part…
    expect(screen.getByRole("button", { name: /Milchreis/ })).toBeInTheDocument();
    // …and the create row promises the name the catalog will actually get.
    expect(screen.getByRole("button", { name: "„Mil“ neu anlegen" })).toBeInTheDocument();
  });

  it("sends the raw text on Enter so the server can parse it", async () => {
    const addAction = vi.fn(async () => ENTRY_FORM_IDLE);
    renderBody({ addAction });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "1,5 l Milch{Enter}");

    const formData = addAction.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("1,5 l Milch");
  });

  // Tapping a suggestion must not throw the typed quantity away.
  it("re-attaches the typed quantity when a suggestion is tapped", async () => {
    const addAction = vi.fn(async () => ENTRY_FORM_IDLE);
    renderBody({ addAction });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "1,5 l Mil");
    await userEvent.click(screen.getByRole("button", { name: /Milchreis/ }));

    const formData = addAction.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("1,5 l Milchreis");
  });

  it("leaves a suggestion alone when nothing was parsed", async () => {
    const addAction = vi.fn(async () => ENTRY_FORM_IDLE);
    renderBody({ addAction });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "Milc");
    await userEvent.click(screen.getByRole("button", { name: /Milchreis/ }));

    const formData = addAction.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("Milchreis");
  });

  // The raw text is searched FIRST, so an article whose own name starts with a
  // number still finds itself (the server-side escape hatch's client half).
  it("keeps searching the raw text for an article that starts with a number", async () => {
    renderBody({
      articles: [
        { id: "a1", name: "7 Zwerge Bier", defaultCategory: null, defaultUnit: null },
      ],
    });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "7 Zwerge");

    expect(screen.getByRole("button", { name: /7 Zwerge Bier/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/lists/[listId]/ListBody.test.tsx"`
Expected: FAIL — „1,5 l Mil" produces no dropdown at all (`getByRole` finds no `Milchreis` button), and the tapped-suggestion case posts `"Milchreis"` without the prefix.

- [ ] **Step 3: Write the implementation**

In `src/app/lists/[listId]/ListBody.tsx`:

Add the imports:

```tsx
import { formatQuantityLabel } from "@/lib/format/quantity";
import { buildUnitLookup, parseEntryInput } from "@/lib/lists/parseEntryInput";
```

Widen the article type, just above `ListBodyProps`:

```tsx
/**
 * The catalog shape this screen needs: what the dropdown ranks, plus the unit —
 * the trailing row has to know the project's own unit vocabulary to strip a
 * typed „2 Kisten" prefix off the autocomplete query (Slice 15). `page.tsx`
 * already passes `searchCatalog`'s rows, which carry all four fields.
 */
export type ListBodyArticle = AutocompleteArticle & { defaultUnit: string | null };
```

and change the prop:

```tsx
  /** The project's catalog, for the trailing row's autocomplete. */
  articles: ListBodyArticle[];
```

Replace the single `suggestions` line (currently line 109) with:

```tsx
  // The project's unit vocabulary, rebuilt per render like `buildAutocomplete`
  // below it: both are cheap pure functions over an array the server already
  // handed us, and memoising them would only add a dependency array to get wrong.
  const unitLookup = buildUnitLookup(articles.map((article) => article.defaultUnit));
  // The SAME parser the server runs (addEntryFromRow). Here it is used for two
  // cosmetic jobs only — the server remains the single source of truth for what
  // actually gets stored.
  const parsedDraft = parseEntryInput(draft, unitLookup);

  // Raw text first: an article whose own name starts with a number („7 Zwerge
  // Bier") must still find itself, which mirrors the server's escape hatch. Only
  // when the raw text finds nothing AND the parser peeled a quantity off do we
  // search the article part — that is what makes „1,5 l Mil" offer „Milch" and,
  // just as importantly, makes the „…neu anlegen" row promise the name the
  // catalog will really get.
  const rawSuggestions = buildAutocomplete(articles, draft);
  const suggestions =
    parsedDraft.quantity === null || rawSuggestions.options.length > 0
      ? rawSuggestions
      : buildAutocomplete(articles, parsedDraft.name);
```

Then, inside `addEntry`, insert the re-attach before the `FormData` is filled:

```tsx
  /** The trailing row's submit: one add_item with a client-generated identity. */
  const addEntry = (name: string) => {
    // Enter hands back the raw draft (prefix included); a dropdown tap hands back
    // a bare ARTICLE name, which would silently drop a typed „1,5 l". Re-attach
    // it as TEXT — never as parsed fields — because addEntryFromRow is the only
    // parser and must keep seeing exactly what a user would have typed.
    const prefix = formatQuantityLabel(parsedDraft.quantity, parsedDraft.unit);
    const submitted = prefix && name !== draft.trim() ? `${prefix} ${name}` : name;

    const formData = new FormData();
    // Client-generated UUID (MVP design §3): stable identity across retries, and
    // it is what lets the action tell us WHICH entry to open the sheet on.
    formData.set("itemId", crypto.randomUUID());
    formData.set("name", submitted);
    // …rest of the function unchanged…
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/lists/[listId]/ListBody.test.tsx"`
Expected: PASS — 24 tests (19 pre-existing + 5 new).

- [ ] **Step 5: Verify `page.tsx` compiles unchanged**

Run: `npx tsc --noEmit`
Expected: no errors. `page.tsx` passes `catalog` (from `searchCatalog`, which selects `defaultUnit`) into `articles`, so the widened type is already satisfied. **If and only if** tsc reports an error here, the fix is to widen the shape at the source, never to cast — but no edit is expected.

- [ ] **Step 6: Commit**

```bash
git add "src/app/lists/[listId]/ListBody.tsx" "src/app/lists/[listId]/ListBody.test.tsx"
git commit -m "feat(lists): strip the quantity prefix for autocomplete, keep it on submit"
```

---

## Task 5: Full verification, review document, meta plan

**Files:**
- Create: `docs/implementation-reviews/slice-15-quantity-parsing.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

- [ ] **Step 1: Run the whole suite and the linter**

```bash
npm test
npm run lint
npx tsc --noEmit
```

Expected: all green. Record the **actual** test count in the review document — do not claim a number you did not see. If anything fails, fix it before continuing (`superpowers:systematic-debugging` if the cause is not obvious).

- [ ] **Step 2: Manual browser check**

```bash
npm run dev
```

On a list screen, verify each of these by hand — the parser's whole value is that it feels right while typing:

1. „1,5 l Milch" + ↵ → the row shows **Milch** with **1,5 l** on the right.
2. „3 Joghurt" + ↵ → **Joghurt**, **3**, no unit.
3. Open the Katalog screen: **Milch** exists as an article, with **no** default unit („Standard-Kategorie · Einheit" sub-line shows no unit).
4. „1,5 l Mil" → the dropdown offers **Milch**; tap it → the entry still has **1,5 l**.
5. „3 l" + ↵ → an article literally named **3 l** is created (the conservative refusal). Delete it afterwards.
6. Type „1,5 l Milch" again with Milch already in the catalog → still no `defaultUnit` written.

- [ ] **Step 3: Write the implementation review**

Create `docs/implementation-reviews/slice-15-quantity-parsing.md`, in English, covering the five mandatory sections from CLAUDE.md § Implementation review:

1. **What was achieved** — the slice goal and whether it was fully met.
2. **Steps taken** — the four implementation tasks and what each changed.
3. **Core components built** — `parseEntryInput.ts` (`BASE_UNIT_ALIASES`, `buildUnitLookup`, `parseEntryInput`), the `unitIsGuess` flag on `AddItemOperation`, the rewritten `addEntryFromRow`, the `ListBody` prefix handling.
4. **Most important lines of code** — quote and explain at least: the `LEADING_NUMBER` lookahead (why it kills „1,5,5"), the `if (!name) return unparsed` refusal (why „3 l" is not an article called „l"), `unit: operation.unitIsGuess ? undefined : operation.unit` (guess vs. decision), the escape-hatch ternary in `addEntryFromRow`, and `const submitted = prefix && name !== draft.trim() ? …` (why the client re-attaches text rather than sending parsed fields).
5. **Architecture contribution** — the entry row now carries the design's full input grammar; the catalog's article-name purity survived; the parse sits inside the operations funnel, so a Phase 2 offline replay gets it for free. What comes next: **Slice 8 (PWA polish)**, then optionally Slice 16.

- [ ] **Step 4: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- Slice 15's table row: `_to be created_` → a link to this plan, and status `⬜ Open` → `✅ Done / verified`.
- Add a progress-log entry dated 2026-09-02 in the established `### YYYY-MM-DD — Slice N: <name> — <status>` format, recording: the four rulings and who made them, the `unitIsGuess` addition to the operation contract, the deliberate cuts (plurals, „2x", the first-time „7 Zwerge Bier"), and the inherited open items carried forward unchanged (PageHeader/nav hydration overlay; Toggle <44px tap target; `middleware` → `proxy` migration; member-path browser smoke).
- State plainly that **Slice 8 (PWA polish) is the next open slice**.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: Slice 15 implementation review + meta plan progress log"
```

---

## Self-Review

**Spec coverage.** The handoff's Slice 15 sentence has three clauses; each has a task. „führende Zahl + bekannte Einheit werden in Menge/Einheit gelöst" → Tasks 1 + 3. „der Katalog bekommt nur den Artikelnamen" → Task 3 (`name: parsed.name`) plus its explicit test, and Task 2's flow-back suppression, which is the *unit* half of the same rule. The trailing row wiring the meta plan calls „plus wiring" → Tasks 3 + 4. The meta plan's Slice 12 seam note („parser between `Autocomplete.onSubmit` and add FormData") is deliberately superseded by ruling 1 — Task 4 documents the client's reduced role, and Task 5 records the deviation in the progress log.

**Placeholder scan.** No task says "add validation" or "handle edge cases": every refusal rule is a named test row in Task 1, and the one validation this slice does *not* add (empty name, quantity > 0) is explicitly delegated to `getOrCreateCatalogItem` and `assertValidQuantity` with a comment saying so.

**Type consistency.** `ParsedEntryInput` is `{ quantity, unit, name }` in Tasks 1, 3 and 4. `UnitLookup` is produced by `buildUnitLookup` and consumed by `parseEntryInput` in both the server and client tasks. `unitIsGuess` is defined in Task 2 and set in Task 3 only. `ListBodyArticle` is defined in Task 4 and matches `CatalogSuggestion`'s four fields. The escape hatch's stand-in object `{ quantity: null, unit: null, name: input.name }` matches `ParsedEntryInput` exactly.

**One risk worth naming for the executor:** Task 3 changes the *name* that reaches `getOrCreateCatalogItem`, which is the catalog's identity function. If a test in `src/lib/catalog` or `src/lib/suggestions` starts failing after Task 3, the cause is almost certainly a fixture that adds an entry whose name begins with a digit — read the fixture before changing any production code.
