/**
 * Route handler for /api/lists/[listId]/delta — the polling/sync endpoint (MVP design §4.5).
 *
 * A GET (no side effects): the client polls it every ~2s with the cursor it last saw
 * (?since=<epoch-ms>) and gets back the entry bodies that changed since then, the full current
 * entry-id set (to detect deletions), the list metadata, and the next cursor. Member-level;
 * non-members / unknown / malformed ids get 404 from requireListAccess.
 *
 * Pattern: thin HTTP adapter — identity -> list-access guard -> read function -> JSON.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { getListDelta } from "@/lib/lists/delta";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * GET /api/lists/:listId/delta?since=<epoch-ms>
 * Returns the ListDelta for the list. Member-level.
 * Response: 200 ListDelta
 */
export async function GET(request: Request, { params }: Context) {
  try {
    // Identity first — no session means 401 before any data access.
    const userId = await requireUserId();
    const { listId } = await params;
    // Resolve the list AND check membership in its project (404 for both failure modes).
    await requireListAccess(prisma, listId, userId);

    // Optional ?since cursor. Absent or non-numeric values become undefined ("baseline pull").
    // Present numeric strings parse via Number(); note that ?since= (empty) yields since = 0 because
    // Number("") is 0 and is finite — only NaN/Infinity fall through to undefined.
    const sinceParam = new URL(request.url).searchParams.get("since");
    const sinceNum = sinceParam !== null ? Number(sinceParam) : Number.NaN;
    const since = Number.isFinite(sinceNum) ? sinceNum : undefined;

    const delta = await getListDelta(prisma, listId, since);
    return NextResponse.json(delta);
  } catch (error) {
    return toErrorResponse(error);
  }
}
