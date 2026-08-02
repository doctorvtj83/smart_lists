# Smart Lists — Meta Project Plan (MVP, Approach A)

> **For agentic workers:** This is the **umbrella plan** over all 16 vertical slices of the MVP.
> It is **not** executed step-by-step — it coordinates the individual slice plans and tracks progress.
> Each slice has (or will get) its own executable plan under `docs/superpowers/plans/`.
>
> **REQUIRED of every agent:** When you have implemented and verified a slice plan, record the result
> below in the **[Progress Log](#progress-log)** (see the
> [maintenance guide](#maintenance-guide-for-future-agents)). This is part of a slice's "Definition of
> Done" — not optional.

**Goal:** A collaborative list PWA MVP (Approach A) per the
[MVP design](../specs/2026-06-02-smart-lists-mvp-design.md) and
[Vision PRD](../specs/2026-06-02-smart-lists-vision-prd.md).

**Visual target:** the [UI design handoff](../../design/2026-08-01-ui-handoff/README.md) (high-fidelity,
all 11 screens) plus the [UI design brief](../../design/2026-08-01-ui-design-brief.md) it was produced
from. The handoff's HTML files are the **binding source for all measurements and colors**; its README
carries the token table. It is a design reference, not production code — rebuild it in the existing
Next.js codebase, never paste its markup.

**Language:** Per [CLAUDE.md](../../../CLAUDE.md), implementation docs, code, and code comments are written
in **English** (project default as of 2026-06-04). **In-app user-facing strings stay German** (the product
is German). The existing canonical specs/PRDs remain in German. Commit messages: either is fine; keep them
consistent within a slice.

---

## Locked tech stack

This is the binding technology choice that the MVP design (deliberately technology-neutral) left open.
All slice plans build on it.

| Layer | Choice | Rationale |
|---|---|---|
| Frontend + API | **Next.js** (App Router, TypeScript), as an installable PWA | One repo for frontend **and** API (Route Handlers); covers the JS-frontend + polling architecture the vision hints at. |
| Auth | **Auth.js (NextAuth v5)** + Google provider, JWT session | Standard for Next.js; the `signIn` callback is the natural place for the allowlist gate. |
| Database | **Neon** (serverless Postgres) via **Prisma ORM** | Postgres = relational DB, fits the linked domain model. Neon = runs Postgres in the cloud (incl. test branches). Prisma = type-safe, beginner-friendly translator between TypeScript and SQL. |
| Tests | **Vitest** + Testing Library | Fast, TS-native, good for TDD. |
| Hosting | **Vercel** (plugin already active in `.claude/settings.json`) | Native Next.js platform. |

**Important stack-wide conventions** (honor in every slice):

- **Stable UUIDs** for all entities, client-generatable (preparation for offline Phase 2).
- **Entry-level, idempotent operations** as the mutation model (`add_item`, `update_item`,
  `check_item`, `remove_item`) from Slice 3 on — keep API contracts field/entry-granular.
- **Every API operation re-checks membership + role** (never trust the client).
- **Test-first (TDD)**, small vertical slices, frequent commits.
- DB access through an **injectable Prisma instance**, so logic stays testable in isolation
  (see test seams, MVP design §7).

---

## The slices (build order)

Slices 1–8 come from MVP design §9. Slice 9 was added on 2026-07-26, slices 10–12 on 2026-08-01 with
the design brief, slices 13–16 later the same day when the finished UI handoff landed (see the notes
under the table). Each slice is working, tested software on its own.

| # | Slice | Delivers | Plan | Status |
|---|---|---|---|---|
| 1 | **Auth + Allowlist** | Scaffold, Google login, email allowlist, JIT user provisioning, admin seed | [2026-06-04-slice-1-auth-allowlist.md](2026-06-04-slice-1-auth-allowlist.md) | ✅ Done / verified |
| 2 | **Projects + Membership** | Projects CRUD, roles (Owner/Member), invite/remove members, permission guard | [2026-06-28-slice-2-projects-membership.md](2026-06-28-slice-2-projects-membership.md) | ✅ Done / verified |
| 3 | **Lists + Entries (operations)** | Lists CRUD, ListItems, entry-level operations, category/quantity/unit/checked | [2026-07-05-slice-3-lists-entries.md](2026-07-05-slice-3-lists-entries.md) | ✅ Done / verified |
| 4 | **Catalog + Autocomplete** | Per-project CatalogItem, `normalized_name`, autocomplete, category flow-back | [2026-07-08-slice-4-catalog-autocomplete.md](2026-07-08-slice-4-catalog-autocomplete.md) | ✅ Done / verified |
| 5 | **Favorites + Suggestions** | Per-project favorites, pure suggestion read function (favorites ∪ N-of-M statistic), pre-fill | [2026-07-20-slice-5-favorites-suggestions.md](2026-07-20-slice-5-favorites-suggestions.md) | ✅ Done / verified |
| 6 | **Completion + Archive** | Complete a list (manual + auto-suggest when "all checked"), archive view | [2026-07-20-slice-6-completion-archive.md](2026-07-20-slice-6-completion-archive.md) | ✅ Done / verified |
| 7 | **Polling / Sync** | Cursor-based delta endpoint, client polling (1–3 s), last-writer-wins merge | [2026-07-20-slice-7-polling-sync.md](2026-07-20-slice-7-polling-sync.md) | ✅ Done / verified |
| 8 | **PWA polish** | Manifest, service worker, iPhone optimization (safe areas, home screen, touch) | _to be created_ | ⬜ Open |
| 9 | **Admin area (allowlist + admin rights)** | `/admin` page: invite/revoke allowlist emails, grant/revoke `is_admin`, remove a revoked person from all projects | [2026-07-26-slice-9-admin-area.md](2026-07-26-slice-9-admin-area.md) | ✅ Done / verified |
| 10 | **Catalog management** | Catalog edit operations (rename with normalized-name collision check, edit default category/unit, delete guarded by list usage, **create an article directly**) + `/projects/[id]/katalog` screen with search and inline edit panel | _to be created_ | ⬜ Open |
| 11 | **App structure + navigation** | Project drawer + desktop sidebar incl. **project switcher**; split the project screen into `/archiv`, `/favoriten`, `/mitglieder`; inline project rename; **new-list sheet with de-selectable pre-fill preview** | _to be created_ | ⬜ Open |
| 12 | **List interaction rework** | Trailing empty row instead of the add-entry form; category filter chips with auto-assignment; entry detail sheet for Menge/Einheit/Kategorie; **swipe-to-delete**. Inherits Slice 7's sync unchanged | _to be created_ | ⬜ Open |
| 13 | **Design foundation** | Design tokens, Figtree, icon set, and the shared primitives every later slice reuses: bottom sheet, chips, cards/rows, empty state, inline edit, destructive confirm, inline error | [2026-08-01-slice-13-design-foundation.md](2026-08-01-slice-13-design-foundation.md) | ✅ Done / verified |
| 14 | **Restyle the built screens** | Login, Zugang verweigert, Home (incl. the new "Weitermachen" card), Projekte, Verwaltung (incl. the two-way revoke sheet) in the new visual language | [2026-08-02-slice-14-restyle-built-screens.md](2026-08-02-slice-14-restyle-built-screens.md) | ✅ Done / verified |
| 15 | **Quantity parsing in the entry row** | Pure parser for "1,5 l Milch" / "3 Joghurt" (leading number + known unit → Menge/Einheit), wired into the trailing row; the catalog only ever receives the article name | _to be created_ | ⬜ Open |
| 16 | **Per-row remote-change flash** _(optional)_ | The design's 1.4 s highlight on rows a *remote* member changed. Pure comfort — sync works without it | _to be created_ | ⬜ Open (optional) |

**Status legend:** ⬜ Open · 🟨 In progress · ✅ Done / verified unless the row includes an explicit caveat

**Build order for what is left: 13 → 14 → 10 → 11 → 12 → 15 → 8**, then 16 only if real use asks for it.

> **Build-order note (2026-07-26):** Slice 5 was built LAST of the functional slices, after 6 and 7.
> Its N-of-M statistic reads *completed* lists, which only exist once Slice 6 ships, so the real
> dependency arrow runs 6 → 5, not by slice number; Slice 7 was pulled forward while Slice 5's plan
> was being reconciled. Slices 1–7 are done.

> **Slice 9 note (2026-07-26):** Slice 9 is **not** from MVP design §9 — it was added because no slice
> ever covered the "Allowlist pflegen — nur `is_admin`" row of the permission matrix (MVP design §6).
> Slice 1 shipped only the *read* side of that gate (`isEmailAllowed` + the seed script); there is no way
> to invite or revoke anyone from inside the app, and `is_admin` can only be set by editing the database.
> It is numbered 9 so the §9 numbering of slices 1–8 stays intact, but it is **built before Slice 8**
> (owner's decision, 2026-07-26): letting more people in is worth more right now than PWA polish, and
> Slice 8 has no plan yet, so nothing gets invalidated by going first.
>
> **Slice 9 is done / verified.**

> **Slices 10–12 note (2026-08-01):** These come from the
> [UI design brief](../../design/2026-08-01-ui-design-brief.md) and the structure review held while
> writing it. They are **not** from MVP design §9 — writing the brief forced the question of what the
> app's screens actually are, and the answer changed the structure:
>
> - The project screen stacked six unrelated concerns. Members, favorites, archive and the (previously
>   invisible) catalog become their own screens behind a Todoist-style project drawer (**Slice 11**).
> - The catalog is made **visible and editable** — rename an article, change its default category/unit,
>   delete it. This is the only genuinely new capability in the rework; everything else is existing
>   functionality relocated. Deleting is guarded: an article used by any list (active or archived)
>   cannot be deleted, because the N-of-M suggestion statistic reads past lists per article
>   (**Slice 10**). This supersedes the MVP design's "no catalog screen" decision.
> - The list screen's four-field add form is replaced by a **trailing empty row** (Apple Erinnerungen /
>   Todoist) plus **category filter chips**; typing in a filtered category auto-assigns that category.
>   Menge/Einheit move into an entry detail sheet (**Slice 12**). The "permanent sync indicator goes
>   away" item turned out to be a no-op — there has never been one; see the Slice 16 note.
>   Both the trailing row and the chips need the list body to become a client component — that is the
>   real cost driver of this slice; the chips themselves are nearly free, since `groupByCategory` in
>   `src/app/lists/[listId]/page.tsx` already computes exactly the chip set on every render.
>
> **Deferred at the time:** parsing quantity/unit out of the typed text ("Milch 1,5 l") — now scheduled
> as **Slice 15**, after Slice 12 (see the handoff note below).
>
> **Order within the rework: 10 → 11 → 12.** PWA polish (Slice 8) comes *after* it — polishing screens
> that are about to be split or re-interacted is wasted work, and Slice 8 still has no plan, so nothing
> is invalidated by moving it. Slice 10 goes first because it is backend-heavy and TDD-able (catalog
> operations), which gives Slice 11 a finished screen to hang in the drawer.
>
> ⚠️ The original plan to apply the visual language "per screen as slices 10–12 touch them" was
> **superseded** by the handoff note below: slices 13 + 14 now come first.

> **UI handoff note (2026-08-01):** The finished high-fidelity design landed in
> [docs/design/2026-08-01-ui-handoff/](../../design/2026-08-01-ui-handoff/) (README with the token
> table, two `.dc.html` reference prototypes, 12 screenshots). It covers all 11 screens of the brief —
> including the five that slices 10–12 never touch — and it specifies three things **beyond** the brief.
> Owner decisions, 2026-08-01:
>
> - **Styling gets its own foundation.** Nothing in `src/` is styled today (one `globals.css`, one
>   `page.module.css`). Every later screen needs the same primitives — bottom sheet, chips, cards/rows,
>   empty state, inline edit, destructive confirm, inline error — so they are built **once** in
>   **Slice 13** instead of three times inside slices 10–12. Styling approach: **CSS Modules** (already
>   the established pattern in the codebase and what the handoff README assumes). Icons: the design
>   deliberately ships placeholder squares — pick one set in Slice 13 (Lucide, stroke ~1.75) and use it
>   everywhere. Font: Figtree 400–800.
> - **Slice 14 restyles the already-built screens** the rework never reaches: Login, Zugang verweigert,
>   Home, Projekte, Verwaltung. It goes before 10–12 on purpose: those are the simplest screens, so they
>   prove out the Slice 13 tokens and primitives cheaply — except Verwaltung's two-way revoke sheet,
>   which is the first real customer of the sheet primitive and the most consequence-heavy screen in the
>   app. It also carries the one **new capability** the design added here: the Home **"Weitermachen"
>   card** (the user's most recently touched open list across all projects, with "5 von 8 offen" and a
>   progress bar). That needs a new cross-project read function with its own tests — the design brief
>   only invited it as a proposal ("feel free to propose"); the owner accepted it.
> - **Quantity parsing becomes Slice 15**, after 12. The design specifies it in the trailing row
>   ("1,5 l Milch", "3 Joghurt" → Menge/Einheit), while brief §8 and the note above deferred it. Slice 12
>   therefore builds the trailing row **name-only**, exactly as the brief describes, and the parser
>   follows as a small pure-function-plus-wiring slice. Keeps an uncertain heuristic out of the slice
>   that already carries the server→client conversion of the list body. Rule that must survive: the
>   **catalog only ever receives the article name**, never the parsed quantity.
>
> Two smaller design additions were absorbed into existing slices rather than scheduled separately:
> **Slice 10** gains "Neuen Artikel anlegen…" (creating a catalog article directly, not only as a
> by-product of typing an entry) plus the search field and the inline edit panel; **Slice 11** gains the
> project-switcher dropdown in the drawer, the desktop sidebar (≥ ~900px), and the new-list bottom sheet
> whose pre-fill preview chips can be de-selected individually with a live count
> ("Liste mit 7 Einträgen anlegen"). That sheet is more than Slice 5's boolean `prefill` flag: it reads
> `GET /suggestions` first and then creates the list from the surviving selection.
>
> **Slice 10 (Katalog-Verwaltung) is the next open slice** (plan still to be created).

> **Slice 16 note (2026-08-01) — why the flash is optional and last.** The design replaces the permanent
> sync indicator with a **per-row flash** (`#eef2fc → transparent`, 1.4 s) on rows a *remote* member
> changed. Two findings moved it out of Slice 12 into its own optional slice at the very end:
>
> - **The "no permanent indicator" half is already true.** `ListSyncPoller` renders `null` and the list
>   page shows no sync UI at all. Nothing to remove.
> - **Cross-device sync does not need any of this.** Slice 7 shipped it and it was verified in a
>   two-session browser test (2026-07-26): add / check / edit / remove / rename / complete all propagate
>   in ~2 s. That works *because* `changed → router.refresh()` never asks which row changed — it just
>   re-pulls server truth. The flash is the only requirement in the whole product that needs per-row
>   identity **on the client**, and it changes no data, fixes no bug and unblocks nothing. It buys
>   attention routing (40 items re-render silently; the highlight says where to look) — genuinely nice in
>   a shared shopping list, and genuinely optional.
>
> **The implementation question it forces is "who owns a row on the client?"** — not "where does the data
> come from". The data is already on the wire: `delta.items` carries the changed bodies with ids, and the
> id-set diff gives adds/deletes. Two credible answers, to be chosen **after** Slice 12 has settled the
> list screen's client/server split:
>
> - **Path A — client entry store.** Entries move into client state; the poller merges the delta
>   (`mergeDelta(current, delta) → { items, flashedIds }`, a lovely pure function to TDD) instead of
>   calling `router.refresh()`. Flagging a changed row is then trivial. But it introduces a second source
>   of truth next to the DB — this is the "client-side entry store + optimistic UI" the Slice 7 log
>   assigns to **Phase 2**. `DeltaItem.updatedAt` is already exposed for exactly that future.
> - **Path B — flash context, rows stay server-rendered.** A `FlashProvider` (client state) holds the
>   recently-changed ids; each `<li>` gets a thin client wrapper that only sets `className`. This works
>   because `router.refresh()` **preserves client component state**, so the provider survives while the
>   server supplies fresh content. No merge logic, no second source of truth, no Phase 2. Seam: the flash
>   starts a few hundred ms before the refreshed content lands — invisible at 1.4 s.
>
> Path B is the cheaper default; take Path A only if Slice 12 pulls the list body client-side anyway.
> **Two problems appear on either path:** (1) your *own* writes come back in your own next delta, so a
> naive implementation flashes the row you just tapped — the write path has to tell the poller "I caused
> id X"; (2) a CSS animation only replays on a class *transition*, so a row changing twice inside 1.4 s
> needs the class re-applied or the element re-keyed. One thing already handled: the render-time baseline
> cursor means the first poll never reports rows you are already looking at — no flash storm on load.
>
> **Cheap insurance while building Slice 12:** put `data-item-id` on each entry row. Useful for tests
> anyway, and it keeps this door open without building anything speculative.

### Dependencies between slices

```
1 Auth ──> 2 Projects/Membership ──> 3 Lists/Entries ──> 4 Catalog ──> 5 Favorites/Suggestions
  │                                       │                                    ^
  │                                       ├──> 6 Completion/Archive ───────────┘
  │                                       └──> 7 Polling/Sync
  └──> 9 Admin area (allowlist + admin rights)

UI rework + design (2026-08-01):
13 Design foundation ──> 14 Restyle built screens
        │                       (Login, Fehler, Home + Weitermachen, Projekte, Verwaltung)
        ├──> 4 Catalog ──> 10 Catalog management ──┐
        ├──> 2 Projects ───────────────────────────┴──> 11 App structure + navigation
        └──> 3 Lists/Entries + 7 Polling ─────────────> 12 List interaction rework ──> 15 Qty parsing
                                                              └──> 16 Row flash (optional, last)

8 PWA polish: final polish at the end, AFTER 10–15.

Build order for what is left:  13 → 14 → 10 → 11 → 12 → 15 → 8   ·   16 only if real use asks for it
```

- Slice 2 needs 1 (auth identity for membership checks).
- Slice 3 needs 2 (lists live in projects; operations check membership).
- Slice 4 needs 3 (catalog hangs off ListItems / input).
- Slice 5 needs 4 (suggestions read the catalog) **and** 6 (the statistic needs completed lists).
- Slices 6 + 7 hang off 3.
- Slice 9 needs only 1 (it writes the allowlist that Slice 1 reads). It has **no** dependency on 2–7 and
  changes **no** shared code path: the design's §4 analysis showed the planned session-guard rewrite was
  unnecessary. `requireUserId` still trusts the JWT; the new `requireAdmin` reads `isAdmin` live from the
  database but is used **only** by `/admin`. Cutting someone off from project content was already
  immediate before this slice, because membership is read fresh on every request (`getRole`, Slice 2).
- Slice 10 needs 4 (it edits the catalog Slice 4 built) and must not break Slice 5's statistic — hence
  the delete guard against list usage.
- Slice 11 needs 2 (membership screen), 5 (favorites screen), 6 (archive screen) and 10 (catalog screen);
  it is the slice that assembles them into one navigation shell.
- Slice 12 needs 3 (entry operations it drives from the trailing row) and 7 (the poller it makes quiet).
  It is independent of 10 and 11 and could be built in parallel.
- Slice 13 needs nothing but the handoff — it is pure presentation (tokens + primitives, no domain
  logic). Slices 10, 11, 12 and 14 all consume it; it is a hard prerequisite for each of them, because
  every one of those screens uses at least the sheet, the chips or the empty-state pattern.
- Slice 14 needs 13, and needs 1 (Login/Fehler), 2 (Projekte) and 9 (Verwaltung) for the screens it
  restyles — all done. Its one new capability, the Home "Weitermachen" card, additionally reads across
  2, 3 and 6 (open lists in the user's projects, with checked/total counts).
- Slice 15 needs 12 (it wires the parser into the trailing row that slice builds). It is the last
  functional slice and can slip past 8 without blocking anything.
- Slice 16 needs 12 **settled**, not merely done: its cost depends entirely on how much of the list body
  Slice 12 moved to the client. It blocks nothing and nothing waits on it — the app is fully
  collaborative without it. Deliberately scheduled after Slice 8 so the decision is "do we still want
  this after using it for a while?" rather than "how much would it cost?".

---

## Maintenance guide (for future agents)

When you have finished a slice, **before** the final commit do the following:

1. **Update the status table above:** set the slice to ✅ (or 🟨 if only partial), and fill in the real
   filename of the slice plan if you created it.
2. **Add a progress log entry** below (template there). Required content:
   - Date, slice, your result (what works now, what is tested).
   - **Deviations** from the slice plan and **why** (important for learning mode).
   - **Follow-up decisions** that affect later slices (e.g. "session now carries `isAdmin`").
   - Open items / debt the next slice inherits.
3. **Prepare the next slice:** if no plan exists yet for the next slice, create it with the
   `superpowers:writing-plans` skill, save it as `docs/superpowers/plans/YYYY-MM-DD-slice-N-<name>.md`,
   and link it in the status table.
4. **Update CLAUDE.md** once real build/test/run commands exist (see the note there: "When code is added,
   update this file with the real build/test/run commands.").

> Keep log entries short and factual. This umbrella plan is the shared source of truth about project
> progress — it must be correct when a fresh agent lands here with no context.

---

## Progress log

> Newest entries on top. Template:
>
> ```
> ### YYYY-MM-DD — Slice N: <name> — <status>
> - **Delivered:** …
> - **Tested:** … (command + result)
> - **Deviations from the plan:** … (or "none")
> - **Follow-up decisions for later slices:** …
> - **Inherited open items:** … (or "none")
> - **Commit(s):** <hash(es)>
> ```

### 2026-08-02 — Slice 14: Restyle the built screens — ✅ Done / verified
- **Delivered:** Deterministic German date/number formatting (`src/lib/format/date.ts`) clearing the
  Slice 13 hydration overlay root cause; German plural helpers; `PageHeader` + `ProgressBar`;
  restyled Login / Zugang verweigert / Home / Projekte / Verwaltung in the Slice 13 visual language;
  `listProjectSummaries` read model; `getContinueList` + `ContinueCard` (Weitermachen); `GoogleLogo`;
  `RevokeSheet` with URL-driven open state and both revoke Server Actions as props. Plan file
  `2026-08-02-slice-14-restyle-built-screens.md` already committed with the slice.
- **Tested:** `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude
  '**/.worktrees/**'` → **46 files / 328 tests** passed; `npm run lint` → 2 errors + 8 warnings, all
  pre-existing in `docs/design/2026-08-01-ui-handoff/support.js` (`src/` clean; process exit 0);
  `npm run build` succeeds. Manual 14-item checklist (dev server on `:3014`): **PASS** —
  (1) `/login` accent tile + real Google G + copy; (2) `/auth/error` neutral lock, no red, back link;
  (13) `/dev/ui` includes `PageHeader` + `ProgressBar`; (14) no horizontal scroll at 375px on those
  three routes. **DEFERRED (Google OAuth unavailable in this environment)** — (3)–(11) signed-in
  Home / Projekte / Verwaltung behaviours; (12) hydration console on `/projects/[projectId]` and
  `/lists/[listId]` (format fix unit-tested; automation `data-cursor-ref` overlay on `/auth/error`
  is a known false positive per Task 5). Domain/component tests cover Weitermachen ranking, summaries,
  ContinueCard, and RevokeSheet close/actions.
- **Deviations from the plan:** Task 2 — 7 vitest cases vs brief’s “8” (one `it` asserts two plural
  values). Task 3 — `ProgressBar` JSDoc vs unclamped `aria-valuenow` (visual fill clamps; a11y reports
  raw). Task 10 — empty-state flex centering may be soft. Task 11 — self-row shows Admin twice
  (brief-verbatim). Task 12 — JWT honesty sentence dropped (handoff-aligned); `next/navigation` mock
  localized in setup for jsdom. Tasks 9–12 browser smoke partly deferred (OAuth).
- **Follow-up decisions for later slices:**
  - `PageHeader`'s `leading` slot is where Slice 11 mounts the ☰ drawer trigger.
  - `src/lib/format/date.ts` is now the only sanctioned way to render a date or a decimal —
    `toLocaleDateString` / `toLocaleString` must not reappear (Task 1 Step 6 grep is the guard).
  - "Last touched" is derived from `ListItem.updatedAt`, not stored on `List`. If a later slice ever
    needs list-level recency for renames too, that is the moment to add `List.updatedAt` — not before.
  - `listProjectSummaries` is the read model Slice 11's project switcher should reuse.
  - The revoke sheet keeps the URL (`?revoke=`) as its open/closed state; any future sheet on a
    server-rendered screen should follow that pattern rather than lifting data fetching to the client.
- **Inherited open items:** Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0;
  overlapping polls; cancelled-before-JSON race) remain open. Locale-date hydration overlay from the
  Slice 13 log is **closed** by Task 1 (signed-in project/list browser re-check still deferred on OAuth).
  **Slice 10 (Katalog-Verwaltung) is next** (plan still to be created).
- **Commit(s):** `1ee0781`…`5f6dd7b` (implementation Tasks 1–12) + this docs commit; plan file
  `2026-08-02-slice-14-restyle-built-screens.md` landed earlier as `66cc325`.

### 2026-08-02 — Slice 13: Design foundation — ✅ Done / verified
- **Delivered:** Design tokens + Figtree in `src/app/globals.css` / `layout.tsx`; the 14 primitives in
  `src/components/ui/` (Button, TextField/FieldError, Card, RowLink, Avatar, Badge, SectionLabel, Chip,
  ChipTabs, EmptyState, Sheet, ConfirmSheet, InlineEdit, Banner) plus `Icon`; development gallery at
  `/dev/ui` (404 in production; middleware excludes `dev` so the gallery is reachable unauthenticated
  in development).
- **Tested:** `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**'` → **37 files /
  274 tests** passed; `npm run lint` → only pre-existing errors in
  `docs/design/2026-08-01-ui-handoff/support.js` (gallery/`src` clean); `npm run build` succeeds;
  Task 14 manual browser checklist — all **12** items PASS (Figtree, background, button weights,
  invalid TextField, RowLink cards, ChipTabs underline, removable Chip, Sheet open/Escape/overlay/
  scroll lock, ConfirmSheet options, InlineEdit Enter/Escape, EmptyState).
- **Deviations from the plan:** Task 5 — human overruled plan text: TextField spreads `{...rest}`
  **before** aria attrs so error wiring always wins (`391a658`). Task 14 — middleware `dev` exclusion
  was required (not in the original file list) so Auth.js does not redirect `/dev/ui` → `/login`.
- **Follow-up decisions for later slices:**
  - Component tests opt into a DOM with `// @vitest-environment jsdom`; `src/test/setup.ts` registers
    Testing Library cleanup and jest-dom only in that environment.
  - `src/app/globals.css` is the single token source; `src/test/design-tokens.test.ts` pins the
    palette, so changing a colour means changing the test too — on purpose.
  - Only components with hooks carry `"use client"` (`Sheet`, `ConfirmSheet`, `TextField`,
    `InlineEdit`). The rest stay server-renderable.
  - `Chip`'s `onClick` and `onRemove` are mutually exclusive by design.
  - `RowLink` is a whole-card `<a>`, so its slots must not contain interactive elements.
  - `Sheet` has no focus trap and no focus restore — a deliberate MVP cut, worth revisiting when a
    sheet grows a multi-step flow.
  - CSS custom properties cannot be used in `@media`; the desktop breakpoint stays the literal `900px`.
- **Inherited open items:** Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0;
  overlapping polls; cancelled-before-JSON race) remain open. The locale-date hydration overlay on
  project/list pages is still open — **Slice 14** touches those pages and should fix the overlay while
  it is there. **Slice 14 is next** (plan still to be created).
- **Commit(s):** `4d11b2f`…`1758371` (implementation) + this docs commit; plan file
  `2026-08-01-slice-13-design-foundation.md` added alongside.

### 2026-08-01 (later) — Per-row flash split out of Slice 12 into optional Slice 16
- **Delivered:** Roadmap correction only. The per-row remote-change flash left Slice 12 and became
  **Slice 16**, optional and scheduled *after* Slice 8. Supersedes the "swipe-to-delete and the per-row
  remote flash → Slice 12" line in the entry below, and the "Watch out in Slice 12" note it produced.
- **Tested:** n/a (documentation only).
- **Why (owner decision, after walking through `ListSyncPoller` and `getListDelta`):** cross-device sync
  is finished and verified — `changed → router.refresh()` propagates everything in ~2 s precisely
  *because* it never asks which row changed. The flash is the only requirement in the product that needs
  per-row identity on the client, it changes no data and unblocks nothing, and the app is fully
  collaborative without it. Its cost is also unknowable until Slice 12 settles the list screen's
  client/server split. So it waits until the app is installable (Slice 8) and real two-person use can
  answer whether the signal is actually missed.
- **Correction carried into the plan:** the earlier note claimed the flash "means the list body holds
  client state". That overstated it — **Path B** (a flash context plus thin per-row client wrappers,
  relying on `router.refresh()` preserving client state) delivers it with the rows still server-rendered.
  Path A (client entry store) is Phase 2 and only justified if Slice 12 moves the body client-side anyway.
  Both paths are now written up in the Slice 16 note, along with the two traps either one hits
  (own-writes flashing your own row; CSS animations not replaying without a class transition).
- **Follow-up decisions for later slices:** Slice 12 should put `data-item-id` on each entry row — cheap,
  useful for tests, and it keeps Slice 16 open without speculative work. Slice 12's own scope is now
  purely the interaction rework; it inherits Slice 7's sync untouched.
- **Inherited open items:** unchanged from the entry below; Slice 13 is still next.
- **Commit(s):** `712d552`

### 2026-08-01 — UI design handoff landed → slices 13–15 added, build order reshuffled
- **Delivered:** The finished high-fidelity design bundle, committed to
  [docs/design/2026-08-01-ui-handoff/](../../design/2026-08-01-ui-handoff/): `README.md` (token table,
  all 11 screens, navigation, motion values, empty-state pattern, PWA notes), `Smart Lists
  Prototyp.dc.html` (interactive — binding for behavior and motion), `Smart Lists Optionen.dc.html`
  (static — all screens, desktop 4a/4b, empty states 5a–5g), `support.js` (the prototypes' runtime) and
  `screenshots/` (12 PNGs). Meta plan updated: slices **13 (design foundation)**, **14 (restyle the
  built screens)** and **15 (quantity parsing)** added; scope of 10–12 extended with the design's
  additions; dependency graph and build order rewritten.
- **Tested:** n/a (documentation + design assets only; no code touched).
- **Decisions taken (owner, 2026-08-01):**
  - **Build order for the remainder is 13 → 14 → 10 → 11 → 12 → 15 → 8.** Styling stops being a
    per-slice afterthought: the primitives are built once in Slice 13 and proven on the simple existing
    screens in Slice 14 before the structural slices consume them.
  - **CSS Modules** stays the styling approach; **Figtree** the font; **one icon set** chosen in Slice
    13 (the design ships deliberate placeholder squares) and used everywhere after that.
  - **Home gets the "Weitermachen" card** (most recently touched open list across all the user's
    projects + "5 von 8 offen" + progress bar) — a new cross-project read function, built with tests in
    Slice 14.
  - **Quantity parsing is scheduled, not cancelled**, as Slice 15 after 12. Slice 12 builds the trailing
    row name-only per brief §8; the parser lands separately so an uncertain heuristic never sits inside
    the slice that converts the list body to a client component.
  - Absorbed without new slices: catalog article **creation** + search + inline edit panel → Slice 10;
    project switcher, desktop sidebar, and the **de-selectable pre-fill preview sheet** → Slice 11;
    swipe-to-delete and the per-row remote flash → Slice 12.
- **Follow-up decisions for later slices:** The handoff's inline styles are the binding source for
  measurements and colors — the README table is a summary, not the authority. The HTML is a reference
  prototype: rebuild it in React, never paste it. The per-row flash in Slice 12 requires the poller to
  know *which* entries changed (`ListSyncPoller` only calls `router.refresh()` today) — the delta
  endpoint already carries changed bodies and the full id set, but consuming it moves the list body to
  client state. The pre-fill sheet needs `GET /suggestions` *before* list creation, which Slice 5's
  boolean `prefill` flag does not cover.
- **Inherited open items:** Plans for slices 13, 14, 10, 11, 12, 15 and 8 all still to be created —
  **Slice 13 is next**. Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0;
  overlapping polls; cancelled-before-JSON race) remain open, as does the hydration overlay from
  locale-sensitive date formatting on the project/list pages — the latter is worth fixing while Slice 14
  and 12 touch those screens anyway.
- **Commit(s):** `e6718d9`

### 2026-08-01 — UI design brief + structure review → slices 10–12 added
- **Delivered:** [docs/design/2026-08-01-ui-design-brief.md](../../design/2026-08-01-ui-design-brief.md) — the input document for generating UI mockups. Reviewing it with the owner turned into a structure decision, so the brief now describes the app *after* a rework and marks every screen `[gebaut]` or `[neu]`. Screen count 7 → 11.
- **Tested:** n/a (documentation only; no code touched).
- **Decisions taken (owner, 2026-08-01):**
  - **Catalog becomes visible and editable** — rename (with `normalizedName` collision check), edit default category/unit, delete **only** when the article appears in no list, active or archived. Supersedes the MVP design's "catalog has no screen" decision and removes "catalog management screen" from the brief's out-of-scope list.
  - **Project screen is split** — archive, favorites, members and catalog become their own routes behind a Todoist-style project drawer. Renaming a project becomes inline on the project screen; the rename form disappears.
  - **List entry model changes** — the four-field add form is replaced by a trailing empty row (name only). Menge/Einheit/Kategorie move to an entry detail sheet, which keeps the existing catalog flow-back.
  - **Categories become filter chips**, not navigation: derived from the entries, alphabetical with "Ohne Kategorie" last, the active chip survives becoming empty, and typing in a filtered category auto-assigns it.
  - **No permanent sync indicator** — only a brief signal at the moment content actually changed.
  - **Quantity/unit text parsing ("Milch 1,5 l") deferred** — deliberately kept out of Slice 12 so an uncertain heuristic cannot block the entry model. Candidate follow-up, not scheduled.
- **Follow-up decisions for later slices:** Recommended build order **10 → 11 → 12 → 8**; Slice 8 (PWA polish) moves behind the rework because polishing screens about to be split is wasted work, and it has no plan yet, so nothing is invalidated. Slices 11 and 12 both need client components — the list body in particular, which is server-rendered today. The chips themselves are cheap: `groupByCategory` in `src/app/lists/[listId]/page.tsx` already builds exactly that set on every render, including every ~2 s poll re-render.
- **Inherited open items:** Plans for slices 10, 11, 12 and 8 all still to be created. Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0; overlapping polls; cancelled-before-JSON race) remain open, as does the hydration overlay from locale-sensitive date formatting on the project/list pages.
- **Commit(s):** `9e681e6` (brief + meta plan)

