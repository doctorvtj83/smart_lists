# Slice 9 — Admin area (allowlist + admin rights) — Design

**Date:** 2026-07-26
**Status:** Design approved, ready for an implementation plan
**Slice:** 9 (see [meta project plan](../plans/2026-06-04-smart-lists-projektplan-meta.md)) — built **before** Slice 8

---

## 1. Why this slice exists

The MVP design's permission matrix (§6) has a row no slice ever implemented:

| Aktion | Owner | Mitglied | Nicht-Mitglied |
|---|---|---|---|
| Allowlist pflegen | nur `is_admin` | — | — |

Slice 1 shipped only the **read** side of that gate: `isEmailAllowed` blocks unlisted emails at login,
and `prisma/seed.ts` bootstraps the first entry. There is no way to invite or revoke anyone from inside
the app, and `is_admin` can only be set by editing the database directly.

This slice closes that gap: an admin manages access from a page in the app.

---

## 2. Scope

**In scope**

- Invite an email (add an allowlist entry).
- Revoke an email (remove an allowlist entry) — blocks future logins.
- **Two distinct revocation intents**, chosen by the admin during the flow (§6):
  - *Deaktivieren* — only the allowlist row goes. No new logins; project memberships stay; re-inviting
    later restores the person to their projects.
  - *Ausschließen* — additionally removes every membership where the person is a plain member, which
    ends their content access on their very next request (membership is checked live, see §4).
- Grant and revoke `is_admin` on an existing user.
- A `/admin` page, reachable only by admins, that does all of it.

**Out of scope — deliberately**

- **Deleting users, projects, or lists.** The strongest action is removing memberships; no `User`,
  `Project`, `List` or `ListItem` row is ever deleted here. Rationale: `Project.ownerId` is a required
  FK, so deleting a user breaks any project they own.
