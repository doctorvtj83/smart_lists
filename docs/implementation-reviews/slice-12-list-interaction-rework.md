# Implementation Review — Slice 12: List interaction rework

## 1. What was achieved

Slice 12 reworks `/lists/[listId]` from the four-field add form into the handoff §10 interaction model. The page stays a Server Component for auth, data load, banners and Server Actions; the interactive body is a client island (`ListBody`) that owns chips, the trailing row, the entry sheet and swipe-to-delete. Favoriten retires its native `<datalist>` in favour of the same `Autocomplete` primitive. Slice 7's `ListSyncPoller` and the operations/delta API are unchanged.

The four deliverables are **fully met**:

| Deliverable | Status |
|---|---|
| Trailing empty row (placeholders, Enter submit, autocomplete dropdown, chip-override category, sheet auto-open for unknown uncategorized articles) | Met |
| Category filter chips (Alle / named / Ohne Kategorie, German order, active-chip survival when emptied) | Met |
| Entry detail sheet (Menge / Einheit / Kategorie chips, flow-back hint, Fertig, Eintrag löschen; field-granular updates only) | Met |
| Swipe-to-delete (geometry module + pointer handlers; threshold snaps back on the safe side) | Met |

**Automated verification (Task 13):**

| Command | Result |
|---|---|
| `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**'` | **72 files / 554 tests** passed |
| `npm test` (same worktree cwd) | **72 files / 554 tests** passed — the config's `**/.worktrees/**` exclude targets sibling worktrees under the main checkout; from inside a worktree the suite is not self-excluded |
| `npm run lint` | **3 errors, 8 warnings.** Pre-existing: 2 errors + 8 warnings in `docs/design/2026-08-01-ui-handoff/support.js`. **New:** 1 error in `src/components/ui/Autocomplete.tsx` (`react-hooks/set-state-in-effect` on `setDismissed(false)` when `value` changes). Process exits non-zero. |
| `npm run build` | Succeeded (Next.js 16.2.9). `/lists/[listId]` present; project routes unchanged. |

**Human rulings recorded during execution:**

