/**
 * Route handlers for the /api/projects collection endpoint.
 *
 * These are thin HTTP adapters — they only translate between HTTP (request/response) and domain
 * functions (createProject, listProjectsForUser). All business logic and data access live in the
 * domain layer; this file just wires them together and maps errors to HTTP responses.
 *
 * Pattern: Thin route handlers keep routing code free of business logic. The try/catch+toErrorResponse
 * pattern is repeated in every handler: this is intentional — each handler is a separate unit of work
 * and errors should not bleed across them.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { createProject, listProjectsForUser } from "@/lib/projects/projects";

/**
 * GET /api/projects
 * Returns all projects the signed-in user belongs to (any role).
 * Response: 200 Project[]
 */
export async function GET() {
  try {
    // Re-derive identity from the session — never trust the request body or URL for user identity.
    const userId = await requireUserId();

    // Fetch the user's projects from the database (oldest first for stable ordering).
    const projects = await listProjectsForUser(prisma, userId);

    // 200 OK with the projects array (may be empty if the user has no projects yet).
    return NextResponse.json(projects);
  } catch (error) {
    // toErrorResponse maps ApiError to the correct HTTP status, or generic errors to 500.
    return toErrorResponse(error);
  }
}

/**
 * POST /api/projects
 * Creates a new project owned by the signed-in user.
 * Request body: { name: string }
 * Response: 201 Project
 */
export async function POST(request: Request) {
  try {
    // The creator becomes the owner — resolve their id from the session first.
    const userId = await requireUserId();

    // .catch(() => null): if the body is missing, empty, or malformed JSON, request.json() throws.
    // Catching and mapping to null turns this into a clean 400 response below, not an unhandled 500.
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;

    // Only accept string names. If body is null or name is missing/wrong type, treat as empty string.
    // .trim() removes accidental leading/trailing whitespace.
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    // Empty or whitespace-only names are rejected with a descriptive German error message
    // (in-app user-facing strings are German per CLAUDE.md convention).
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");

    // Create the project and the owner's membership in a single transaction (see projects.ts).
    // ownerId comes from the trusted session, never from the request body — this is critical for security.
    const project = await createProject(prisma, { name, ownerId: userId });

    // 201 Created (not 200) signals that a new resource was created.
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
