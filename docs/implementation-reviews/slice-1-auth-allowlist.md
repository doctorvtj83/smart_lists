# Slice 1 Implementation Review: Auth + Allowlist

## 1. What was achieved

Slice 1 assembled the closed-access security perimeter for Smart Lists — the boundary every later slice authorizes against. The product has **no open signup**. A user authenticates with their Google account, but the application only admits the login if three independent conditions hold: Google asserts the account, Google has verified the account's email, and the account's normalized email exists in the **allowlist** table. The first time an admitted user logs in, the app provisions a stable application user row for them ("just-in-time provisioning"). From then on the allowlist remains the *admission* source, while the `users` table becomes the app's stable *identity* store keyed by Google's permanent subject identifier.

Concretely, this slice delivered: the Prisma schema and migration for the `users` and `allowlist_entries` tables; the pure identity rule (`normalizeEmail`); the two database-backed primitives (`isEmailAllowed`, `provisionUser`); the four Auth.js callback bodies extracted into a testable module (`handleSignIn`, `enrichToken`, `enrichSession`, `isRequestAuthorized`); the thin Auth.js wiring that binds those to Google OAuth and JWT sessions; route protection via middleware; the German-language login, error, and protected-home pages; an idempotent seed for the first admin/allowlist email; and the Vitest infrastructure that migrates and resets the Neon test branch.

**Verification status.** The auth core is fully unit-tested directly against the Neon test branch: every sign-in rejection reason, the admit-and-provision happy path, normalized-casing admission, JWT enrichment on sign-in vs. pass-through on later requests, session mirroring, and the middleware predicate are all covered without booting the OAuth runtime. Unauthenticated browser smoke checks are complete — `/` redirects to `/login`, the login page renders, Google OAuth start reaches the Google sign-in screen, and `/auth/error` renders. What is still **pending manual completion**: a full enabled-user Google login, logout, and admin-flag refresh through a live browser, because that requires interactively completing Google's OAuth consent step, which automation cannot drive headlessly here.

## 2. Steps taken

**Task 0: Scaffold.** The repository moved from design-only documentation to a Next.js App Router application using TypeScript, the `src/` directory layout, ESLint, and the `@/*` import alias. The generated app shell became the base for all later auth work.

**Task 1: Vitest.** Vitest was added as the test runner, with `vite-tsconfig-paths` so tests resolve the same `@/*` import alias as application code. An initial smoke test proved the runner worked; the real slice tests then replaced it.

**Task 2: Prisma.** Prisma and `@prisma/client` were added, the auth schema was defined with `User` and `AllowlistEntry`, and the first migration created the `users` and `allowlist_entries` tables. [src/lib/db.ts](../../src/lib/db.ts) introduced the Prisma singleton used by app code.

**Task 3: Test infrastructure.** The test setup now loads `.env.test`, migrates the test database once per Vitest invocation, and resets auth tables between DB tests. A smoke test confirms the test branch has the required auth tables after migration.

**Task 4: `normalizeEmail`.** A pure email-normalization function was built test-first. It trims and lowercases, so allowlist storage and allowlist comparison share exactly one identity rule.

**Task 5: `isEmailAllowed`.** The allowlist gate was built test-first against the Neon test branch. It normalizes the input email before querying the unique allowlist row, proving casing and surrounding whitespace cannot affect admission.

**Task 6: `provisionUser`.** Just-in-time provisioning was added with tests for first login and repeated login. The implementation upserts keyed by Google `sub`, making provisioning idempotent and structurally incapable of creating duplicate users.

**Task 7: Auth.js wiring.** Auth.js v5 was configured with the Google provider, JWT sessions, custom login/error pages, the allowlist/provisioning `signIn` callback, JWT/session callbacks that expose `session.user.id` and `session.user.isAdmin`, API route handlers, and middleware route protection. The callback *bodies* were extracted to [src/lib/auth/callbacks.ts](../../src/lib/auth/callbacks.ts) so they are unit-testable; [src/auth.ts](../../src/auth.ts) is only the wiring that binds them to the production Prisma singleton.

**Task 8: Pages, seed, and browser verification.** German user-facing login, error, and protected home pages were added, along with an idempotent Prisma seed for the first allowlist/admin email. The seed is configured in `prisma.config.ts`, not deprecated `package.json#prisma`. Browser smoke checks verified the unauthenticated redirect, login page, OAuth start, and error page; Google OAuth itself still requires manual sign-in completion.

## 3. Core components built