- **Owner handover.** `removeMember` refuses to remove an owner membership (403, "Der Owner kann nicht
  entfernt werden"), and a project without an owner is broken. Projects the excluded person *owns* are
  therefore skipped and listed by name for the admin to resolve separately. Transferring ownership does
  not exist anywhere in the product and would be its own capability with its own rules.
- **REST endpoints.** The allowlist is never polled by a client and never merged offline, so the
  reason the rest of the app has an operations/REST layer (Slices 3 and 7) does not apply here. The
  domain layer stays the seam if an API is ever needed.
- **Invitation emails.** The project has no mail capability at all — five dependencies, no SMTP or
  provider key in `.env.example`, and Auth.js is wired with the Google provider only. Adding a
  provider means a new dependency, an API key, and a verified sender domain; that is its own slice.
  An invitation here is a database row; the person is told out of band.
- **Rebuilding the session guard.** See §4 — the analysis that removed it from this slice.
- **Audit history** beyond the existing `AllowlistEntry.invitedBy` column.
- `prisma/seed.ts` stays as-is: the bootstrap for the very first admin.

---

## 3. Domain layer — `src/lib/admin/admin.ts` (new)

Pure functions taking an injected `PrismaClient`, following `membership.ts`. `src/lib/auth/allowlist.ts`
is **not** touched: it is the read gate on the login path, and writing is a different responsibility.

| Function | Behavior |
|---|---|
| `listAccessEntries(db)` | Every `AllowlistEntry` joined with its `User`, if that person has ever logged in. Row shape: `{ email, createdAt, user: { id, displayName, isAdmin } \| null }`. There is no FK between the two tables (deliberate — MVP design §3.2: "kein FK auf User nötig"), so the join is on the normalized email. |
| `inviteEmail(db, { email, invitedBy })` | Normalizes via `normalizeEmail`, idempotent upsert, records `invitedBy` (the column exists since Slice 1 and has never been populated). |
| `revokeEmail(db, { email, callerId })` | Deletes the allowlist row. Nothing else. |
| `setAdmin(db, { userId, isAdmin, callerId })` | Sets `User.isAdmin`. |
| `listProjectAccess(db, userId)` | Read for the confirmation view: `{ projectId, name, role }[]` — every project the person belongs to, with their role, so the admin sees the consequences before acting. |
| `excludeFromAllProjects(db, { userId })` | One `deleteMany` over memberships with `role: "member"`. Returns `{ removedCount, ownedProjects: { id, name }[] }` — the projects skipped because the person owns them. Idempotent: running it twice removes nothing the second time. |

`excludeFromAllProjects` deletes memberships directly rather than looping over `removeMember`, because
`removeMember` is project-scoped, does its own lookups, and throws 403 on owner rows — a loop would
have to catch and classify those errors. Filtering on `role: "member"` in a single query expresses the
same rule (owners are never ejected) declaratively, and the skipped set is derived from a separate read
so the admin gets names, not an error count. Memberships have no dependents — lists and items hang off
the *project* — so no cascade is involved.

**Lockout invariants**, raised as `ApiError` with German messages (the `src/lib/http/errors.ts`
convention):

- Nobody can revoke their own email or drop their own admin flag → **403**.
- At least one admin must always remain → **403**. This does not follow from the rule above: it also
  covers "admin A demotes admin B while B demotes A".
- Admin rights only attach to an existing `User`, i.e. someone who has logged in at least once → **404**.
  The flag lives on `User`, not on the allowlist email.
- Non-UUID `userId` → **404** via `isUuid` (the Slice 2 convention that keeps Prisma's P2023 from
  surfacing as a 500).
- `MAX_EMAIL_LENGTH` (254, already defined in Slice 2) applies to `inviteEmail`.

`listAccessEntries` must never return `googleSub` — the same leak rule Slice 2 retrofitted onto
`listMembers`.

---

## 4. Access control: what is immediate and what is not

This was the most-debated part of the design, and the conclusion reshaped the slice. The question was
whether revoking access must take effect immediately, which would force a live database check into
`requireUserId` — the function every API route depends on. Walking the actual scenarios showed the
requirement was mis-scoped:

**Revoking admin rights → immediate, for free.** The only thing a stale admin token buys is access to
`/admin`. That page is new, so its `requireAdmin()` reads the database directly. No existing code path
is touched.

**Cutting someone off from project content → already immediate today.** The allowlist is the *login*
gate, not the *content* gate. Access to a project is decided by membership, and membership is read
fresh from the database on every request: `getRole` does a `findUnique` on `memberships`, and every
project page, list page and API route reaches it through `requireMembership` / `requireListAccess`.
Removing someone on the project's member list therefore takes effect on their very next request —
shipped in Slice 2, no new code.

**What a live check in `requireUserId` would add** is only this remainder: someone who was *deaktiviert*
rather than *ausgeschlossen* keeps access to the projects they are still a member of until their token
expires. That is exactly what "deaktivieren" is chosen for — the reversible variant, where the person is
expected to come back. An admin who wants them gone now picks *ausschließen*, and because membership is
read live, that takes effect on the person's next request with no token wait and no guard rebuild.

Making the two intents explicit in the UI (§6) is what closes this gap. The one case it does not cover
is a project the person owns: those memberships survive by design (§2), so an owner keeps access to
their own projects until the token expires or the admin resolves the ownership.

So the guard rebuild is out of scope. Sessions keep the Auth.js JWT strategy unchanged.

### Why a JWT cannot be revoked selectively

A JWT is a signed claim held by the user; it has no link back to the server and cannot know it was
revoked. For anyone to notice that *this particular* user is deactivated, every request must consult
shared state — a cost paid by all users, not just the revoked one. The workable variants were
considered and rejected for this app: a per-request denylist check is the guard rebuild under another
name; an in-process denylist cache with a short TTL still edits the shared path and needs an explicit
"deactivated" field this design does not create; a Vercel Edge Config denylist readable from middleware
introduces a second source of truth to keep in sync, which is disproportionate for a handful of users.

### Break-glass procedure (documented, not built)

If someone must lose access *right now*, rotate `AUTH_SECRET` in Vercel and redeploy. Auth.js derives
the signing/encryption key from it, so every existing token becomes unreadable and all sessions end at
once. Everyone signs in again; the revoked person fails at the login gate. Not selective, but for a
closed app with a handful of known users this is seconds of inconvenience for an event that may never
occur — and it costs no code.

---

## 5. Guard — `requireAdmin()`

A new function alongside `requireUserId` in `src/lib/auth/session.ts`. It resolves the caller's id from
the session as usual, then reads that user from the database and checks `isAdmin` there, not in the
token — which is what makes an admin demotion take effect immediately. Used **only** by the `/admin`
page; no existing caller changes.

---

## 6. UI — `/admin`

A Server Component following `src/app/projects/[projectId]/page.tsx`: data straight from the domain
layer, mutations as Server Actions with `revalidatePath`. No client component, no client state.

`requireAdmin()` runs first; non-admins get `redirect("/projects")` rather than a 403 screen — the page
should simply not exist for them, mirroring the "non-members see 404, not 403" decision from Slice 2.

**Block "Zugang"** — a table over `listAccessEntries`, one row per allowlist email:

- the email
- status: the user's display name, or "Noch nie angemeldet" when no `User` exists for it yet
- admin: "Ja"/"Nein", with a grant/revoke button — shown only when a user exists, otherwise a note
  that the person has to sign in once first
- a button to revoke access

The caller's own row renders without buttons and is marked "(du)". That is UI courtesy only; the
invariants in §3 are enforced in the domain layer, not in the form.

**Block "E-Mail einladen"** — one field and a button calling `inviteEmail`. Errors come back as German
messages, like `Nutzer nicht gefunden` in Slice 2.

**Revoking is a two-step flow**, because the admin has to state their intent. The button in the table
links to `/admin?revoke=<email>`; that same Server Component then renders a confirmation panel instead
of jumping straight to a mutation. A URL parameter rather than a dialog keeps the page free of client
components, matching how the rest of the app is built.

If no `User` exists for that email yet — the person was invited but never signed in — there can be no
memberships. The panel then skips the project section and the exclusion button entirely and offers only
the plain revoke; the two intents are indistinguishable in that case.

Otherwise the panel shows the result of `listProjectAccess`: every project the person belongs to and
their role there. It offers two actions:

- **"Nur Zugang entziehen"** — `revokeEmail` alone. Labelled as the reversible choice: no new logins,
  memberships stay, re-inviting later puts the person back where they were. A running session keeps
  working until it expires.
- **"Zugang entziehen und aus allen Projekten entfernen"** — `revokeEmail` + `excludeFromAllProjects`.
  Labelled as immediate: access to those projects ends on the person's next request.

If `excludeFromAllProjects` reports skipped `ownedProjects`, the page names them afterwards with a note
that the person still owns them and keeps access there — to be resolved by deleting the project or by
another owner taking it over. Silently leaving those out would be the one genuinely surprising outcome
of this flow.

**Honest wording throughout.** The button is "Zugang entziehen", never "Nutzer entfernen" — nothing is
deleted but an allowlist row and, on request, memberships. The panel states plainly that existing
sessions run until they expire.

**Entry point.** The home page currently renders a dead `Admin: ja/nein` line (`src/app/page.tsx`).
It is replaced by a "Verwaltung" link rendered only for admins. The session flag is good enough to
decide visibility; authorization is the page's own job.

All visible strings are German; code and comments are English.

---

## 7. Tests (test-first)

`src/lib/admin/admin.test.ts` against the Neon test branch, plus additions under `src/lib/auth/`:

- `inviteEmail`: normalizes (`" Foo@Bar.DE "` → one entry), idempotent on a repeat invite, records
  `invitedBy`, rejects malformed and over-long emails.
- `revokeEmail`: deletes the row and `isEmailAllowed` is false afterwards; own email → 403; last
  admin's email → 403; unknown email → 404.
- `setAdmin`: grant and revoke; self-demotion → 403; last admin → 403; unknown `userId` → 404;
  non-UUID → 404.
- `listAccessEntries`: an email with a user is joined; an email without one comes back as `user: null`;
  `googleSub` appears nowhere in the result.
- `listProjectAccess`: returns owner and member rows with the project name; empty array for a user with
  no memberships; empty for an unknown or non-UUID id (never a 500).
- `excludeFromAllProjects`: member memberships are gone and `getRole` returns null for them afterwards;
  an owner membership survives and comes back in `ownedProjects` with its name; other users'
  memberships in the same projects are untouched; a second run removes nothing and reports
  `removedCount: 0`.
- `requireAdmin`: admin passes; non-admin → 403; no session → 401; and the decisive one — token flag
  `true` while the database says `false` → 403, proving the flag is read from the database.

Baseline is 168 tests across 18 files; this slice should land around +25.

---

## 8. Risks and open items

- **The one behavioral asymmetry to communicate to the owner:** revoking an allowlist entry does not
  end a running session. Choosing *ausschließen* (§6) ends project access immediately anyway, so this
  only bites for the reversible *deaktivieren* path and for projects the person owns. The UI states it
  (§6) and the break-glass procedure (§4) covers the urgent case. If it ever feels too loose in
  practice, shortening the JWT `maxAge` from the Auth.js default of 30 days is a one-line change in
  `src/auth.ts` that needs no architecture.
- **Exclusion is not reversible by re-inviting.** Once memberships are deleted, re-adding the email
  brings the person back with no projects; the owners have to invite them again. That is the intended
  difference between the two paths, but it must be unmistakable in the UI wording — an admin who picks
  the wrong button cannot undo it from this page.
- **`invitedBy` becomes meaningful for the first time.** It is nullable and null for seeded rows; the UI
  must not assume it is set.
- Admins are global, not per project. Nothing in this slice changes the Owner/Member model.
