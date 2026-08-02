import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getProjectNav } from "@/lib/projects/nav";
import { ProjectShell } from "@/components/nav/ProjectShell";

// Next.js 16: a layout's dynamic params are a Promise and MUST be awaited.
type Props = {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
};

/**
 * The shell around all five project screens (Listen, Archiv, Favoriten, Katalog,
 * Mitglieder).
 *
 * Why the navigation lives in a LAYOUT and not in each page: a layout is not
 * re-rendered when you navigate between its children, so the drawer's open state
 * and the sidebar survive a screen change. Repeating the nav per page would also
 * repeat the read that feeds it.
 *
 * Why each page still runs its own membership guard: a layout guards the
 * RENDER, not the Server Actions the pages define. Those are individually
 * addressable POST endpoints, so the pages re-check for themselves — the
 * defense-in-depth rule this codebase applies everywhere.
 */
export default async function ProjectLayout({ children, params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  // One read covers the guard AND the nav: the membership predicate is inside
  // the query, so `null` already means "not a member / unknown / malformed id".
  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  // Server Action defined here rather than inside the panel: signOut must run on
  // the server, and Server Actions are serialisable across the boundary — so the
  // client panel arranges the UI while the server keeps the session handling.
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <ProjectShell
      nav={{
        projectId: nav.projectId,
        projectName: nav.projectName,
        projects: nav.projects,
        activeListCount: nav.activeListCount,
        memberCount: nav.memberCount,
        // The session flag decides VISIBILITY only; /admin re-reads isAdmin live
        // from the database, so a stale token gets redirected there (Slice 9).
        isAdmin: Boolean(session!.user.isAdmin),
      }}
      signOutAction={signOutAction}
    >
      {children}
    </ProjectShell>
  );
}
