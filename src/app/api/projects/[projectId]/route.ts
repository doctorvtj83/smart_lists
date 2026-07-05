/**
 * Route handlers for the /api/projects/[projectId] item endpoint.
 *
 * These handlers operate on a single project identified by the URL segment [projectId].
 * Each handler enforces access control via the permission guard before accessing data:
 *   - GET: membership required (any role)
 *   - PATCH: owner required
 *   - DELETE: owner required
 *
 * Pattern: Thin HTTP adapters — permission check → domain function call → HTTP response.
 * All business logic lives in the domain layer (guard.ts, projects.ts).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireMembership, requireOwner } from "@/lib/projects/guard";
import { deleteProject, getProject, renameProject } from "@/lib/projects/projects";

/**
 * In the Next.js 16 App Router, a dynamic route's `params` is a Promise and MUST be awaited.
 * This is a breaking change from earlier versions where params was a plain object.
 * Using this type for the second argument of every handler enforces the correct runtime behavior.
 *
 * If params were NOT awaited, the projectId would be undefined and all database queries
 * would fail or return unexpected results.
 */
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId
 * Returns a single project by id. Requires the caller to be a member (any role).
 * Non-members receive 404 (project existence is hidden from non-members — see guard.ts).
 * Response: 200 Project
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    // Identity first — no session means 401 before any data access.
    const userId = await requireUserId();

    // Await the params Promise — required by Next.js 16 App Router dynamic routing.
    const { projectId } = await params;

    // requireMembership throws 404 if the user is not a member (hiding project existence).
    // This must happen before getProject to prevent unauthorized data access.
    await requireMembership(prisma, projectId, userId);

    // Fetch the project data after confirming the caller is authorized to see it.
    const project = await getProject(prisma, projectId);

    // getProject returns null if the project does not exist. This should be rare after
    // requireMembership succeeded (they are a member, so the project must exist), but
    // race conditions (concurrent delete) could cause this, so handle gracefully.
    if (!project) throw new ApiError(404, "Projekt nicht gefunden");

    return NextResponse.json(project);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * PATCH /api/projects/:projectId
 * Renames a project. Requires the caller to be the owner.
 * Request body: { name: string }
 * Response: 200 Project
 */
export async function PATCH(request: Request, { params }: Context) {
  try {
    // Identity first.
    const userId = await requireUserId();

    // Await the params Promise — required by Next.js 16 App Router.
    const { projectId } = await params;

    // requireOwner throws 404 for non-members and 403 for members who are not owners.
    // This enforces that only owners can rename their projects.
    await requireOwner(prisma, projectId, userId);

    // Parse the request body, tolerating malformed JSON gracefully (map to null → 400).
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;

    // Only accept non-empty string names (same validation pattern as POST /api/projects).
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");

    // Update the project name in the database (renameProject also re-validates the name — core-level
    // defense in depth on top of the route check above).
    const project = await renameProject(prisma, projectId, name);

    return NextResponse.json(project);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * DELETE /api/projects/:projectId
 * Deletes a project and all its memberships (via FK cascade). Owner only.
 * Response: 204 No Content
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    // Identity first.
    const userId = await requireUserId();

    // Await the params Promise — required by Next.js 16 App Router.
    const { projectId } = await params;

    // Only the owner can delete a project. requireOwner throws for non-members (404) and
    // non-owners (403), so this line also implicitly validates the projectId is accessible.
    await requireOwner(prisma, projectId, userId);

    // Delete the project. Memberships are removed by the onDelete: Cascade FK defined
    // in schema.prisma (Task 1), so we only need to delete the project row itself.
    await deleteProject(prisma, projectId);

    // 204 No Content: the operation succeeded, and there is no body to return.
    // Using `new NextResponse(null, ...)` instead of `NextResponse.json(null, ...)` ensures
    // no body is included in the response (json() would include "null" as the body).
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
