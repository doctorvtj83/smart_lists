# Implementation Review — Slice 14: Restyle the built screens

## 1. What was achieved

Slice 14 turns the Slice 13 design foundation into the product’s first real screens in the new visual language: **Login**, **Zugang verweigert**, **Home** (with the new **Weitermachen** capability), **Projekte**, and **Verwaltung** (including the two-way revoke bottom sheet). Along the way it adds two presentation primitives (`PageHeader`, `ProgressBar`), German plural/date helpers, the `listProjectSummaries` / `getContinueList` read models, and the deterministic `formatGermanDate` / `formatGermanNumber` path that removes the locale-timezone hydration mismatch Slice 13 handed over.

The slice goal is **met in code**. Automated verification is green (see numbers below). Manual browser verification of the five restyled screens is **partial**: unauthenticated screens (`/login`, `/auth/error`, `/dev/ui`) and 375px overflow on those routes were checked in this session; signed-in Home / Projekte / Verwaltung flows (checklist items 3–11, and hydration on `/projects/[projectId]` / `/lists/[listId]`) require Google OAuth and were **not** exercised here — same constraint noted across Tasks 9–12.

**Automated verification (Task 13 Step 1, this session):**

| Command | Result |
|---|---|
| `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.worktrees/**'` | **46 files / 328 tests** passed (exit 0; ~111 s) |
| `npm run lint` | **2 errors, 8 warnings**, all in pre-existing `docs/design/2026-08-01-ui-handoff/support.js` (exit 0; `src/` clean) |
| `npm run build` | Succeeded (Next.js 16.2.9; `/login`, `/auth/error`, `/dev/ui` static; app routes dynamic) |

**Manual checklist (Task 13 Step 2):** see honest ticks in the progress-log entry and in `.superpowers/sdd/.../task-13-report.md`. Unauthenticated items **1, 2, 13** PASS; **14** PASS on those three routes; **3–12** deferred for OAuth except that item 12’s format fix is covered by unit tests and the automation-induced `data-cursor-ref` overlay on `/auth/error` is a known false positive (Task 5).

---

## 2. Steps taken

**Task 1 — German date/number formatting:** Added `src/lib/format/date.ts` with pinned `de-DE` + `Europe/Berlin` formatters; replaced the three unsafe `toLocaleDateString` / `toLocaleString` calls on project-detail and list-detail pages; grep-guard so ambient locale formatting cannot sneak back.

**Task 2 — German plural helpers:** Added `formatListCount`, `formatMemberCount`, and the Weitermachen counter phrase in `src/lib/format/plural.ts` for meta lines on Home / Projekte.

**Task 3 — PageHeader + ProgressBar:** New CSS-Modules primitives with component tests; gallery sections under Kopfzeile / Fortschritt on `/dev/ui`.

**Task 4 — Login restyle:** Handoff 3a — accent logo tile, real Google `G`, closed-access copy, tokenised colours (follow-up commit for logo colour tokens).

**Task 5 — Zugang verweigert restyle:** Handoff 3b — neutral lock circle, no danger red, working back link to `/login`.

**Task 6 — `listProjectSummaries`:** UI read model with filtered `_count` (active lists only) and the caller’s per-viewer role for the OWNER badge.

**Task 7 — `getContinueList`:** First cross-project read — most recently touched active list among projects the user belongs to; pure `lastTouchedAt` / `pickContinueList` ranking.

**Task 8 — ContinueCard:** Presentational card (progress bar + meta) for the Home hero; client-safe props, link to the list.

**Task 9 — Home restyle:** Handoff 3c — PageHeader without hairline, optional Weitermachen section, PROJEKTE rows from summaries, admin-only Verwaltung, Abmelden.

**Task 10 — Projekte restyle:** Handoff 3d/5a — row cards, create row, empty state `Noch kein Projekt`, OWNER pill only for the viewer’s own owner role.

**Task 11 — Verwaltung table restyle:** Handoff 3k — ADMIN pill, ZUGANG card, self-row without action buttons, grant/revoke + invite wiring preserved.

**Task 12 — Revoke bottom sheet:** Handoff 3l — `RevokeSheet` over the table; URL `?revoke=` is open/closed state; both Server Actions passed as props; Escape / overlay / Abbrechen close via `router.push("/admin")`.

**Task 13 — Verification + docs:** Full vitest / lint / build; partial manual checklist; this review; meta-plan status + progress log.

---

## 3. Core components built

| File / component | Role |
|---|---|
| `src/lib/format/date.ts` — `formatGermanDate` / `formatGermanNumber` | Deterministic German date/decimal formatting; kills server/client timezone mismatch. |
| `src/lib/format/plural.ts` | German plural helpers for “N Listen · M Mitglieder” and the Weitermachen open-count phrase. |
| `src/components/ui/PageHeader.tsx` | Shared page chrome with optional `leading` slot (drawer trigger later), title, trailing, hairline. |
| `src/components/ui/ProgressBar.tsx` | Accessible progress track for Weitermachen and the gallery. |
| `src/lib/projects/summaries.ts` — `listProjectSummaries` | Home/Projekte read model: active list count, member count, caller role. |
| `src/lib/lists/continue.ts` — `lastTouchedAt` / `pickContinueList` / `getContinueList` | Cross-project “resume this list” ranking + query. |
| `src/app/ContinueCard.tsx` | Home hero card UI consuming `ContinueCardData`. |
| `src/app/login/GoogleLogo.tsx` | Multicolour Google G for the login button (not a Lucide stand-in). |
| `src/app/admin/RevokeSheet.tsx` | Client bottom sheet for two-way revoke; URL-driven open state. |
| `src/app/login/page.tsx` | Restyled closed-access login (handoff 3a). |
| `src/app/auth/error/page.tsx` | Restyled access-denied dead end (handoff 3b). |
| `src/app/page.tsx` | Restyled Home with Weitermachen + project rows (handoff 3c). |
| `src/app/projects/page.tsx` | Restyled Projekte list + create/empty (handoff 3d/5a). |
| `src/app/admin/page.tsx` | Restyled Verwaltung table + sheet mount (handoff 3k/3l). |

