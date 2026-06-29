import { auth } from "@/auth";
import { ApiError } from "@/lib/http/errors";

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
