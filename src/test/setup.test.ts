import { PrismaClient } from "@prisma/client";
import { afterAll, expect, test } from "vitest";

const db = new PrismaClient();

afterAll(async () => {
  // Close the Prisma connection so Vitest can exit cleanly after the smoke test.
  await db.$disconnect();
});

test("test database has the auth slice tables after migration", async () => {
  // Query only metadata table names; this proves migrations ran without reading
  // or printing any connection details or application data.
  const tables = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'allowlist_entries')
    ORDER BY table_name
  `;

  expect(tables.map((table) => table.table_name)).toEqual([
    "allowlist_entries",
    "users",
  ]);
});
