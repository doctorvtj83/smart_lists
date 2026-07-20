# Implementation Review — Slice 4: Catalog + Autocomplete

## 1. What was achieved

Slice 4 turned the per-project article catalog from passive identity storage into **active project memory** — the distinguishing foundation for intelligent pre-filling in later slices. Concretely:

- **Autocomplete read:** `searchCatalog` performs a pure, project-scoped prefix match on `normalizedName` (case-insensitive via normalization), with a blank-query browse mode and a lean `CatalogSuggestion` shape capped at 20 results.
- **Category/unit flow-back:** `flowBackCatalogDefaults` writes user-set category/unit from entry edits back to the catalog item's defaults; only concrete (non-null) values flow back — clearing an entry field never erases shared catalog memory.
- **Operations integration:** Flow-back is wired inside `applyOperation` for `add_item` (explicit values at add time) and `update_item` (category/unit fields), keeping the catalog mutation path inside the single operations funnel.
- **REST endpoint:** `GET /api/projects/:projectId/catalog?q=` exposes autocomplete to any project member (non-members get 404).
- **UI autocomplete:** The list detail page renders a native, server-rendered `<datalist>` wired to the name input — zero client JavaScript; category/unit inherit at add time when left blank.
- **118 tests** across 15 test files (12 new in this slice + 106 from Slices 1–3), all green; `npm run lint` and `npm run build` pass cleanly.
- The slice goal was **fully met**: the catalog remembers articles, suggests them on input, and learns category/unit defaults from user edits. Manual browser verification (2026-07-20) **passed**: datalist autocomplete, add-time flow-back, category inheritance on blank-category re-add, and flow-back via re-add with a new explicit category (no entry-edit UI in Slice 3/4 — `update_item` is API-only).

**Locked design decisions honored:** (1) autocomplete UI = native server-rendered `<datalist>` (no client component, no fetch-on-keystroke); (2) flow-back fires on add AND edit, non-null only.

---

## 2. Steps taken

**Task 1 — `searchCatalog`:** Created `src/lib/catalog/search.ts` with `CatalogSuggestion`, `CATALOG_SEARCH_LIMIT`, and the pure-read autocomplete function; five unit tests cover prefix match, lean shape, blank browse, cap, and project isolation.

**Task 2 — `flowBackCatalogDefaults`:** Extended `src/lib/catalog/catalog.ts` with `CatalogDefaults` and the sparse write-back helper; three unit tests verify concrete writes, null-clearing is ignored, and partial updates.

**Task 3 — Operations wiring:** Modified `src/lib/lists/operations.ts` to call `flowBackCatalogDefaults` from `add_item` and `update_item` (category/unit); four unit tests verify add-time seeding, edit-time overwrite, null-clearing preservation, and inheritance on re-add.

**Task 4 — GET catalog endpoint:** Created `src/app/api/projects/[projectId]/catalog/route.ts` — thin adapter (session → membership guard → `searchCatalog` → JSON).

**Task 5 — Datalist UI:** Modified `src/app/lists/[listId]/page.tsx` to load catalog suggestions in parallel with the list and render `<datalist>` + `list="catalog-suggestions"` on the name input.

**Task 6 — Docs + meta-plan:** This review and the meta project plan progress log entry.

---

## 3. Core components built

| File | Role |
|---|---|
| `src/lib/catalog/search.ts` | `searchCatalog` — pure-read autocomplete over the project catalog; `CatalogSuggestion` lean shape; `CATALOG_SEARCH_LIMIT` |
| `src/lib/catalog/search.test.ts` | Unit tests for prefix match, browse mode, cap, project isolation, lean shape |
| `src/lib/catalog/catalog.ts` (amended) | `CatalogDefaults` + `flowBackCatalogDefaults` — sparse write-back of category/unit to catalog defaults |
| `src/lib/catalog/catalog.test.ts` (amended) | Unit tests for flow-back semantics (concrete write, null ignored, partial update) |
| `src/lib/lists/operations.ts` (amended) | Flow-back calls inside `add_item` and `update_item` — catalog learning lives in the mutation funnel |
| `src/lib/lists/operations.test.ts` (amended) | Four flow-back integration tests inside `applyOperation` |
| `src/app/api/projects/[projectId]/catalog/route.ts` | `GET` member-level autocomplete endpoint over `searchCatalog` |
| `src/app/lists/[listId]/page.tsx` (amended) | Server-rendered `<datalist>` autocomplete on the add-entry name input |