- `package.json`: Defines Next.js, Prisma, Auth.js, Vitest, lint, build, and development scripts.
- `next.config.ts`: Holds the Next.js application configuration for the App Router scaffold.
- `tsconfig.json`: Enables TypeScript and the `@/*` alias used across app and test code.
- `vitest.config.ts`: Configures Node-based Vitest tests, path aliases, global DB migration setup, per-file environment loading, and serial file execution for DB isolation.
- [prisma/schema.prisma](../../prisma/schema.prisma): Defines `User` and `AllowlistEntry`, including stable UUID IDs, the unique `google_sub`, the unique normalized allowlist `email`, and snake_case database mappings.
- `prisma/migrations/20260627130822_init_auth/migration.sql`: The committed database migration that creates the Slice 1 auth tables.
- [prisma/seed.ts](../../prisma/seed.ts): Idempotently inserts the first allowlist entry and promotes the matching provisioned user to admin once that user exists.
- `prisma.config.ts`: Centralizes Prisma schema, migration, datasource, and seed configuration; this is where the seed command now lives.
- [src/lib/db.ts](../../src/lib/db.ts): Exports the reusable Prisma singleton so development hot reload does not create excess database clients.
- [src/lib/auth/normalize.ts](../../src/lib/auth/normalize.ts): Provides `normalizeEmail`, the pure identity rule for allowlist comparison and storage.
- [src/lib/auth/normalize.test.ts](../../src/lib/auth/normalize.test.ts): Proves email normalization lowercases, trims, and is idempotent.
- [src/lib/auth/allowlist.ts](../../src/lib/auth/allowlist.ts): Provides `isEmailAllowed` and `provisionUser`, the database-backed auth primitives consumed by the sign-in callback.
- [src/lib/auth/allowlist.test.ts](../../src/lib/auth/allowlist.test.ts): Covers allowed/denied emails plus idempotent user provisioning against the test database.
- [src/lib/auth/callbacks.ts](../../src/lib/auth/callbacks.ts): The Auth.js callback bodies (`handleSignIn`, `enrichToken`, `enrichSession`, `isRequestAuthorized`) extracted out of `auth.ts` with the Prisma client injected, so the admission gate and identity wiring are unit-testable without booting the Auth.js runtime.
- [src/lib/auth/callbacks.test.ts](../../src/lib/auth/callbacks.test.ts): Exercises every rejection reason of the sign-in gate (missing email/sub, unverified email, `email_verified` absent, non-allowlisted email), the admit-and-provision happy path, normalized-casing admission, JWT enrichment on sign-in vs. pass-through on later requests, session mirroring, and the middleware authorization predicate.
- [src/auth.ts](../../src/auth.ts): Thin wiring layer that binds the `callbacks.ts` functions to the production Prisma singleton and configures Auth.js, Google OAuth, and JWT sessions.
- [src/app/api/auth/[...nextauth]/route.ts](../../src/app/api/auth/%5B...nextauth%5D/route.ts): Exposes Auth.js GET/POST handlers for provider login, callback, and sign-out endpoints.
- [src/types/next-auth.d.ts](../../src/types/next-auth.d.ts): Extends Auth.js types so `session.user.id`, `session.user.isAdmin`, `token.userId`, and `token.isAdmin` are type-safe.
- [src/middleware.ts](../../src/middleware.ts): Protects application routes while excluding auth routes, public auth pages, Next internals, images, and static files.
- [src/app/login/page.tsx](../../src/app/login/page.tsx): Renders the German closed-access login page and starts Google OAuth through a Server Action.
- [src/app/auth/error/page.tsx](../../src/app/auth/error/page.tsx): Renders the German rejection page for users who are not allowlisted.
- [src/app/page.tsx](../../src/app/page.tsx): Renders the protected smoke-test home page, including session email, admin status, and logout.
- [src/test/global-setup.ts](../../src/test/global-setup.ts): Runs Prisma `migrate deploy` once before Vitest files start, using `.env.test`.
- [src/test/setup.ts](../../src/test/setup.ts): Loads `.env.test` before each test file creates Prisma clients.
- [src/test/reset-db.ts](../../src/test/reset-db.ts): Truncates Slice 1 auth tables so database tests start from a deterministic baseline.
- [src/test/setup.test.ts](../../src/test/setup.test.ts): Smoke-tests that migrations created the expected auth tables in the test database.
- `.env.example`: Documents required environment variable names without committing secrets.

## 4. Most important lines of code

