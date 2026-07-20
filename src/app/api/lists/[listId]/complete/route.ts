/**
 * Route handler for /api/lists/[listId]/complete — mark a list completed (MVP design §4.6).
 *
 * A dedicated action sub-route (like /ops) rather than overloading PATCH: completing is a lifecycle
 * transition, not a field edit. Member-level (permission matrix §6: every member may complete a
 * list); non-members / unknown / malformed ids get 404 from requireListAccess.
 *
 * Pattern: thin HTTP adapter — identity → list-access guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { completeList } from "@/lib/lists/lists";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * POST /api/lists/:listId/complete
 * Marks the list completed (idempotent). Member-level.
 * Response: 200 List
 */
export async function POST(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    // Guard resolves the list AND checks membership in its project (404 for both failure modes).
    await requireListAccess(prisma, listId, userId);
    const list = await completeList(prisma, listId);
    return NextResponse.json(list);
  } catch (error) {
    return toErrorResponse(error);
  }
}
