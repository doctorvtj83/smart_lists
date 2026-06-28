# Slice 2: Projects + Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **On completion:** Record progress in the
> [meta project plan](2026-06-04-smart-lists-projektplan-meta.md) (status table + progress log).
> This is part of the Definition of Done.
>
> **Code documentation:** All code must be meticulously documented with inline comments — every
> function, every non-obvious line, every pattern choice. See the "Code documentation standard"
> section in [CLAUDE.md](../../../CLAUDE.md). This is mandatory, not optional.
>
> **Implementation review:** After completing this slice, write
> `docs/implementation-reviews/slice-2-projects-membership.md` covering: what was achieved, steps
> taken, core components built, most important lines of code (quoted), and architecture
> contribution. See the "Implementation review" section in [CLAUDE.md](../../../CLAUDE.md).
> This is part of the Definition of Done.
>
> **Learning mode:** The user is a beginner developer learning along the way. While implementing,
> explain each step — *what* and *why* — and keep the inline comments in the code (see
> [CLAUDE.md](../../../CLAUDE.md)). In-app user-facing strings stay German (the product is German).

**Goal:** Users can create projects, share them by inviting members (Owner/Member roles), and remove
members — with every project-scoped operation re-checking membership and role server-side.

**Architecture:** A single source of truth for project/membership logic lives in pure, dependency-injected
core functions under `src/lib/projects/*` (testable against the Neon test branch). A small permission
**guard** (`getRole` / `requireMembership` / `requireOwner`) is the reusable authorization primitive that
every later slice consumes. Two thin transport adapters sit on top of the core: **REST Route Handlers**
(the HTTP boundary the MVP design calls for, used by future client/polling code) and a **minimal
server-rendered UI** (server components + server actions) for human verification. Both adapters resolve the
caller via `auth()` → `session.user.id` (from Slice 1), then call the guard, then the core.

**Tech Stack:** Next.js (App Router, TypeScript) · Auth.js (NextAuth v5) · Prisma ORM · Neon Postgres · Vitest

---

## Global Constraints

Project-wide rules (from the [meta project plan](2026-06-04-smart-lists-projektplan-meta.md)); every task
implicitly includes these:

- **Stable, client-generatable UUIDs** for all entities. Match the Slice 1 convention exactly:
  `String @id @default(uuid()) @db.Uuid` for primary keys and `@db.Uuid` on every UUID foreign-key column
  (Slice 1's `User.id` / `AllowlistEntry.id` use the native Postgres `uuid` type, so related FK columns
  **must** also be `@db.Uuid` or Prisma rejects the relation with a type-mismatch error).
- **Runtime is Next.js 16** (per the Slice 1 progress log). Dynamic route `params` is a `Promise` and must
  be awaited. Next 16 warns that `middleware` is deprecated in favor of `proxy`; Slice 1 deliberately keeps
  `src/middleware.ts` — do not change that here.
- **Every API operation re-checks membership + role** server-side — never trust the client. This slice
  builds the guard that enforces it.
- **DB access through an injectable Prisma instance** (`db: PrismaClient` as the first parameter of every
  core function), so logic is testable in isolation. Production passes the singleton from `src/lib/db.ts`;
  tests pass a test-DB client.
- **Test-first (TDD)**, small vertical slices, frequent commits.
- **Language:** implementation docs, code identifiers, and code comments in **English**. **In-app
  user-facing strings stay German** (the product is German). Commit messages: either language, consistent
  within the slice.
- **Roles:** `owner` | `member` only (no viewer role in the MVP). `is_admin` (Slice 1) is unrelated — it
  governs only the allowlist, not project access.

---

## Prerequisites

- **Slice 1 must be merged first.** At the time of writing, Slice 1 is implemented in a separate worktree
  (`.worktrees/slice-1-auth-allowlist`) but **not yet merged**. This plan assumes it is merged into the
  branch you implement Slice 2 on. The concrete Slice 1 artifacts this slice builds on (verified against
  the actual implementation, not just the Slice 1 plan):
  - `prisma/schema.prisma` — `User` + `AllowlistEntry`, both with `@db.Uuid` primary keys.
  - `src/lib/db.ts` — exports the Prisma singleton `prisma`.
  - `src/auth.ts` + `src/types/next-auth.d.ts` — `session.user.id` (string) and `session.user.isAdmin`
    (boolean) are populated; JWT strategy.
  - `src/lib/auth/normalize.ts` — exports `normalizeEmail(email): string`.
  - Test infra: `vitest.config.ts` runs `globalSetup: ["./src/test/global-setup.ts"]` (which runs
    `npx prisma migrate deploy` once against the test DB) **and** `setupFiles: ["./src/test/setup.ts"]`
    (loads `.env.test`), with `fileParallelism: false`. `src/test/reset-db.ts` exports
    `resetDb(db): Promise<void>`. Tests instantiate `new PrismaClient()` directly and call `resetDb` in
    `beforeEach`.
  - Seed config lives in `prisma.config.ts` (not `package.json#prisma`) — irrelevant to this slice but do
    not "fix" it.
- **No new external accounts or keys** are required. The same Neon main/test branches and Google
  credentials from Slice 1 are sufficient.

> Before starting, confirm the baseline: run `npm test`, `npm run lint`, and `npm run build`. All three must
> be green (they were for Slice 1). If Slice 1 is not yet merged, merge it first — this plan builds directly
> on it.

---

## File structure for this slice

