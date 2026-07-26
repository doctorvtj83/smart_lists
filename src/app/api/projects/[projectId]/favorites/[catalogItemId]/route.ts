/**
 * Route handler for /api/projects/[projectId]/favorites/[catalogItemId] — un-favorite one article.
 *
 * Member-level; non-members get 404 from the guard. Idempotent: removing a favorite that isn't there
 * still returns 204 (removeFavorite is a no-op in that case).
 *
 * Pattern: thin HTTP adapter — identity → membership guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { removeFavorite } from "@/lib/favorites/favorites";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string; catalogItemId: string }> };

/**
 * DELETE /api/projects/:projectId/favorites/:catalogItemId
 * Un-favorites the article. Member-level. Idempotent.
 * Response: 204 No Content
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId, catalogItemId } = await params;
    await requireMembership(prisma, projectId, userId);
    await removeFavorite(prisma, { projectId, catalogItemId });
    // 204: success with no body (the favorite is gone, or was already gone — idempotent).
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
