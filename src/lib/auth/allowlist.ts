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

// Input data for provisioning, derived from the Google profile after the login gate accepted the user.
export interface ProvisionInput {
  googleSub: string;
  email: string;
  displayName: string | null;
}

// Creates the app user exactly when they first log in, then refreshes profile data on later logins.
// The upsert pattern keeps provisioning idempotent because googleSub is Google's stable identity key.
export async function provisionUser(db: PrismaClient, input: ProvisionInput) {
  const email = normalizeEmail(input.email);

  return db.user.upsert({
    where: { googleSub: input.googleSub },
    update: { email, displayName: input.displayName },
    create: {
      googleSub: input.googleSub,
      email,
      displayName: input.displayName,
    },
  });
}
