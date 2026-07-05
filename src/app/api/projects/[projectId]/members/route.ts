/**
 * Route handlers for the /api/projects/[projectId]/members collection endpoint.
 *
 * This module exposes the membership list for a project and lets the owner
 * add new members by email.  Membership data is project-private: only existing
 * members may see who else belongs to the project.
 *
 * HTTP contracts:
 *   GET  /api/projects/:projectId/members          → 200  Membership[]  (member+)
 *   POST /api/projects/:projectId/members  {email} → 201  Membership    (owner only)
 *
 * Pattern: thin HTTP adapters — identity → permission → domain call → HTTP response.
 * All business logic lives in guard.ts and membership.ts.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireMembership, requireOwner } from "@/lib/projects/guard";
import { addMember, listMembers } from "@/lib/projects/membership";

/**
 * In the Next.js 16 App Router, dynamic route `params` is a Promise and MUST be awaited.
 * This is a breaking change from earlier versions where params was a plain object.
 * The type annotation makes the requirement explicit and triggers a TypeScript error
 * if a caller tries to destructure without awaiting.
 */
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/members
 *
 * Returns the full membership list (including embedded user data) for the given project.
 * Any project member (any role) may call this — they already know the project exists,
 * so listing who else is in it does not expose new information.
 *
 * Non-members receive 404 (project existence is hidden from non-members via requireMembership).
 * Response shape: Membership & { user: User }[] — see listMembers in membership.ts.
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    // Establish identity first — no session means 401 before any data access.
    const userId = await requireUserId();

    // Await the params Promise — required by Next.js 16 App Router dynamic routing.
    const { projectId } = await params;

    // requireMembership throws 404 if the caller is not a member.
    // This is intentional: non-members must not learn that the project exists.
    await requireMembership(prisma, projectId, userId);

    // Fetch all memberships with their embedded User records, oldest first.
    const members = await listMembers(prisma, projectId);

    // 200 OK with the members array as JSON.
    return NextResponse.json(members);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/projects/:projectId/members
 *
 * Adds an existing user (identified by email) as a member of the project.
 * Only the project owner may invite new members.
 *
 * The target user must already have logged in at least once (JIT provisioning from Slice 1)
 * because Membership requires a user_id that exists in the User table.
 * Pre-login invitations are a Phase 2 concern.
 *
 * Request body: { email: string }
 * Response: 201 Membership on success; 400 if email is missing; 404 if user not found.
 * Idempotent: inviting an already-member is a no-op (returns the existing membership).
 */
export async function POST(request: Request, { params }: Context) {
  try {
    // Establish identity first.
    const userId = await requireUserId();

    // Await the params Promise — required by Next.js 16 App Router.
    const { projectId } = await params;

    // requireOwner throws 404 for non-members and 403 for members who are not owners.
    // Only the project owner may manage membership.
    await requireOwner(prisma, projectId, userId);

    // Parse the request body, tolerating malformed JSON gracefully (map to null → 400 below).
    // The cast to `{ email?: unknown } | null` keeps TypeScript happy while reflecting the
    // fact that we cannot trust the shape of arbitrary client input.
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;

    // Coerce to string and trim whitespace; anything else (missing, null, number…) becomes "".
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    // Guard: an empty email string is meaningless — reject early with a clear German message
    // (in-app user-facing strings must be German per CLAUDE.md).
    if (!email) throw new ApiError(400, "E-Mail darf nicht leer sein");

    // Delegate to the domain layer.  addMember normalizes the email, looks up the user,
    // and upserts the membership (idempotent re-invite is a no-op).
    const membership = await addMember(prisma, { projectId, email });

    // 201 Created — the membership resource was created (or already existed, but we still
    // return 201 to keep the semantics of the operation consistent for the caller).
    return NextResponse.json(membership, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
