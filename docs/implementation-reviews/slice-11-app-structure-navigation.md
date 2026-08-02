# Implementation Review — Slice 11: App structure + navigation

## 1. What was achieved

Slice 11 splits the overloaded project screen into **five project routes** behind one shared navigation shell: a mobile overlay drawer and a permanent desktop sidebar (≥900px), both driven by the same `ProjectNavPanel` (project switcher, Listen / Archiv / Favoriten / Katalog / Mitglieder, admin „Verwaltung", sign-out). The Listen screen is reduced to active lists plus a **Neue-Liste bottom sheet** whose pre-fill preview can be toggled and de-selected chip by chip; Archiv, Favoriten and Mitglieder become their own screens; Katalog keeps Slice 10 behaviour and swaps the back arrow for the ☰ drawer trigger. Inline project rename and guarded project deletion sit on Listen for owners only.

The slice goal is **met**. Automated verification is green. The signed-in 14-item browser checklist on `http://localhost:3000` (Google OAuth redirect URI) passed for the owner path; member-as-second-account smoke was not available in this session (recorded as deferred, matching Task 10/13 ledger notes).

**Automated verification (Task 14):**

| Command | Result |
|---|---|
| `npx vitest run` | **61 files / 444 tests** passed |
| `npm run lint` | **2 errors, 8 warnings**, all pre-existing in `docs/design/2026-08-01-ui-handoff/support.js`. **`src/` clean.** Process exits non-zero because of that handoff file — do not "fix" the design bundle. |
| `npm run build` | Succeeded (Next.js 16.2.9). All five project routes present: `/projects/[projectId]`, `/archiv`, `/favoriten`, `/katalog`, `/mitglieder`. |

**Manual checklist (owner `volkertjaden@gmail.com`, project Einkauf + Katalog Empty Test, port 3000):**

| # | Item | Result |
|---|---|---|
| 1 | Drawer open; dim overlay; Escape; nav tap closes | **PASS** |
| 2 | ≥900px: drawer gone, sidebar permanent | **PASS** |
| 3 | Active nav = white pill; only one at a time | **PASS** |
| 4 | Switcher: all projects, ✓ on current, „Neues Projekt…" → `/projects` | **PASS** |
| 5 | Listen / Mitglieder counts update after create | **PASS** (Listen 5→7) |
| 6 | Hero sheet: name, toggle, drop/restore chips, create exact entries | **PASS** („Slice11 Prefill Check" → Bananen + Milch) |
| 7 | „Leere Liste" creates empty list without leaving | **PASS** |
| 8 | Owner: dashed rename (drawer updates); delete confirm sheet | **PASS** (full delete not executed — confirm UI + `redirect("/projects")` in action). Member DOM: **SKIPPED** (no second session) |
| 9 | Archiv: date line, footnote; empty centred state | **PASS** |
| 10 | Favoriten: banner, ✕ chips, datalist add; empty 5e | **PASS** |
| 11 | Mitglieder: OWNER, „(du)", Entfernen not on owner; unknown invite German error | **PASS**. Live member view / remove-as-member: **SKIPPED** |
| 12 | Katalog header shows ☰ (not back arrow) | **PASS** |
| 13 | 375px: no horizontal scroll on the five screens | **PASS** |
| 14 | Verwaltung in drawer only for admin | **PASS** |

**Inherited debt (not product-rule failures):** Next.js hydration overlay still appears on project screens (`PageHeader` / `ProjectNavPanel`) — same class as Slice 10's Katalog note. Toggle tap target remains <44px per Task 3 parked ruling.

**Four deliberate deferrals** (plan § „What this slice deliberately does NOT do"):

1. **List screen untouched** — `/lists/[listId]` keeps `← Zum Projekt` and no drawer (Slice 12).
2. **Favoriten autocomplete stays native `<datalist>`** — Slice 12's trailing-row control should be reused here later.
3. **No new REST endpoints** — domain layer + Server Actions only.
4. **Quantity parsing is Slice 15.**

**Deviation from earlier meta phrasing:** the sheet's suggestions arrive as **server props** from `computeSuggestions` on the Listen page, not via a client `GET /suggestions` fetch. Behaviour matches „read suggestions then create"; transport follows the Slice 10 rule (server-owned data, client view state).

**PageHeader title decision (Task 10):** `title=""` with `ProjectTitle` in the `leading` slot next to `DrawerTrigger`, so the name is not duplicated (handoff 3e). The empty `<h1>` acts as the flex spacer from the prototype; accessible naming comes from InlineEdit's „Projektname" label (owner) / visible text (member).

---

## 2. Steps taken

**Task 1 — List summaries:** Added `listActiveListSummaries` and `listArchivedListSummaries` in `src/lib/lists/summaries.ts` (open counts; archive ordered by `completedAt` desc).

**Task 2 — Explicit list create:** Extracted `createListWithArticles` so the sheet's surviving selection is the truth; `createPrefilledList` became a thin wrapper that still serves REST `prefill: true`.

**Task 3 — Toggle:** Built the on/off switch primitive (handoff toggleStyle verbatim; tap-target shortfall parked).

**Task 4 — DrawerContext + DrawerTrigger:** Context crosses the layout→page gap so ☰ can open a drawer the layout owns.

**Task 5 — ProjectNavPanel:** Shared switcher + nav rows + footer; exact `pathname === href` for the active pill; Verwaltung gated by `isAdmin`.

**Task 6 — ProjectShell:** Desktop sidebar + mobile overlay drawer; Escape / overlay / `onNavigate` close; body scroll lock while open.

**Task 7 — Project layout + Katalog ☰:** `getProjectNav` in the layout; Katalog swaps back link for `DrawerTrigger`.

**Task 8 — ProjectTitle + DeleteProjectButton:** Owner-only inline rename and ConfirmSheet delete; `revalidatePath(..., "layout")` for drawer name.

**Task 9 — NewListSheet:** Hero + sheet with exclusion-set chips, Toggle, repeated `articleName` hidden fields.

**Task 10 — Listen page rewrite:** Reduced project page to Listen; PageHeader title decision; empty-list action revalidates layout.

**Task 11 — Archiv screen:** Newest-completed first, German date line, footnote, empty state.

**Task 12 — Favoriten screen:** Banner, chips with remove, datalist add row, empty 5e.

**Task 13 — Mitglieder screen:** Invite form with inline German errors; Entfernen + ConfirmSheet; owner-only controls not rendered for members.

**Task 14 — Gallery + verification + docs:** Toggle in `/dev/ui`; full vitest / lint / build; browser checklist; this review; meta-plan status + progress log.

---

## 3. Core components built

| File / component | Role |
|---|---|
| `listActiveListSummaries` / `listArchivedListSummaries` (`summaries.ts`) | UI read models for Listen rows and Archiv. |
| `getProjectNav` (`nav.ts`) | Single membership+nav read; `null` → redirect `/projects`. |
| `createListWithArticles` / wrapper `createPrefilledList` | Explicit create path vs REST prefill entry point. |
| `formatOpenCount` / `formatNewListLabel` (`plural.ts`) | „N offen" and sheet button labels. |
| `Toggle` | Vorbefüllen switch (gallery + sheet). |
| `DrawerContext` / `useDrawer` / `DrawerTrigger` | Cross-boundary open control for the shell. |
| `ProjectNavPanel` | Shared nav content for drawer and sidebar. |
| `ProjectShell` | Layout chrome: sidebar, overlay drawer, context provider. |
| `projects/[projectId]/layout.tsx` | Server guard + nav load + shell wrap. |
| `ProjectTitle` | Dashed inline rename (owner) / plain name (member). |
| `DeleteProjectButton` | Owner destroy + ConfirmSheet. |
| `NewListSheet` | Hero + de-selectable pre-fill sheet. |
| `archiv/page.tsx` | Archive list + empty state. |
| `favoriten/page.tsx` + `FavoritesEditor` | Favourites management UI. |
| `mitglieder/page.tsx` + `InviteForm` + `RemoveMemberButton` | Members list, invite errors, guarded remove. |
| Listen `page.tsx` (rewrite) | Active lists + sheet + empty-list row + owner chrome. |

---

## 4. Most important lines of code

### (a) Layout cannot reach into children — context

```typescript
// Why a context rather than props: the ☰ button lives inside each SCREEN's
// PageHeader, while the drawer itself belongs to the layout that wraps those
// screens. There is no prop path between them — a layout passes `children`, it
// cannot reach into them.
export const DrawerContext = createContext<DrawerControls | null>(null);
```

Why it matters: this is the structural reason the shell exists as a client provider around server-rendered pages. Without it, every screen would need its own drawer copy.

### (b) Exact path match for the active pill

```typescript
// Exact comparison, not startsWith: „/projects/p1" is a prefix of every other
// screen's path, so a prefix test would light up „Listen" everywhere.
const isCurrent = (href: string) => pathname === href;
```

Why it matters: a prefix match would mark Listen active on Archiv/Favoriten/… — the white pill would lie.

### (c) `getProjectNav` returns null for three failures

```typescript
// Why `null` instead of throwing: the membership predicate is baked into the
// query … so "no matching row" covers the unknown project, the malformed id and
// the non-member alike. All three mean the same thing to the layout …
const current = summaries.find((summary) => summary.id === projectId);
if (!current) return null;
```

Why it matters: one redirect story (`/projects`) instead of mixing 403/404; screens and layout share the same gate.

### (d) Exclusion set in NewListSheet

```typescript
// Why the selection is expressed as an EXCLUSION set: the design's default is
// "everything is in", and a set of ids the user removed keeps that default true
// even when the suggestion list changes between renders — an inclusion set would
// silently drop newly-suggested articles.
const [excluded, setExcluded] = useState<Set<string>>(new Set());
```

Why it matters: the sheet's default is opt-out, not opt-in; the data structure encodes that product rule.

### (e) Repeated `articleName` hidden fields — client→server contract

```typescript
{selected.map((article) => (
  <input
    key={article.catalogItemId}
    type="hidden"
    name="articleName"
    value={article.name}
  />
))}
```

Paired with:

```typescript
const articleNames = formData.getAll("articleName").map((value) => String(value));
const list = await createListWithArticles(prisma, { projectId, name, articleNames });
```

Why it matters: the surviving chips are the create payload. Recomputing suggestions on the server would re-add dropped articles. No JSON schema — plain form posts.

### (f) Layout-scoped revalidation

```typescript
// "layout" scope, not the default: the drawer and the sidebar print the
// project name too, and they live in the layout above this page.
revalidatePath(`/projects/${projectId}`, "layout");
```

Why it matters: page-only revalidate leaves a stale name/count in the shell. Same pattern after empty-list create and member invite/remove.

### (g) Suggestions as server props (deviation note)

```typescript
// Why the suggestions arrive as PROPS instead of a GET /suggestions fetch: the
// page that renders this is a Server Component and has already read them.
export function NewListSheet({ suggestions, favoriteIds, ... }: NewListSheetProps) {
```

Why it matters: documents the intentional transport choice against older „GET first" wording.

---

## 5. Architecture contribution

Slice 11 installs the **project navigation shell** and the **five-screen project IA**. Everything under `/projects/[projectId]/*` now shares one membership+nav read (`getProjectNav`), one chrome (`ProjectShell`), and the convention that each screen puts `<DrawerTrigger />` in its `PageHeader` `leading` slot.

**What comes next:**

- **Slice 12 (List interaction rework)** — reworks `/lists/[listId]` under this shell (trailing empty row, category chips, entry detail sheet, swipe-to-delete); should ship a reusable autocomplete and adopt it on Favoriten; plan still to be created.
- **Slice 15** — quantity parsing into that trailing row.
- The list screen remaining outside the layout until Slice 12 is intentional, not unfinished work.

The mutation model for lists stays entry-level operations; this slice only adds an explicit *create-with-names* path that still goes through `add_item`. Polling/sync (Slice 7) is unchanged.