### 2026-07-26 — Slice 9: Admin area (allowlist + admin rights) — Done
- **Delivered:** `src/lib/admin/admin.ts` (`listAccessEntries`, `inviteEmail`, `revokeEmail`, `setAdmin`, `listProjectAccess`, `excludeFromAllProjects`) with the lockout invariants (no self-revoke, no self-demotion, never the last admin); `requireAdmin(db)` in `src/lib/auth/session.ts` reading `isAdmin` live from the DB; the `/admin` Server Component (access table, invite form, two-step revoke with two explicit intents, owned-projects notice); "Verwaltung" link on the home page replacing the dead `Admin: ja/nein` line.
- **Tested:** `npm test` passed (20 files, 203 tests — 35 new in Slice 9 vs plan estimate of ~30); `npm run lint` + `npm run build` clean (pre-existing `.remember/` lint warning and middleware-deprecation notice unchanged). Manual browser pass per plan Task 5 Step 4: largely passed (invite, revoke, setAdmin, exclude member, owned-projects Hinweis, non-admin redirect). Home "Verwaltung" link visibility needs a fresh OAuth JWT after seeding `isAdmin` in DB (expected: home uses session flag for visibility; `/admin` is guarded live). Checklist item 8 verified via DB demotion rather than a second private-window account.
- **Deviations from the plan:** Plan expected ~30 new tests / 198 total; actual is 203 in 20 files (`admin.test.ts` 30 + `session.test.ts` 5; Task 1 added a duplicate-email lockout regression beyond the brief's 12, and brief arithmetic was slightly low). `revokeEmail` lockouts were hardened beyond the plan's `findFirst`-only approach (human chose reviewer fix): self-revoke compares the caller's email; last-admin counts all admins bound to the email.
- **Follow-up decisions for later slices:**
  - NO REST endpoints for the allowlist (never polled, never merged offline). The domain layer is the seam if an API is ever needed.
  - `requireUserId` still trusts the JWT — deliberately. Only `/admin` pays for a live DB check. A plain revoke does not end a running session; *ausschließen* ends project access on the next request because membership is read live. Break-glass for the urgent case: rotate `AUTH_SECRET` and redeploy.
  - Owner memberships are never removed (`Project.ownerId` is a required FK). Ownership handover does not exist in the product; if it is ever needed it is its own capability with its own rules.
  - `session.test.ts` introduces the project's first `vi.mock` (of `@/auth`), scoped to that file only.
- **Inherited open items:** Slice 8 (PWA polish) plan to be created per maintenance guide step 3.
- **Commit(s):** fdaa7e7, fe1636a, 4f49ae6, d341521, 5200336, 317636e, b8b7468

### 2026-07-26 — Slice 5: Review fixes — Done
- **Delivered:** All seven findings from the Slice 5 code review, fixed on the same branch (plan: [2026-07-26-slice-5-review-fixes.md](2026-07-26-slice-5-review-fixes.md)). (1) Characterization tests pinning `NULLS LAST`, the configurable `M` window, the German locale sort, the favorites 404 message and `removeFavorite`'s malformed-id no-op. (2) New `compareArticleNames` (`src/lib/catalog/sort.ts`) shared by `listFavorites` and `computeSuggestions`. (3) `listFavorites` returns the lean `FavoriteArticle` instead of the raw Prisma row. (4) `suggestionRuleM` clamped to `Math.max(0, …)`. (5) `createPrefilledList` deletes its list if an entry fails. (6) The §4.3-vs-§3.1 "Menge" wording gap documented. (7) The Slice 5 SDD ledger committed.
- **Tested:** `npm test` passed (18 files, 168 tests — 9 new); `npm run lint` + `npm run build` passed (with the two pre-existing warnings noted in the Slice 7 entry). No manual browser pass needed: the only UI change is the favorites `<ul>` reading `f.name`/`f.catalogItemId` from the lean shape, covered by build + the core tests behind it.
- **Deviations from the plan:** none.
- **Follow-up decisions for later slices:**
  - `compareArticleNames` (`src/lib/catalog/sort.ts`) is THE article-ordering rule — any new article list must use it. `searchCatalog` is the deliberate exception: it truncates with `take` in the query, so a JS sort would reorder an already-cut page and could change which articles survive. Fix that when Slice 8 replaces the `<datalist>` with a fetch-on-keystroke dropdown.
  - `listFavorites` and `computeSuggestions` now return the same four-field article shape (`FavoriteArticle` / `SuggestedArticle`). They stay separate types so the favorites core does not import the suggestions core — suggestions read favorites, never the reverse.
  - `createPrefilledList` compensates (delete-on-failure) rather than transacts, because the Slice 3/4 cores type their first parameter as `PrismaClient` and an interactive transaction client is not assignable to it. Revisit only if a second multi-write orchestrator appears.
  - `suggestionRuleN`/`suggestionRuleM` are still not settable through any endpoint or UI. `M` is clamped at the read; if per-project tuning is ever exposed, validate both at the write instead.
  - MVP design §4.3 step 3 lists *Menge* among the catalog defaults a pre-filled entry inherits, but §3.1's `CatalogItem` has only `default_category`/`default_unit`. The entity list wins; `quantity: null` is correct. Do not add a `defaultQuantity` column on the strength of §4.3 alone.
- **Inherited open items:** Slice 8 (PWA polish) plan still to be created — it is the only remaining slice. Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0; overlapping polls; cancelled-before-JSON race) stay open and are untouched. The pre-existing Next.js hydration overlay from locale-sensitive date formatting on the project/list pages is also still open.
- **Commit(s):** 633fe25, 03b0bac, 0197e1f, 1246c66, 6e23629, b8d241b, 9eb57c3, 27b0f03