---

## 4. Most important lines of code

### The `startsWith` prefix predicate in `searchCatalog` (`src/lib/catalog/search.ts`)

```typescript
...(normalized ? { normalizedName: { startsWith: normalized } } : {}),
```

Why it matters: autocomplete matches on the **normalized** name (already lowercased in the DB), so a query like `"MIL"` finds `"Milch"` without Prisma `mode: "insensitive"`. The spread is conditional — a blank/whitespace query omits the filter entirely and browses all articles alphabetically (capped). This is the core read seam Slice 5 suggestions and the future PWA client will build on.

### The `!= null` sparse-update guard in `flowBackCatalogDefaults` (`src/lib/catalog/catalog.ts`)

```typescript
if (changes.category != null) data.defaultCategory = changes.category;
if (changes.unit != null) data.defaultUnit = changes.unit;
if (Object.keys(data).length === 0) return;
```

Why it matters: loose `!= null` catches **both** `null` (explicit clear on an entry) and `undefined` (field not supplied) in one check. Clearing an entry's category must never erase the project's shared catalog default — that is a locked product decision. The early return skips a DB round-trip when nothing concrete was supplied.

### The `add_item` flow-back call (`src/lib/lists/operations.ts`)

```typescript
await flowBackCatalogDefaults(db, catalogItem.id, {
  category: operation.category,
  unit: operation.unit,
});
```

Why it matters: raw `operation.category`/`operation.unit` are passed through — values that were **inherited** from the catalog default arrive as `undefined` and are safely skipped by the helper, while **explicit** user-supplied values become the new catalog default. This runs only on first creation (idempotent replays return early above), so flow-back does not fire on duplicate `add_item` replays.

### The `<datalist>` wiring on the list detail page (`src/app/lists/[listId]/page.tsx`)

```tsx
<datalist id="catalog-suggestions">
  {suggestions.map((s) => (
    <option key={s.id} value={s.name} />
  ))}
</datalist>
<input name="name" ... list="catalog-suggestions" />
```

Why it matters: this is the zero-JS autocomplete decision — the browser natively suggests catalog names without a client component or fetch-on-keystroke. Category/unit are **not** prefilled into input boxes; leaving them blank lets `add_item` inherit the flowed-back catalog default, so the category still lands on the created entry. The GET endpoint built in Task 4 is ready for a fetch-based dropdown upgrade in Slice 8 PWA polish.

---

## 5. Architecture contribution

Slice 4 completes the **catalog memory layer** of the MVP architecture:

- **Read seam:** `searchCatalog` is the single pure-read function over the project catalog. Slice 5 (Favorites + Suggestions) will call it (or query the same data) to build pre-fill suggestions; the future PWA client will consume the `GET /api/projects/:id/catalog` endpoint instead of the server-rendered `<datalist>`.
- **Write seam:** `flowBackCatalogDefaults` runs **only inside** `applyOperation` — catalog defaults are mutated exclusively through the operations funnel, preserving the single mutation path that Slice 7 sync must respect.
- **Self-improving catalog:** every entry add/edit with an explicit category/unit teaches the catalog, so subsequent adds of the same article inherit the latest defaults — the behavioral loop that makes lists "smart."
- **Prerequisite for Slice 5:** favorites and the N-of-M statistic both read `CatalogItem` rows; Slice 4 ensures those rows carry meaningful `defaultCategory`/`defaultUnit` values learned from real usage.

**Inherited for later slices:** Slice 5 plan still to be created. Manual browser verification of Slice 4 is complete (2026-07-20).
