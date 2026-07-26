# Slice 9 — Admin area (allowlist + admin rights) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **BUILD ORDER NOTE:** Slice 9 is built **before** Slice 8 (owner's decision, 2026-07-26). It depends on **Slice 1 only** (it writes the allowlist that `isEmailAllowed` reads) and is written against the current built state (Slices 1–7 done, 168 tests in 18 files). It **adds** a domain module, one guard function, one page, and replaces two lines on the home page. **No existing behavior changes, no schema change, no migration.**

**Goal:** Give an admin a `/admin` page inside the app to invite and revoke allowlist emails, grant and revoke `is_admin`, and — as an explicit second intent — remove a revoked person from every project where they are a plain member.

**Architecture:** A new domain module `src/lib/admin/admin.ts` holds all six operations as pure functions over an injected `PrismaClient` (the `membership.ts` pattern), enforcing the lockout invariants as `ApiError`s with German messages. A new `requireAdmin(db)` in `src/lib/auth/session.ts` resolves the caller from the session and then reads `isAdmin` **from the database**, which is what makes an admin demotion take effect immediately. The `/admin` page is a Server Component with Server Actions (the `projects/[projectId]/page.tsx` pattern) — no client component, no client state; the two-step revoke confirmation is driven by a `?revoke=<email>` URL parameter rather than a dialog. There are deliberately **no REST endpoints** (the allowlist is never polled and never merged offline) and **no session-guard rewrite** (see the design's §4).

**Tech Stack:** Next.js 16 (App Router, TypeScript), Prisma ORM against Neon Postgres, Auth.js (NextAuth v5, JWT sessions), Vitest. No new dependencies, no migration.

**Design source of truth:** [docs/superpowers/specs/2026-07-26-admin-area-design.md](../specs/2026-07-26-admin-area-design.md). Where this plan says "design §N", that is the file.

## Global Constraints

Copied verbatim from CLAUDE.md, the meta project plan, and the design. Every task inherits these.

- **Implementation docs, code identifiers, and code comments: English.** In-app user-facing strings stay **German** (the product is German).
- **Meticulous inline comments** on every function (what + **why**) and every non-obvious line; name the pattern when one is used; never remove or thin existing comments when editing a file.
- **DB access through an injectable `PrismaClient`** (first parameter of every core function), so logic stays unit-testable in isolation.
- **Errors are `ApiError(status, germanMessage)`** from `src/lib/http/errors.ts`. Domain functions throw; they never import Next.js.
- **Non-UUID ids must never reach a `uuid` column.** Guard with `isUuid` (`src/lib/validate.ts`) and answer 404 / an empty result, so Prisma's P2023 never surfaces as a fake 500 (Slice 2 convention).
- **`MAX_EMAIL_LENGTH` is 254** and is already exported from `src/lib/projects/membership.ts` — import it, do not redefine it.
- **`googleSub` must never leave the server** in any read projection (the leak rule Slice 2 retrofitted onto `listMembers`).
- **Test-first (TDD)**, small vertical slices, frequent commits.
- **Test convention (Slices 1–7):** core functions are unit-tested against the Neon test branch (`new PrismaClient()` + `resetDb(db)` in `beforeEach`); route handlers and pages are thin adapters with **no unit tests** — verified by `npm test` + `npm run lint` + `npm run build` + a manual browser pass. Follow this split; do not invent page tests.
- **Do not touch** `src/lib/auth/allowlist.ts` (the read gate on the login path), `prisma/seed.ts` (the first-admin bootstrap), `src/auth.ts` (session strategy stays JWT), or `src/middleware.ts` (`/admin` is already covered by its matcher).
- **Nothing is ever deleted but allowlist rows and memberships.** No `User`, `Project`, `List` or `ListItem` row is deleted anywhere in this slice.

---

## Design decisions locked for this slice

1. **No REST endpoints.** The allowlist is never polled by a client and never merged offline, so the reason the rest of the app has an operations/REST layer does not apply (design §2). The domain layer is the seam if an API is ever needed.
2. **No session-guard rewrite.** `requireUserId` stays token-based. Content access is already live-checked through `getRole`/`requireMembership` on every request (Slice 2), so *ausschließen* takes effect on the person's next request without touching the shared path. The only thing a stale token buys is `/admin`, and that page reads `isAdmin` from the database (design §4). **This supersedes the meta plan's older dependency note, which Task 6 corrects.**
3. **Two revocation intents, chosen by the admin.** *Nur Zugang entziehen* = allowlist row only (reversible; memberships stay). *Zugang entziehen und aus allen Projekten entfernen* = additionally `deleteMany` over `role: "member"` memberships (immediate; not reversible by re-inviting). Owner memberships are never touched — `Project.ownerId` is a required FK and there is no ownership handover in the product (design §2).
4. **`excludeFromAllProjects` deletes memberships directly** rather than looping over `removeMember`: `removeMember` is project-scoped and throws 403 on owner rows, so a loop would have to catch and classify errors. `where: { role: "member" }` expresses the same rule declaratively, and the skipped owner projects come from a separate read so the admin gets **names**, not an error count.
5. **The join between `allowlist_entries` and `users` is on the normalized email**, because there is deliberately no FK between them (MVP design §3.2: "kein FK auf User nötig"). Both sides store the email normalized (`normalizeEmail` on write in `provisionUser` and in `inviteEmail`), so the join key is exact-match, not case-insensitive matching in SQL.
6. **Lockout invariants live in the domain layer, not in the form.** The UI additionally hides the buttons on the caller's own row, but that is courtesy only — a hand-crafted POST to a Server Action still hits the same checks.
7. **The last-admin check is a count, and it is read-committed.** Two admins demoting each other in the *same instant* could in principle both pass. Accepted for a closed app with a handful of admins; the fix would be a serializable transaction, which is not worth it here. Sequential demotions — the real case — are fully covered.
8. **Errors surface the same way as Slice 2's `invite` action:** an `ApiError` thrown inside a Server Action propagates (German message, dev error overlay). No custom error UI in this slice — that is the established convention, not an oversight.
9. **The two-step revoke is a URL parameter (`/admin?revoke=<email>`), not a dialog**, so the page stays free of client components (design §6). After an exclusion that skipped owner projects, the page redirects to `/admin?owned=<userId>` and **re-reads** the surviving memberships rather than smuggling names through the URL.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/admin/admin.ts` (create) | All six domain operations + their result types. The only module that writes `allowlist_entries` and `users.is_admin`. | 1–3 |
| `src/lib/admin/admin.test.ts` (create) | Unit tests for the domain module against the Neon test branch. | 1–3 |
| `src/lib/auth/session.ts` (modify) | Add `requireAdmin(db)` next to the unchanged `requireUserId()`. | 4 |
| `src/lib/auth/session.test.ts` (create) | Tests for `requireAdmin`, including the decisive stale-token case (project's first module mock). | 4 |
| `src/app/admin/page.tsx` (create) | The `/admin` Server Component: access table, invite form, two-step revoke panel, Server Actions. | 5 |
| `src/app/page.tsx` (modify) | Replace the dead `Admin: ja/nein` line with a "Verwaltung" link for admins. | 5 |
| `docs/implementation-reviews/slice-9-admin-area.md` (create) | Per-slice implementation review (Definition of Done). | 6 |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` (modify) | Flip Slice 9 to ✅, correct the stale dependency note, add the progress-log entry. | 6 |

`src/test/reset-db.ts` needs **no** change: this slice adds no table, and `users`, `allowlist_entries`, `projects` and `memberships` are already truncated there.

**Test baseline before this slice: 168 tests in 18 files.** This slice adds **30** (12 + 6 + 7 + 5), landing at **198 in 20 files**. Confirm the real numbers with `npm test` at execution.

---

### Task 1: Domain module — allowlist reads and writes

**Files:**
- Create: `src/lib/admin/admin.ts`
- Test: `src/lib/admin/admin.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `AllowlistEntry` from `@prisma/client`; `normalizeEmail` from `@/lib/auth/normalize`; `ApiError` from `@/lib/http/errors`; `MAX_EMAIL_LENGTH` from `@/lib/projects/membership`; `isEmailAllowed` from `@/lib/auth/allowlist` (test only).
- Produces:
  - `export interface AccessEntryUser { id: string; displayName: string | null; isAdmin: boolean }`
  - `export interface AccessEntry { email: string; createdAt: Date; user: AccessEntryUser | null }`
  - `export async function listAccessEntries(db: PrismaClient): Promise<AccessEntry[]>` — every allowlist row, oldest invite first, joined with its user (or `null` if that person never logged in). Never returns `googleSub`.
  - `export interface InviteEmailInput { email: string; invitedBy: string }`
  - `export async function inviteEmail(db: PrismaClient, input: InviteEmailInput): Promise<AllowlistEntry>` — normalizing, idempotent upsert; records `invitedBy`. Throws 400 for an over-long or malformed email.
  - `export interface RevokeEmailInput { email: string; callerId: string }`
  - `export async function revokeEmail(db: PrismaClient, input: RevokeEmailInput): Promise<void>` — deletes the allowlist row and nothing else. Throws 404 (unknown email), 403 (own email), 403 (last admin).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/admin/admin.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { inviteEmail, listAccessEntries, revokeEmail } from "./admin";

// One shared client for the file (the pattern every core test in Slices 1–7 uses). resetDb gives
// every test a clean DB; the beforeEach then rebuilds the ONE fixture every admin test needs:
// a signed-in admin who is also on the allowlist — i.e. the state seed.ts bootstraps in production.
const db = new PrismaClient();
let adminId: string;

beforeEach(async () => {
  await resetDb(db);
  const admin = await db.user.create({
    data: {
      googleSub: "g-admin",
      email: "admin@example.com",
      displayName: "Admin",
      isAdmin: true,
    },
  });
  adminId = admin.id;
  // invitedBy stays null here on purpose: this mirrors the seeded first row, which the UI must
  // tolerate (design §8 — "invitedBy is nullable and null for seeded rows").
  await db.allowlistEntry.create({ data: { email: "admin@example.com" } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("inviteEmail", () => {
  it("stores the email normalized and records the inviter", async () => {
    await inviteEmail(db, { email: "  Foo@Bar.DE  ", invitedBy: adminId });
    const rows = await db.allowlistEntry.findMany({ where: { email: "foo@bar.de" } });
    expect(rows).toHaveLength(1);
    // invitedBy exists since Slice 1 and has never been populated — this slice is what gives it meaning.
    expect(rows[0].invitedBy).toBe(adminId);
  });

  it("opens the login gate for that email", async () => {
    // The whole point of an invite: isEmailAllowed (the Slice 1 read gate) must now say yes.
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    expect(await isEmailAllowed(db, "GAST@example.com")).toBe(true);
  });

  it("is idempotent: a repeat invite keeps one row and the ORIGINAL inviter", async () => {
    const second = await db.user.create({
      data: { googleSub: "g-second", email: "second@example.com" },
    });
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    await inviteEmail(db, { email: "gast@example.com", invitedBy: second.id });
    const rows = await db.allowlistEntry.findMany({ where: { email: "gast@example.com" } });
    expect(rows).toHaveLength(1);
    // The upsert's empty `update` is what preserves the first invitation's provenance.
    expect(rows[0].invitedBy).toBe(adminId);
  });

  it("rejects a malformed email with 400", async () => {
    await expect(
      inviteEmail(db, { email: "kein-at-zeichen", invitedBy: adminId }),
    ).rejects.toMatchObject({ status: 400, message: "Keine gültige E-Mail-Adresse" });
  });

  it("rejects an over-long email with 400 (length is checked before shape)", async () => {
    // Well-formed but 262 chars: proves the length guard runs first, so the admin gets the
    // message that actually explains the problem.
    const tooLong = `${"a".repeat(250)}@example.com`;
    await expect(inviteEmail(db, { email: tooLong, invitedBy: adminId })).rejects.toMatchObject({
      status: 400,
      message: "E-Mail-Adresse ist zu lang",
    });
  });
});

describe("revokeEmail", () => {
  it("removes the row and closes the login gate", async () => {
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    await revokeEmail(db, { email: "GAST@example.com", callerId: adminId });
    expect(await isEmailAllowed(db, "gast@example.com")).toBe(false);
  });

  it("leaves the user row untouched (nothing but the allowlist row is deleted)", async () => {
    const guest = await db.user.create({
      data: { googleSub: "g-guest", email: "gast@example.com" },
    });
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    await revokeEmail(db, { email: "gast@example.com", callerId: adminId });
    // Deleting users is explicitly out of scope (design §2): Project.ownerId is a required FK.
    expect(await db.user.findUnique({ where: { id: guest.id } })).not.toBeNull();
  });

  it("refuses to revoke the caller's own access with 403", async () => {
    await expect(
      revokeEmail(db, { email: "admin@example.com", callerId: adminId }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Du kannst dir den Zugang nicht selbst entziehen.",
    });
  });

  it("refuses to revoke the last remaining admin with 403", async () => {
    // Caller is somebody else, so the self-check cannot be what fires here. Without this rule the
    // app would end up with no one able to maintain the allowlist and no way back except SQL.
    const other = await db.user.create({
      data: { googleSub: "g-other", email: "other@example.com" },
    });
    await expect(
      revokeEmail(db, { email: "admin@example.com", callerId: other.id }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Der letzte Admin kann nicht entfernt werden.",
    });
  });

  it("revokes an admin's access while another admin remains", async () => {
    await db.user.create({
      data: { googleSub: "g-two", email: "two@example.com", isAdmin: true },
    });
    await db.allowlistEntry.create({ data: { email: "two@example.com" } });
    await revokeEmail(db, { email: "two@example.com", callerId: adminId });
    expect(await isEmailAllowed(db, "two@example.com")).toBe(false);
  });

  it("rejects an unknown email with 404", async () => {
    await expect(
      revokeEmail(db, { email: "niemand@example.com", callerId: adminId }),
    ).rejects.toMatchObject({
      status: 404,
      message: "E-Mail steht nicht auf der Zugangsliste",
    });
  });
});

describe("listAccessEntries", () => {
  it("joins each allowlist email with its user, oldest invite first", async () => {
    await inviteEmail(db, { email: "gast@example.com", invitedBy: adminId });
    const entries = await listAccessEntries(db);
    expect(entries.map((e) => e.email)).toEqual(["admin@example.com", "gast@example.com"]);
    expect(entries[0].user).toEqual({ id: adminId, displayName: "Admin", isAdmin: true });
    // Invited but never signed in -> no User row exists yet (JIT provisioning, Slice 1).
    expect(entries[1].user).toBeNull();
  });

  it("ignores users whose email is not on the allowlist", async () => {
    // A revoked person keeps their User row; they must not reappear as an access entry.
    await db.user.create({ data: { googleSub: "g-ex", email: "ex@example.com" } });
    const entries = await listAccessEntries(db);
    expect(entries.map((e) => e.email)).toEqual(["admin@example.com"]);
  });

  it("never exposes googleSub (the OAuth identity stays server-side)", async () => {
    // Same leak rule Slice 2 retrofitted onto listMembers. Serializing the whole result is what
    // makes a future `user: true` (instead of a narrow select) fail this test.
    const entries = await listAccessEntries(db);
    expect(JSON.stringify(entries)).not.toContain("g-admin");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/admin/admin.test.ts`
Expected: FAIL — `Failed to resolve import "./admin"` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/admin/admin.ts`:

```ts
import type { AllowlistEntry, PrismaClient } from "@prisma/client";
import { normalizeEmail } from "@/lib/auth/normalize";
import { ApiError } from "@/lib/http/errors";
// Reuse, do not redefine: 254 is the RFC 5321 practical maximum and is already the app's one
// email-length rule (Slice 2). A second copy here would be a second thing to keep in sync.
import { MAX_EMAIL_LENGTH } from "@/lib/projects/membership";

// This module is the ONLY writer of `allowlist_entries` and of `users.is_admin`.
// It deliberately does not touch src/lib/auth/allowlist.ts: that module is the READ gate on the
// login path (isEmailAllowed + provisionUser), and writing the list is a different responsibility
// with different callers (an admin in the UI, not the OAuth callback).
//
// Pattern: dependency injection of the PrismaClient (first parameter), exactly like membership.ts —
// production passes the singleton from @/lib/db, tests pass a client bound to the Neon test branch.

// Minimal shape check for an invited email. Deliberately not an RFC-complete validator (those are
// famously wrong in both directions): the real verification is that Google authenticates that
// address on login. This only rejects input that is obviously not an address, so a typo becomes a
// visible error instead of a dead allowlist row nobody can ever use.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Counts the admins. Used by the lockout invariants below, never exported: "how many admins are
// there" is not a question any caller outside this module should need to ask.
async function countAdmins(db: PrismaClient): Promise<number> {
  return db.user.count({ where: { isAdmin: true } });
}

// Resolves the app user behind an allowlist email, or null if that person has never logged in.
// User.email is not unique (googleSub is the identity), so findFirst — and orderBy createdAt makes
// the pick deterministic if two accounts ever share an email: the oldest wins. That is exactly the
// rule addMember uses (membership.ts), so both places bind an email to the same account.
async function findUserByEmail(db: PrismaClient, normalizedEmail: string) {
  return db.user.findFirst({
    where: { email: normalizedEmail },
    orderBy: { createdAt: "asc" },
  });
}

// The user fields the admin page may see. Deliberately NOT the full User: googleSub (the OAuth
// identity) must never leave the server — the same least-exposure rule as MemberUser in
// membership.ts. Enforced at the data-access layer so every transport inherits it.
export interface AccessEntryUser {
  id: string;
  displayName: string | null;
  isAdmin: boolean;
}

// One row of the access table: the allowlist email plus the person behind it, if they exist yet.
export interface AccessEntry {
  email: string;
  createdAt: Date;
  user: AccessEntryUser | null;
}

// The access table: every allowlisted email, joined with its user where there is one.
//
// Why two queries and a Map instead of a Prisma `include`: there is no FK between
// allowlist_entries and users (MVP design §3.2 — "kein FK auf User nötig"), so Prisma has no
// relation to traverse. Two indexed reads plus an in-memory join is still O(1) round-trips; a
// per-row lookup would be the N+1 this avoids.
export async function listAccessEntries(db: PrismaClient): Promise<AccessEntry[]> {
  // Oldest invite first: a stable, meaningful order (the seeded first admin stays on top) that
  // does not depend on Postgres' arbitrary row order.
  const entries = await db.allowlistEntry.findMany({ orderBy: { createdAt: "asc" } });

  // Both sides store the email normalized (provisionUser and inviteEmail both call normalizeEmail),
  // so the join key is an exact match — no lower() in SQL, no collation surprises.
  const users = await db.user.findMany({
    where: { email: { in: entries.map((entry) => entry.email) } },
    select: { id: true, email: true, displayName: true, isAdmin: true },
    orderBy: { createdAt: "asc" },
  });

  const byEmail = new Map<string, AccessEntryUser>();
  for (const user of users) {
    // First wins = oldest account wins, matching findUserByEmail's deterministic rule above.
    if (!byEmail.has(user.email)) {
      byEmail.set(user.email, {
        id: user.id,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
      });
    }
  }

  return entries.map((entry) => ({
    email: entry.email,
    createdAt: entry.createdAt,
    // ?? null (not undefined): the UI branches on `user === null` to render "Noch nie angemeldet".
    user: byEmail.get(entry.email) ?? null,
  }));
}

export interface InviteEmailInput {
  email: string;
  // The inviting admin's id. Callers pass requireAdmin()'s return value, which is a user id the
  // guard just read back from the database — so it is always a real UUID and never needs an
  // isUuid check before it reaches the uuid column.
  invitedBy: string;
}

// Invites an email = adds it to the allowlist, which is the ONLY thing that lets a Google account
// past handleSignIn (Slice 1). No mail is sent: the project has no mail capability at all (design
// §2), so an invitation is a database row and the person is told out of band.
export async function inviteEmail(
  db: PrismaClient,
  input: InviteEmailInput,
): Promise<AllowlistEntry> {
  const email = normalizeEmail(input.email);

  // Length before shape: an over-long but well-formed address must produce the message that
  // actually explains the problem. Also keeps unbounded input away from the DB (see MAX_EMAIL_LENGTH).
  if (email.length > MAX_EMAIL_LENGTH) {
    throw new ApiError(400, "E-Mail-Adresse ist zu lang");
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Keine gültige E-Mail-Adresse");
  }

  // Upsert = idempotent invite: re-inviting somebody who is already listed is a no-op, not a
  // unique-constraint crash. The EMPTY update is the load-bearing part — it preserves the original
  // invitedBy and createdAt, so re-inviting never rewrites who first let this person in.
  return db.allowlistEntry.upsert({
    where: { email },
    update: {},
    create: { email, invitedBy: input.invitedBy },
  });
}

export interface RevokeEmailInput {
  email: string;
  // The acting admin's id — needed for the self-revocation invariant, not for authorization
  // (authorization is requireAdmin's job at the page boundary).
  callerId: string;
}

// Revokes an email = removes the allowlist row, and nothing else. Memberships, projects and the
// user row all survive; ending project access is the separate, explicit intent implemented by
// excludeFromAllProjects (design §2/§6).
//
// Honest limitation, stated in the UI too: this blocks FUTURE logins. A JWT already issued keeps
// working until it expires — a signed token has no link back to the server (design §4).
export async function revokeEmail(db: PrismaClient, input: RevokeEmailInput): Promise<void> {
  const email = normalizeEmail(input.email);

  const entry = await db.allowlistEntry.findUnique({ where: { email } });
  if (!entry) throw new ApiError(404, "E-Mail steht nicht auf der Zugangsliste");

  // The person behind the email — may be null (invited, never signed in), in which case neither
  // lockout invariant can apply: no user means no caller identity and no admin flag.
  const user = await findUserByEmail(db, email);

  if (user) {
    // Invariant 1: nobody locks themselves out. Compared by user id, not by email string, so it
    // holds even if the caller's account and the allowlist row ever drift apart.
    if (user.id === input.callerId) {
      throw new ApiError(403, "Du kannst dir den Zugang nicht selbst entziehen.");
    }
    // Invariant 2: at least one admin must remain. This does NOT follow from invariant 1 — it also
    // covers "admin A revokes admin B while B revokes A". See locked decision 7 on the read-committed
    // race, which is accepted for a closed app with a handful of admins.
    if (user.isAdmin && (await countAdmins(db)) <= 1) {
      throw new ApiError(403, "Der letzte Admin kann nicht entfernt werden.");
    }
  }

  // Delete by the row's own id (already loaded), so the delete cannot hit a different row than the
  // one the invariants were checked against.
  await db.allowlistEntry.delete({ where: { id: entry.id } });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/admin/admin.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/admin.ts src/lib/admin/admin.test.ts
git commit -m "feat(admin): allowlist domain core — listAccessEntries, inviteEmail, revokeEmail"
```

---

### Task 2: Domain module — `setAdmin`

**Files:**
- Modify: `src/lib/admin/admin.ts` (append)
- Test: `src/lib/admin/admin.test.ts` (append)

**Interfaces:**
- Consumes: `isUuid` from `@/lib/validate`; the private `countAdmins` from Task 1; `randomUUID` from `node:crypto` (test only).
- Produces:
  - `export interface SetAdminInput { userId: string; isAdmin: boolean; callerId: string }`
  - `export async function setAdmin(db: PrismaClient, input: SetAdminInput): Promise<void>` — sets `User.isAdmin`. Throws 404 (unknown or non-UUID `userId`), 403 (self-demotion), 403 (last admin).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/admin/admin.test.ts` — add `setAdmin` to the import from `./admin`, add `import { randomUUID } from "node:crypto";` at the top, and append this describe block:

```ts
describe("setAdmin", () => {
  it("grants admin rights to an existing user", async () => {
    const user = await db.user.create({
      data: { googleSub: "g-new", email: "new@example.com" },
    });
    await setAdmin(db, { userId: user.id, isAdmin: true, callerId: adminId });
    const updated = await db.user.findUnique({ where: { id: user.id } });
    expect(updated?.isAdmin).toBe(true);
  });

  it("revokes admin rights while another admin remains", async () => {
    const other = await db.user.create({
      data: { googleSub: "g-two", email: "two@example.com", isAdmin: true },
    });
    await setAdmin(db, { userId: other.id, isAdmin: false, callerId: adminId });
    const updated = await db.user.findUnique({ where: { id: other.id } });
    expect(updated?.isAdmin).toBe(false);
  });

  it("refuses self-demotion with 403", async () => {
    await expect(
      setAdmin(db, { userId: adminId, isAdmin: false, callerId: adminId }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Du kannst dir die Adminrechte nicht selbst entziehen.",
    });
  });

  it("refuses to demote the last remaining admin with 403", async () => {
    // Caller is a different person, so this can only be the last-admin rule firing.
    const other = await db.user.create({
      data: { googleSub: "g-other", email: "other@example.com" },
    });
    await expect(
      setAdmin(db, { userId: adminId, isAdmin: false, callerId: other.id }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Der letzte Admin kann nicht entfernt werden.",
    });
  });

  it("rejects an unknown userId with 404", async () => {
    // The flag lives on User, not on the allowlist email: rights only attach to somebody who has
    // actually signed in at least once (design §3).
    await expect(
      setAdmin(db, { userId: randomUUID(), isAdmin: true, callerId: adminId }),
    ).rejects.toMatchObject({ status: 404, message: "Nutzer nicht gefunden" });
  });

  it("rejects a non-UUID userId with 404 (never reaches the uuid column)", async () => {
    // Without the isUuid guard Postgres rejects the value and Prisma raises P2023, which the error
    // mapper would report as a fake 500 (see validate.ts).
    await expect(
      setAdmin(db, { userId: "not-a-uuid", isAdmin: true, callerId: adminId }),
    ).rejects.toMatchObject({ status: 404, message: "Nutzer nicht gefunden" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/admin/admin.test.ts`
Expected: FAIL — `"setAdmin" is not exported by "src/lib/admin/admin.ts"` (or a TypeScript/import error naming `setAdmin`). The 12 tests from Task 1 must still pass once the import resolves.

- [ ] **Step 3: Write the implementation**

Add the `isUuid` import at the top of `src/lib/admin/admin.ts`:

```ts
import { isUuid } from "@/lib/validate";
```

Append to `src/lib/admin/admin.ts`:

```ts
export interface SetAdminInput {
  userId: string;
  // The target state, not a toggle: the UI sends what it wants to be true, so a double-submit or a
  // stale page cannot flip the flag to the opposite of what the admin saw and clicked.
  isAdmin: boolean;
  callerId: string;
}

// Grants or revokes global admin rights.
//
// Why this takes effect immediately even though sessions are JWTs: the only thing the flag controls
// is access to /admin, and that page's guard (requireAdmin) reads isAdmin from the DATABASE, not
// from the token (design §4/§5). Nothing else in the app reads isAdmin.
export async function setAdmin(db: PrismaClient, input: SetAdminInput): Promise<void> {
  // Shape check before the query: a malformed id can never match a uuid column, and Prisma would
  // raise P2023 -> fake 500. Treat it as "not found", the Slice 2 convention.
  if (!isUuid(input.userId)) throw new ApiError(404, "Nutzer nicht gefunden");

  const user = await db.user.findUnique({ where: { id: input.userId } });
  // Admin rights attach to a USER, so the person must have logged in at least once (JIT
  // provisioning, Slice 1). There is nothing to flag on a merely invited email.
  if (!user) throw new ApiError(404, "Nutzer nicht gefunden");

  // Both invariants only concern REMOVING rights; granting can never lock anybody out.
  if (!input.isAdmin) {
    // Invariant 1: nobody demotes themselves (checked first so the caller gets the message that
    // explains their own action, not the generic last-admin one).
    if (user.id === input.callerId) {
      throw new ApiError(403, "Du kannst dir die Adminrechte nicht selbst entziehen.");
    }
    // Invariant 2: the last admin stays. Guarded by `user.isAdmin` so demoting a non-admin (a
    // no-op) never trips it. See locked decision 7 for the accepted read-committed race.
    if (user.isAdmin && (await countAdmins(db)) <= 1) {
      throw new ApiError(403, "Der letzte Admin kann nicht entfernt werden.");
    }
  }

  // Returns void rather than the updated User: the full row carries googleSub, and no caller needs
  // it — the page re-reads through listAccessEntries, which has the safe projection.
  await db.user.update({ where: { id: user.id }, data: { isAdmin: input.isAdmin } });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/admin/admin.test.ts`
Expected: PASS — 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/admin.ts src/lib/admin/admin.test.ts
git commit -m "feat(admin): setAdmin with self-demotion and last-admin lockout invariants"
```

---

### Task 3: Domain module — project access read + exclusion

**Files:**
- Modify: `src/lib/admin/admin.ts` (append)
- Test: `src/lib/admin/admin.test.ts` (append)

**Interfaces:**
- Consumes: `Role` from `@prisma/client`; `isUuid`; `getRole` from `@/lib/projects/guard` (test only).
- Produces:
  - `export interface ProjectAccess { projectId: string; name: string; role: Role }`
  - `export async function listProjectAccess(db: PrismaClient, userId: string): Promise<ProjectAccess[]>` — every project the person belongs to, with their role. Empty array for an unknown or non-UUID id (never throws).
  - `export interface ExcludeResult { removedCount: number; ownedProjects: { id: string; name: string }[] }`
  - `export async function excludeFromAllProjects(db: PrismaClient, input: { userId: string }): Promise<ExcludeResult>` — one `deleteMany` over `role: "member"` memberships; reports the owner projects it skipped. Idempotent.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/admin/admin.test.ts` — add `excludeFromAllProjects` and `listProjectAccess` to the import from `./admin`, add `import { getRole } from "@/lib/projects/guard";` at the top, and append:

```ts
// Fixture for the two project-scoped reads: a guest who OWNS one project and is a plain MEMBER of
// two others — the exact shape the exclusion has to treat asymmetrically.
async function seedGuestWithProjects() {
  const guest = await db.user.create({
    data: { googleSub: "g-guest", email: "gast@example.com" },
  });
  const owned = await db.project.create({ data: { name: "Gasts Projekt", ownerId: guest.id } });
  await db.membership.create({ data: { projectId: owned.id, userId: guest.id, role: "owner" } });

  const haushalt = await db.project.create({ data: { name: "Haushalt", ownerId: adminId } });
  const ferien = await db.project.create({ data: { name: "Ferien", ownerId: adminId } });
  for (const project of [haushalt, ferien]) {
    await db.membership.create({ data: { projectId: project.id, userId: adminId, role: "owner" } });
    await db.membership.create({ data: { projectId: project.id, userId: guest.id, role: "member" } });
  }
  return { guest, owned, haushalt, ferien };
}

describe("listProjectAccess", () => {
  it("returns every project with the person's role and the project name", async () => {
    const { guest, owned, haushalt, ferien } = await seedGuestWithProjects();
    const access = await listProjectAccess(db, guest.id);
    // Sorted by name so the confirmation panel reads predictably.
    expect(access).toEqual([
      { projectId: ferien.id, name: "Ferien", role: "member" },
      { projectId: owned.id, name: "Gasts Projekt", role: "owner" },
      { projectId: haushalt.id, name: "Haushalt", role: "member" },
    ]);
  });

  it("returns an empty array for a user without memberships", async () => {
    const lonely = await db.user.create({
      data: { googleSub: "g-lonely", email: "lonely@example.com" },
    });
    expect(await listProjectAccess(db, lonely.id)).toEqual([]);
  });

  it("returns an empty array for an unknown or malformed id (never a 500)", async () => {
    // This read is driven by a URL parameter, so a crafted id must produce an empty panel, not a crash.
    expect(await listProjectAccess(db, randomUUID())).toEqual([]);
    expect(await listProjectAccess(db, "not-a-uuid")).toEqual([]);
  });
});

describe("excludeFromAllProjects", () => {
  it("removes every MEMBER membership and reports how many", async () => {
    const { guest, haushalt, ferien } = await seedGuestWithProjects();
    const result = await excludeFromAllProjects(db, { userId: guest.id });
    expect(result.removedCount).toBe(2);
    // getRole is the function every permission check in the app goes through, and it reads live —
    // so a null here IS the proof that content access ended on the person's next request.
    expect(await getRole(db, haushalt.id, guest.id)).toBeNull();
    expect(await getRole(db, ferien.id, guest.id)).toBeNull();
  });

  it("keeps owner memberships and names the skipped projects", async () => {
    const { guest, owned } = await seedGuestWithProjects();
    const result = await excludeFromAllProjects(db, { userId: guest.id });
    // Project.ownerId is a required FK and there is no ownership handover in the product, so an
    // owner is never ejected — the admin is told instead (design §2/§6).
    expect(result.ownedProjects).toEqual([{ id: owned.id, name: "Gasts Projekt" }]);
    expect(await getRole(db, owned.id, guest.id)).toBe("owner");
  });

  it("leaves other users' memberships in the same projects untouched", async () => {
    const { guest, haushalt } = await seedGuestWithProjects();
    await excludeFromAllProjects(db, { userId: guest.id });
    expect(await getRole(db, haushalt.id, adminId)).toBe("owner");
  });

  it("deletes no project and no user", async () => {
    const { guest } = await seedGuestWithProjects();
    await excludeFromAllProjects(db, { userId: guest.id });
    expect(await db.user.findUnique({ where: { id: guest.id } })).not.toBeNull();
    expect(await db.project.count()).toBe(3);
  });

  it("is idempotent: a second run removes nothing and still reports the owned projects", async () => {
    const { guest, owned } = await seedGuestWithProjects();
    await excludeFromAllProjects(db, { userId: guest.id });
    const second = await excludeFromAllProjects(db, { userId: guest.id });
    expect(second.removedCount).toBe(0);
    expect(second.ownedProjects).toEqual([{ id: owned.id, name: "Gasts Projekt" }]);
  });

  it("treats a malformed id as a no-op (no P2023 crash)", async () => {
    expect(await excludeFromAllProjects(db, { userId: "not-a-uuid" })).toEqual({
      removedCount: 0,
      ownedProjects: [],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/admin/admin.test.ts`
Expected: FAIL — `listProjectAccess`/`excludeFromAllProjects` are not exported by `src/lib/admin/admin.ts`.

- [ ] **Step 3: Write the implementation**

Extend the `@prisma/client` type import at the top of `src/lib/admin/admin.ts` to include `Role`:

```ts
import type { AllowlistEntry, PrismaClient, Role } from "@prisma/client";
```

Append to `src/lib/admin/admin.ts`:

```ts
// One project the person belongs to, flattened for display: the confirmation panel needs the name
// and the role, nothing else.
export interface ProjectAccess {
  projectId: string;
  name: string;
  role: Role;
}

// Everything the person can reach, so the admin sees the CONSEQUENCES before acting rather than
// discovering them afterwards. Read-only — this function never changes anything.
export async function listProjectAccess(
  db: PrismaClient,
  userId: string,
): Promise<ProjectAccess[]> {
  // The id comes from a URL parameter, so a malformed value must yield an empty panel, not a P2023
  // crash. "No memberships" is the honest answer for an id that cannot exist (same call as getRole's).
  if (!isUuid(userId)) return [];

  const memberships = await db.membership.findMany({
    where: { userId },
    // Narrow select: we need the project's name, not its suggestion parameters or owner id.
    select: { role: true, project: { select: { id: true, name: true } } },
    // By project name: the panel is a human-read list, so alphabetical beats join order.
    orderBy: { project: { name: "asc" } },
  });

  return memberships.map((m) => ({
    projectId: m.project.id,
    name: m.project.name,
    role: m.role,
  }));
}

// What an exclusion actually did: how many memberships were removed, and which projects were
// skipped because the person owns them. The skipped set is returned with NAMES (not just a count)
// because silently leaving those out would be the one genuinely surprising outcome of this flow.
export interface ExcludeResult {
  removedCount: number;
  ownedProjects: { id: string; name: string }[];
}

// The "ausschließen" half of a revocation: ends the person's access to project CONTENT.
//
// Why this is immediate while a login revocation is not: membership is read fresh from the database
// on every request (getRole -> requireMembership/requireListAccess, Slice 2), so the person loses
// access on their very next request — no token wait, no guard rebuild (design §4).
//
// Why a single deleteMany instead of looping over removeMember: removeMember is project-scoped,
// does its own lookups, and throws 403 on owner rows — a loop would have to catch and classify
// those errors. `role: "member"` says the same thing declaratively (owners are never ejected), and
// memberships have no dependents (lists and items hang off the PROJECT), so no cascade is involved.
export async function excludeFromAllProjects(
  db: PrismaClient,
  input: { userId: string },
): Promise<ExcludeResult> {
  // Same reasoning as above: an id that cannot exist means there is nothing to remove.
  if (!isUuid(input.userId)) return { removedCount: 0, ownedProjects: [] };

  // Read the owner rows FIRST — they survive the delete either way, but reading before writing keeps
  // the reported set unambiguous even if something else changes memberships concurrently.
  const owned = await db.membership.findMany({
    where: { userId: input.userId, role: "owner" },
    select: { project: { select: { id: true, name: true } } },
    orderBy: { project: { name: "asc" } },
  });

  const removed = await db.membership.deleteMany({
    where: { userId: input.userId, role: "member" },
  });

  // Idempotent by construction: running this twice deletes nothing the second time and reports
  // removedCount: 0, because deleteMany over an empty match set is not an error.
  return {
    removedCount: removed.count,
    ownedProjects: owned.map((m) => ({ id: m.project.id, name: m.project.name })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/admin/admin.test.ts`
Expected: PASS — 25 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/admin.ts src/lib/admin/admin.test.ts
git commit -m "feat(admin): listProjectAccess + excludeFromAllProjects (owner memberships survive)"
```

---

### Task 4: Guard — `requireAdmin`

**Files:**
- Modify: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts` (create)

**Interfaces:**
- Consumes: `auth` from `@/auth` (mocked in the test); `requireUserId` from the same module; `ApiError`; `isUuid`.
- Produces:
  - `export async function requireAdmin(db: PrismaClient): Promise<string>` — returns the caller's user id if the **database** says they are an admin. Throws `ApiError(401, "Nicht angemeldet")` without a session and `ApiError(403, "Kein Zugriff")` for anybody else.
- `requireUserId()` is **unchanged** — no existing caller is affected.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/session.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/test/reset-db";
import { requireAdmin } from "./session";

// This is the project's FIRST module mock, and it is justified here and only here: requireAdmin's
// whole point is that it trusts the DATABASE over the session token, and proving that needs a
// session claiming something the database contradicts. The real @/auth module boots Auth.js with
// the Google provider and reads a request context that does not exist in a Vitest process.
//
// vi.hoisted: vi.mock calls are hoisted above the imports by Vitest's transform, so the mock
// function must be created in a hoisted block — otherwise it would not exist yet when the factory runs.
const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: mockAuth }));

