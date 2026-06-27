# Slice 1 Implementation Review: Auth + Allowlist

## 1. What was achieved

Slice 1 assembled the closed-access security perimeter for Smart Lists. Users authenticate with Google, but the app only admits Google accounts whose normalized email exists in the allowlist. Allowed users are provisioned just in time on first successful login, so the allowlist remains the admission source while the `users` table becomes the app's stable identity store.

The code, tests, seed command, route protection, login/error/home pages, and unauthenticated browser smoke checks are complete. Full enabled-user Google login, logout, and admin-flag refresh verification is still pending manual completion of the Google OAuth sign-in step. Automated/browser verification reached the Google sign-in screen; unauthenticated `/` redirect to `/login`, login page rendering, Google OAuth start, and `/auth/error` rendering were verified.

## 2. Steps taken

**Task 0: Scaffold.** The repository moved from design-only documentation to a Next.js App Router application using TypeScript, `src/`, ESLint, and the `@/*` import alias. The generated app shell became the base for all later auth work.

**Task 1: Vitest.** Vitest was added as the test runner, with `vite-tsconfig-paths` so tests can use the same import alias as application code. The initial smoke test proved the runner worked, then the real slice tests replaced it.

**Task 2: Prisma.** Prisma and `@prisma/client` were added, the auth schema was defined with `User` and `AllowlistEntry`, and the first migration created the `users` and `allowlist_entries` tables. `src/lib/db.ts` introduced the Prisma singleton used by app code.

**Task 3: Test infrastructure.** The test setup now loads `.env.test`, migrates the test database once per Vitest invocation, and resets auth tables between DB tests. A smoke test confirms the test branch has the required auth tables after migration.

**Task 4: `normalizeEmail`.** A pure email normalization function was built test-first. It trims and lowercases emails, which makes allowlist storage and comparison share one identity rule.

**Task 5: `isEmailAllowed`.** The allowlist gate was built test-first against the Neon test branch. It normalizes the input email before checking the unique allowlist row, proving that casing and surrounding whitespace do not affect admission.

**Task 6: `provisionUser`.** Just-in-time provisioning was added with tests for first login and repeated login. The implementation uses an upsert keyed by Google `sub`, making provisioning idempotent and preventing duplicate users.

**Task 7: Auth.js wiring.** Auth.js v5 was configured with the Google provider, JWT sessions, custom login/error pages, an allowlist/provisioning `signIn` callback, JWT/session callbacks that expose `session.user.id` and `session.user.isAdmin`, API route handlers, and middleware route protection.

**Task 8: Pages, seed, and browser verification.** German user-facing login, error, and protected home pages were added, along with an idempotent Prisma seed for the first allowlist/admin email. The seed is configured in `prisma.config.ts`, not deprecated `package.json#prisma`. Browser smoke checks verified the unauthenticated redirect, login page, OAuth start, and error page; Google OAuth itself still requires manual sign-in completion.

## 3. Core components built

