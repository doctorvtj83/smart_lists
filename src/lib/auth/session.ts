import type { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

/**
 * Resolves the signed-in user's id for use in API route handlers.
 * Throws ApiError(401) if there is no session.
 *
 * Defense in depth: middleware already protects routes, but API handlers must never assume a caller —
 * they re-derive identity from the trusted session. This ensures that even if middleware is bypassed
 * or a new API route is added without updating the middleware config, the handler itself is still safe.
 *
 * Pattern: Single responsibility — every route handler delegates auth identity resolution to this
 * function so it's consistent and easy to test/change in one place.
 *
 * The session is a JWT (per auth.ts config, strategy: "jwt"), so auth() decodes the token from the
 * request cookie without a database round-trip.
 *
 * @returns The signed-in user's database id (a UUID string set by enrichToken in callbacks.ts)
 * @throws ApiError(401) if the session is missing or the user id is not present
 */
export async function requireUserId(): Promise<string> {
  // auth() reads the JWT from the request cookie and returns the decoded session,
  // or null if there is no valid session (not logged in, token expired, etc.).
  const session = await auth();

  // session?.user?.id is the app user id stored in the JWT by the `jwt` callback (see auth.ts).
  // Using optional chaining handles both missing session and missing user gracefully.
  const userId = session?.user?.id;

  // Throw immediately if there's no user id — callers must not proceed without identity.
  // 401 means "you must authenticate first" (different from 403 which means "authenticated but forbidden").
  if (!userId) throw new ApiError(401, "Nicht angemeldet");

  return userId;
}

/**
 * Resolves the signed-in user's id and asserts they are an admin — the guard for /admin.
 *
 * The load-bearing detail: the admin flag is read from the DATABASE, not from the session token.
 * Sessions are JWTs (auth.ts, strategy: "jwt") that live up to 30 days, so a token issued while the
 * person was an admin still claims isAdmin: true after their rights were revoked. Reading the flag
 * live means a demotion takes effect on the very next request (design §5).
 *
 * That extra query costs nothing app-wide, because this guard is used ONLY by the admin page —
 * requireUserId above is unchanged, so no existing route pays for it. This is the deliberate scoping
 * from the design's §4: the allowlist is the LOGIN gate, while content access is decided by
 * membership, which requireMembership already reads live on every request.
 *
 * Pattern: layered guards, like requireOwner building on requireMembership (guard.ts) — it delegates
 * identity resolution to requireUserId and only adds the admin check, so the 401 behavior is
 * inherited rather than duplicated.
 *
 * @param db - The Prisma client (injected for testability, as everywhere in this codebase)
 * @returns The signed-in admin's database id
 * @throws ApiError(401) if there is no session (from requireUserId)
 * @throws ApiError(403) if the caller is not an admin according to the database
 */
export async function requireAdmin(db: PrismaClient): Promise<string> {
  const userId = await requireUserId();

  // A token could in principle carry a malformed id; it must never reach the uuid column, where
  // Prisma would raise P2023 and turn a denied request into a fake 500 (see validate.ts).
  if (!isUuid(userId)) throw new ApiError(403, "Kein Zugriff");

  // Narrow select: this guard needs one boolean, and loading the full row would pull googleSub into
  // memory for no reason (least exposure, same rule as the read projections in the domain layer).
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  // `!user?.isAdmin` covers both "the user was deleted" and "not an admin" with the same answer —
  // the page must not distinguish those cases for the caller.
  if (!user?.isAdmin) throw new ApiError(403, "Kein Zugriff");

  return userId;
}