What this slice creates or modifies and what each file is responsible for:

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | Add `Role` enum, `Project`, `Membership` models + back-relations on `User`. |
| `prisma/migrations/<ts>_add_projects_membership/` (create) | The migration generated from the schema change. |
| `src/test/reset-db.ts` (modify) | Truncate the two new tables too, so DB tests stay deterministic. |
| `src/lib/http/errors.ts` (create) | `ApiError` (status-carrying error) + `toErrorResponse` mapper. The one HTTP error convention. |
| `src/lib/auth/session.ts` (create) | `requireUserId()` — resolves the signed-in user id or throws `ApiError(401)`. |
| `src/lib/projects/guard.ts` (create) | `getRole` / `requireMembership` / `requireOwner` — the reusable permission guard. |
| `src/lib/projects/projects.ts` (create) | Project core: `createProject` (atomic), `listProjectsForUser`, `getProject`, `renameProject`, `deleteProject`. |
| `src/lib/projects/membership.ts` (create) | Membership core: `addMember`, `removeMember`, `listMembers`. |
| `src/app/api/projects/route.ts` (create) | REST: `GET` (my projects), `POST` (create). |
| `src/app/api/projects/[projectId]/route.ts` (create) | REST: `GET` (detail), `PATCH` (rename), `DELETE`. |
| `src/app/api/projects/[projectId]/members/route.ts` (create) | REST: `GET` (members), `POST` (add member). |
| `src/app/api/projects/[projectId]/members/[userId]/route.ts` (create) | REST: `DELETE` (remove member). |
| `src/app/projects/page.tsx` (create) | UI: list my projects + create form (server action). |
| `src/app/projects/[projectId]/page.tsx` (create) | UI: project detail, rename/delete (owner), members list, invite/remove (owner). |
| `src/app/page.tsx` (modify) | Add a link to `/projects`. |
| Test files alongside each `src/lib/**` module | TDD coverage for the core + guard. |

### Permission matrix this slice implements (MVP design §6)

| Action | Owner | Member | Non-member | Enforced by |
|---|---|---|---|---|
| Read project / list members | ✓ | ✓ | ✗ | `requireMembership` |
| Rename / delete project | ✓ | ✗ | ✗ | `requireOwner` |
| Invite / remove members | ✓ | ✗ | ✗ | `requireOwner` |

> **Design decision — inviting members:** A `Membership` needs a `user_id`, and a `User` row only exists
> after that person's first successful login (JIT provisioning, Slice 1). Therefore `addMember` looks the
> invitee up **by email among existing users**; if nobody has logged in under that email yet, it fails with
> a clear German message. "Pending invitations by email" (membership before first login) would require a
> model change and is deliberately Phase 2 — record this as a follow-up in the progress log.

---

## Task 1: Data model — `Project`, `Membership`, `Role` enum

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/test/reset-db.ts`
- Create: `prisma/migrations/<timestamp>_add_projects_membership/` (generated by the migrate command)

**Interfaces:**
- Produces: Prisma models `Project { id, name, ownerId, suggestionRuleN, suggestionRuleM, createdAt }`,
  `Membership { id, projectId, userId, role, createdAt }` with a compound unique
  `@@unique([projectId, userId])` (Prisma selector name: `projectId_userId`), and the `Role` enum
  (`owner` | `member`). All later tasks rely on these names.

- [ ] **Step 1: Add the enum, models, and back-relations to the schema**

Modify `prisma/schema.prisma`. First, add the two back-relation fields to the existing `User` model (inside
the `model User { ... }` block, before the closing `@@map("users")`):

```prisma
  // Back-relations added in Slice 2 (Projects + Membership).
  // ownedProjects: projects this user created (Project.ownerId points here).
  ownedProjects Project[]
  // memberships: every project this user belongs to (any role).
  memberships   Membership[]
```

Then append the new enum and models at the end of the file:

```prisma
// Project roles. The MVP has exactly two (no viewer role — that is Phase 2).
enum Role {
  owner
  member
}

// A Project groups lists. Lists/catalog/favorites (later slices) all hang off a project.
model Project {
  // @db.Uuid: native Postgres uuid type, matching Slice 1's User.id. FK columns pointing here must match.
  id      String @id @default(uuid()) @db.Uuid // stable, client-generatable UUID (offline-prep convention)
  name    String
  ownerId String @db.Uuid @map("owner_id") // the creator; also gets an owner Membership row (see createProject)
  owner   User   @relation(fields: [ownerId], references: [id])

  // Parameters of the suggestion statistic (MVP design §4.3). Stored now so Slice 5 needs no migration;
  // editing them is out of scope for this slice. Defaults: appears in >= N of the last M completed lists.
  suggestionRuleN Int @default(2) @map("suggestion_rule_n")
  suggestionRuleM Int @default(4) @map("suggestion_rule_m")

  createdAt   DateTime     @default(now()) @map("created_at")
  memberships Membership[]

  @@map("projects")
}

// Join row between User and Project carrying the role. Membership is the unit every permission check reads.
model Membership {
  id        String @id @default(uuid()) @db.Uuid
  projectId String @db.Uuid @map("project_id")
  // onDelete: Cascade -> deleting a project removes its memberships automatically (see deleteProject).
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String @db.Uuid @map("user_id")
  // onDelete: Cascade -> if a user is ever deleted, their memberships go too.
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      Role
  createdAt DateTime @default(now()) @map("created_at")

  // A user has at most one membership per project (the identity rule from MVP design §3.1).
  // Prisma exposes this as the compound selector `projectId_userId` in findUnique/upsert.
  @@unique([projectId, userId])
  @@map("memberships")
}
```

- [ ] **Step 2: Create and apply the migration against the main DB**

Run: `npx prisma migrate dev --name add_projects_membership`
Expected: Prisma creates the `projects` and `memberships` tables + the `Role` enum in the Neon main DB,
writes `prisma/migrations/<timestamp>_add_projects_membership/`, and regenerates the typed client (so
`prisma.project` / `prisma.membership` become available in TypeScript).

- [ ] **Step 3: Extend the test-DB reset helper**

Modify `src/test/reset-db.ts` — this file already exists from Slice 1 with explanatory comments (keep them;
CLAUDE.md forbids thinning out existing comments). Make a **targeted edit**: add the two new tables to the
existing `TRUNCATE` statement. Change this exact line:

```ts
    'TRUNCATE TABLE "users", "allowlist_entries" RESTART IDENTITY CASCADE;'
