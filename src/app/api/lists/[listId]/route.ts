/**
 * Route handlers for /api/lists/[listId] — a single list.
 *
 * Lists get a FLAT URL (not nested under /api/projects/...): the listId alone identifies the
 * resource, and requireListAccess derives the project for the membership check from the list row
 * itself. This keeps client URLs short and is the same shape Slice 7's polling endpoint will use.
 *
 * All handlers are member-level; non-members and unknown/malformed ids get 404 from the guard.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireListAccess } from "@/lib/lists/access";
import { deleteList, getListWithItems, renameList } from "@/lib/lists/lists";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ listId: string }> };

/**
 * GET /api/lists/:listId
 * Returns the list with its items (sortIndex order), each item including its catalog item
 * (the entry's display name lives there). Member-level.
 * Response: 200 ListWithItems
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    // Guard resolves the list AND checks membership in its project (404 for both failure modes).
    await requireListAccess(prisma, listId, userId);
    const list = await getListWithItems(prisma, listId);
    // Rare race: the list was deleted between the guard and this read — handle gracefully.
    if (!list) throw new ApiError(404, "Liste nicht gefunden");
    return NextResponse.json(list);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * PATCH /api/lists/:listId
 * Renames a list. Member-level (lists belong to the project, not to a person).
 * Request body: { name: string }
 * Response: 200 List
 */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    await requireListAccess(prisma, listId, userId);

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");

    // renameList re-validates the name (core-level defense in depth on top of the route check).
    const list = await renameList(prisma, listId, name);
    return NextResponse.json(list);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * DELETE /api/lists/:listId
 * Deletes a list and its entries (FK cascade). Member-level per the permission matrix
 * (MVP design §6: every member may delete lists — only PROJECT deletion is owner-only).
 * Response: 204 No Content
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { listId } = await params;
    await requireListAccess(prisma, listId, userId);
    await deleteList(prisma, listId);
    // 204: success with no body (new NextResponse, not .json — see the Slice 2 DELETE precedent).
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
