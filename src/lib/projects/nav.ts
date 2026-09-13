import type { PrismaClient, Role } from "@prisma/client";
import { DEFAULT_RECIPE_LABEL_PLURAL } from "@/lib/recipes/labels";
import { listProjectSummaries } from "./summaries";

/** Everything the navigation shell renders for one project. */
export interface ProjectNavData {
  projectId: string;
  projectName: string;
  /** The CALLER's role — the project screen prints "Deine Rolle: …" from it. */
  role: Role;
  activeListCount: number;
  memberCount: number;
  /** Whether the recipes feature is on — decides whether the nav shows its entry at all. */
  recipesEnabled: boolean;
  /** The project's own plural, e.g. "Sets" — the nav entry's label (spec §4, §5). */
  recipeLabelPlural: string;
  /** Every project the caller belongs to — the switcher's dropdown. */
  projects: { id: string; name: string }[];
}

/**
 * The navigation read: current project, its two counts, the caller's role, and
 * the project list for the switcher — in ONE query.
 *
 * Why it is built on listProjectSummaries rather than a fresh query: that read
 * model already returns every project the caller is a member of, each with the
 * active-list and member counts and the caller's role. The current project is
 * simply the row whose id matches — so the switcher and the counts cost the same
 * single round-trip.
 *
 * Why `null` instead of throwing: the membership predicate is baked into the
 * query (`memberships: { some: { userId } }`), so "no matching row" covers the
 * unknown project, the malformed id and the non-member alike. All three mean the
 * same thing to the layout — "this project does not exist for you" — and it
 * answers with the redirect to /projects that Slice 2 established, never a 403.
 */
export async function getProjectNav(
  db: PrismaClient,
  projectId: string,
  userId: string,
): Promise<ProjectNavData | null> {
  const summaries = await listProjectSummaries(db, userId);
  const current = summaries.find((summary) => summary.id === projectId);
  if (!current) return null;

  // A second, deliberately narrow read rather than widening listProjectSummaries: that read backs
  // Home and Projekte, where these two columns would ride along on every project row for nothing.
  // Two columns of one row is cheaper than that, and it keeps the summary shape honest.
  const settings = await db.project.findUnique({
    where: { id: projectId },
    select: { recipesEnabled: true, recipeLabelPlural: true },
  });

  return {
    projectId: current.id,
    projectName: current.name,
    role: current.role,
    activeListCount: current.activeListCount,
    memberCount: current.memberCount,
    // `settings` cannot be null here — the summary above proves the project exists — but falling
    // back keeps a concurrent delete from turning the nav into a crash.
    recipesEnabled: settings?.recipesEnabled ?? false,
    recipeLabelPlural: settings?.recipeLabelPlural ?? DEFAULT_RECIPE_LABEL_PLURAL,
    // Only id + name: the switcher shows an avatar and a name, nothing else.
    projects: summaries.map((summary) => ({ id: summary.id, name: summary.name })),
  };
}