```

to:

```ts
    'TRUNCATE TABLE "users", "allowlist_entries", "projects", "memberships" RESTART IDENTITY CASCADE;'
```

Leave the surrounding function and comments untouched.

- [ ] **Step 4: Verify the client compiles with the new models**

Run: `npx tsc --noEmit`
Expected: no errors. (This confirms the regenerated Prisma client exposes `project`/`membership` and the
`Role` type, and that the `User` back-relations are valid.)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/test/reset-db.ts
git commit -m "feat: data model Project + Membership (Role enum), test-DB reset"
```

---

## Task 2: HTTP error convention (`ApiError` + `toErrorResponse`)

A single, status-carrying error type lets core functions (and the guard) signal "403 / 404 / 400" without
importing anything web-specific, while route handlers map any thrown error to a consistent JSON response.

**Files:**
- Create: `src/lib/http/errors.ts`
- Test: `src/lib/http/errors.test.ts`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { status: number; constructor(status: number, message: string) }`
  - `function toErrorResponse(error: unknown): NextResponse` — `ApiError` → `{ error: message }` with its
    status; anything else → `{ error: "Interner Fehler" }` with status 500.

- [ ] **Step 1: Write the failing test**

Create `src/lib/http/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError, toErrorResponse } from "./errors";

describe("ApiError", () => {
  it("carries a status and message", () => {
    const e = new ApiError(403, "kein zugriff");
    expect(e.status).toBe(403);
    expect(e.message).toBe("kein zugriff");
  });
});

