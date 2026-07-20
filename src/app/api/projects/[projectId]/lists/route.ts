/**
 * Route handlers for /api/projects/[projectId]/lists — a project's lists collection.
 *
 * Both handlers are member-level (the permission matrix allows every member to read and create
 * lists); non-members get 404 from the guard (project existence stays hidden).
 *
 * Pattern: Thin HTTP adapters — identity → permission guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { createList, listLists } from "@/lib/lists/lists";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/lists
 * Returns the project's lists, newest first. Member-level.
 * Response: 200 List[]
 */
export async function GET(request: Request, { params }: Context) {
  try {
    // Identity first — no session means 401 before any data access.
    const userId = await requireUserId();
    const { projectId } = await params;
    // Any member may read; non-members get 404 (existence hidden).
    await requireMembership(prisma, projectId, userId);

    // Optional ?status=active|completed filter (Slice 6 archive). Anything else (or absent) means
    // "all lists" — listLists ignores an undefined status. We only forward the two valid values so a
    // junk query can never reach the enum column.
    const statusParam = new URL(request.url).searchParams.get("status");
    const status =
      statusParam === "active" || statusParam === "completed" ? statusParam : undefined;

    const lists = await listLists(prisma, projectId, status);
    return NextResponse.json(lists);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/projects/:projectId/lists
 * Creates a list. Member-level (per the permission matrix, creating lists is not owner-only).
 * Request body: { name: string, id?: string } — id is the optional client-generated UUID
 * (offline-prep convention); createList validates its shape.
 * Response: 201 List
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);

    // .catch(() => null): malformed/empty JSON becomes a clean 400, not an unhandled throw.
    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; id?: unknown }
      | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "Name darf nicht leer sein");
    // The optional client id is passed through as-is: createList validates the UUID shape (400).
    const id = typeof body?.id === "string" ? body.id : undefined;

    const list = await createList(prisma, { projectId, name, id });
    return NextResponse.json(list, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
