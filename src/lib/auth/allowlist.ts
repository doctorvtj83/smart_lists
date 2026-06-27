import type { PrismaClient } from "@prisma/client";
import { normalizeEmail } from "./normalize";

// Checks whether an email is enabled for login.
// Passing db in uses dependency injection: tests can target the test DB while production can pass the app singleton.
export async function isEmailAllowed(
  db: PrismaClient,
  email: string
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const entry = await db.allowlistEntry.findUnique({
    where: { email: normalized },
  });

  return entry !== null;
}