describe("toErrorResponse", () => {
  it("maps an ApiError to a response with its status and message", async () => {
    const res = toErrorResponse(new ApiError(404, "nicht gefunden"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "nicht gefunden" });
  });

  it("maps an unknown error to a generic 500", async () => {
    const res = toErrorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Fehler" });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/http/errors.test.ts`
Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/http/errors.ts`:

```ts
import { NextResponse } from "next/server";

// A domain/HTTP error that carries the status code it should map to.
// Pattern: throwing a typed error keeps core functions free of web-framework imports — they just throw
// `new ApiError(403, ...)`, and the single mapper below turns it into an HTTP response at the boundary.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// The ONE place that turns a thrown error into an HTTP JSON response.
// Known ApiError -> its status + German message (user-facing). Anything else -> generic 500 (don't leak
// internals), and we log the real error server-side for debugging.
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Unexpected error:", error);
  return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/http/errors.test.ts`
Expected: PASS (3 tests green). The 500 test prints `Unexpected error: ...` to the console — that is the
intended logging, not a failure.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/errors.ts src/lib/http/errors.test.ts
git commit -m "feat: ApiError + toErrorResponse HTTP error convention"
```

---

## Task 3: Permission guard (`getRole` / `requireMembership` / `requireOwner`)

This is **the** authorization primitive of the whole app and the core test seam from MVP design §7
("Berechtigungsprüfung: Owner/Mitglied/Nicht-Mitglied gegen jede Aktion"). Every project-scoped operation
in this and later slices calls it.

**Files:**
- Create: `src/lib/projects/guard.ts`
- Test: `src/lib/projects/guard.test.ts`

**Interfaces:**
- Consumes: `ApiError` from `src/lib/http/errors.ts`; the `Role` type from `@prisma/client`.
- Produces:
  - `getRole(db: PrismaClient, projectId: string, userId: string): Promise<Role | null>`
  - `requireMembership(db, projectId, userId): Promise<Role>` — throws `ApiError(404)` if not a member.
  - `requireOwner(db, projectId, userId): Promise<Role>` — throws `ApiError(403)` if a member but not owner
    (and propagates the `404` from `requireMembership` for non-members).

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/guard.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { getRole, requireMembership, requireOwner } from "./guard";

const db = new PrismaClient();

// Three actors and one project shared by the cases below.
let ownerId: string;
let memberId: string;
let strangerId: string;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  const member = await db.user.create({ data: { googleSub: "g-member", email: "member@example.com" } });
  const stranger = await db.user.create({ data: { googleSub: "g-stranger", email: "stranger@example.com" } });
  ownerId = owner.id;
  memberId = member.id;
  strangerId = stranger.id;

  const project = await db.project.create({ data: { name: "Haushalt", ownerId } });
  projectId = project.id;
  await db.membership.create({ data: { projectId, userId: ownerId, role: "owner" } });
  await db.membership.create({ data: { projectId, userId: memberId, role: "member" } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("getRole", () => {
  it("returns the role for members", async () => {
    expect(await getRole(db, projectId, ownerId)).toBe("owner");
    expect(await getRole(db, projectId, memberId)).toBe("member");
  });

  it("returns null for a non-member", async () => {
    expect(await getRole(db, projectId, strangerId)).toBeNull();
  });
});

describe("requireMembership", () => {
  it("returns the role for members", async () => {
    expect(await requireMembership(db, projectId, memberId)).toBe("member");
  });

  it("throws 404 for a non-member (existence is hidden)", async () => {
    await expect(requireMembership(db, projectId, strangerId)).rejects.toMatchObject({ status: 404 });
  });
});

describe("requireOwner", () => {
  it("passes for the owner", async () => {
    await expect(requireOwner(db, projectId, ownerId)).resolves.toBe("owner");
  });

  it("throws 403 for a member", async () => {
    await expect(requireOwner(db, projectId, memberId)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 404 for a non-member", async () => {
    await expect(requireOwner(db, projectId, strangerId)).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/projects/guard.test.ts`
Expected: FAIL — `Cannot find module './guard'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/projects/guard.ts`:

```ts
import type { PrismaClient, Role } from "@prisma/client";
import { ApiError } from "@/lib/http/errors";

// Reads the caller's role in a project, or null if they are not a member.
// db is injected (dependency injection) so this is testable against the test DB.
export async function getRole(
  db: PrismaClient,
  projectId: string,
  userId: string,
): Promise<Role | null> {
  // Uses the compound unique index (projectId_userId) -> one indexed lookup, no scan.
  const membership = await db.membership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return membership ? membership.role : null;
}

// Asserts the caller is a member; returns their role for callers that branch on it.
// Non-members get 404 (not 403) so we don't reveal that a project they can't see even exists.
export async function requireMembership(
  db: PrismaClient,
  projectId: string,
  userId: string,
): Promise<Role> {
  const role = await getRole(db, projectId, userId);
  if (!role) throw new ApiError(404, "Projekt nicht gefunden");
  return role;
}

// Asserts the caller is the owner. Builds on requireMembership, so:
//   non-member -> 404 (from requireMembership), member -> 403 (here), owner -> ok.
export async function requireOwner(
  db: PrismaClient,
  projectId: string,
  userId: string,
): Promise<Role> {
  const role = await requireMembership(db, projectId, userId);
  if (role !== "owner") throw new ApiError(403, "Nur der Owner darf das");
  return role;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/projects/guard.test.ts`
Expected: PASS (7 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/guard.ts src/lib/projects/guard.test.ts
git commit -m "feat: project permission guard (getRole/requireMembership/requireOwner) with tests"
```

---

## Task 4: Project core functions

**Files:**
- Create: `src/lib/projects/projects.ts`
- Test: `src/lib/projects/projects.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `Project` from `@prisma/client`.
- Produces:
  - `createProject(db, input: { name: string; ownerId: string }): Promise<Project>` — atomically creates
    the project **and** the creator's owner `Membership`.
  - `listProjectsForUser(db, userId: string): Promise<Project[]>` — projects the user is a member of, oldest
    first.
  - `getProject(db, projectId: string): Promise<Project | null>`
  - `renameProject(db, projectId: string, name: string): Promise<Project>`
  - `deleteProject(db, projectId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/projects.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import {
  createProject,
  deleteProject,
  getProject,
  listProjectsForUser,
  renameProject,
} from "./projects";

const db = new PrismaClient();
let userId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await db.user.create({ data: { googleSub: "g-u", email: "u@example.com" } });
  userId = user.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createProject", () => {
  it("creates the project with defaults and the creator as owner membership", async () => {
    const project = await createProject(db, { name: "Einkauf", ownerId: userId });
    expect(project.id).toBeTruthy();
    expect(project.name).toBe("Einkauf");
    expect(project.ownerId).toBe(userId);
    expect(project.suggestionRuleN).toBe(2); // default from the schema
    expect(project.suggestionRuleM).toBe(4); // default from the schema

    // The owner membership must exist (this is what later permission checks read).
    const membership = await db.membership.findUnique({
      where: { projectId_userId: { projectId: project.id, userId } },
    });
    expect(membership?.role).toBe("owner");
  });
});

describe("listProjectsForUser", () => {
  it("returns only projects the user is a member of", async () => {
    const other = await db.user.create({ data: { googleSub: "g-o", email: "o@example.com" } });
    await createProject(db, { name: "Meins", ownerId: userId });
    await createProject(db, { name: "Fremd", ownerId: other.id });

    const mine = await listProjectsForUser(db, userId);
    expect(mine.map((p) => p.name)).toEqual(["Meins"]);
  });
});

describe("renameProject", () => {
  it("changes the name", async () => {
    const project = await createProject(db, { name: "Alt", ownerId: userId });
    const renamed = await renameProject(db, project.id, "Neu");
    expect(renamed.name).toBe("Neu");
  });
});

describe("deleteProject", () => {
  it("deletes the project and cascades its memberships", async () => {
    const project = await createProject(db, { name: "Weg", ownerId: userId });
    await deleteProject(db, project.id);

    expect(await getProject(db, project.id)).toBeNull();
    expect(await db.membership.count({ where: { projectId: project.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/projects/projects.test.ts`
Expected: FAIL — `Cannot find module './projects'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/projects/projects.ts`:

```ts
import type { PrismaClient, Project } from "@prisma/client";

// Input for creating a project. ownerId comes from the trusted session, never from the request body.
export interface CreateProjectInput {
  name: string;
  ownerId: string;
}

// Creates a project AND the creator's owner membership in one transaction.
// Why a transaction: a project without its owner membership would be unreachable (no one could pass the
// permission guard). $transaction guarantees both rows are written or neither is.
export async function createProject(
  db: PrismaClient,
  input: CreateProjectInput,
): Promise<Project> {
  return db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { name: input.name, ownerId: input.ownerId },
    });
    await tx.membership.create({
      data: { projectId: project.id, userId: input.ownerId, role: "owner" },
    });
    return project;
  });
}

// All projects the user belongs to (any role), oldest first for a stable list order.
// `memberships: { some: { userId } }` = "projects having at least one membership row for this user".
export async function listProjectsForUser(
  db: PrismaClient,
  userId: string,
): Promise<Project[]> {
  return db.project.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: "asc" },
  });
}

// Single project by id, or null if it does not exist. Permission is checked by the caller via the guard.
export async function getProject(
  db: PrismaClient,
  projectId: string,
): Promise<Project | null> {
  return db.project.findUnique({ where: { id: projectId } });
}

// Renames a project. Owner-only; the caller enforces that via requireOwner before calling this.
export async function renameProject(
  db: PrismaClient,
  projectId: string,
  name: string,
): Promise<Project> {
  return db.project.update({ where: { id: projectId }, data: { name } });
}

// Deletes a project. Memberships are removed automatically by the onDelete: Cascade FK (schema, Task 1).
export async function deleteProject(
  db: PrismaClient,
  projectId: string,
): Promise<void> {
  await db.project.delete({ where: { id: projectId } });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/projects/projects.test.ts`
Expected: PASS (4 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/projects.ts src/lib/projects/projects.test.ts
git commit -m "feat: project core functions (create/list/get/rename/delete) with tests"
```

---

## Task 5: Membership core functions

**Files:**
- Create: `src/lib/projects/membership.ts`
- Test: `src/lib/projects/membership.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `Membership`, `User` from `@prisma/client`; `normalizeEmail` from
  `@/lib/auth/normalize` (Slice 1); `ApiError` from `@/lib/http/errors`.
- Produces:
  - `addMember(db, input: { projectId: string; email: string }): Promise<Membership>` — looks up an
    existing user by normalized email; throws `ApiError(404)` if none has logged in yet; idempotent upsert
    with `role = "member"`.
  - `removeMember(db, input: { projectId: string; userId: string }): Promise<void>` — refuses to remove an
    owner membership (`ApiError(403)`); `ApiError(404)` if the membership does not exist.
  - `listMembers(db, projectId: string): Promise<(Membership & { user: User })[]>` — members with their
    user, oldest first.

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/membership.test.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/test/reset-db";
import { createProject } from "./projects";
import { addMember, listMembers, removeMember } from "./membership";

const db = new PrismaClient();
let ownerId: string;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const owner = await db.user.create({ data: { googleSub: "g-owner", email: "owner@example.com" } });
  ownerId = owner.id;
  const project = await createProject(db, { name: "Haushalt", ownerId });
  projectId = project.id; // already has the owner membership
});

afterAll(async () => {
  await db.$disconnect();
});

describe("addMember", () => {
  it("adds an existing user (looked up by normalized email) as a member", async () => {
    await db.user.create({ data: { googleSub: "g-m", email: "member@example.com" } });
    // Email written differently on purpose -> normalization must match it.
    const membership = await addMember(db, { projectId, email: "  Member@Example.com " });
    expect(membership.role).toBe("member");

    const members = await listMembers(db, projectId);
    expect(members).toHaveLength(2); // owner + new member
  });

  it("is idempotent: adding the same member twice keeps a single membership", async () => {
    await db.user.create({ data: { googleSub: "g-m", email: "member@example.com" } });
    await addMember(db, { projectId, email: "member@example.com" });
    await addMember(db, { projectId, email: "member@example.com" });
    expect(await db.membership.count({ where: { projectId } })).toBe(2); // owner + one member
  });

  it("throws 404 if no user with that email has logged in yet", async () => {
    await expect(addMember(db, { projectId, email: "ghost@example.com" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("removeMember", () => {
  it("removes a member", async () => {
    const member = await db.user.create({ data: { googleSub: "g-m", email: "member@example.com" } });
    await addMember(db, { projectId, email: "member@example.com" });
    await removeMember(db, { projectId, userId: member.id });
    expect(await db.membership.count({ where: { projectId } })).toBe(1); // only the owner left
  });

  it("refuses to remove the owner", async () => {
    await expect(removeMember(db, { projectId, userId: ownerId })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws 404 when the membership does not exist", async () => {
    const stranger = await db.user.create({ data: { googleSub: "g-s", email: "s@example.com" } });
    await expect(removeMember(db, { projectId, userId: stranger.id })).rejects.toMatchObject({
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/projects/membership.test.ts`
Expected: FAIL — `Cannot find module './membership'`.

- [ ] **Step 3: Minimal implementation**

Create `src/lib/projects/membership.ts`:

```ts
import type { Membership, PrismaClient, User } from "@prisma/client";
import { normalizeEmail } from "@/lib/auth/normalize";
import { ApiError } from "@/lib/http/errors";

export interface AddMemberInput {
  projectId: string;
  email: string;
}

// Adds an existing user as a member of a project, identified by email.
// Why "existing": a Membership needs a user_id, and a User row only exists after that person's first login
// (JIT provisioning, Slice 1). Pre-login invitations would need a model change -> Phase 2.
// Idempotent: upsert means inviting an already-member is a no-op, not a duplicate/error.
export async function addMember(
  db: PrismaClient,
  input: AddMemberInput,
): Promise<Membership> {
  const email = normalizeEmail(input.email);

  // User.email is not unique (googleSub is the identity), so findFirst — practically one row per email.
  const user = await db.user.findFirst({ where: { email } });
  if (!user) {
    throw new ApiError(
      404,
      "Nutzer nicht gefunden – die Person muss sich zuerst einmal anmelden.",
    );
  }

  return db.membership.upsert({
    where: { projectId_userId: { projectId: input.projectId, userId: user.id } },
    update: {}, // already a member -> change nothing (idempotent)
    create: { projectId: input.projectId, userId: user.id, role: "member" },
  });
}

export interface RemoveMemberInput {
  projectId: string;
  userId: string;
}

// Removes a member from a project. The owner cannot be removed (you delete the project to dissolve it).
export async function removeMember(
  db: PrismaClient,
  input: RemoveMemberInput,
): Promise<void> {
  const membership = await db.membership.findUnique({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
  });
  if (!membership) throw new ApiError(404, "Mitglied nicht gefunden");
  if (membership.role === "owner") {
    throw new ApiError(403, "Der Owner kann nicht entfernt werden.");
  }
  await db.membership.delete({ where: { id: membership.id } });
}

// Lists a project's members with their user record, oldest membership first.
// The `& { user: User }` return type reflects the `include: { user: true }` so callers get typed user data.
export async function listMembers(
  db: PrismaClient,
  projectId: string,
): Promise<(Membership & { user: User })[]> {
  return db.membership.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/projects/membership.test.ts`
Expected: PASS (6 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/membership.ts src/lib/projects/membership.test.ts
git commit -m "feat: membership core functions (add/remove/list) with tests"
```

---

## Task 6: REST route handlers — projects (`/api/projects`, `/api/projects/[projectId]`)

Thin HTTP adapters over the tested core. Each handler: resolve the user → run the guard → call the core →
map errors. We do not unit-test this glue (it only wires already-tested functions); it is verified by
`npm run build` plus the curl smoke test in Step 4 and the browser checks in Task 8.

**Files:**
- Create: `src/lib/auth/session.ts`
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[projectId]/route.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth`; `prisma` from `@/lib/db`; `ApiError` / `toErrorResponse`; the guard and
  project core.
- Produces: `requireUserId(): Promise<string>` (in `session.ts`) — returns the signed-in user id or throws
  `ApiError(401)`. HTTP contract:
  - `GET /api/projects` → `200` `Project[]`
  - `POST /api/projects` `{ name }` → `201` `Project`
  - `GET /api/projects/:id` → `200` `Project` (member only)
  - `PATCH /api/projects/:id` `{ name }` → `200` `Project` (owner only)
  - `DELETE /api/projects/:id` → `204` (owner only)

- [ ] **Step 1: Create the session helper**

Create `src/lib/auth/session.ts`:

```ts
import { auth } from "@/auth";
import { ApiError } from "@/lib/http/errors";

// Resolves the signed-in user's id for use in API route handlers.
// Throws ApiError(401) if there is no session. Defense in depth: middleware already protects routes, but
// API handlers must never assume a caller — they re-derive identity from the trusted session.
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ApiError(401, "Nicht angemeldet");
  return userId;
}
```

- [ ] **Step 2: Create the collection route**

Create `src/app/api/projects/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { createProject, listProjectsForUser } from "@/lib/projects/projects";

// GET /api/projects -> the caller's projects.
export async function GET() {
  try {
    const userId = await requireUserId();
    const projects = await listProjectsForUser(prisma, userId);
    return NextResponse.json(projects);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// POST /api/projects { name } -> create a project (caller becomes owner).
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    // .catch(() => null): a malformed/empty body must become a clean 400, not an unhandled throw.
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");

    const project = await createProject(prisma, { name, ownerId: userId });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 3: Create the item route**

Create `src/app/api/projects/[projectId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireMembership, requireOwner } from "@/lib/projects/guard";
import { deleteProject, getProject, renameProject } from "@/lib/projects/projects";

// In the App Router, a dynamic route's `params` is a Promise and must be awaited.
type Context = { params: Promise<{ projectId: string }> };

// GET /api/projects/:id -> project detail (members only).
export async function GET(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);
    const project = await getProject(prisma, projectId);
    return NextResponse.json(project);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// PATCH /api/projects/:id { name } -> rename (owner only).
export async function PATCH(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireOwner(prisma, projectId, userId);

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");

    const project = await renameProject(prisma, projectId, name);
    return NextResponse.json(project);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// DELETE /api/projects/:id -> delete (owner only). 204 = success, no body.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireOwner(prisma, projectId, userId);
    await deleteProject(prisma, projectId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Lint + build check + manual curl smoke test**

Run: `npm run lint && npm run build`
Expected: lint clean, build succeeds, no TypeScript errors.

Then, with the dev server running (`npm run dev`) and **not** logged in, confirm the auth boundary:

Run: `curl -i http://localhost:3000/api/projects`
Expected: a redirect to `/login` (middleware) or `401 {"error":"Nicht angemeldet"}` — either way, **not**
project data. (Authenticated CRUD is exercised through the UI in Task 8, where the browser carries the
session cookie.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/app/api/projects
git commit -m "feat: REST routes for projects (list/create/get/rename/delete)"
```

---

## Task 7: REST route handlers — members

**Files:**
- Create: `src/app/api/projects/[projectId]/members/route.ts`
- Create: `src/app/api/projects/[projectId]/members/[userId]/route.ts`

**Interfaces:**
- Consumes: `requireUserId`; the guard; the membership core.
- Produces HTTP contract:
  - `GET /api/projects/:id/members` → `200` members with user (member only)
  - `POST /api/projects/:id/members` `{ email }` → `201` `Membership` (owner only)
  - `DELETE /api/projects/:id/members/:userId` → `204` (owner only)

- [ ] **Step 1: Create the members collection route**

Create `src/app/api/projects/[projectId]/members/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireMembership, requireOwner } from "@/lib/projects/guard";
import { addMember, listMembers } from "@/lib/projects/membership";

type Context = { params: Promise<{ projectId: string }> };

// GET -> list members (any member may see who is in the project).
export async function GET(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);
    const members = await listMembers(prisma, projectId);
    return NextResponse.json(members);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// POST { email } -> invite an existing user as a member (owner only).
export async function POST(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireOwner(prisma, projectId, userId);

    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) throw new ApiError(400, "E-Mail darf nicht leer sein");

    const membership = await addMember(prisma, { projectId, email });
    return NextResponse.json(membership, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Create the member item route**

Create `src/app/api/projects/[projectId]/members/[userId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireOwner } from "@/lib/projects/guard";
import { removeMember } from "@/lib/projects/membership";

type Context = { params: Promise<{ projectId: string; userId: string }> };

// DELETE -> remove a member (owner only). removeMember itself refuses to remove the owner.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const callerId = await requireUserId();
    const { projectId, userId } = await params;
    await requireOwner(prisma, projectId, callerId);
    await removeMember(prisma, { projectId, userId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 3: Lint + build check**

Run: `npm run lint && npm run build`
Expected: lint clean, build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/projects
git commit -m "feat: REST routes for members (list/add/remove)"
```

---

## Task 8: Minimal UI + manual end-to-end verification

Server-rendered pages with server actions. The actions call the **same** tested core functions through the
**same** guard as the REST routes, so this exercises the full chain in the browser. In-app strings are
German; comments stay English.

**Files:**
- Create: `src/app/projects/page.tsx`
- Create: `src/app/projects/[projectId]/page.tsx`
- Modify: `src/app/page.tsx` (add a link to `/projects`)

- [ ] **Step 1: Projects list + create page**

Create `src/app/projects/page.tsx`:

```tsx
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createProject, listProjectsForUser } from "@/lib/projects/projects";

// Server Component: runs on the server, so it can read the session and call the DB core directly.
export default async function ProjectsPage() {
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is present.
  const userId = session!.user.id;
  const projects = await listProjectsForUser(prisma, userId);

  // Server Action: the form posts here on the server; no client JS needed.
  async function create(formData: FormData) {
    "use server";
    const s = await auth();
    const uid = s?.user?.id;
    if (!uid) return; // should not happen behind middleware
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await createProject(prisma, { name, ownerId: uid });
    revalidatePath("/projects"); // re-render the list with the new project
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Projekte</h1>
      <form action={create}>
        <input name="name" placeholder="Projektname" aria-label="Projektname" />
        <button type="submit">Projekt anlegen</button>
      </form>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Project detail page (members, rename/delete, invite/remove)**

Create `src/app/projects/[projectId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { deleteProject, getProject, renameProject } from "@/lib/projects/projects";
import { addMember, listMembers, removeMember } from "@/lib/projects/membership";
import { requireMembership, requireOwner } from "@/lib/projects/guard";

type Props = { params: Promise<{ projectId: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  // Guard: a non-member must not see this page. requireMembership throws -> send them back to the list.
  let role;
  try {
    role = await requireMembership(prisma, projectId, userId);
  } catch {
    redirect("/projects");
  }

  const project = await getProject(prisma, projectId);
  const members = await listMembers(prisma, projectId);
  const isOwner = role === "owner";

  // --- Owner-only server actions. Each re-checks ownership server-side (defense in depth). ---
  async function rename(formData: FormData) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await renameProject(prisma, projectId, name);
    revalidatePath(`/projects/${projectId}`);
  }

  async function remove() {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    await deleteProject(prisma, projectId);
    redirect("/projects");
  }

  async function invite(formData: FormData) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await addMember(prisma, { projectId, email });
    revalidatePath(`/projects/${projectId}`);
  }

  async function kick(formData: FormData) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    const memberUserId = String(formData.get("userId") ?? "");
    if (!memberUserId) return;
    await removeMember(prisma, { projectId, userId: memberUserId });
    revalidatePath(`/projects/${projectId}`);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>{project?.name}</h1>
      <p>Deine Rolle: {role === "owner" ? "Owner" : "Mitglied"}</p>

      <h2>Mitglieder</h2>
      <ul>
        {members.map((m) => (
          <li key={m.id}>
            {m.user.email} ({m.role === "owner" ? "Owner" : "Mitglied"})
            {isOwner && m.role !== "owner" && (
              <form action={kick} style={{ display: "inline" }}>
                <input type="hidden" name="userId" value={m.userId} />
                <button type="submit">Entfernen</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <>
          <h2>Mitglied einladen</h2>
          <form action={invite}>
            <input name="email" placeholder="E-Mail" aria-label="E-Mail" />
            <button type="submit">Einladen</button>
          </form>

          <h2>Projekt umbenennen</h2>
          <form action={rename}>
            <input name="name" placeholder="Neuer Name" aria-label="Neuer Name" />
            <button type="submit">Umbenennen</button>
          </form>

          <h2>Projekt löschen</h2>
          <form action={remove}>
            <button type="submit">Projekt löschen</button>
          </form>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Link to projects from the home page**

Modify `src/app/page.tsx` (the Slice 1 home page — keep its existing content: the `redirect` guard, email,
admin flag, and logout form). Two edits:

First, add the `Link` import below the existing imports (the file already imports `auth, signOut` from
`@/auth` and `redirect` from `next/navigation`):

```tsx
import Link from "next/link";
```

Second, add this paragraph inside the existing `<main>`, just before the logout `<form>`:

```tsx
      <p>
        <Link href="/projects">Zu meinen Projekten</Link>
      </p>
```

> Keep all existing Slice 1 markup; only add the import and the one `<p>`.

- [ ] **Step 4: Manual end-to-end verification in the browser**

Run: `npm run dev`, log in with your enabled Google account, then check in order:

1. Open `/` → "Zu meinen Projekten" link works → `/projects`. ✅
2. Create a project "Haushalt" → it appears in the list. ✅
3. Open it → you see "Deine Rolle: Owner" and yourself listed as the only member (Owner). ✅
4. Rename it → the heading updates. ✅
5. Invite an email that has **never logged in** → an error surfaces (the German "Nutzer nicht gefunden …"
   message; in dev this appears as a server error overlay — that is the expected guard behavior). ✅
6. *(If a second enabled account that has logged in once is available)* invite that email → it appears as
   "Mitglied"; "Entfernen" removes it. ✅
7. *(If you can log in as that member)* open the project as the member → no rename/delete/invite controls
   are shown; visiting another member's project you are **not** part of redirects to `/projects`. ✅
8. Delete the project as owner → you return to `/projects` and it is gone. ✅

Stop the server with `Ctrl-C`.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects src/app/page.tsx
git commit -m "feat: projects UI (list/create + detail with members, rename/delete, invite/remove)"
```

---

## Task 9: Wrap-up — full suite, docs, progress, review

**Files:**
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`
- Create: `docs/implementation-reviews/slice-2-projects-membership.md`
- Modify: `CLAUDE.md` (only if a command changed — see Step 2)

- [ ] **Step 1: Run the full test suite + build**

Run: `npm test`
Expected: all green — Slice 1 (normalize/allowlist/provisioning/callbacks) **plus** Slice 2 (errors, guard,
projects, membership): 3 + 7 + 4 + 6 = 20 new tests across the new files, all passing.

Run: `npm run lint && npm run build`
Expected: lint clean, build succeeds, no errors.

- [ ] **Step 2: Update CLAUDE.md if needed**

No new build/test/run commands are introduced by this slice (same `npm test` / `npm run dev` /
`npx prisma migrate dev`). If Slice 1 already added the "Build / Test / Run" section, **no change is
needed**. If it is missing, add it now (see Slice 1 plan, Task 9 Step 2).

- [ ] **Step 3: Update the meta project plan**

Modify `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:
- In the status table, set Slice 2 to **✅ Done** and fill in this plan's filename
  (`2026-06-28-slice-2-projects-membership.md`).
- Append a progress-log entry (newest on top) following the template, including these
  **follow-up decisions for later slices:**
  - "The permission guard `src/lib/projects/guard.ts` (`getRole` / `requireMembership` / `requireOwner`) is
    the reusable authorization primitive — Slices 3–6 MUST call it for every project-scoped operation."
  - "`ApiError` + `toErrorResponse` (`src/lib/http/errors.ts`) is the standard HTTP error convention;
    `requireUserId` (`src/lib/auth/session.ts`) is the standard way route handlers resolve the caller."
  - "`addMember` requires the invitee to have logged in once (a `User` row must exist). Pending
    email-only invitations are deferred to Phase 2 (would need a model change)."
  - "Non-members receive `404` (not `403`) for project access, to avoid leaking project existence."

- [ ] **Step 4: Write the implementation review**

Create `docs/implementation-reviews/slice-2-projects-membership.md` covering all five required sections
(see CLAUDE.md "Implementation review"):

1. **What was achieved** — projects CRUD, Owner/Member roles, invite/remove members, and a reusable
   server-side permission guard; whether the slice goal was fully met.
2. **Steps taken** — one short paragraph per task (1–8): schema, error convention, guard, project core,
   membership core, project routes, member routes, UI + verification.
3. **Core components built** — each new file with its role (start from the file-structure table at the top
   of this plan).
4. **Most important lines of code** — quote and explain the 5–10 lines that carry the most conceptual
   weight. Good candidates: the `$transaction` in `createProject`, the `projectId_userId` lookup in
   `getRole`, the `requireOwner` building on `requireMembership` (404→403 layering), the idempotent
   `upsert` in `addMember`, and the `toErrorResponse` mapper.
5. **Architecture contribution** — this slice assembled the **authorization layer**: every later
   project-scoped operation flows through `requireMembership` / `requireOwner`, consuming the
   `session.user.id` that Slice 1 produced. Explain how Slice 3 (lists/entries) will sit on top of it.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md docs/implementation-reviews/slice-2-projects-membership.md CLAUDE.md
git commit -m "docs: meta plan progress + implementation review (Slice 2 done)"
```

---

## Definition of Done (Slice 2)

- [ ] `npm test` green (errors, guard, projects, membership — plus all Slice 1 tests).
- [ ] `npm run build` with no errors.
- [ ] An owner can create, rename, and delete a project; only members can read it; non-members are rejected.
- [ ] An owner can invite an existing user by email and remove members; the owner cannot be removed.
- [ ] Inviting an email that has never logged in fails with the clear German message.
- [ ] A member sees no owner-only controls; a non-member visiting a project is redirected/`404`.
- [ ] All code is meticulously documented with inline comments (CLAUDE.md "Code documentation standard").
- [ ] Meta project plan shows Slice 2 ✅ with a progress-log entry; implementation review exists with all
      five sections.

## Test-seam coverage (against MVP design §7)

| Seam from §7 | Covered by |
|---|---|
| Permission check (Owner / Member / Non-member against each action) | Task 3 (`guard.test.ts`) + Task 8 browser verification |
| Atomic project creation with owner membership | Task 4 (`createProject` test: project + owner membership) |
| Membership identity (one membership per user+project) | Task 5 (`addMember` idempotency test) + `@@unique` (Task 1) |

> The remaining §7 seams (normalization/catalog identity, suggestion logic, entry merge, completion) belong
> to later slices and are deliberately not covered here.
