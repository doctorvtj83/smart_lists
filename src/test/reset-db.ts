import { PrismaClient } from "@prisma/client";

// Empties all tables relevant to this slice so every DB test starts from a
// deterministic baseline instead of inheriting rows from previous tests.
export async function resetDb(db: PrismaClient): Promise<void> {
  // TRUNCATE is intentionally raw SQL here because Prisma does not provide a
  // cross-table reset primitive; RESTART IDENTITY keeps future auto values
  // deterministic, and CASCADE keeps this helper valid when FKs arrive later.
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "allowlist_entries" RESTART IDENTITY CASCADE;'
  );
}