This section walks the lines that carry the most conceptual weight, **in the order they execute during a real login**, so each snippet is explained by the work it performs at that moment in the flow. Each block names its source file and line range.

### 4.1 The OAuth admission gate — the heart of closed access

**File:** [src/lib/auth/callbacks.ts:35-39](../../src/lib/auth/callbacks.ts#L35-L39)

```ts
if (!email) return false;
if (!googleSub) return false;
// Strict === true: a missing or non-boolean claim must never count as verified.
if (googleProfile?.email_verified !== true) return false;
if (!(await isEmailAllowed(db, email))) return false;
```

**When this runs.** After the user clicks "Mit Google anmelden" and completes Google's consent screen, Google redirects back to the app's callback endpoint with an OIDC profile. Auth.js invokes the `signIn` callback ([src/auth.ts:35-37](../../src/auth.ts#L35-L37)), which delegates to `handleSignIn`. These four lines are the *entire* decision about whether the person is allowed into the product — returning `false` from any of them makes Auth.js abort the login and redirect to `/auth/error`.

**Why it matters.** This is the security boundary the whole MVP design hangs on ("Closed access. No open signup."). Three properties are deliberate:

- **Each rejection reason is its own guard.** A regression in any one of them silently widens access, which is why [callbacks.test.ts](../../src/lib/auth/callbacks.test.ts#L39-L65) has a dedicated failing-input test for each line.
- **Order is cheap-first.** The two in-memory presence checks and the boolean check run before the `await isEmailAllowed(...)` database round trip, so disqualified logins never touch the DB.
- **`!== true` is strict on purpose.** Google's `email_verified` is typed as `unknown` here ([callbacks.ts:17](../../src/lib/auth/callbacks.ts#L17)); a missing, `"false"`-string, or otherwise truthy-but-not-`true` value must be treated as *not verified*. Comparing against `true` rather than using a loose truthiness test closes that gap, and it has its own regression test ("rejects when `email_verified` is absent").

### 4.2 Provisioning the app identity — idempotent by construction

**File:** [src/lib/auth/allowlist.ts:30-38](../../src/lib/auth/allowlist.ts#L30-L38)

```ts
return db.user.upsert({
  where: { googleSub: input.googleSub },
  update: { email, displayName: input.displayName },
  create: {
    googleSub: input.googleSub,
    email,
    displayName: input.displayName,
  },
});
```

**When this runs.** Immediately after the gate above passes, `handleSignIn` calls `provisionUser` ([callbacks.ts:41-46](../../src/lib/auth/callbacks.ts#L41-L46)). On a user's *first* ever login this creates their `users` row ("just-in-time provisioning"); on *every subsequent* login it instead refreshes their email and display name from the current Google profile.

**Why it matters.** The `upsert` is keyed on `googleSub` — Google's stable, permanent subject identifier (`@unique` in [schema.prisma:16](../../prisma/schema.prisma#L16)) — *not* on email, which a person can change. This single choice is what makes provisioning **idempotent**: logging in a hundred times produces exactly one user row, never duplicates. That guarantee is asserted directly by the "admits using normalized email" test, which checks `db.user.count()` is `1` after a second login. The email is normalized first ([allowlist.ts:28](../../src/lib/auth/allowlist.ts#L28)) so the stored value always matches the allowlist's normalized form.

### 4.3 The shared identity rule — one definition of "same email"

**File:** [src/lib/auth/normalize.ts:4-6](../../src/lib/auth/normalize.ts#L4-L6)

```ts
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

**When this runs.** Twice in the login path: once inside `isEmailAllowed` before the allowlist lookup ([allowlist.ts:10](../../src/lib/auth/allowlist.ts#L10)), and once inside `provisionUser` before writing the user row ([allowlist.ts:28](../../src/lib/auth/allowlist.ts#L28)). It also ran when the seed wrote the first allowlist entry.

**Why it matters.** This tiny function is the *single* place that defines what makes two emails "the same". Because the allowlist column is a unique index on the normalized value and the runtime comparison normalizes the same way, `User@Example.com `, `user@example.com`, and `  USER@EXAMPLE.COM` all resolve to one allowlist row and one user. The MVP design (§4.4) deliberately scopes this to lowercase + trim and does *not* collapse internal whitespace — that collapsing rule belongs to article names, not emails. Keeping the rule pure and shared is what the "normalized casing differs" admission test protects.

### 4.4 JWT enrichment — attaching the app identity once, at sign-in

**File:** [src/lib/auth/callbacks.ts:59-67](../../src/lib/auth/callbacks.ts#L59-L67)

```ts
if (profile?.sub) {
  const user = await db.user.findUnique({
    where: { googleSub: String(profile.sub) },
  });
  if (user) {
    token.userId = user.id;
    token.isAdmin = user.isAdmin;
  }
}
return token;
```

**When this runs.** Right after a successful sign-in, Auth.js calls the `jwt` callback ([src/auth.ts:40-42](../../src/auth.ts#L40-L42)) and *passes the Google `profile`*. On this single call, `enrichToken` looks up the freshly-provisioned app user and stamps its database UUID and admin flag onto the JWT.

**Why it matters.** The `if (profile?.sub)` guard is the performance and correctness hinge. Auth.js calls the `jwt` callback on **every** authenticated request, but only supplies `profile` on the *initial* sign-in; on all later calls `profile` is undefined, the block is skipped, and the token passes through untouched. That means the DB is queried exactly once per session instead of once per request. The two behaviors — enrich-on-sign-in and pass-through-afterwards — are pinned by separate tests ("copies the app user id…" and "leaves the token untouched when there is no profile"). Storing `user.id` (the app UUID) rather than the Google sub is what lets every downstream slice authorize against a stable internal principal.

### 4.5 Session mirroring — exposing a typed app user without a session table

**File:** [src/lib/auth/callbacks.ts:75-78](../../src/lib/auth/callbacks.ts#L75-L78)

```ts
if (token.userId) {
  session.user.id = token.userId;
  session.user.isAdmin = Boolean(token.isAdmin);
}
return session;
```

**When this runs.** Whenever server or client code reads the session (e.g. the protected home page, or any future API route), Auth.js builds the session object from the JWT and calls the `session` callback ([src/auth.ts:45-47](../../src/auth.ts#L45-L47)), which delegates here. It is pure — no DB access, because the JWT already holds everything.

**Why it matters.** This is the **public contract** the rest of the system consumes. Because the project uses JWT sessions (`strategy: "jwt"`, [src/auth.ts:20](../../src/auth.ts#L20)), there is no Auth.js session table; this mirror is the only thing that turns raw token claims into the typed `session.user.id` / `session.user.isAdmin` that downstream code relies on. The fields are made type-safe by the module augmentation in [next-auth.d.ts](../../src/types/next-auth.d.ts#L4-L11). The `Boolean(...)` coercion guarantees `isAdmin` is always a real boolean even if the token field is missing.

### 4.6 The middleware authorization predicate — the gate for protected routes

**File:** [src/lib/auth/callbacks.ts:85-87](../../src/lib/auth/callbacks.ts#L85-L87)

```ts
export function isRequestAuthorized(auth: Session | null): boolean {
  return Boolean(auth?.user?.id);
}
```

**When this runs.** On every request that the middleware matcher selects (see §4.7), Auth.js calls the `authorized` callback ([src/auth.ts:30-32](../../src/auth.ts#L30-L32)) *before* the page renders. If this returns `false`, the user is redirected to `/login`.

**Why it matters.** It re-expresses the same security boundary as §4.1 in one cheap, pure check: a request is authorized **only if the session carries an app database user id**. A `session.user.id` is only ever present if the full sign-in gate ran and provisioning succeeded — so a forged or half-built token (one that never passed the gate) leaves `id` empty and is rejected. The three predicate tests cover exactly the meaningful states: a real id (authorized), a null session (rejected), and an empty-id session (rejected).

### 4.7 The middleware matcher — what is protected vs. public

**File:** [src/middleware.ts:6](../../src/middleware.ts#L6)

```ts
matcher: ["/((?!api/auth|login|auth/error|_next/static|_next/image|.*\\..*).*)"],
```

**When this runs.** Before §4.6, at the very edge: this regex decides *which* requests the `authorized` predicate even runs for. It runs on every incoming request to the app.

**Why it matters.** This is the difference between "closed app" and "broken app". The negative lookahead excludes the routes that *must* stay reachable without a session — otherwise login itself would be locked behind login. Specifically it leaves open: `api/auth` (the OAuth handshake endpoints), `login` and `auth/error` (the public auth pages), `_next/static` and `_next/image` (Next's build assets), and `.*\\..*` (any path with a file extension, i.e. static files). Everything *else* — every real application page — falls through to the authorization predicate and requires a valid session.

### 4.8 The Prisma singleton — one DB client across hot reloads

**File:** [src/lib/db.ts:6-12](../../src/lib/db.ts#L6-L12)

```ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// In production hot reload is not a concern; there the client must not hang off global.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**When this runs.** At module load time, the first time anything imports `prisma`. Every callback in the login flow ultimately runs its queries through this one client, because [src/auth.ts:3](../../src/auth.ts#L3) imports it and passes it into the callbacks.

**Why it matters.** This is the **singleton pattern**, applied to work around a specific Next.js dev-mode quirk: hot reload re-evaluates modules on every code change. Without caching the client on `globalThis`, each reload would construct a new `PrismaClient` and open a new pool of database connections, quickly exhausting Neon's connection limit. The `?? new PrismaClient()` reuses an existing cached client if present. The `NODE_ENV !== "production"` guard is the other half of the pattern: in production there is no hot reload, so the client must *not* be attached to global state — it is created once normally and lives for the process lifetime.

### 4.9 Test global setup — assert against the committed schema

**File:** [src/test/global-setup.ts:9-13](../../src/test/global-setup.ts#L9-L13)

```ts
config({ path: ".env.test", override: true });

// migrate deploy applies existing migrations without generating new files,
// which keeps local and CI test databases aligned with the committed schema.
execSync("npx prisma migrate deploy", { stdio: "inherit" });
```

**When this runs.** Once per `npm test` invocation, before any test file starts (global setup, not per-file). It is the reason the database-backed tests for §4.1–§4.4 can run at all.

**Why it matters.** Loading `.env.test` with `override: true` *first* guarantees the child `prisma` process inherits the **test** branch's `DATABASE_URL` and cannot accidentally fall back to the developer's real database. `migrate deploy` then applies the committed migrations without generating new ones, so every DB test asserts against the exact schema that ships, not a hand-prepared database — the same migration path CI and production use.

### 4.10 The bootstrap seed — promoting the first admin safely

**File:** [prisma/seed.ts:11-22](../../prisma/seed.ts#L11-L22)

```ts
await prisma.allowlistEntry.upsert({
  where: { email: ADMIN_EMAIL },
  update: {},
  create: { email: ADMIN_EMAIL },
});
console.log(`Allowlist enabled: ${ADMIN_EMAIL}`);

// The user only exists after the first successful Google login, so the initial seed run may update zero rows.
await prisma.user.updateMany({
  where: { email: ADMIN_EMAIL },
  data: { isAdmin: true },
});
```

**When this runs.** On demand via `npx prisma db seed`, to bootstrap closed access — there has to be *one* allowlisted email before anyone can log in at all (a chicken-and-egg the seed breaks).

**Why it matters.** The seed has to cope with ordering it does not control. The allowlist `upsert` with an empty `update: {}` is idempotent — re-running keeps a single canonical row and never errors. The admin promotion uses `updateMany` precisely because **the user row may not exist yet**: the user is only provisioned on their first login (§4.2), so the very first seed run legitimately updates *zero* rows, and a later run (after that first login) flips `isAdmin` to true. `updateMany` tolerates the zero-match case where a `update` would throw.

## 5. Architecture contribution

This slice built the security perimeter that every later slice depends on. The application now has a closed login boundary, a stable app user UUID, an admin flag for allowlist administration, and route protection that denies unauthenticated access before any project or list behavior exists.

The most important downstream contract is **`session.user.id`** (produced by §4.5, gated by §4.1 and §4.6). Slice 2 uses it as the authenticated principal for project-membership checks, and every later API operation re-checks membership and role from that identity. `session.user.isAdmin` is available for allowlist upkeep, but project permissions should still be modeled through project membership and roles rather than treating admin as a universal project bypass.

A second contract worth naming for later slices is the **dependency-injection seam**: `isEmailAllowed`, `provisionUser`, and all four callbacks take the Prisma client as an argument rather than importing it. That is the pattern that made this slice's auth core unit-testable against the Neon test branch without booting the OAuth runtime, and it is the pattern subsequent slices should keep following for their own data-access primitives.

Finally, because the app uses JWT sessions, `session.user.id` and `session.user.isAdmin` are **snapshots from login time** (§4.4 only re-reads the DB on the sign-in pass). Database permission changes — including admin promotion by the seed in §4.10 — take effect on the user's *next* login, not immediately. Later slices that test role or permission changes must account for this; if a slice ever needs immediate revocation, that is a deliberate departure from the current JWT model and should be designed explicitly.