### 2026-07-26 — Slice 5: Favorites + Suggestions — Done
- **Delivered:** `Favorite` model + `add_favorites` migration (project-shared, unique per project+article); favorites core (`addFavorite`/`removeFavorite`/`listFavorites`, idempotent, project-scoped); `computeSuggestions` pure read (favorites ∪ articles in ≥ N of the last M completed lists, deduped, sorted, `completedAt DESC NULLS LAST` window); `createPrefilledList` (creates a list, seeds it via `applyOperation`); member-level REST endpoints (`GET`/`POST /favorites`, `DELETE /favorites/:catalogItemId`, `GET /suggestions`, `prefill` flag on lists POST); "Vorbefüllte Liste anlegen" form + Favoriten section on the project page.
- **Tested:** `npm test` passed (18 files, 159 tests — 24 new in Slice 5); `npm run lint` + `npm run build` passed (with the two pre-existing warnings noted in the Slice 7 entry). Manual browser check: all 8 Step 7 checks passed. In project Einkauf, Bananen/Milch were favorited; a pre-filled list got the favorites while a plain list stayed empty; completing 2 lists with Nudeln made the next pre-fill include Nudeln plus the favorites once each; reopening one completed list made Nudeln drop from the next pre-fill.
- **Deviations from the plan:** Task 4's sortIndex assertion used `[1, 2]`, not the plan's `[0, 1]`, because `applyOperation` starts at 1 (matching the existing operations contract). Minor earlier review notes remain non-blocking: a 404 message assertion gap and focused `NULLS LAST`, configurable-M, and German-locale-sort test gaps. A pre-existing Next.js hydration overlay from locale date formatting appeared on project/list pages but did not block Slice 5 flows and is unrelated to favorites.
- **Follow-up decisions for later slices:**
  - The statistic is live (Slice 6 shipped first). `completeList` never re-stamps `completedAt` and `reopenList` clears it, so the "last M completed" window is stable and reversible — do not change that guard without revisiting `computeSuggestions`.
  - Pre-fill goes through `applyOperation` (single mutation path) and inherits catalog category/unit — Slice 7's delta sees pre-fill entries as ordinary `add_item` results with a normal `updatedAt`, no special case needed. Never replace that loop with a bulk `createMany`.
  - The project page is NOT polled (`ListSyncPoller` is list-page only), so favorites do not live-update between members. Deliberate: if Phase 2 wants project-level sync, extend the delta seam rather than special-casing favorites.
  - Favorites are project-shared and keyed by `(projectId, catalogItemId)`; `addFavorite` blocks cross-project ids (404).
  - `computeSuggestions` (`src/lib/suggestions/suggestions.ts`) and the `/suggestions` endpoint are the read seam the future PWA client consumes.