- **ConfirmSheet constraint sharpened:** ConfirmSheet is for irreversible/cascading deletes only (project/list/member/allowlist). Never nest ConfirmSheet inside Sheet. Entry delete (swipe or „Eintrag löschen") has no second confirmation. An Undo-banner for both delete paths is parked for **Slice 16**.
- **Option A for `operations.ts`:** restoring the `null` vs `undefined` distinction on `add_item` category/unit is an intentional contract fix (chip „Ohne Kategorie" → `null`; „Alle" → `undefined` to inherit catalog default). The plan's Untouched list was exempted for that bug fix.
- **Vitest worktree exclude:** `vitest.config.ts` excludes `**/.worktrees/**` so the main checkout does not double-run suites against the shared Neon test DB. Recorded exact count above; no phantom empty suite from this worktree.

**Decisions / consequences the brief requires on the record:**

- **Slice 16 is Path B** (flash context; rows stay server-rendered). Entries arrive as props, not a client store — nothing was pulled client-side that would make Path A cheaper. `data-item-id` is on every `EntryRow`.
- **Slice 15 seam:** the trailing row submits `name` as typed. The quantity parser goes between `Autocomplete.onSubmit` and `addEntry`'s FormData and must keep `name` = article name only.
- **Accepted consequence:** adding while a category chip is active flows that category into the catalog default (product rule + covered by test).
- **Design conflict resolved:** empty-state mocks 5c/5d draw `☰`; §10 specifies `←`. `←` shipped — `/lists/[listId]` is outside the project layout.
- **Known gap:** autocomplete has no arrow-key navigation (design shows no active-row highlight); rows are Tab-reachable; Enter always submits the typed text.
- **Inherited open items:** Slice 7 minors; PageHeader/nav hydration overlay if still present; Toggle <44px; member-path browser smoke. Slice 11's „adopt Autocomplete in Favoriten" is **closed** by Task 12.

---

## 2. Steps taken

**Task 1 — Category vocabulary + German collation:** Extracted `compareGermanText`; added `categories.ts` (labels, chip options with active survival, Alle grouping, known sheet categories).

**Task 2 — Quantity format:** `parseGermanDecimal` / `formatQuantityLabel` for the sheet and the row's trailing label (Slice 15 still owns typed-string parsing into Menge/Einheit).

**Task 3 — Swipe geometry:** Pure `swipe.ts` (offset clamp, start tolerance, delete threshold with strict `<`).

**Task 4 — Autocomplete options:** Pure `buildAutocomplete` for prefix matches + optional „… neu anlegen".

**Task 5 — Autocomplete primitive:** Inline input with dropdown above the field; gallery entry on `/dev/ui`.

**Task 6 — `addEntryFromRow`:** Catalog read before add; chip→category three-way; `needsCategory` cue. Option A restored `add_item`'s null/undefined contract after a brief add+update workaround.

**Task 7 — EntryRow:** Check circle, quantity label, tap-to-open, swipe-to-delete, `data-item-id`; frozen completed lists ignore interaction.

**Task 8 — EntrySheet:** Menge/Einheit/Kategorie + chips; `collectChanges` sends only diffs; Eintrag löschen without ConfirmSheet (ruling).

**Task 9 — ListMenu:** `⋮` header — Liste abschließen / Liste löschen with ConfirmSheet for list delete.

**Task 10 — ListBody + page rewrite:** Chips, groups/filter, empty 5c/5d, trailing row, sheet orchestration; page keeps Server Actions + banners.

**Task 11 — Banners / frozen / sync:** All-checked banner, completed-list frozen chrome, `←` back link; live sync left on `ListSyncPoller`.

**Task 12 — Favoriten Autocomplete:** Replaced `<datalist>` with the shared primitive (closes Slice 11 follow-up).

**Task 13 — Review + meta plan:** This document; slice table + progress log + Slice 16 Path B note.

---

## 3. Core components built

| File / component | Role |
|---|---|
| `src/lib/lists/categories.ts` | Category vocabulary: Alle / Ohne Kategorie, chip order, Alle grouping, sheet known-category set. |
| `src/lib/lists/swipe.ts` | Swipe geometry and the delete-threshold predicate. |
| `src/lib/format/quantity.ts` | German decimal parse + row quantity/unit label. |
| `src/lib/catalog/autocomplete.ts` | Pure dropdown options for a typed prefix. |
| `src/lib/lists/addEntry.ts` | Trailing-row server meaning: chip category + `needsCategory` after catalog-aware add. |
| `Autocomplete` (+ CSS, test) | Reusable inline input with dropdown above; list trailing row + Favoriten. |
| `formState.ts` | Shared `EntryFormState` / idle for both entry Server Actions. |
| `EntryRow` (+ CSS, test) | One entry: check, name, quantity, tap, swipe; `data-item-id`. |
| `EntrySheet` (+ CSS, test) | Detail bottom sheet; field-diff Fertig; direct delete. |
| `ListMenu` (+ CSS, test) | Header `⋮` with complete + guarded list delete. |
| `ListBody` (+ CSS, test) | Client island: chips, groups, empty states, trailing row, sheet orchestration. |
| `page.module.css` | List screen layout Module (page previously had none). |
| `page.tsx` (rewrite) | Server page: header, banners, actions, `ListBody` props. |
| `compareGermanText` in `sort.ts` | Shared German collation for chips and catalog names. |
| `FavoritesEditor` (modified) | Favoriten add row on the shared Autocomplete. |
| `Gallery.tsx` (modified) | Autocomplete in `/dev/ui`. |

Untouched by design (verified): `ListSyncPoller`, `delta.ts`, REST list routes. `operations.ts` only for the Option A contract restore (Untouched exemption).

---

## 4. Most important lines of code

### (a) Catalog read before add — `needsCategory`

```typescript
// Read the article BEFORE adding: add_item creates it on first use, so after
// the write there is no way left to tell a new article from an old one.
const knownArticle = normalizedName
  ? await db.catalogItem.findUnique({ … })
  : null;
// …
needsCategory: knownArticle === null && item.category === null,
```

Why it matters: the design opens the sheet only for a *new* unknown article without a category. After `add_item` every name looks known; the pre-read is the only honest „unknown" signal.

### (b) Only changed fields travel — LWW

```typescript
if (!Object.is(nextQuantity, entry.quantity)) changes.quantity = nextQuantity;
```

Why it matters: each field is its own `update_item`. Sending an untouched field would overwrite a concurrent remote edit under last-writer-wins. `Object.is` also treats `NaN` as always-changed so invalid Menge text still reaches server validation.

### (c) Presence, not truthiness — clear vs omit

```typescript
if (formData.has("quantity")) {
  await applyOperation(prisma, l, {
    op: "update_item",
    itemId,
    field: "quantity",
    // …
```

Why it matters: `""` means clear the column (`null`). Truthiness would treat clear as „absent" and skip the update. Absent keys leave the field alone for LWW.

### (d) Client-generated identity enables sheet auto-open

```typescript
formData.set("itemId", crypto.randomUUID());
formData.set("name", name);
```

Why it matters: MVP stable client UUIDs, and the action returns that same id as `openEntryId` when `needsCategory` is true — the client opens the sheet on the entry it just created without a second round-trip lookup.

### (e) Active chip survives an empty category

```typescript
export function categoryChipOptions(items, active = ALL_CATEGORIES_LABEL): string[] {
  const present = new Set(items.map((item) => categoryLabel(item.category)));
  if (active !== ALL_CATEGORIES_LABEL) present.add(active);
  // … Alle, named (German sort), Ohne Kategorie last
}
```

Why it matters: deleting the last item in „Molkerei" must not yank the filter out from under the user; the chip stays in sorted position so they can keep adding into that category.

### (f) Delete threshold — strict `<`

```typescript
export function shouldDeleteOnRelease(offset: number): boolean {
  return offset < SWIPE_DELETE_THRESHOLD_PX;
}
```

Why it matters: exactly at the threshold snaps back. The destructive outcome is irreversible here (no Undo yet), so the boundary belongs to the safe side.

---

## 5. Architecture contribution

Slice 12 settles the **server→client split of the list body**: the page owns membership, list+entries+catalog props, Server Actions and banners; `ListBody` owns view state (active chip, draft, open sheet) over server-supplied entries. Mutations stay entry-level `applyOperation` calls. Sync stays `changed → router.refresh()` — no client entry store.

**What that settles for later slices:**

- **Slice 15** — wire quantity parsing between Autocomplete submit and FormData; catalog still receives name only.
- **Slice 16 — Path B** — flash context + thin per-row class wrappers; `data-item-id` already shipped. Path A (client entry store) is not warranted by this split.
- **ConfirmSheet / Undo:** entry delete is intentional without a second confirm; Undo-banner is Slice 16 scope if pursued.
- List screen remains **outside** the project drawer layout (`←` back), matching §10 over empty-state mock chrome.

The collaborative core (operations + polling) was not renegotiated — only how humans drive it on the list screen.
