/**
 * Route handler for /api/lists/[listId]/ops — THE mutation endpoint for list entries.
 *
 * All entry changes arrive here as one entry-level operation per request (MVP design §4.5):
 * add_item / update_item / check_item / remove_item, each carrying the stable client-generated
 * ListItem id. There is deliberately NO other way to mutate entries — this single funnel is what
 * lets Slice 7 poll deltas and Phase 2 replay an offline queue against the same contract.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { applyOperation, parseOperation } from "@/lib/lists/operations";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * POST /api/lists/:listId/ops
 * Applies one operation to the list. Member-level.
 * Request body: an Operation (see src/lib/lists/operations.ts for the exact shapes).
 * Response: 200 ListItem (the resulting entry) — or 200 `null` after remove_item.
 *
 * SINCE SLICE 17: the returned entry's `id` may DIFFER from the `itemId` that was posted. An
 * add_item whose article, unit and quantity match an existing unchecked row is absorbed by that row
 * (recipes design §3), and the absorbed row is what comes back. A client must therefore read the
 * response instead of assuming the id it generated now exists — replaying the same operation later
 * resolves to the same target row via the server-side AbsorbedEntry ledger, so retries stay safe.
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;

    // The guard returns the loaded list; applyOperation needs it (projectId for the catalog).
    const { list } = await requireListAccess(prisma, listId, userId);

    // Malformed JSON -> null -> parseOperation throws the clean 400 ("Ungültige Operation").
    const body = await request.json().catch(() => null);
    const operation = parseOperation(body);

    const item = await applyOperation(prisma, list, operation);
    // One uniform response shape for all four ops: the resulting entry, or null when removed.
    return NextResponse.json(item);
  } catch (error) {
    return toErrorResponse(error);
  }
}