- **Inherited open items:** Slice 8 (PWA polish) plan to be created per maintenance guide step 3 — it is the only remaining slice. Slice 7's minor non-blocking review notes (empty `?since=` → cursor 0; overlapping polls; cancelled-before-JSON race) stay open and are untouched by this slice.
- **Commit(s):** cc4ebd2, 9b869b8, a993cb6, 47064f0, 8971c10, 7169c42, plus the docs commit carrying this entry

### 2026-07-26 — Slice 7: Polling / Sync — Manual browser verification complete
- **Delivered:** (no code changes) Closed the open Task 4 Step 5 two-session browser verification from 2026-07-20.
- **Tested:** Manual E2E with two allowlisted members on the same open list (Session A mutates, Session B observes). Verified within ~2s without a manual reload in B: (1) add entry → appears in B; (2) check entry → checkbox/strike-through updates in B; (3) edit field (re-add / category or `/ops`) → change appears in B; (4) remove entry → disappears in B (id-set deletion detection); (5) rename or complete list → B reflects new name / status; (6) B tab backgrounded, change in A, return to B → change shows on the next visible poll (`document.hidden` skip does not lose updates).
- **Deviations from the plan:** None for the verification itself.
- **Follow-up decisions for later slices:** Unchanged from the Slice 7 Done entry.
- **Inherited open items:** None for Slice 7 manual verification. Slice 8 (PWA polish) plan still to be created per maintenance guide step 3. Slice 5 remains next to build (after its plan reconciliation against Slice 6 project-page edits).
- **Commit(s):** (documentation-only update; no new code commits)

