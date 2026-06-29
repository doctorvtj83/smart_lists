/**
 * Route handlers for the /api/projects/[projectId]/members/[userId] item endpoint.
 *
 * This module handles operations on a single membership identified by both a project
 * and a user ID.  Currently only DELETE is implemented; GET/PATCH on a single membership
 * are not part of the MVP.
 *
 * HTTP contract:
 *   DELETE /api/projects/:projectId/members/:userId → 204  (owner only)
 *
 * The [userId] segment is the ID of the user whose membership is being removed —
 * it is NOT the caller's ID.  The caller is identified via the session (callerId).
 * Do not confuse the two: the caller must be an owner; the target user is the one to remove.
 *
 * Pattern: thin HTTP adapter — identity → permission → domain call → HTTP response.
 * Business logic (can't remove owner, must be a member) lives in membership.ts and guard.ts.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireOwner } from "@/lib/projects/guard";
import { removeMember } from "@/lib/projects/membership";

/**
 * In the Next.js 16 App Router, dynamic route `params` is a Promise and MUST be awaited.
 * This route has two dynamic segments: [projectId] and [userId].
 * Both are delivered together in a single params Promise.
 */
type Context = { params: Promise<{ projectId: string; userId: string }> };

/**
 * DELETE /api/projects/:projectId/members/:userId
 *
 * Removes the user identified by [userId] from the project identified by [projectId].
 * The caller (identified by their session) must be the project owner.
 *
 * Key distinction:
 *   callerId = the authenticated user making this request (must be owner)
 *   userId   = the user to be removed (from the URL path segment)
 *
 * The domain function removeMember enforces that the owner cannot remove themselves
 * (a membership with role "owner" cannot be deleted — dissolve the project instead).
 *
 * Response: 204 No Content on success; 403/404 on permission or not-found errors.
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    // Establish the caller's identity — throws 401 if there is no session.
    // This is the ID of the person making the DELETE request, not the member to remove.
    const callerId = await requireUserId();

    // Await the params Promise — required by Next.js 16 App Router dynamic routing.
    // Destructure both segments at once; both are needed for the permission check and
    // the domain call respectively.
    const { projectId, userId } = await params;

    // Verify that the caller is the owner of this project.
    // requireOwner throws 404 for non-members and 403 for members without the owner role.
    // We pass callerId (the session user), NOT userId (the URL segment being deleted).
    await requireOwner(prisma, projectId, callerId);

    // Perform the removal.  removeMember checks that:
    //   1. The target membership exists (throws 404 if not).
    //   2. The target is not the owner (throws 403 — owner cannot be ejected this way).
    await removeMember(prisma, { projectId, userId });

    // 204 No Content: the operation succeeded, and there is nothing to return.
    // Using `new NextResponse(null, ...)` avoids including any body in the response,
    // which NextResponse.json(null) would do (it serialises null as the string "null").
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
