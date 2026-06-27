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
| 1 | **Auth + Allowlist** | Scaffold, Google login, email allowlist, JIT user provisioning, admin seed | [2026-06-04-slice-1-auth-allowlist.md](2026-06-04-slice-1-auth-allowlist.md) | ✅ Done |
| 2 | **Projects + Membership** | Projects CRUD, roles (Owner/Member), invite/remove members, permission guard | _to be created_ | ⬜ Open |
| 3 | **Lists + Entries (operations)** | Lists CRUD, ListItems, entry-level operations, category/quantity/unit/checked | _to be created_ | ⬜ Open |
| 4 | **Catalog + Autocomplete** | Per-project CatalogItem, `normalized_name`, autocomplete, category flow-back | _to be created_ | ⬜ Open |
| 5 | **Favorites + Suggestions** | Per-project favorites, pure suggestion read function (favorites ∪ N-of-M statistic), pre-fill | _to be created_ | ⬜ Open |
| 6 | **Completion + Archive** | Complete a list (manual + auto-suggest when "all checked"), archive view | _to be created_ | ⬜ Open |
| 7 | **Polling / Sync** | Cursor-based delta endpoint, client polling (1–3 s), last-writer-wins merge | _to be created_ | ⬜ Open |
| 8 | **PWA polish** | Manifest, service worker, iPhone optimization (safe areas, home screen, touch) | _to be created_ | ⬜ Open |

**Status legend:** ⬜ Open · 🟨 In progress · ✅ Done & verified

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

### 2026-06-27 — Slice 1: Auth + Allowlist — Done
- **Delivered:** Next.js/App Router scaffold, Prisma auth schema and migration, Google Auth.js wiring, closed-access allowlist gate, just-in-time user provisioning, admin/allowlist seed, protected home page, login/error pages, middleware protection, and test infrastructure.
- **Tested:** `npm test` passed (3 files, 8 tests); `npm run lint` passed; `npm run build` passed. Browser automation reached the Google OAuth manual sign-in step, so full enabled-user login/logout/admin-refresh verification still requires manual Google completion. Local checks and unauthenticated redirect/login/error page smoke checks passed.
- **Deviations from the plan:** Prisma seed configuration lives in `prisma.config.ts` instead of deprecated `package.json#prisma`, removing the seed deprecation warning. Next 16 warns that `middleware` is deprecated in favor of `proxy`; the slice keeps `src/middleware.ts` because the plan requested it and the build succeeds.
- **Follow-up decisions for later slices:** Session carries `user.id` (UUID) and `user.isAdmin`; JWT strategy, so DB permission changes only take effect on next login. Membership checks (Slice 2) build on `session.user.id`.
- **Inherited open items:** Complete a manual Google sign-in pass for enabled-user login/logout/admin flag refresh once browser interaction can finish OAuth. Revisit `middleware` -> `proxy` migration in a later Next.js maintenance slice.
- **Commit(s):** Final Slice 1 wrap-up commit.