### 2026-07-24 — Slice 6: Completion + Archive — Manual browser verification complete
- **Delivered:** (no code changes) Closed the open Task 4 Step 7 browser verification from 2026-07-20.
- **Tested:** Manual E2E while logged in as an allowlisted member. Verified: (1) open list → "Liste abschließen" visible, no auto-suggest while unchecked; (2) check every entry → auto-suggest prompt appears; (3) complete → "✓ Abgeschlossen am <date>" + "Wieder öffnen", entries still render; (4) project page → list under "Archiv" with date, gone from "Listen"; (5) reopen → active again under "Listen", out of "Archiv".
- **Deviations from the plan:** None for the verification itself.
- **Follow-up decisions for later slices:** Unchanged from the Slice 6 Done entry.
- **Inherited open items:** None for Slice 6 manual verification. Slice 5 plan reconciliation against this slice's project-page edits still applies when executing Slice 5.
- **Commit(s):** (documentation-only update; no new code commits)

### 2026-07-20 — Slice 7: Polling / Sync — Done
- **Delivered:** `getListDelta` + `computeCursor` (cursor = max ListItem.updatedAt in epoch-ms; changed bodies via strict `> since`; full id set for tombstone-less deletion detection; always-full list metadata); `GET /api/lists/:id/delta?since=` member-level endpoint; `ListSyncPoller` client component (~2s interval, `document.hidden` skip, `router.refresh()` on change); mounted on the list page with a render-time baseline.
- **Tested:** `npm test` passed (16 files, 135 tests — 9 new in Slice 7); `npm run lint` + `npm run build` passed. The build retained the known multiple-lockfile/Turbopack-root and `middleware` deprecation warnings. Manual two-session browser check (add/check/edit/remove/rename propagate within ~2s): completed 2026-07-26 (see entry above).
- **Deviations from the plan:** none (manual verification was deferred from the agent run and closed later).
- **Follow-up decisions for later slices:**
  - Last-writer-wins is enforced SERVER-SIDE in applyOperation; the poller only makes remote writes visible. A client-side entry store + optimistic UI + offline queue is Phase 2 and would consume this same delta endpoint (Slice 8 may start it).
  - The cursor is millisecond-precision with a strict `>` filter (never switch to `>=` — refresh loop). Rare same-ms field updates may defer until the next change; adds/deletes are always caught by the id-set diff (accepted MVP limitation, §8).
  - `ListSyncPoller` is the project's first client component; further client-side interactivity builds on this pattern.
