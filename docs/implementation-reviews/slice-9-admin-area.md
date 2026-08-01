# Implementation Review — Slice 9: Admin area (allowlist + admin rights)

## 1. What was achieved

Slice 9 closes the "Allowlist pflegen — nur `is_admin`" row of the MVP permission matrix (§6), which no earlier slice implemented. An admin can now maintain access from inside the app: invite and revoke allowlist emails, grant and revoke `is_admin`, and optionally end project access immediately by removing member memberships.

Slice 1 had only shipped the *read* side of that gate (`isEmailAllowed` + the seed script). After this slice, allowlist writes and admin-flag changes are first-class domain operations behind a live `requireAdmin` guard and a German `/admin` Server Component UI.

Automated verification passed with **20 test files / 203 tests** (35 new in Slice 9: 30 in `admin.test.ts`, 5 in `session.test.ts`), plus `npm run lint` (one pre-existing warning under `.remember/`) and a clean `npm run build` (existing middleware-deprecation notice unchanged).

**Manual browser pass (Task 5 Step 4):** largely passed — invite, revoke, setAdmin, exclude member, owned-projects Hinweis, and non-admin redirect all behaved as designed. Home "Verwaltung" link visibility needs a fresh OAuth JWT after seeding `isAdmin` in the DB (expected: the home page uses the session flag for link visibility only; `/admin` itself is guarded live). Checklist item 8 (demoted admin loses `/admin`) was verified via DB demotion rather than a second private-window account.

Two behavioral asymmetries from the design's §8 remain honest product facts, not bugs: (1) a running JWT session survives a plain allowlist revoke until expiry; (2) exclusion is not undone by re-inviting — memberships stay gone and project owners must re-invite. Break-glass for the urgent "end every session now" case: rotate `AUTH_SECRET` and redeploy.

---

## 2. Steps taken

**Task 1 — Allowlist domain core:** `listAccessEntries`, `inviteEmail`, `revokeEmail` with lockout invariants (no self-revoke; never remove the email that gates every remaining admin). Locked decisions honored: no REST layer; email join without an FK (allowlist ↔ user is by normalized email).

**Task 2 — `setAdmin`:** Grant/revoke `isAdmin` with no self-demotion and never-demote-the-last-admin. Self-check alone is not enough (mutual demotion); last-admin count covers that. Accepted read-committed race documented in code/comments.

**Task 3 — Project-access reads + exclusion:** `listProjectAccess` and `excludeFromAllProjects` with `deleteMany({ where: { userId, role: "member" } })` so owner memberships survive. Two explicit revocation intents stay separate from the allowlist delete.

**Task 4 — `requireAdmin`:** Live DB read of `isAdmin` in `src/lib/auth/session.ts`. Deliberately **no** session-guard rewrite — `requireUserId` still trusts the JWT; only `/admin` pays for the live check.

**Task 5 — Page + entry point:** `/admin` Server Component (access table, invite form, two-step revoke via URL parameter instead of a dialog, owned-projects notice) and home-page "Verwaltung" link replacing the dead `Admin: ja/nein` line. German user-facing strings throughout.

**Task 6 — Documentation:** This implementation review and the meta-plan status / dependency / progress-log update.

---

## 3. Core components built

| File / component | Role |
|---|---|
| `src/lib/admin/admin.ts` — six functions | Domain seam: `listAccessEntries`, `inviteEmail`, `revokeEmail`, `setAdmin`, `listProjectAccess`, `excludeFromAllProjects`. |
| `src/lib/admin/admin.ts` — `AccessEntry` / `ProjectAccess` / `ExcludeResult` | Safe projections for the admin UI (no `googleSub`); exclusion reports removed count + surviving owned projects. |
| `src/lib/auth/session.ts` — `requireAdmin` | Page/action guard that reads `isAdmin` live from the database so demotion is immediate under 30-day JWTs. |
| `src/app/admin/page.tsx` | Admin Server Component: table, invite, setAdmin forms, two-step revoke panel, Server Actions each calling `requireAdmin`. |
| Home page entry point | "Verwaltung" link for session-flagged admins; replaces the non-functional admin status line. |
| `src/lib/admin/admin.test.ts` | Domain lockouts, invite/revoke/list, setAdmin, project access, exclusion invariants (30 tests). |
| `src/lib/auth/session.test.ts` | `requireAdmin` coverage including stale-token demotion; introduces the project's first `vi.mock` of `@/auth` (5 tests). |

---

## 4. Most important lines of code

### (a) Live `isAdmin` read in `requireAdmin` (`src/lib/auth/session.ts`)

```typescript
const user = await db.user.findUnique({
  where: { id: userId },
  select: { isAdmin: true },
});
```

Why it matters: sessions are JWTs that can live up to 30 days. A token issued while the person was an admin still claims `isAdmin: true` after demotion. Reading the flag from the database makes demotion take effect on the next `/admin` request without rewriting `requireUserId` for the whole app.

### (b) Role-filtered exclusion (`src/lib/admin/admin.ts`)

```typescript
const removed = await db.membership.deleteMany({
  where: { userId: input.userId, role: "member" },
});
```

Why it matters: `Project.ownerId` is a required FK — owners must never be ejected. Filtering by `role: "member"` states that declaratively. A loop over `removeMember` would have to catch and classify 403s on owner rows; `deleteMany` avoids that ceremony and stays idempotent.

### (c) Empty upsert update in `inviteEmail` (`src/lib/admin/admin.ts`)

```typescript
return db.allowlistEntry.upsert({
  where: { email },
  update: {},
  create: { email, invitedBy: input.invitedBy },
});
```

Why it matters: re-inviting an already-listed email is a no-op. The empty `update` is what preserves the original `invitedBy` (and `createdAt`) — a non-empty update would rewrite history on every re-invite.

### (d) Last-admin guard beyond self-check (`src/lib/admin/admin.ts`)

```typescript
if (user.isAdmin && (await countAdmins(db)) <= 1) {
  throw new ApiError(403, "Der letzte Admin kann nicht entfernt werden.");
}
```

Why it matters: forbidding self-demotion alone does not stop two admins from demoting each other. Counting remaining admins closes that mutual-demotion hole. The accepted race is read-committed: two concurrent demotions of different admins could both see `count > 1` and both succeed — accepted for the MVP's tiny admin set (locked decision 7).

### (e) `requireAdmin` inside every Server Action (`src/app/admin/page.tsx`)

```typescript
async function inviteAction(formData: FormData) {
  "use server";
  const adminId = await requireAdmin(prisma);
  // ...
}
```

Why it matters: a Server Action is an individually addressable POST endpoint. Rendering the page once is not authorization for later posts. Hidden form fields are convenience, never trust; each action re-derives identity and re-checks admin rights live.

---

## 5. Architecture contribution

Slice 9 completes the access-control story started in Slice 1: the allowlist gains a write side, admin rights become manageable in-app, and the guard layer gains its first live (non-token) check — scoped to `/admin` only.

It deliberately does **not** assemble: a REST surface for the allowlist, outbound mail, ownership handover, user/project deletion, audit history, or a rewrite of `requireUserId`. Cutting someone off from project *content* was already immediate before this slice, because membership is read fresh on every request (`getRole`, Slice 2); `excludeFromAllProjects` is the admin-facing way to use that fact when revoking.

**Next:** Slice 8 (PWA polish) is the remaining open MVP slice — manifest, service worker, iPhone optimization. Its plan still needs to be created per the meta-plan maintenance guide.
