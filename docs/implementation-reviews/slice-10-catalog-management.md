# Implementation Review — Slice 10: Catalog management

## 1. What was achieved

Slice 10 makes the per-project catalog **visible and editable**. Members can open `/projects/[projectId]/katalog`, browse articles (German locale sort, live substring search), create an article directly, rename with a normalized-name collision check, edit / clear default category and unit, and delete an article only when no list — active or completed — still references it. The screen is built from a server-owned read model plus client view state (search text, open panel), with mutations as Server Actions over `src/lib/catalog/manage.ts` (no new REST endpoints).

The slice goal is **met in code**. Automated verification is green (numbers below). The 17-item signed-in browser checklist is **SKIPPED in this environment**: Google OAuth fails with `redirect_uri_mismatch` for `http://localhost:3010/api/auth/callback/google`, so no authenticated session could be established. Domain and component tests cover the behaviours those checklist items target; residual risk is layout/hydration and end-to-end wiring that only a signed-in pass proves.

**Automated verification (Task 9 Step 1, this session):**

| Command | Result |
|---|---|
| `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'` | **49 files / 382 tests** passed (exit 0; ~77–79 s). Running from this worktree, the `.worktrees` exclude did **not** hide local tests (paths are relative to the worktree cwd). |
| `npm run lint` | **2 errors, 8 warnings**, all pre-existing in `docs/design/2026-08-01-ui-handoff/support.js`. **`src/` clean** after a Task-9 lint fix in `CatalogBrowser` (no `setState` in `useEffect`). Process exit 1 because of the handoff file. |
| `npm run build` | Succeeded (Next.js 16.2.9; `/projects/[projectId]/katalog` listed as dynamic). |

**Manual checklist (Task 9 Step 2):** all **17 items SKIPPED (environment)** — see progress-log entry and `task-9-report.md`. Automated coverage that already pins the intended behaviour is noted per item in that report.

**Out of scope (deliberately — do not hunt for these in this slice):**

- The ☰ drawer / sidebar and project switcher (Slice 11). Until then the screen is reached through a plain „Katalog" link on the un-restyled project page; the header carries a back link instead of the hamburger.
- Restyling the project detail screen (Slice 11). This slice adds exactly one link line.
- Merging two articles on a rename collision (design: error, not merge).
- Autocomplete changes (`searchCatalog` stays prefix + `take`; Katalog filter is client-side substring only).
- Editing `suggestionRuleN` / `suggestionRuleM`.
- Quantity parsing (Slice 15), per-row remote flash (Slice 16), PWA polish (Slice 8).

---

## 2. Steps taken

**Task 1 — German meta lines:** Extended `src/lib/format/plural.ts` with `formatArticleCount`, `formatUsedInLists`, and `formatArticleDefaults` so header count, delete-guard wording, and row sub-lines share one source.

**Task 2 — `listCatalog` read model:** Added `CatalogArticle` + `listCatalog` in `manage.ts` — project-scoped articles with distinct list usage, favourite flag, and `compareArticleNames` sort.

**Task 3 — `createCatalogArticle`:** Explicit create with pre-check + unique-constraint `P2002` → 409 „Artikel existiert bereits" (contrast: Slice 4 `getOrCreateCatalogItem`).

**Task 4 — `updateCatalogArticle`:** Single write for rename + both defaults; skip collision query when normalized name is unchanged; `toDefaultValue` clears emptied fields.

**Task 5 — `deleteCatalogArticle`:** Guard via `countListsUsingArticle` (active + completed); favourite row cascades with the article. Minor: count→delete TOCTOU without a transaction (deferred).

**Task 6 — `CatalogEditPanel`:** Presentational inline panel with collision error on Name, guarded delete / ConfirmSheet, shared `formState.ts`. ConfirmSheet closes after danger `onSelect` (Gallery pattern; final review fix).

**Task 7 — `CatalogBrowser`:** Client body with live `normalizeName` substring search, create row, empty state 5f, panel open/close driven from action wrappers (Task 9 lint fix moved this off `useEffect`). Final review fix: jsdom coverage for edit-`ok` → panel close (create-opens was already covered).

**Task 8 — Katalog page + project link:** Server Component page with member-level Server Actions, `PageHeader` + back link, one „Katalog" link on the project detail page.

**Task 9 — Verification + docs:** Full vitest / lint / build; OAuth-blocked manual checklist documented as SKIPPED; this review; meta-plan status + progress log.

---

## 3. Core components built

