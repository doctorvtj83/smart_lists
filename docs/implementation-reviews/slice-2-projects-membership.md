# Implementation Review — Slice 2: Projects + Membership

## 1. What was achieved

Slice 2 delivered the full Projects + Membership layer of the Smart Lists MVP. Concretely:

- **Projects CRUD:** create, list, get, rename, and delete projects, with the creator automatically becoming the owner.
- **Role-based access control:** two roles (`owner` / `member`), enforced by a reusable permission guard that every later slice MUST call.
- **Membership management:** invite an existing user by email (idempotent), remove a member (the owner cannot be removed), and list members.
- **REST API:** seven route handlers covering projects (collection + item) and members (collection + member item), all returning typed JSON.
- **Server-rendered UI:** project list page (with create form), project detail page (members list, rename/delete, invite/remove), and a link from the home page.
- **HTTP error convention:** `ApiError` + `toErrorResponse` unify all error handling across the API surface.
- **43 tests** across 8 test files (20 new in this slice + 23 from Slice 1), all green; `npm run lint` and `npm run build` pass cleanly.
- **Manual browser verification (Task 8):** Completed 2026-07-05 in Safari with two allowlisted Google accounts. Owner flow (create, rename, delete, invite, unknown-email error) and permission matrix (member sees no owner controls; non-member redirected to `/projects`) confirmed. Slice 2 Definition of Done is fully met.

---

## 2. Steps taken

**Task 1 — Schema (Project + Membership models):** Added the `Role` enum (`owner` / `member`), `Project` model, and `Membership` model to `prisma/schema.prisma`. All IDs are UUIDs (`@default(uuid()) @db.Uuid`). Memberships carry a compound unique index `@@unique([projectId, userId])` so there can never be duplicate membership rows. Both models cascade-delete: deleting a project removes its memberships. A new Prisma migration was generated and applied to the test database.

**Task 2 — HTTP error convention (`ApiError` + `toErrorResponse`):** Created `src/lib/http/errors.ts`. `ApiError` is a plain JavaScript `Error` subclass that carries an HTTP status code alongside the message. `toErrorResponse` is the single boundary function that turns any thrown value into a `NextResponse`—known `ApiError` instances map to their status + message, everything else collapses to a generic 500. Domain logic never imports Next.js; it just throws `ApiError`.

**Task 3 — Permission guard (`getRole` / `requireMembership` / `requireOwner`):** Created `src/lib/projects/guard.ts`. `getRole` does an indexed lookup on the compound key. `requireMembership` wraps it and throws `ApiError(404)` if the user is not a member—hiding project existence from non-members. `requireOwner` layers on top: non-members still get 404, members-only get 403. Seven unit tests cover all three functions and all role combinations.

**Task 4 — Project core functions:** Created `src/lib/projects/projects.ts` with `createProject`, `listProjectsForUser`, `getProject`, `renameProject`, and `deleteProject`. `createProject` wraps project + owner-membership creation in a `$transaction` so the two rows are always written together. Four unit tests verify the transaction behavior and happy-path CRUD.

**Task 5 — Membership core functions:** Created `src/lib/projects/membership.ts` with `addMember`, `removeMember`, and `listMembers`. `addMember` looks up the invitee by email (after normalization), then uses Prisma `upsert` against the compound key for idempotency. `removeMember` refuses to remove the owner. Six unit tests cover the idempotency case, the "user not found" error, and the owner-removal guard.

**Task 6 — Project REST routes:** Created `src/app/api/projects/route.ts` (GET list + POST create) and `src/app/api/projects/[projectId]/route.ts` (GET, PATCH rename, DELETE). Also created `src/lib/auth/session.ts` with `requireUserId`—a helper that extracts the signed-in user's id from the JWT session and throws `ApiError(401)` if absent. Every handler calls `requireUserId` then the relevant permission guard before touching data.

**Task 7 — Member REST routes:** Created `src/app/api/projects/[projectId]/members/route.ts` (GET list + POST invite) and `src/app/api/projects/[projectId]/members/[userId]/route.ts` (DELETE remove). All handlers follow the same session-check → permission-guard → data-function pattern established in Task 6.

