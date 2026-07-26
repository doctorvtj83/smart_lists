/**
 * Route handlers for /api/projects/[projectId]/favorites — a project's favorites collection.
 *
 * Both handlers are member-level (permission matrix, MVP design §6: "Favoriten/Katalog pflegen" is
 * allowed for every member); non-members get 404 from the guard (project existence stays hidden).
 *
 * Pattern: thin HTTP adapters — identity → membership guard → core function → response.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ApiError, toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { addFavorite, listFavorites } from "@/lib/favorites/favorites";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/favorites
 * The project's favorites (with their catalog item), alphabetical by article name. Member-level.
 * Response: 200 FavoriteWithItem[]
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);
    const favorites = await listFavorites(prisma, projectId);
    return NextResponse.json(favorites);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/projects/:projectId/favorites
 * Favorites an article of the project. Member-level.
 * Request body: { catalogItemId: string } — the id of a catalog item in THIS project (addFavorite
 * rejects a foreign/malformed id with 404).
 * Response: 201 Favorite
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);

    // .catch(() => null): malformed/empty JSON becomes a clean 400, not an unhandled throw.
    const body = (await request.json().catch(() => null)) as { catalogItemId?: unknown } | null;
    if (typeof body?.catalogItemId !== "string") {
      throw new ApiError(400, "catalogItemId fehlt");
    }
    const favorite = await addFavorite(prisma, { projectId, catalogItemId: body.catalogItemId });
    return NextResponse.json(favorite, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
