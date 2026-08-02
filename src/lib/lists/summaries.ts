import type { PrismaClient } from "@prisma/client";

/**
 * An active list as the project screen's row card renders it: the list plus the
 * „5 offen" counter (handoff screen 3e).
 *
 * Why a read model and not `List`: the row needs a count that lives on ListItem,
 * and `listLists` deliberately returns the plain rows the REST layer serialises.
 * A different consumer gets a different shape — the same reasoning as
 * ProjectSummary next to listProjectsForUser.
 */
export interface ActiveListSummary {
  id: string;
  name: string;
  /** UNCHECKED entries only. 0 for a list nobody has typed into yet. */
  openCount: number;
}

/** An archived list as the Archiv screen renders it (handoff screen 3f). */
export interface ArchivedListSummary {
  id: string;
  name: string;
  /**
   * Nullable because the column is: `completeList` always stamps it, but a
   * seeded/imported row could be `completed` without one. The screen prints the
   * „Abgeschlossen am …" line only when it exists.
   */
  completedAt: Date | null;
}

/**
 * The project's open lists with their open-entry count.
 *
 * The count is done by the DATABASE via a filtered relation count, so no entry
 * rows travel over the wire — the same technique listProjectSummaries uses for
 * its two counts. A project with 20 lists therefore still costs one query, not 21.
 *
 * Ordering is `createdAt: "desc"`, identical to `listLists(db, id, "active")`, so
 * the project screen and the REST collection never disagree about the order.
 */
export async function listActiveListSummaries(
  db: PrismaClient,
  projectId: string,
): Promise<ActiveListSummary[]> {
  const rows = await db.list.findMany({
    where: { projectId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      // Filtered relation count: "how many of this list's items are unchecked".
      _count: { select: { items: { where: { checked: false } } } },
    },
  });

  // Flatten Prisma's `_count` nesting into the lean shape the UI renders, so no
  // screen has to know how the count was produced.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    openCount: row._count.items,
  }));
}

/**
 * The project's completed lists, newest-completed first.
 *
 * A different sort key from the active list on purpose: for an archived list the
 * meaningful recency is when it was CLOSED, not when it was created (the rule
 * `listLists` already encodes for `status === "completed"`).
 *
 * `nulls: "last"` is deliberate — Postgres sorts NULLs FIRST on DESC, so a
 * completed row without a `completedAt` would otherwise sit above genuinely
 * recent lists. Same guard as computeSuggestions' window query.
 */
export async function listArchivedListSummaries(
  db: PrismaClient,
  projectId: string,
): Promise<ArchivedListSummary[]> {
  return db.list.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: { sort: "desc", nulls: "last" } },
    select: { id: true, name: true, completedAt: true },
  });
}
