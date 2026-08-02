import type { PrismaClient, Role } from "@prisma/client";

/**
 * A project row as the Home and Projekte screens render it: the project plus the
 * two counts in its meta line and the caller's own role.
 *
 * Why the role is part of the summary and not looked up separately: the OWNER
 * badge is per-viewer, and fetching it in a second round-trip per row would turn
 * one query into N+1.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  /** ACTIVE lists only — the archive is a separate screen and must not inflate this. */
  activeListCount: number;
  memberCount: number;
  /** The CALLER's role in this project, not the project's owner. */
  role: Role;
}

/**
 * All projects the user belongs to, each with the meta the design's row cards show
 * ("3 Listen · 4 Mitglieder" + the OWNER badge).
 *
 * Why a separate function instead of extending listProjectsForUser: that function
 * returns plain `Project` rows and is used by the REST layer, where the counts
 * would be dead weight. This one is a UI read model — a different shape for a
 * different consumer.
 *
 * Ordering is `createdAt: "asc"`, identical to listProjectsForUser, so the two
 * screens never disagree about the order of the same projects.
 */
export async function listProjectSummaries(
  db: PrismaClient,
  userId: string,
): Promise<ProjectSummary[]> {
  const rows = await db.project.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      // Filtered relation counts (GA since Prisma 5): the DB does the counting,
      // so no list or membership rows travel over the wire.
      _count: {
        select: {
          memberships: true,
          lists: { where: { status: "active" } },
        },
      },
      // Exactly the caller's membership row. The compound unique (projectId,
      // userId) guarantees at most one, and the outer `where` guarantees at
      // least one — so [0] is always present.
      memberships: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    activeListCount: row._count.lists,
    memberCount: row._count.memberships,
    role: row.memberships[0].role,
  }));
}
