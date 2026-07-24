/**
 * Route handler for /api/lists/[listId]/reopen — undo completion (MVP design §4.6, "mit Undo").
 *
 * Member-level; non-members / unknown / malformed ids get 404 from requireListAccess.
 *
 * Pattern: thin HTTP adapter — identity → list-access guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { reopenList } from "@/lib/lists/lists";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * POST /api/lists/:listId/reopen
 * Reopens a completed list (status active, completedAt cleared). Member-level.
 * Response: 200 List
 */
export async function POST(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    await requireListAccess(prisma, listId, userId);
    const list = await reopenList(prisma, listId);
    return NextResponse.json(list);
  } catch (error) {
    return toErrorResponse(error);
  }
}
