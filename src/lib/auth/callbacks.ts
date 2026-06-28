import type { PrismaClient } from "@prisma/client";
import type { Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { isEmailAllowed, provisionUser } from "./allowlist";

// The Auth.js callbacks live here, extracted out of the NextAuth() config in
// auth.ts, for one reason: testability. Inlined in the config object they can
// only be exercised by booting the full Auth.js + OAuth runtime. As standalone
// functions that take the Prisma client via dependency injection (the same DI
// pattern as isEmailAllowed/provisionUser), each callback can be unit-tested
// against the Neon test branch or with a plain stub. auth.ts stays a thin wiring
// layer that binds these to the production Prisma singleton.

// Google's OIDC profile carries email_verified, but the base next-auth Profile
// type does not declare it. This narrow shape lets us read the field without an
// `any` cast and without inventing a full Google profile interface.
type GoogleProfile = Profile & { email_verified?: unknown };

// The OAuth admission gate plus just-in-time provisioning.
// Returns true only for a verified, allowlisted Google account; returning false
// makes Auth.js reject the login and redirect to the error page. On success the
// app user is upserted so the allowlist stays the source of admission while the
// users table becomes the stable identity store.
export async function handleSignIn(
  db: PrismaClient,
  profile: Profile | undefined
): Promise<boolean> {
  const googleProfile = profile as GoogleProfile | undefined;
  const email = googleProfile?.email;
  const googleSub = googleProfile?.sub;

  // Each guard is a distinct admission requirement; ordering them cheap-first
  // (in-memory checks before the DB round trip) avoids querying for logins that
  // are already disqualified.
  if (!email) return false;
  if (!googleSub) return false;
  // Strict === true: a missing or non-boolean claim must never count as verified.
  if (googleProfile?.email_verified !== true) return false;
  if (!(await isEmailAllowed(db, email))) return false;

  await provisionUser(db, {
    googleSub: String(googleSub),
    email,
    // name is optional on the profile; normalize "absent" to null for the column.
    displayName: (googleProfile?.name as string | undefined) ?? null,
  });
  return true;
}

// Enriches the JWT with app-specific identity on the sign-in pass.
// Auth.js only passes `profile` on the initial sign-in call; on later calls the
// token already carries userId/isAdmin, so we only query when profile.sub is
// present. This keeps every authenticated request from hitting the DB.
export async function enrichToken(
  db: PrismaClient,
  token: JWT,
  profile: Profile | undefined
): Promise<JWT> {
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
}

// Mirrors the app identity fields from the JWT into the session object so server
// and client code read a typed app user (id + isAdmin) without an Auth.js session
// table. Pure: no DB access, the token already holds everything.
export function enrichSession(session: Session, token: JWT): Session {
  if (token.userId) {
    session.user.id = token.userId;
    session.user.isAdmin = Boolean(token.isAdmin);
  }
  return session;
}

// The middleware authorization predicate. A request is authorized only when the
// session carries the app database user id — i.e. the full sign-in gate above ran
// and provisioning succeeded. Pure boolean so it is trivially testable.
export function isRequestAuthorized(auth: Session | null): boolean {
  return Boolean(auth?.user?.id);
}
