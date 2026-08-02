import type { PrismaClient } from "@prisma/client";

/**
 * The minimum a list has to expose for the recency rule. Kept structural (not a
 * Prisma type) so the ranking can be tested with plain objects and no database.
 */
export interface TouchableList {
  id: string;
  createdAt: Date;
  items: { updatedAt: Date }[];
}

/**
 * When a list was last touched.
 *
 * Why derived and not stored: `List` has no updatedAt column. Adding one would
 * mean a migration plus a write in every entry operation — for a comfort feature.
 * `ListItem.updatedAt` already exists (Prisma bumps it on every update; it is the
 * last-writer-wins timestamp and Slice 7's sync cursor), so the newest item
 * timestamp IS the list's activity.
 *
 * The fallback to `createdAt` covers a list nobody has typed into yet, and the
 * Math.max keeps the rule monotonic: a list can never report activity from
 * before it existed.
 */
export function lastTouchedAt(list: TouchableList): Date {
  const newestItem = list.items.reduce(
    (max, item) => (item.updatedAt > max ? item.updatedAt : max),
    // Seeding the reduce with createdAt is what makes the empty-items case and
    // the monotonicity rule the same line of code.
    list.createdAt,
  );
  return newestItem;
}

/**
 * The single list the Weitermachen card points at: the most recently touched one.
 *
 * Ties are broken by the later `createdAt` so the result is deterministic — two
 * lists created in the same millisecond with no entries would otherwise depend on
 * the database's row order, and a card that flickers between two lists on reload
 * is worse than either choice.
 */
export function pickContinueList<T extends TouchableList>(lists: T[]): T | null {
  return lists.reduce<T | null>((best, candidate) => {
    if (best === null) return candidate;

    const bestTouched = lastTouchedAt(best).getTime();
    const candidateTouched = lastTouchedAt(candidate).getTime();

    if (candidateTouched > bestTouched) return candidate;
    if (candidateTouched < bestTouched) return best;
    // Tie on activity -> the younger list wins.
    return candidate.createdAt > best.createdAt ? candidate : best;
  }, null);
}

/** Everything the Home hero card renders. `null` means: render nothing. */
export interface ContinueCardData {
  listId: string;
  listName: string;
  projectId: string;
  projectName: string;
  /** Unchecked entries — the "5" in "5 von 8 offen". */
  openCount: number;
  /** All entries — the "8". May be 0 for a brand-new list. */
  totalCount: number;
}

/**
 * The user's most recently touched OPEN list across all their projects.
 *
 * This is the first genuinely cross-project read in the app: every other read is
 * scoped to one project after a membership check. Access control is therefore
 * baked into the query itself — `project: { memberships: { some: { userId } } }`
 * is the same membership predicate `listProjectsForUser` uses, so a list can only
 * surface here if the caller may already see it.
 *
 * Completed lists are excluded: "Weitermachen" means resume, and an archived list
 * has nothing to resume.
 */
export async function getContinueList(
  db: PrismaClient,
  userId: string,
): Promise<ContinueCardData | null> {
  const lists = await db.list.findMany({
    where: {
      status: "active",
      project: { memberships: { some: { userId } } },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      // Only the two fields the ranking and the counter need — not the whole
      // entry, and explicitly not the catalog item.
      items: { select: { updatedAt: true, checked: true } },
    },
  });

  const winner = pickContinueList(lists);
  if (winner === null) return null;

  return {
    listId: winner.id,
    listName: winner.name,
    projectId: winner.project.id,
    projectName: winner.project.name,
    openCount: winner.items.filter((item) => !item.checked).length,
    totalCount: winner.items.length,
  };
}