**Task 8 — Server-rendered UI + browser verification:** Created `src/app/projects/page.tsx` (project list with create form, using React Server Components + server actions) and `src/app/projects/[projectId]/page.tsx` (detail page with members list, rename/delete form, and invite/remove form). Added a "Meine Projekte" link on the home page. Manual browser verification completed 2026-07-05 (see §1).

---

## 3. Core components built

| File | Role |
|---|---|
| `prisma/schema.prisma` (amended) | Adds `Role` enum, `Project`, and `Membership` models with UUID PKs, cascade deletes, and the `@@unique([projectId, userId])` compound index |
| `prisma/migrations/*/migration.sql` | Applies the schema changes to the database (dev + test branches) |
| `src/lib/http/errors.ts` | `ApiError` class and `toErrorResponse` mapper — the universal HTTP error convention for all route handlers |
| `src/lib/projects/guard.ts` | `getRole`, `requireMembership`, `requireOwner` — the **reusable authorization primitive**; every project-scoped operation in Slices 3–6 must call it |
| `src/lib/projects/projects.ts` | `createProject`, `listProjectsForUser`, `getProject`, `renameProject`, `deleteProject` — pure data functions, no HTTP concerns |
| `src/lib/projects/membership.ts` | `addMember`, `removeMember`, `listMembers` — membership management with idempotent upsert and owner-removal guard |
| `src/lib/auth/session.ts` | `requireUserId` — resolves the caller's id from the JWT session; used in every API route handler |
| `src/app/api/projects/route.ts` | REST collection: GET (list) + POST (create) |
| `src/app/api/projects/[projectId]/route.ts` | REST item: GET + PATCH (rename) + DELETE |
| `src/app/api/projects/[projectId]/members/route.ts` | REST member collection: GET (list) + POST (invite) |
| `src/app/api/projects/[projectId]/members/[userId]/route.ts` | REST member item: DELETE (remove) |
| `src/app/projects/page.tsx` | Server-rendered project list page with create form (server action) |
| `src/app/projects/[projectId]/page.tsx` | Server-rendered project detail page with members list, rename/delete, and invite/remove forms (server actions) |

---

## 4. Most important lines of code

### The `$transaction` in `createProject` (`src/lib/projects/projects.ts`)

```typescript
return db.$transaction(async (tx) => {
  const project = await tx.project.create({
    data: { name: input.name, ownerId: input.ownerId },
  });
  await tx.membership.create({
    data: { projectId: project.id, userId: input.ownerId, role: "owner" },
  });
  return project;
});
```

Why it matters: a project without its owner membership would be permanently inaccessible — no one could pass the permission guard. The transaction guarantees that both rows are written atomically or neither is. This prevents the "orphaned project" failure mode entirely.

### The compound-key lookup in `getRole` (`src/lib/projects/guard.ts`)

```typescript
const membership = await db.membership.findUnique({
  where: { projectId_userId: { projectId, userId } },
});
return membership ? membership.role : null;
```

Why it matters: `projectId_userId` is the Prisma name for the `@@unique([projectId, userId])` index defined in the schema. Using `findUnique` on that index guarantees an indexed lookup (not a table scan) and is the atomic read on which all authorization decisions are based.

### The layered guard in `requireOwner` (`src/lib/projects/guard.ts`)

```typescript
export async function requireOwner(...): Promise<Role> {
  const role = await requireMembership(db, projectId, userId);
  if (role !== "owner") throw new ApiError(403, "Nur der Owner darf das");
  return role;
}
```

Why it matters: the guard chain composes cleanly. `requireMembership` already returns `404` for non-members (hiding project existence), so `requireOwner` inherits that behavior for free and only adds the `403` case for members who are not owners. The error-code semantics are consistent across all call sites without duplication.

### The idempotent upsert in `addMember` (`src/lib/projects/membership.ts`)