---

## 4. Most important lines of code

### (a) Pinned time zone kills the hydration mismatch (`src/lib/format/date.ts`)

```typescript
const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
```

Why it matters: `toLocaleDateString("de-DE")` used the ambient zone. Near midnight, Node (UTC) and a Berlin browser disagreed on the calendar day and React threw a hydration overlay. Pinning `Europe/Berlin` makes the string a pure function of the instant in both runtimes.

### (b) “Touched” is derived, seeded with `createdAt` (`src/lib/lists/continue.ts`)

```typescript
export function lastTouchedAt(list: TouchableList): Date {
  const newestItem = list.items.reduce(
    (max, item) => (item.updatedAt > max ? item.updatedAt : max),
    list.createdAt,
  );
  return newestItem;
}
```

Why it matters: `List` has no `updatedAt`. Activity already lives on `ListItem.updatedAt` (LWW / sync cursor). Seeding the reduce with `createdAt` covers empty lists and keeps activity monotonic without a migration.

### (c) Access control inside the first cross-project read (`src/lib/lists/continue.ts`)

```typescript
const lists = await db.list.findMany({
  where: {
    status: "active",
    project: { memberships: { some: { userId } } },
  },
  // ...
});
```

Why it matters: every prior read was project-scoped after a membership check. Weitermachen spans projects, so the membership predicate must live in the query — the same shape as `listProjectsForUser` — or a foreign list could leak into the card.

### (d) Filtered `_count` for active lists only (`src/lib/projects/summaries.ts`)

```typescript
_count: {
  select: {
    memberships: true,
    lists: { where: { status: "active" } },
  },
},
```

Why it matters: the archive must not inflate “N Listen”. Prisma does the filtered count in the database so no list rows travel over the wire for a meta line.

### (e) Per-viewer role, not project ownership (`src/lib/projects/summaries.ts`)

```typescript
role: row.memberships[0].role,
```

Why it matters: the OWNER pill is about the **caller’s** membership. A second round-trip per row would be N+1; the compound unique `(projectId, userId)` plus the outer membership filter make `[0]` always present.

### (f) URL is the sheet’s open/closed state (`src/app/admin/RevokeSheet.tsx`)

```typescript
const close = () => router.push("/admin");
```

Why it matters: `?revoke=` is loaded on the server with the table. Closing is navigation that drops the query — Escape, overlay, and Abbrechen all share one path. Future sheets on server-rendered screens should copy this rather than lifting data fetching to the client.

### (g) Server Actions as props into a thin client wrapper (`src/app/admin/page.tsx`)

```tsx
{revokeEntry && (
  <RevokeSheet
    email={revokeEntry.email}
    userId={revokeEntry.user?.id ?? null}
    displayName={revokeEntry.user?.displayName ?? revokeEntry.email}
    projects={revokeProjects.map((p) => ({
      projectId: p.projectId,
      name: p.name,
      role: p.role,
    }))}
    revokeOnlyAction={revokeOnlyAction}
    revokeAndExcludeAction={revokeAndExcludeAction}
  />
)}
```

Why it matters: the page stays a Server Component for data + auth; the sheet only owns dialog UX. Mutations remain the existing Server Actions — no client-side API rewrite for a restyle.

---

## 5. Architecture contribution

Slice 14 is the first **consumption proof** of the Slice 13 primitives on consequence-heavy product surfaces (closed login, home resume, admin revoke). It also lands two read models the later structural slices need:

- **`PageHeader`’s `leading` slot** is the seam Slice 11 fills with the ☰ drawer trigger — headers on `/projects` and `/admin` intentionally render without a hamburger until then.
- **`listProjectSummaries`** is the row-card read model Slice 11’s project switcher should reuse instead of inventing a third project list shape.
- **`formatGermanDate` / `formatGermanNumber`** are now the mandatory formatting path for archive (Slice 11) and list interaction (Slice 12); ambient `toLocale*` must not return.
- **Weitermachen** establishes the first membership-scoped cross-project query pattern without storing list-level recency.

**Deliberately out of scope (do not hunt for these in this slice):**

- The ☰ drawer / sidebar (Slice 11)
- Projekt-Detail, Liste, Archiv, Favoriten, Katalog, Mitglieder screens (Slices 10–12) — Task 1 only touched two of them for the hydration fix
- Quantity parsing (Slice 15)
- Per-row remote-change flash (Slice 16, optional)
- PWA manifest / service worker (Slice 8)

**Next:** Slice 10 (Katalog-Verwaltung) is the next open slice (plan still to be created).
