# Smart Lists — Meta Project Plan (MVP, Approach A)

> **For agentic workers:** This is the **umbrella plan** over all 8 vertical slices of the MVP.
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

## The 8 slices (build order)

Order from MVP design §9. Each slice is working, tested software on its own.

| # | Slice | Delivers | Plan | Status |
|---|---|---|---|---|
| 1 | **Auth + Allowlist** | Scaffold, Google login, email allowlist, JIT user provisioning, admin seed | [2026-06-04-slice-1-auth-allowlist.md](2026-06-04-slice-1-auth-allowlist.md) | ✅ Done / verified |
| 2 | **Projects + Membership** | Projects CRUD, roles (Owner/Member), invite/remove members, permission guard | [2026-06-28-slice-2-projects-membership.md](2026-06-28-slice-2-projects-membership.md) | ✅ Done / verified |
| 3 | **Lists + Entries (operations)** | Lists CRUD, ListItems, entry-level operations, category/quantity/unit/checked | [2026-07-05-slice-3-lists-entries.md](2026-07-05-slice-3-lists-entries.md) | ✅ Done / verified |
| 4 | **Catalog + Autocomplete** | Per-project CatalogItem, `normalized_name`, autocomplete, category flow-back | [2026-07-08-slice-4-catalog-autocomplete.md](2026-07-08-slice-4-catalog-autocomplete.md) | ✅ Done / verified |
| 5 | **Favorites + Suggestions** | Per-project favorites, pure suggestion read function (favorites ∪ N-of-M statistic), pre-fill | [2026-07-20-slice-5-favorites-suggestions.md](2026-07-20-slice-5-favorites-suggestions.md) | ⬜ Open — **build after 6** |
| 6 | **Completion + Archive** | Complete a list (manual + auto-suggest when "all checked"), archive view | [2026-07-20-slice-6-completion-archive.md](2026-07-20-slice-6-completion-archive.md) | ⬜ Open — **build next** |
| 7 | **Polling / Sync** | Cursor-based delta endpoint, client polling (1–3 s), last-writer-wins merge | [2026-07-20-slice-7-polling-sync.md](2026-07-20-slice-7-polling-sync.md) | ⬜ Open |
| 8 | **PWA polish** | Manifest, service worker, iPhone optimization (safe areas, home screen, touch) | _to be created_ | ⬜ Open |

**Status legend:** ⬜ Open · 🟨 In progress · ✅ Done / verified unless the row includes an explicit caveat

> **Build-order note (2026-07-20):** Slice **6 is built before Slice 5**. Slice 5's N-of-M statistic
> reads *completed* lists, which only exist once Slice 6 ships — the real dependency arrow runs 6 → 5,
> not by slice number. Both plans exist; the Slice 5 plan carries a header block requiring Slice 6
> first and listing the two shared-file edits to reconcile afterward.

### Dependencies between slices

```
1 Auth ──> 2 Projects/Membership ──> 3 Lists/Entries ──> 4 Catalog ──> 5 Favorites/Suggestions
                                          │                                    ^
                                          ├──> 6 Completion/Archive ───────────┘
                                          └──> 7 Polling/Sync
8 PWA polish: throughout, final polish at the end.
```

- Slice 2 needs 1 (auth identity for membership checks).
- Slice 3 needs 2 (lists live in projects; operations check membership).
- Slice 4 needs 3 (catalog hangs off ListItems / input).
- Slice 5 needs 4 (suggestions read the catalog) **and** 6 (the statistic needs completed lists).
- Slices 6 + 7 hang off 3.

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