- **Inherited open items:** Slice 8 (PWA polish) plan to be created per maintenance guide step 3. Manual two-session browser verification closed 2026-07-26. Minor non-blocking review notes: empty `?since=` becomes cursor `0`; overlapping polls and the cancelled-before-JSON race remain possible.
- **Commit(s):** 1996bd5, cc74c57, 21b1415, b99ee4a, plus the docs commit carrying this entry


### 2026-07-20 — Slice 6: Completion + Archive — Done
- **Delivered:** `completeList` (idempotent, stamps completedAt), `reopenList` (undo, clears it), `allItemsChecked` predicate; `listLists` optional status filter (active by createdAt, archive by completedAt); `POST /api/lists/:id/complete` + `/reopen` endpoints; `?status=` filter on the lists GET; list-page completion UI (manual + auto-suggest prompt + undo) and project-page "Archiv" section.
- **Tested:** `npm test` passed (15 files, 126 tests — 8 new in Slice 6); `npm run lint` + `npm run build` passed cleanly. Manual browser check of complete → archive → reopen: completed 2026-07-24 (see entry above).
- **Deviations from the plan:** none.
- **Follow-up decisions for later slices:**
  - Completion is idempotent and never re-stamps completedAt — Slice 5 may rely on a stable "last M completed" ordering.
  - List lifecycle changes (complete/reopen) are list-level mutations, NOT entry operations; Slice 7's delta must surface `status`/`completedAt` changes separately from the entry ops.
  - Completed lists remain editable (read-only archive was intentionally out of scope) — revisit if needed.