const db = new PrismaClient();

beforeEach(async () => {
  await resetDb(db);
  // Reset between tests so a leftover session from a previous test cannot make one pass by accident.
  mockAuth.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("requireAdmin", () => {
  it("returns the caller's id when the database says they are an admin", async () => {
    const user = await db.user.create({
      data: { googleSub: "g-a", email: "a@example.com", isAdmin: true },
    });
    mockAuth.mockResolvedValue({ user: { id: user.id, isAdmin: true } });
    await expect(requireAdmin(db)).resolves.toBe(user.id);
  });

  it("rejects a signed-in non-admin with 403", async () => {
    const user = await db.user.create({
      data: { googleSub: "g-b", email: "b@example.com" },
    });
    mockAuth.mockResolvedValue({ user: { id: user.id, isAdmin: false } });
    await expect(requireAdmin(db)).rejects.toMatchObject({
      status: 403,
      message: "Kein Zugriff",
    });
  });

  it("rejects a request without a session with 401", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAdmin(db)).rejects.toMatchObject({
      status: 401,
      message: "Nicht angemeldet",
    });
  });

  it("reads the flag from the DATABASE, not the token: a stale isAdmin=true token is rejected", async () => {
    // The decisive test of this slice. The JWT is issued at login and lives up to 30 days; if the
    // guard trusted token.isAdmin, a demoted admin would keep /admin for weeks (design §5).
    const user = await db.user.create({
      data: { googleSub: "g-c", email: "c@example.com", isAdmin: false },
    });
    mockAuth.mockResolvedValue({ user: { id: user.id, isAdmin: true } });
    await expect(requireAdmin(db)).rejects.toMatchObject({
      status: 403,
      message: "Kein Zugriff",
    });
  });

  it("rejects a session whose user no longer exists with 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: randomUUID(), isAdmin: true } });
    await expect(requireAdmin(db)).rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/auth/session.test.ts`
Expected: FAIL — `"requireAdmin" is not exported by "src/lib/auth/session.ts"`.

- [ ] **Step 3: Write the implementation**

Add to the top of `src/lib/auth/session.ts` (keep the existing imports and the entire existing comment block on `requireUserId` untouched):

```ts
import type { PrismaClient } from "@prisma/client";
import { isUuid } from "@/lib/validate";
```

Append to `src/lib/auth/session.ts`:

```ts
/**
 * Resolves the signed-in user's id and asserts they are an admin — the guard for /admin.
 *
 * The load-bearing detail: the admin flag is read from the DATABASE, not from the session token.
 * Sessions are JWTs (auth.ts, strategy: "jwt") that live up to 30 days, so a token issued while the
 * person was an admin still claims isAdmin: true after their rights were revoked. Reading the flag
 * live means a demotion takes effect on the very next request (design §5).
 *
 * That extra query costs nothing app-wide, because this guard is used ONLY by the admin page —
 * requireUserId above is unchanged, so no existing route pays for it. This is the deliberate scoping
 * from the design's §4: the allowlist is the LOGIN gate, while content access is decided by
 * membership, which requireMembership already reads live on every request.
 *
 * Pattern: layered guards, like requireOwner building on requireMembership (guard.ts) — it delegates
 * identity resolution to requireUserId and only adds the admin check, so the 401 behavior is
 * inherited rather than duplicated.
 *
 * @param db - The Prisma client (injected for testability, as everywhere in this codebase)
 * @returns The signed-in admin's database id
 * @throws ApiError(401) if there is no session (from requireUserId)
 * @throws ApiError(403) if the caller is not an admin according to the database
 */
export async function requireAdmin(db: PrismaClient): Promise<string> {
  const userId = await requireUserId();

  // A token could in principle carry a malformed id; it must never reach the uuid column, where
  // Prisma would raise P2023 and turn a denied request into a fake 500 (see validate.ts).
  if (!isUuid(userId)) throw new ApiError(403, "Kein Zugriff");

  // Narrow select: this guard needs one boolean, and loading the full row would pull googleSub into
  // memory for no reason (least exposure, same rule as the read projections in the domain layer).
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  // `!user?.isAdmin` covers both "the user was deleted" and "not an admin" with the same answer —
  // the page must not distinguish those cases for the caller.
  if (!user?.isAdmin) throw new ApiError(403, "Kein Zugriff");

  return userId;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/auth/session.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Run the whole suite and the linter**

Run: `npm test && npm run lint`
Expected: PASS — 198 tests in 20 files (168 baseline + 30), lint clean. The new `vi.mock("@/auth")` is scoped to `session.test.ts` and must not affect any other file; if another file starts failing, that is a real regression, not noise.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat(auth): requireAdmin guard reading isAdmin live from the database"
```

---

### Task 5: The `/admin` page and its entry point

**Files:**
- Create: `src/app/admin/page.tsx`
- Modify: `src/app/page.tsx:17` (replace the dead `Admin: ja/nein` line)

**Interfaces:**
- Consumes: `requireAdmin` (Task 4); `listAccessEntries`, `inviteEmail`, `revokeEmail`, `setAdmin`, `listProjectAccess`, `excludeFromAllProjects` (Tasks 1–3); `normalizeEmail`; `prisma` from `@/lib/db`.
- Produces: the `/admin` route. No exported functions other than the default page component.
- No unit tests: pages are thin adapters (test convention above). Verified by `npm run lint`, `npm run build` and the manual pass in Step 4.

- [ ] **Step 1: Write the page**

Create `src/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/normalize";
import {
  excludeFromAllProjects,
  inviteEmail,
  listAccessEntries,
  listProjectAccess,
  revokeEmail,
  setAdmin,
} from "@/lib/admin/admin";

// Next.js 16: searchParams is a Promise in server components. Typed with the framework's own wide
// value type (a query key can repeat, which yields string[]) so the generated PageProps check
// accepts it; the two params we use are narrowed to a single string right after the await.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Reads one query parameter as a single string. A repeated key ("?revoke=a&revoke=b") arrives as an
// array — we ignore those instead of guessing which one the admin meant.
function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Server Component: reads the session and calls the domain layer directly — no HTTP round-trip, no
// client component, no client state (the pattern from projects/[projectId]/page.tsx).
//
// This slice deliberately ships NO REST endpoints: the allowlist is never polled and never merged
// offline, so the reason the rest of the app has an operations/REST layer does not apply (design §2).
// The domain layer stays the seam if an API is ever needed.
export default async function AdminPage({ searchParams }: Props) {
  // The guard runs FIRST, before any read. requireAdmin throws 401 without a session and 403 for a
  // non-admin; both mean "this page does not exist for you", so we redirect instead of rendering an
  // error screen — mirroring the "non-members are redirected, not told 403" rule from Slice 2.
  // .catch(() => redirect(...)) rather than try/catch: redirect() returns `never`, so the awaited
  // type stays a plain string with no non-null assertion.
  const callerId = await requireAdmin(prisma).catch(() => redirect("/projects"));

  const params = await searchParams;
  const revokeParam = singleParam(params.revoke);
  const ownedParam = singleParam(params.owned);

  // The access table itself; also the lookup for the confirmation panel below, so it is read once.
  const entries = await listAccessEntries(prisma);

  // --- Server Actions -------------------------------------------------------------------------
  // Every action re-derives identity AND re-checks admin rights via requireAdmin (defense in depth):
  // a Server Action is an individually addressable POST endpoint, so a crafted request could call it
  // without ever rendering this page. The hidden fields below are convenience, never authorization.
  // Errors propagate as thrown ApiErrors with German messages — the same behavior as Slice 2's
  // invite action ("Nutzer nicht gefunden"), which is the established convention for this app.

  async function inviteAction(formData: FormData) {
    "use server";
    const adminId = await requireAdmin(prisma);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return; // Ignore empty submissions silently (same convention as the other forms).
    await inviteEmail(prisma, { email, invitedBy: adminId });
    revalidatePath("/admin");
  }

  async function setAdminAction(formData: FormData) {
    "use server";
    const adminId = await requireAdmin(prisma);
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return;
    // The form sends the TARGET state, not a toggle, so a stale page cannot flip the flag to the
    // opposite of what the admin saw and clicked.
    const isAdmin = formData.get("isAdmin") === "true";
    await setAdmin(prisma, { userId, isAdmin, callerId: adminId });
    revalidatePath("/admin");
  }

  // "Nur Zugang entziehen": the reversible intent — the allowlist row goes, memberships stay.
  async function revokeOnlyAction(formData: FormData) {
    "use server";
    const adminId = await requireAdmin(prisma);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await revokeEmail(prisma, { email, callerId: adminId });
    // redirect() leaves the ?revoke= confirmation view and re-renders the table.
    redirect("/admin");
  }

  // "Zugang entziehen und aus allen Projekten entfernen": the immediate intent. Not reversible by
  // re-inviting — the memberships are gone and the project owners have to invite the person again.
  async function revokeAndExcludeAction(formData: FormData) {
    "use server";
    const adminId = await requireAdmin(prisma);
    const email = String(formData.get("email") ?? "").trim();
    const userId = String(formData.get("userId") ?? "");
    if (!email || !userId) return;
    // Revoke first: if the exclusion failed halfway, the person would at least be locked out of new
    // logins, which is the weaker but safer partial state of the two.
    await revokeEmail(prisma, { email, callerId: adminId });
    const result = await excludeFromAllProjects(prisma, { userId });
    // Projects the person OWNS keep their membership by design, and that is the one genuinely
    // surprising outcome of this flow — so the page has to say so. We pass only the user id and
    // re-read the surviving memberships on render instead of smuggling project names through the URL.
    redirect(result.ownedProjects.length > 0 ? `/admin?owned=${userId}` : "/admin");
  }

  // --- Two-step revoke: ?revoke=<email> renders a confirmation panel INSTEAD of the table --------
  // A URL parameter rather than a dialog keeps this page free of client components, matching how the
  // rest of the app is built. The admin has to state their INTENT here — the two revocation variants
  // differ in whether project access ends now or is left reversible (design §6).
  if (revokeParam) {
    const normalized = normalizeEmail(revokeParam);
    const entry = entries.find((e) => e.email === normalized);

    // Stale link, or already revoked in another tab: say so rather than render an empty panel.
    if (!entry) {
      return (
        <main style={{ padding: 24 }}>
          <p>
            <Link href="/admin">← Zurück zur Verwaltung</Link>
          </p>
          <p>Diese E-Mail steht nicht (mehr) auf der Zugangsliste.</p>
        </main>
      );
    }

    // A Membership needs a user id, so somebody who has never signed in cannot be in any project —
    // the panel then skips the project section and both intents collapse into one plain revoke.
    const projects = entry.user ? await listProjectAccess(prisma, entry.user.id) : [];

    return (
      <main style={{ padding: 24 }}>
        <p>
          <Link href="/admin">← Zurück zur Verwaltung</Link>
        </p>
        <h1>Zugang entziehen</h1>
        <p>
          <strong>{entry.email}</strong>
        </p>
        {/* Honest wording: state the JWT limitation instead of implying an instant cut-off. */}
        <p>
          Ein neuer Login ist danach nicht mehr möglich. Eine bereits laufende Sitzung bleibt aktiv,
          bis sie abläuft.
        </p>

        {entry.user ? (
          <>
            <h2>Projekte dieser Person</h2>
            {projects.length === 0 ? (
              <p>Diese Person ist in keinem Projekt.</p>
            ) : (
              <ul>
                {projects.map((p) => (
                  <li key={p.projectId}>
                    {p.name} ({p.role === "owner" ? "Owner" : "Mitglied"})
                  </li>
                ))}
              </ul>
            )}

            <h2>Nur Zugang entziehen</h2>
            <p>
              Umkehrbar: Die Projektmitgliedschaften bleiben bestehen. Eine erneute Einladung stellt
              die Person in ihren Projekten wieder her.
            </p>
            <form action={revokeOnlyAction}>
              <input type="hidden" name="email" value={entry.email} />
              <button type="submit">Nur Zugang entziehen</button>
            </form>

            <h2>Zugang entziehen und aus allen Projekten entfernen</h2>
            <p>
              Sofort wirksam: Der Zugriff auf die oben genannten Projekte endet mit der nächsten
              Aktion dieser Person. Projekte, die ihr selbst gehören, bleiben bestehen. Nicht
              umkehrbar – eine erneute Einladung bringt die Person ohne Projekte zurück.
            </p>
            <form action={revokeAndExcludeAction}>
              <input type="hidden" name="email" value={entry.email} />
              <input type="hidden" name="userId" value={entry.user.id} />
              <button type="submit">Zugang entziehen und aus allen Projekten entfernen</button>
            </form>
          </>
        ) : (
          <>
            <p>
              Diese Person hat sich noch nie angemeldet und kann daher in keinem Projekt Mitglied
              sein.
            </p>
            <form action={revokeOnlyAction}>
              <input type="hidden" name="email" value={entry.email} />
              <button type="submit">Zugang entziehen</button>
            </form>
          </>
        )}
      </main>
    );
  }

  // --- Main view: the access table + the invite form --------------------------------------------
  // After an exclusion that skipped owner projects, ?owned=<userId> makes us re-read what survived,
  // so the admin learns which projects still give that person access.
  const stillOwned = ownedParam ? await listProjectAccess(prisma, ownedParam) : [];

  return (
    <main style={{ padding: 24 }}>
      <p>
        <Link href="/">← Zur Startseite</Link>
      </p>
      <h1>Verwaltung</h1>

      {stillOwned.length > 0 && (
        <section>
          <h2>Hinweis</h2>
          <p>
            Die Person besitzt weiterhin folgende Projekte und hat dort weiter Zugriff. Löse das,
            indem du das Projekt löschst oder es jemand anderem überträgst:
          </p>
          <ul>
            {stillOwned.map((p) => (
              <li key={p.projectId}>{p.name}</li>
            ))}
          </ul>
        </section>
      )}

      <h2>Zugang</h2>
      <table>
        <thead>
          <tr>
            <th>E-Mail</th>
            <th>Status</th>
            <th>Admin</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            // The caller's own row renders without buttons. This is UI courtesy only — the
            // invariants that actually prevent a lockout live in the domain layer (design §6).
            const isSelf = entry.user?.id === callerId;
            return (
              <tr key={entry.email}>
                <td>
                  {entry.email}
                  {isSelf ? " (du)" : ""}
                </td>
                <td>
                  {/* No User row means: invited, but never signed in (JIT provisioning, Slice 1).
                      displayName is nullable even for a real user, hence the second fallback. */}
                  {entry.user ? (entry.user.displayName ?? "Angemeldet") : "Noch nie angemeldet"}
                </td>
                <td>
                  {entry.user ? (
                    <>
                      {entry.user.isAdmin ? "Ja" : "Nein"}{" "}
                      {!isSelf && (
                        <form action={setAdminAction} style={{ display: "inline" }}>
                          <input type="hidden" name="userId" value={entry.user.id} />
                          <input
                            type="hidden"
                            name="isAdmin"
                            value={entry.user.isAdmin ? "false" : "true"}
                          />
                          <button type="submit">
                            {entry.user.isAdmin ? "Adminrechte entziehen" : "Zum Admin machen"}
                          </button>
                        </form>
                      )}
                    </>
                  ) : (
                    // Admin rights live on User, not on the allowlist email — there is nothing to
                    // flag before that person's first login.
                    "– (muss sich zuerst einmal anmelden)"
                  )}
                </td>
                <td>
                  {!isSelf && (
                    // A link, not a form: revoking is a two-step flow, and this step only OPENS the
                    // confirmation panel. encodeURIComponent because an email contains characters
                    // (+, @) that must not be reinterpreted as query syntax.
                    <Link href={`/admin?revoke=${encodeURIComponent(entry.email)}`}>
                      Zugang entziehen
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>E-Mail einladen</h2>
      {/* An invitation is a database row, nothing more: the project has no mail capability, so the
          person has to be told out of band (design §2). */}
      <p>
        Die eingeladene Person kann sich danach mit ihrem Google-Konto anmelden. Es wird keine E-Mail
        verschickt – sag ihr selbst Bescheid.
      </p>
      <form action={inviteAction}>
        <input name="email" placeholder="E-Mail" aria-label="E-Mail" />
        <button type="submit">Einladen</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Add the entry point on the home page**

In `src/app/page.tsx`, replace the dead status line

```tsx
      <p>Admin: {session?.user?.isAdmin ? "ja" : "nein"}</p>
```

with the link that makes the new page reachable:

```tsx
      {/* Slice 9: the entry point to /admin, replacing the purely informational "Admin: ja/nein"
          line. The session flag is good enough to decide VISIBILITY; authorization is the page's own
          job (requireAdmin reads the flag live from the DB, so a stale token gets redirected). */}
      {session?.user?.isAdmin && (
        <p>
          <Link href="/admin">Verwaltung</Link>
        </p>
      )}
```

`Link` is already imported in that file — do not add a second import.

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: PASS both. The build type-checks the new page, including the `searchParams` prop against Next.js' generated `PageProps` for `/admin`.

- [ ] **Step 4: Manual browser pass**

Run: `npm run dev`, sign in as the seeded admin, then walk this checklist:

1. The home page shows "Verwaltung"; `/admin` opens and lists your own email marked "(du)" with no buttons.
2. Invite a fresh address → it appears with "Noch nie angemeldet" and "– (muss sich zuerst einmal anmelden)".
3. Invite the same address again → still exactly one row (idempotent).
4. Click "Zugang entziehen" on that row → the panel skips the project section and offers only the plain revoke; confirm → the row is gone.
5. For a second, already-signed-in person: "Zum Admin machen" → "Ja"; then "Adminrechte entziehen" → "Nein".
6. Put that second person into a project as a member, then revoke them with "Zugang entziehen und aus allen Projekten entfernen" → the panel listed the project; afterwards that project's member list no longer shows them.
7. Repeat 6 with a person who OWNS a project → after the action the page shows the "Hinweis" block naming the owned project.
8. Sign in as a non-admin in a private window → `/admin` redirects to `/projects`.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/page.tsx src/app/page.tsx
git commit -m "feat(admin): /admin page with access table, invite form and two-step revoke"
```

---

### Task 6: Implementation review + meta-plan update (Definition of Done)

**Files:**
- Create: `docs/implementation-reviews/slice-9-admin-area.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:** none (documentation). Part of every slice's Definition of Done.

- [ ] **Step 1: Re-run the full verification and capture the real numbers**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Record the exact test count (expected 198 in 20 files: 168 baseline + 30 new).

- [ ] **Step 2: Write the implementation review**

Create `docs/implementation-reviews/slice-9-admin-area.md` covering the five required sections (English):

1. **What was achieved** — an admin can now maintain access from inside the app: invite and revoke allowlist emails, grant and revoke `is_admin`, and optionally end project access immediately by removing member memberships. State that this closes the "Allowlist pflegen — nur `is_admin`" row of the MVP permission matrix (§6), which no earlier slice implemented.
2. **Steps taken** — one line per task (allowlist core, `setAdmin`, project-access reads + exclusion, `requireAdmin`, the page + entry point, docs), naming the locked decisions: no REST layer, no session-guard rewrite, two explicit revocation intents, `deleteMany` over `role: "member"`, email join without an FK, URL-parameter confirmation instead of a dialog.
3. **Core components built** — `src/lib/admin/admin.ts` (six functions + `AccessEntry` / `ProjectAccess` / `ExcludeResult`), `requireAdmin` in `src/lib/auth/session.ts`, `src/app/admin/page.tsx`, the home-page entry point, and the two test files.
4. **Most important lines of code** — quote and explain: (a) `const user = await db.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })` in `requireAdmin` — why reading the flag from the DB rather than the token is what makes a demotion immediate under 30-day JWTs; (b) `deleteMany({ where: { userId, role: "member" } })` — why filtering by role expresses "owners are never ejected" declaratively and avoids a loop that would have to catch 403s; (c) the `update: {}` in `inviteEmail`'s upsert — why the empty update is what preserves the original `invitedBy`; (d) `if (user.isAdmin && (await countAdmins(db)) <= 1)` — why the self-check alone is not enough (mutual demotion) and what the accepted read-committed race is; (e) `await requireAdmin(prisma)` *inside* each Server Action — why a Server Action is an addressable endpoint and the hidden fields are never authorization.
5. **Architecture contribution** — Slice 9 completes the access-control story started in Slice 1: the allowlist gains a write side, admin rights become manageable in-app, and the guard layer gains its first live (non-token) check. Note what it deliberately does not assemble (no REST surface, no mail, no ownership handover) and that Slice 8 (PWA polish) is next.

Also record honestly: the two behavioral asymmetries from the design's §8 (a running session survives a plain revoke; exclusion is not undone by re-inviting) and the break-glass procedure (rotate `AUTH_SECRET` and redeploy to end all sessions at once).

- [ ] **Step 3: Update the meta project plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

- In the status table, set the **Slice 9** row's **Plan** column to link `2026-07-26-slice-9-admin-area.md` and its **Status** to `✅ Done / verified`; change its **Delivers** cell to `/admin page: invite/revoke allowlist emails, grant/revoke is_admin, remove a revoked person from all projects`.
- Update the two notes that still announce Slice 9 as upcoming (`> **Slice 9 is next and still needs a plan; Slice 8 (PWA polish) follows it.**`) so they read as done, with Slice 8 as the next open slice.
- **Correct the now-wrong dependency bullet** (currently: "it **changes a file they all sit on**: the session guard … starts resolving the caller against the database instead of trusting the JWT … Every existing route inherits that check through `requireUserId`"). Replace it with:

```markdown
- Slice 9 needs only 1 (it writes the allowlist that Slice 1 reads). It has **no** dependency on 2–7 and
  changes **no** shared code path: the design's §4 analysis showed the planned session-guard rewrite was
  unnecessary. `requireUserId` still trusts the JWT; the new `requireAdmin` reads `isAdmin` live from the
  database but is used **only** by `/admin`. Cutting someone off from project content was already
  immediate before this slice, because membership is read fresh on every request (`getRole`, Slice 2).
```

- Add a new progress-log entry at the TOP of the "Progress log" section (newest first):

```markdown
### 2026-07-26 — Slice 9: Admin area (allowlist + admin rights) — Done
- **Delivered:** `src/lib/admin/admin.ts` (`listAccessEntries`, `inviteEmail`, `revokeEmail`, `setAdmin`, `listProjectAccess`, `excludeFromAllProjects`) with the lockout invariants (no self-revoke, no self-demotion, never the last admin); `requireAdmin(db)` in `src/lib/auth/session.ts` reading `isAdmin` live from the DB; the `/admin` Server Component (access table, invite form, two-step revoke with two explicit intents, owned-projects notice); "Verwaltung" link on the home page replacing the dead `Admin: ja/nein` line.
- **Tested:** `npm test` passed (N files, M tests — 30 new in Slice 9); `npm run lint` + `npm run build` clean. Manual browser pass per plan Task 5 Step 4: <fill in>.
- **Deviations from the plan:** <fill in, or "none">.
- **Follow-up decisions for later slices:**
  - NO REST endpoints for the allowlist (never polled, never merged offline). The domain layer is the seam if an API is ever needed.
  - `requireUserId` still trusts the JWT — deliberately. Only `/admin` pays for a live DB check. A plain revoke does not end a running session; *ausschließen* ends project access on the next request because membership is read live. Break-glass for the urgent case: rotate `AUTH_SECRET` and redeploy.
  - Owner memberships are never removed (`Project.ownerId` is a required FK). Ownership handover does not exist in the product; if it is ever needed it is its own capability with its own rules.
  - `session.test.ts` introduces the project's first `vi.mock` (of `@/auth`), scoped to that file only.
- **Inherited open items:** Slice 8 (PWA polish) plan to be created per maintenance guide step 3.
- **Commit(s):** <hashes>
```

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-reviews/slice-9-admin-area.md docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md
git commit -m "docs: Slice 9 implementation review + meta-plan progress log"
```

---

## Self-Review (performed while writing this plan)

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-26-admin-area-design.md`):

| Design section | Requirement | Task |
|---|---|---|
| §2 | Invite an email | 1 (`inviteEmail`) |
| §2 | Revoke an email (blocks future logins) | 1 (`revokeEmail`) |
| §2 | Two revocation intents, chosen in the flow | 3 (`excludeFromAllProjects`) + 5 (the two panel buttons) |
| §2 | Grant/revoke `is_admin` | 2 (`setAdmin`) |
| §2 | `/admin` page reachable only by admins | 4 (`requireAdmin`) + 5 (redirect) |
| §2 | Out of scope: no deletions, no owner handover, no REST, no mail, no guard rebuild, no audit history, seed untouched | Global Constraints + locked decisions 1–4; the "deletes no project and no user" test in Task 3 pins it |
| §3 | All six domain functions with the stated shapes | 1–3 |
| §3 | Lockout invariants (self-revoke, self-demotion, last admin, user must exist, non-UUID → 404, `MAX_EMAIL_LENGTH`) | 1 + 2 |
| §3 | `googleSub` never returned | 1 (narrow `select` + the serialization test) |
| §4 | No live check in `requireUserId`; exclusion is what makes cut-off immediate | Locked decision 2; Task 6 corrects the meta plan's stale note |
| §4 | Break-glass procedure documented | Task 6 Step 2 (review) |
| §5 | `requireAdmin()` reads `isAdmin` from the DB, used only by `/admin` | 4 |
| §6 | Table (email / status / admin+button / revoke), "(du)" row, invite block, two-step revoke via URL param, skip-project-section when no user, owned-projects notice, honest wording, home-page entry point, German strings | 5 |
| §7 | All listed test cases | 1 (invite/revoke/list), 2 (`setAdmin`), 3 (`listProjectAccess`/`excludeFromAllProjects`), 4 (`requireAdmin` incl. the stale-token case) |
| §8 | Risks communicated in the UI and in the review | 5 (panel wording) + 6 (review) |

Gaps found and closed while writing: the design names no error message for an unknown email in `revokeEmail` (fixed as `E-Mail steht nicht auf der Zugangsliste`, 404) and no email-format rule for `inviteEmail` (added `EMAIL_PATTERN` → 400 `Keine gültige E-Mail-Adresse`, with the length check first so the message matches the actual problem). The design's §6 asks the page to name skipped owner projects after an exclusion, which a Server Action cannot return to a Server Component without client state — resolved by `?owned=<userId>` plus a re-read (locked decision 9).

**2. Placeholder scan:** No TBD/TODO/"add appropriate error handling"/"similar to Task N". Every code step contains the complete file or the complete addition; every test step contains full test bodies. The only intentional fill-ins are in Task 6: the real test count, the manual-pass outcome, deviations, and commit hashes — all unknowable before execution.

**3. Type consistency:** `AccessEntry`/`AccessEntryUser` are defined in Task 1 and consumed field-by-field in Task 5 (`entry.email`, `entry.user?.id`, `entry.user.displayName`, `entry.user.isAdmin`). `ProjectAccess` (Task 3: `projectId`/`name`/`role`) is rendered with exactly those names in Task 5. `ExcludeResult.ownedProjects` (`{ id, name }`) is used as `result.ownedProjects.length` in Task 5 and asserted as `{ id, name }` in Task 3's tests. `inviteEmail(db, { email, invitedBy })`, `revokeEmail(db, { email, callerId })`, `setAdmin(db, { userId, isAdmin, callerId })`, `listProjectAccess(db, userId)`, `excludeFromAllProjects(db, { userId })` and `requireAdmin(db)` are called with those exact signatures everywhere. `countAdmins` and `findUserByEmail` stay module-private and are referenced only inside `admin.ts` (Tasks 1–3). Reused existing symbols verified against the current code: `normalizeEmail` (`src/lib/auth/normalize.ts`), `ApiError` (`src/lib/http/errors.ts`), `isUuid` (`src/lib/validate.ts`), `MAX_EMAIL_LENGTH` (exported from `src/lib/projects/membership.ts:8`), `isEmailAllowed` (`src/lib/auth/allowlist.ts`), `getRole` (`src/lib/projects/guard.ts`), `resetDb` (`src/test/reset-db.ts`, already truncates all four tables this slice touches), `prisma` (`src/lib/db.ts`), `requireUserId` (`src/lib/auth/session.ts`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-26-slice-9-admin-area.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with a two-stage review between tasks. Fast iteration, clean context per task.
2. **Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`, batched with checkpoints for your review.

Which approach?