| File / component | Role |
|---|---|
| `formatArticleCount` / `formatUsedInLists` / `formatArticleDefaults` (`plural.ts`) | German meta lines for header, delete note/error, and row defaults. |
| `CatalogArticle` / `listCatalog` (`manage.ts`) | Read model: sorted articles with distinct list usage and favourite flag. |
| `createCatalogArticle` | Explicit create; duplicate normalized name is 409, not get-or-create. |
| `updateCatalogArticle` | Rename + defaults in one write; self-respelling is not a collision; empty field clears. |
| `deleteCatalogArticle` / `countListsUsingArticle` | Delete only when unused across active and completed lists. |
| `formState.ts` | Shared `CatalogFormState` / idle constant for both Server Actions + `useActionState`. |
| `CatalogEditPanel` | Inline edit UI; owns only confirm-sheet open state. |
| `CatalogBrowser` | Client interactive body: search, create, open panel, scoped errors. |
| `katalog/page.tsx` | Server page: membership gate, `listCatalog`, create/edit Server Actions, `PageHeader`. |

---

## 4. Most important lines of code

### (a) Distinct lists, not entries (`listCatalog`)

```typescript
usedInListCount: new Set(item.listItems.map((listItem) => listItem.listId)).size,
```

Why it matters: the delete guard and the panel note speak in *lists* („wird in N Listen verwendet"). Counting `ListItem` rows would inflate the number when the same article appears twice on one list, and would mis-state the cascade risk (one list wiped of that article vs N lists).

### (b) Re-spelling one's own name is not a collision (`updateCatalogArticle`)

```typescript
if (normalizedName !== article.normalizedName) {
  const collision = await db.catalogItem.findUnique({
    where: { projectId_normalizedName: { projectId, normalizedName } },
  });
  if (collision) throw new ApiError(409, DUPLICATE_ARTICLE_MESSAGE);
}
```

Why it matters: „milch" → „Milch" only changes display casing. Without the `!==` guard the unique index would look like a self-hit and every cosmetic rename would 409.

### (c) Explicit clear vs sparse flow-back (`toDefaultValue` vs `flowBackCatalogDefaults`)

```typescript
function toDefaultValue(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
```

Why it matters: on this screen an emptied field means „clear the catalog default". Slice 4's `flowBackCatalogDefaults` must *not* treat a cleared list-entry field the same way — that null is local to the entry and must not wipe shared project memory. Two paths, opposite null semantics, both correct.

### (d) Guard that actually prevents the cascade (`deleteCatalogArticle` + schema)

```typescript
const usedInListCount = await countListsUsingArticle(db, projectId, catalogItemId);
if (usedInListCount > 0) {
  throw new ApiError(409, `Löschen nicht möglich — ${formatUsedInLists(usedInListCount)}.`);
}
```

Paired with `ListItem.catalogItemId` `onDelete: Cascade`: without the guard, deleting a catalog row would silently strip that article from every list item (including completed lists that feed N-of-M suggestions). The guard is what keeps history intact; the cascade is still correct for *project* teardown.

### (e) Pre-check for the message, DB for the truth (`rethrowAsDuplicate`)

```typescript
function rethrowAsDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError(409, DUPLICATE_ARTICLE_MESSAGE);
  }
  throw error;
}
```

Why it matters: the friendly pre-check covers the normal race-free case; two members creating the same name in the same second slip past it — the compound unique index is the real guarantee, and `P2002` is how it speaks German to the UI.

### (f) Error scoped to one article (`CatalogBrowser`)

```typescript
error={editState.articleId === article.id ? editState.error : null}
```

Why it matters: `editState` survives across panel opens. Without the `articleId` match, a failed save on Milch would paint „Artikel existiert bereits" onto Nudeln after the user cancelled and opened another row.

### (g) Bugs must not look like validation (`toFormState`)

```typescript
function toFormState(error: unknown, articleId: string | null): CatalogFormState {
  if (error instanceof ApiError) {
    return { error: error.message, ok: false, createdId: null, articleId };
  }
  throw error;
}
```

Why it matters: only `ApiError` carries intentional German copy for the inline field. Anything else is a real defect; disguising it as a field message would hide the crash and teach the user the wrong recovery.

---

## 5. Architecture contribution

This slice adds the first **explicit** catalog write path (`manage.ts`: duplicate = error, empty field = clear, delete guarded) beside Slice 4's **implicit** path (`catalog.ts`: get-or-create, sparse flow-back). They must stay separate — merging them would break either list typing or Katalog upkeep.

It is also the first product screen whose **interactivity lives in a client component while the data stays server-owned** (`articles` as props + `revalidatePath` after Server Actions). Slices 11 and 12 should follow that split rather than fetching the catalog/list body on the client.

The Katalog screen is what Slice 11's drawer will link to; `PageHeader`'s `leading` slot currently holds the back link and is exactly where the ☰ drawer trigger replaces it. Catalog management ships **no REST endpoints** (Slice 9 precedent); `manage.ts` remains the seam if one is ever needed.