- **Inherited open items:** Slice 5 plan (`docs/superpowers/plans/2026-07-20-slice-5-favorites-suggestions.md`) is written and ready; its statistic is now live because completed lists exist. Reconcile Slice 5's project-page edits against this slice's changes to the same file (see that plan's header note). Manual browser verification completed 2026-07-24.
- **Commit(s):** 14da449, ed32905, 03cc6dc, 61026a6, plus the docs commit carrying this entry

### 2026-07-20 — Slice 4 follow-up: `CATALOG_DATALIST_LIMIT` for datalist browse
- **Delivered:** Separate browse cap `CATALOG_DATALIST_LIMIT` (1000) in `search.ts`; list detail page seeds `<datalist>` with that limit instead of `CATALOG_SEARCH_LIMIT` (20). Native datalist filters only over pre-rendered options, so the API's short cap was silently hiding later articles.
- **Tested:** Lint/compile only for the follow-up (behavior change is the numeric limit passed to already-tested `searchCatalog`); full Slice 4 manual browser verification already recorded in the entry below.
- **Deviations from the plan:** Intentional post-slice fix; plan Task 5 used the default search limit for browse.
- **Follow-up decisions for later slices:** When Slice 8 replaces the datalist with fetch-on-keystroke (`?q=` at `CATALOG_SEARCH_LIMIT`), remove `CATALOG_DATALIST_LIMIT`.
- **Inherited open items:** Unchanged (Slice 5 plan still open).
- **Commit(s):** bfffcd0, plus the docs commit carrying this entry

### 2026-07-20 — Slice 4: Catalog + Autocomplete — Manual browser verification complete
- **Delivered:** (no code changes) Closed the open Task 5 browser verification from 2026-07-09.
- **Tested:** Manual E2E on list detail page ("Rewe") while logged in as an allowlisted member. Verified: (1) add "Bananen" with category "Obst" → entry under Obst; (2) typing "Ban" suggests "Bananen" from `<datalist>`; (3) re-add "Bananen" with blank category → inherits Obst; (4) re-add "Bananen" with a new explicit category → catalog default updates; subsequent blank-category add inherits the newest category. Note: no entry-edit UI yet — Check 4 used re-add with explicit category (plan alternative); `update_item` remains API/core-only.
- **Deviations from the plan:** None for the verification itself. Entry edit UI was never in Slice 3/4 scope.
- **Follow-up decisions for later slices:** Unchanged from 2026-07-09 entry.
- **Inherited open items:** None for Slice 4. Slice 5 plan still to be created.
- **Commit(s):** (documentation-only update; no new code commits)

### 2026-07-09 — Slice 4: Catalog + Autocomplete — Done
- **Delivered:** `searchCatalog` (prefix match on `normalizedName`, blank=browse, lean `CatalogSuggestion` shape; API default `CATALOG_SEARCH_LIMIT` = 20); `flowBackCatalogDefaults` (non-null category/unit → catalog default); flow-back wired into `applyOperation` for `add_item` (explicit values) and `update_item` (category/unit); `GET /api/projects/:id/catalog?q=` member-level autocomplete endpoint; server-rendered `<datalist>` autocomplete on the list detail page (category/unit inherit at add time — no input prefill; datalist browse uses `CATALOG_DATALIST_LIMIT` = 1000, not the API's 20).
- **Tested:** `npm test` passed (15 files, 118 tests — 12 new in Slice 4 + 106 from Slices 1–3); `npm run lint` passed; `npm run build` passed cleanly. Manual browser check of datalist autocomplete + category inheritance: completed 2026-07-20 (see entry above).
- **Deviations from the plan:** None for the six planned tasks. Post-slice follow-up: `CATALOG_DATALIST_LIMIT` (see 2026-07-20 follow-up entry) so the native datalist is not silently capped at 20.
- **Follow-up decisions for later slices:**
  - `searchCatalog` (`src/lib/catalog/search.ts`) is the catalog read seam — Slice 5 suggestions and the future PWA client build on it.
  - `flowBackCatalogDefaults` runs INSIDE `applyOperation` only — the catalog default is only ever mutated through the operations funnel (keeps the single mutation path intact for Slice 7 sync).
  - Flow-back is non-null only: clearing an entry's category/unit never erases the catalog default (deliberate — shared project memory).
  - Autocomplete UI is a native `<datalist>` (no client component yet); datalist browse uses `CATALOG_DATALIST_LIMIT` (1000) because options are filtered client-side only. A fetch-based dropdown with live category/unit prefill remains a possible PWA-polish upgrade (Slice 8), consuming the GET endpoint at `CATALOG_SEARCH_LIMIT` — at which point `CATALOG_DATALIST_LIMIT` can be removed.
- **Inherited open items:** Slice 5 plan (`docs/superpowers/plans/YYYY-MM-DD-slice-5-favorites-suggestions.md`) to be created per maintenance guide step 3. Manual browser verification completed 2026-07-20.
- **Commit(s):** e5ebf30, ed51baa, 1692a81, 7919524, 4c9ad64, 92158a8, plus the docs commit carrying this entry

### 2026-07-05 — Slice 3: Lists + Entries (operations) — Done
- **Delivered:** Lists CRUD inside projects (`createList`, `listLists`, `getListWithItems`, `renameList`, `deleteList`); minimal catalog identity (`normalizeName`, `getOrCreateCatalogItem` with per-project `normalized_name` uniqueness); list-scoped access guard (`requireListAccess`); entry-level operations model (`parseOperation`, `applyOperation` for `add_item`, `update_item`, `check_item`, `remove_item` with idempotency semantics); REST routes (`/api/projects/:id/lists`, `/api/lists/:id`, `/api/lists/:id/ops`); server-rendered UI (project detail "Listen" section + list detail page with entries grouped by category, quantity/unit, check/remove). Prisma schema adds `ListStatus`, `CatalogItem`, `List`, `ListItem` with client-generatable UUIDs and `@updatedAt` on entries.
- **Tested:** `npm test` passed (14 files, 106 tests — 50 new in Slice 3 + 56 from Slices 1+2); `npm run lint` passed; `npm run build` passed cleanly.
- **Deviations from the plan:** None. All 9 tasks completed as specified.
- **Follow-up decisions for later slices:**
  - `requireListAccess` (`src/lib/lists/access.ts`) is the list-scoped guard — Slices 6 + 7 MUST use it for every list-scoped operation (it composes `requireMembership` and hides existence with 404).
  - `applyOperation` (`src/lib/lists/operations.ts`) is the ONLY mutation path for entries — the Slice 7 sync endpoint and any future transport must funnel through it, never ad-hoc writes.
  - Idempotency semantics: replayed `add_item` (same id, same list) is a no-op returning the existing entry; `remove_item` on a missing entry is a silent no-op; `update_item`/`check_item` on a missing entry are 404 — Slice 7's merge design must account for the 404 case (stale clients operating on removed entries).
  - `remove_item` deletes the row (no tombstones). Slice 7's delta endpoint must therefore make deletions observable to pollers (e.g. include the list's current item ids in the delta response).
  - `CatalogItem` exists with get-or-create identity (`getOrCreateCatalogItem`); the first-typed display name wins and defaults stay null until Slice 4 adds autocomplete + flow-back.
  - `ListItem.updatedAt` is maintained via Prisma `@updatedAt` on every operation — the Slice 7 cursor/LWW basis.
- **Inherited open items:** Slice 4 plan (`docs/superpowers/plans/YYYY-MM-DD-slice-4-catalog-autocomplete.md`) still to be created per maintenance guide step 3. Browser end-to-end verification for Slice 3 (Task 8 manual checks) not recorded in agent context — recommended before starting Slice 4.
- **Commit(s):** b26555c, 20cd0ab, 92fa235, cab6e29, a271b87, 39ef205, 7388bd5, 0dd5ae0, plus the docs commit carrying this entry

### 2026-07-05 — Slice 2: post-review security/robustness fixes
- **Delivered:** Fixes from the Slice 2 code review, implemented test-first (13 new tests):
  `listMembers` no longer exposes `googleSub`/`isAdmin` (selects only `id`/`email`/`displayName`;
  new `MemberUser` type); malformed (non-UUID) URL ids now yield 404 instead of a Prisma-P2023 500
  (new `isUuid` in `src/lib/validate.ts`, applied in `getRole` and `removeMember`); input length
  limits (`MAX_PROJECT_NAME_LENGTH` = 200 enforced in create **and** rename, `MAX_EMAIL_LENGTH` =
  254 in `addMember`); deterministic oldest-account pick for duplicate emails in `addMember`
  (`orderBy createdAt asc`); corrected a factually wrong comment in the PATCH route; project detail
  page fetches project + members via `Promise.all`. Details in the implementation review, section 6.
- **Tested:** `npm test` passed (9 files, 56 tests — 43 from the slice + 13 new); `npm run lint`
  passed; `npm run build` passed cleanly.
- **Deviations from the plan:** n/a (post-plan review fixes).
- **Follow-up decisions for later slices:**
  - `isUuid` (`src/lib/validate.ts`) is the standard shape check before passing URL-derived ids to
    uuid DB columns; the guard applies it automatically for all project-scoped operations.
  - Length limits for user input belong in the core functions (not only the routes), so server
    actions and future transports inherit them automatically.
- **Inherited open items:** none.
- **Commit(s):** ed6b87c (code + tests), plus the docs commit carrying this entry

### 2026-07-05 — Slice 2: Projects + Membership — Manual browser verification complete
- **Delivered:** (no code changes) Closed the open Task 8 browser verification from 2026-06-29.
- **Tested:** Manual E2E in Safari with two allowlisted Google accounts (`volkertjaden@gmail.com` as Owner, `luise.enda.tjaden@gmail.com` as Member). Verified: login/logout, home → `/projects`, project create/rename/delete, owner detail page and controls, invite existing user, reject unknown email (`Nutzer nicht gefunden …`), member view without owner controls, non-member redirect to `/projects`. Re-ran `npm test` (43/43), `npm run lint`, `npm run build` — all green.
- **Deviations from the plan:** None. Member removal (`Entfernen`) was not exercised manually; covered by unit tests.
- **Follow-up decisions for later slices:** Unchanged from 2026-06-29 entry (guard, ApiError, addMember login requirement, 404 for non-members).
- **Inherited open items:** None for Slice 2. Slice 1 manual OAuth also verified in the same session.
- **Commit(s):** (documentation-only update; no new code commits)

### 2026-06-29 — Slice 2: Projects + Membership — Done (browser verification pending)
- **Delivered:** Projects CRUD (create/list/get/rename/delete), Owner/Member role model, invite/remove members (idempotent upsert, owner-removal guard), reusable permission guard (`getRole` / `requireMembership` / `requireOwner`), REST API (7 route handlers), server-rendered UI (project list + detail pages with server actions), HTTP error convention (`ApiError` + `toErrorResponse`), and `requireUserId` session helper.
- **Tested:** `npm test` passed (8 files, 43 tests — 20 new in Slice 2 + 23 from Slice 1); `npm run lint` passed; `npm run build` passed cleanly.
- **Deviations from the plan:** None. All 8 tasks completed as specified.
- **Follow-up decisions for later slices:**
  - The permission guard `src/lib/projects/guard.ts` (`getRole` / `requireMembership` / `requireOwner`) is the reusable authorization primitive — Slices 3–6 MUST call it for every project-scoped operation.
  - `ApiError` + `toErrorResponse` (`src/lib/http/errors.ts`) is the standard HTTP error convention; `requireUserId` (`src/lib/auth/session.ts`) is the standard way route handlers resolve the caller.
  - `addMember` requires the invitee to have logged in once (a `User` row must exist). Pending email-only invitations are deferred to Phase 2 (would need a model change).
  - Non-members receive `404` (not `403`) for project access, to avoid leaking project existence.
- **Inherited open items:** Browser end-to-end verification (Task 8) was skipped in agent context — must be completed manually before considering Slice 2 fully done. Also inherits the Slice 1 open item: complete a manual Google sign-in pass.
- **Commit(s):** c8e7d0d, 97690a5, c649bfc, d673a19, f16cba8, c89bc50, 407f888, fa28986

### 2026-06-27 — Slice 1: Auth + Allowlist — Done
- **Delivered:** Next.js/App Router scaffold, Prisma auth schema and migration, Google Auth.js wiring, closed-access allowlist gate, just-in-time user provisioning, admin/allowlist seed, protected home page, login/error pages, middleware protection, and test infrastructure.
- **Tested:** `npm test` passed (3 files, 8 tests); `npm run lint` passed; `npm run build` passed. Browser automation reached the Google OAuth manual sign-in step, so full enabled-user login/logout/admin-refresh verification still requires manual Google completion. Local checks and unauthenticated redirect/login/error page smoke checks passed.
- **Deviations from the plan:** Prisma seed configuration lives in `prisma.config.ts` instead of deprecated `package.json#prisma`, removing the seed deprecation warning. Next 16 warns that `middleware` is deprecated in favor of `proxy`; the slice keeps `src/middleware.ts` because the plan requested it and the build succeeds.
- **Follow-up decisions for later slices:** Session carries `user.id` (UUID) and `user.isAdmin`; JWT strategy, so DB permission changes only take effect on next login. Membership checks (Slice 2) build on `session.user.id`.
- **Inherited open items:** Complete a manual Google sign-in pass for enabled-user login/logout/admin flag refresh once browser interaction can finish OAuth. Revisit `middleware` -> `proxy` migration in a later Next.js maintenance slice.
- **Commit(s):** 2b117aaefc22d19ad863a02b88062b2b8428b6eb, 61b1cce1aa0787a3f25d522d4eb83a14be7dc838, a3ce3bd7675e96cf11c065717d5d001d605a129c. This line records the finalized Slice 1 / Task 9 documentation commits through the prior metadata consistency update; later commits may be metadata-only tracking fixes.