- `package.json`: Defines Next.js, Prisma, Auth.js, Vitest, lint, build, and development scripts.
- `next.config.ts`: Holds the Next.js application configuration for the App Router scaffold.
- `tsconfig.json`: Enables TypeScript and the `@/*` alias used across app and test code.
- `vitest.config.ts`: Configures Node-based Vitest tests, path aliases, global DB migration setup, per-file environment loading, and serial file execution for DB isolation.
- `prisma/schema.prisma`: Defines `User` and `AllowlistEntry`, including stable UUID IDs, normalized allowlist emails, and snake_case database mappings.
- `prisma/migrations/20260627130822_init_auth/migration.sql`: The committed database migration that creates the Slice 1 auth tables.
- `prisma/seed.ts`: Idempotently inserts the first allowlist entry and promotes the matching provisioned user to admin when that user exists.
- `prisma.config.ts`: Centralizes Prisma schema, migration, datasource, and seed configuration; this is where the seed command now lives.
- `src/lib/db.ts`: Exports the reusable Prisma singleton so development hot reload does not create excess database clients.
- `src/lib/auth/normalize.ts`: Provides `normalizeEmail`, the pure identity rule for allowlist comparison and storage.
- `src/lib/auth/normalize.test.ts`: Proves email normalization lowercases, trims, and is idempotent.
- `src/lib/auth/allowlist.ts`: Provides `isEmailAllowed` and `provisionUser`, the testable auth core used by the OAuth callback.
- `src/lib/auth/allowlist.test.ts`: Covers allowed/denied emails plus idempotent user provisioning against the test database.
- `src/auth.ts`: Configures Auth.js, Google OAuth, the allowlist gate, JIT provisioning, JWT enrichment, session enrichment, and route authorization behavior.
- `src/app/api/auth/[...nextauth]/route.ts`: Exposes Auth.js GET/POST handlers for provider login, callback, and sign-out endpoints.
- `src/types/next-auth.d.ts`: Extends Auth.js types so `session.user.id`, `session.user.isAdmin`, `token.userId`, and `token.isAdmin` are type-safe.
- `src/middleware.ts`: Protects application routes while excluding auth routes, public auth pages, Next internals, images, and static files.
- `src/app/login/page.tsx`: Renders the German closed-access login page and starts Google OAuth through a Server Action.
- `src/app/auth/error/page.tsx`: Renders the German rejection page for users who are not allowlisted.
- `src/app/page.tsx`: Renders the protected smoke-test home page, including session email, admin status, and logout.
- `src/test/global-setup.ts`: Runs Prisma `migrate deploy` once before Vitest files start, using `.env.test`.
- `src/test/setup.ts`: Loads `.env.test` before each test file creates Prisma clients.
- `src/test/reset-db.ts`: Truncates Slice 1 auth tables so database tests start from a deterministic baseline.
- `src/test/setup.test.ts`: Smoke-tests that migrations created the expected auth tables in the test database.
- `.env.example`: Documents required environment variable names without committing secrets.

## 4. Most important lines of code

The `signIn` callback is the slice's main admission gate. It rejects missing email/sub, unverified Google email, or a non-allowlisted email before provisioning the app user.

```ts
if (!email) return false;
if (!googleSub) return false;
if (googleProfile?.email_verified !== true) return false;
if (!(await isEmailAllowed(prisma, email))) return false;
await provisionUser(prisma, {
```

This callback exposes the same security boundary to middleware-protected routes: a request is authorized only when the session contains the app database user ID.

```ts
authorized({ auth }) {
  return Boolean(auth?.user?.id);
},
```

`provisionUser` uses an upsert keyed by Google's stable subject. That makes repeated logins update profile fields without creating duplicate app users.

```ts
return db.user.upsert({
  where: { googleSub: input.googleSub },
  update: { email, displayName: input.displayName },
  create: {
```

The Prisma singleton keeps development hot reload from opening a new database client on every module reload, while avoiding global state in production.

```ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
```

The middleware matcher protects app pages but leaves Auth.js endpoints, public auth pages, Next internals, images, and static files reachable without a session.

```ts
matcher: ["/((?!api/auth|login|auth/error|_next/static|_next/image|.*\\..*).*)"],
```

The email identity rule is deliberately tiny and shared by storage plus lookup. This keeps the allowlist unique index and runtime comparison aligned.

```ts
return email.trim().toLowerCase();
```

Vitest global setup migrates the test branch before any test file runs, so DB tests assert against the committed schema rather than a hand-prepared database.

```ts
config({ path: ".env.test", override: true });
execSync("npx prisma migrate deploy", { stdio: "inherit" });
```

The session callback mirrors app-specific JWT fields into the Auth.js session. Later slices can authorize from `session.user.id` and `session.user.isAdmin` without querying an Auth.js session table.

```ts
session.user.id = token.userId as string;
session.user.isAdmin = Boolean(token.isAdmin);
```

## 5. Architecture contribution

This slice built the security perimeter that every later slice depends on. The application now has a closed login boundary, a stable app user UUID, an admin flag for allowlist administration, and route protection that denies unauthenticated access before project or list behavior exists.

The most important downstream contract is `session.user.id`: Slice 2 can use it as the authenticated principal for project membership checks, and every later API operation can re-check membership and role from that identity. `session.user.isAdmin` is available for allowlist upkeep, but project permissions should still be modeled through project membership and roles rather than treating admin as a universal project bypass.

Because the app uses JWT sessions, `session.user.id` and `session.user.isAdmin` are snapshots from login time. Database permission changes, including admin promotion by seed, take effect on the next login. Later slices should keep that behavior in mind when testing role or permission changes.
