# Slice 2 Review: Prisma Data Model

## What Was Achieved

Task 2 was completed: Prisma is installed, the initial auth data model exists, the first migration was applied to the main Neon database, and the application has a reusable Prisma client singleton. The implemented model covers the two auth foundation tables required by the MVP design: signed-in users and email allowlist entries.

## Steps Taken

- Installed `prisma` as a development dependency and `@prisma/client` as a runtime dependency so the app can generate and use a type-safe database client.
- Initialized Prisma for PostgreSQL, then replaced the generated schema with the required `User` and `AllowlistEntry` models.
- Kept real environment files ignored and updated `.env.example` with safe placeholder values only.
- Ran the `init_auth` migration against the configured main database and verified Prisma Client generation.
- Added `src/lib/db.ts` so application code can share a single Prisma client during development hot reloads.

## Core Components Built

- `prisma/schema.prisma`: Defines the canonical database model for auth users and allowlist entries.
- `prisma/migrations/20260627125115_init_auth/migration.sql`: Creates the `users` and `allowlist_entries` tables plus their unique indexes.
- `src/lib/db.ts`: Exposes a shared `prisma` client instance for server-side application code.
- `.env.example`: Documents required environment variables without storing secrets.
- `prisma.config.ts`: Generated Prisma configuration that points Prisma CLI commands at the schema and migration directory.

## Most Important Lines Of Code

```prisma
generator client {
  provider = "prisma-client-js"
}
```

This selects the standard generated Prisma Client package consumed by `@prisma/client`, which keeps imports simple across the Next.js app.

```prisma
googleSub   String   @unique @map("google_sub")
```

This line makes Google OAuth's stable `sub` claim the unique identity anchor while preserving snake_case column naming in Postgres.

```prisma
email     String   @unique
```

The allowlist email is unique because login authorization depends on one normalized email matching one gate entry.

```sql
CREATE TABLE "allowlist_entries" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invited_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
```

This table is the closed-access login gate. `invited_by` is nullable so the first seed entry can exist before an admin user does.

```ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
```

This is the singleton pattern that prevents repeated Prisma client construction during Next.js development hot reloads.

## Architecture Contribution

This slice establishes the database foundation for the closed-access auth flow. The next auth task can use `AllowlistEntry` to decide whether a Google profile may sign in, then create or update a `User` record through the shared Prisma client.
