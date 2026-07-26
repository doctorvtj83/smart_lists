/**
 * Route handler for /api/projects/[projectId]/suggestions — the pre-fill suggestion set for a
 * project (MVP design §4.3). Member-level; non-members get 404 from the guard.
 *
 * Pattern: thin HTTP adapter — identity → membership guard → core function → response. All the real
 * logic (favorites ∪ N-of-M statistic, dedup, sort) lives in computeSuggestions.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { computeSuggestions } from "@/lib/suggestions/suggestions";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/suggestions
 * The suggestion set (favorites ∪ statistic), deduplicated, alphabetical by name. Member-level.
 * Response: 200 SuggestedArticle[]
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const userId = await requireUserId();
    const { projectId } = await params;
    await requireMembership(prisma, projectId, userId);
    const suggestions = await computeSuggestions(prisma, projectId);
    return NextResponse.json(suggestions);
  } catch (error) {
    return toErrorResponse(error);
  }
}
