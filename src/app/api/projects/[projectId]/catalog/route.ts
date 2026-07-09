/**
 * Route handler for /api/projects/[projectId]/catalog — the autocomplete surface over a project's
 * article catalog (MVP design §4.4, §5).
 *
 * Pattern: thin HTTP adapter — identity → membership guard → core function → response. All the real
 * logic (prefix match, lean shape, cap) lives in searchCatalog, so this file stays trivial and the
 * behavior is unit-tested at the core, not here.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { searchCatalog } from "@/lib/catalog/search";

// Next.js 16 App Router: a dynamic route's `params` is a Promise and MUST be awaited.
type Context = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/:projectId/catalog?q=<prefix>
 * Autocomplete suggestions for the project's catalog. Member-level.
 * `q` is optional: blank/absent returns the first CATALOG_SEARCH_LIMIT articles alphabetically.
 * Response: 200 CatalogSuggestion[]
 */
export async function GET(request: Request, { params }: Context) {
  try {
    // Identity first — no session means 401 before any data access.
    const userId = await requireUserId();
    const { projectId } = await params;
    // Any member may read the catalog; non-members get 404 (existence hidden), same as lists.
    await requireMembership(prisma, projectId, userId);

    // `q` absent -> "" -> searchCatalog browses (first N alphabetically). searchCatalog normalizes.
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const suggestions = await searchCatalog(prisma, projectId, query);
    return NextResponse.json(suggestions);
  } catch (error) {
    return toErrorResponse(error);
  }
}