```typescript
return db.membership.upsert({
  where: { projectId_userId: { projectId: input.projectId, userId: user.id } },
  update: {}, // already a member → change nothing (idempotent)
  create: { projectId: input.projectId, userId: user.id, role: "member" },
});
```

Why it matters: the `@@unique` constraint on `(projectId, userId)` means a user can only have one membership per project. The `upsert` exploits that constraint to make "invite an already-member" a safe no-op instead of an error or a duplicate row. This is the canonical way to implement idempotent writes against a unique index.

### The `toErrorResponse` mapper (`src/lib/http/errors.ts`)

```typescript
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Unexpected error:", error);
  return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
}
```

Why it matters: this is the single place where thrown errors become HTTP responses. Domain functions never touch `NextResponse`; they only throw `ApiError` (or let unexpected errors bubble). `toErrorResponse` handles both branches — intentional errors with their status codes, and unexpected errors collapsed to a generic 500 so internal details are never leaked to clients.

---

## 5. Architecture contribution

Slice 2 assembled the **authorization layer** — the gating mechanism between Slice 1's identity (who you are) and Slice 3+'s data (what you can do).

Slice 1 established: a signed-in user has a `user.id` (UUID) in their JWT session, and the allowlist gate guarantees only approved emails reach the app.

Slice 2 builds on that identity to enforce **project-scoped authorization**:

```
Request
  └── requireUserId()          ← Slice 1: resolve who you are (JWT → user.id)
        └── requireMembership() ← Slice 2: resolve what role you have in this project
              └── requireOwner()  ← Slice 2: assert you are the owner if needed
                    └── data function (projects.ts / membership.ts)
```

Every future project-scoped operation in Slices 3–6 (lists, entries, catalog, favorites, completion, polling) sits on top of this chain. The pattern is: call `requireUserId` to resolve the caller, then call `requireMembership` (or `requireOwner`) to check their role against the project being accessed, then call the data function. The guard functions accept an injected `PrismaClient` so they remain testable in isolation.

Slice 3 (Lists + Entries) will add `List` and `ListItem` models that reference a `projectId`. Every list operation will call `requireMembership(db, projectId, userId)` before touching data — the same function, the same pattern, no new authorization code needed.

## 6. Post-review fixes (2026-07-05)

A code review of the slice surfaced a set of security/robustness issues that were fixed test-first
(13 new tests) on top of the original implementation:

1. **Member-list data exposure (security).** `listMembers` used `include: { user: true }` and thereby
   serialized every member's `googleSub` (OAuth identity) and `isAdmin` flag through
   `GET /api/projects/:id/members`. It now selects only `id`, `email`, `displayName`
   (new exported type `MemberUser` in `membership.ts`). Restricting at the data-access layer means
   every transport (REST and UI) inherits the restriction automatically.
2. **Malformed UUIDs no longer cause 500s.** A non-UUID id in a URL segment (e.g.
   `GET /api/projects/abc`) made Prisma throw P2023 against the Postgres `uuid` column, which the
   error mapper reported as an unexpected 500. A new `isUuid` shape check (`src/lib/validate.ts`)
   is applied in `getRole` (covers every guard consumer → consistent 404 existence-hiding) and in
   `removeMember` (the target `userId` also comes from the URL).
3. **Input length limits.** Project names are capped at 200 chars (`MAX_PROJECT_NAME_LENGTH`,
   enforced in `createProject` **and** `renameProject` so the cap cannot be bypassed via rename)
   and invite emails at 254 chars (`MAX_EMAIL_LENGTH`, RFC 5321 practical limit). Both are enforced
   in the core functions — defense in depth below the route-level trim/empty checks, covering
   server actions and any future transport.
4. **Deterministic email lookup.** `addMember`'s `findFirst` now orders by `createdAt asc`: if two
   accounts ever share an email (`User.email` is not unique — `googleSub` is the identity), the
   oldest account wins instead of an arbitrary row.
5. **Smaller cleanups.** Removed a factually wrong comment in the PATCH route (claimed renaming
   "cascades to the catalog" — there is no catalog until Slice 4); the project detail page now
   fetches project and members with `Promise.all` instead of sequentially.
