import { NextResponse } from "next/server";

/**
 * A domain/HTTP error that carries the status code it should map to.
 *
 * Pattern: throwing a typed error keeps core functions free of web-framework imports — they just throw
 * `new ApiError(403, ...)`, and the single mapper below turns it into an HTTP response at the boundary.
 * This allows domain logic (auth guards, data access) to signal specific HTTP semantics (403 Forbidden,
 * 404 Not Found, 400 Bad Request) without coupling to Next.js or HTTP concerns.
 *
 * The message is user-facing and should be in German (per design).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    // Set the name for better error reporting in logs and debugging.
    this.name = "ApiError";
  }
}

/**
 * The ONE place that turns a thrown error into an HTTP JSON response.
 *
 * This is the boundary between domain logic (which throws ApiError or generic errors) and the HTTP layer.
 * - Known ApiError → its status code + message (user-facing, safe to expose)
 * - Anything else (unexpected errors) → generic 500 with "Interner Fehler" (don't leak internals),
 *   and we log the real error server-side for debugging.
 *
 * Pattern: Using `unknown` for the parameter ensures all call sites consciously handle errors, and
 * the catch-all path prevents unhandled errors from being sent to the client.
 */
export function toErrorResponse(error: unknown): NextResponse {
  // If this is a typed ApiError, we trust the status and message — they are intentional and user-facing.
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  // For any other error (generic Error, plain objects, null, etc.), log it server-side and return a
  // generic 500. This prevents accidental exposure of internal error messages and stack traces to clients.
  console.error("Unexpected error:", error);
  return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
}
