import { redirect } from "next/navigation";
import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getContinueList } from "@/lib/lists/continue";
import { listProjectSummaries } from "@/lib/projects/summaries";
import { formatListCount } from "@/lib/format/plural";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowLink } from "@/components/ui/RowLink";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ContinueCard } from "./ContinueCard";
import styles from "./page.module.css";

// Middleware is the first protection layer; this explicit check keeps the page safe if middleware behavior changes.
// Slice 14 restyles it to handoff screen 3c and adds the "Weitermachen" card.
export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  // Two independent reads -> Promise.all, so the page costs one round-trip's
  // latency instead of two. Neither depends on the other's result.
  const [continueCard, projects] = await Promise.all([
    getContinueList(prisma, userId),
    listProjectSummaries(prisma, userId),
  ]);

  return (
    <>
      {/* No hairline on Home (handoff 3c) — the sections carry the structure. */}
      <PageHeader
        title="Smart Lists"
        hairline={false}
        trailing={<span className={styles.email}>{session.user.email}</span>}
      />
      <main className={styles.content}>
        {/* The section is omitted entirely when there is no open list — an empty
            "WEITERMACHEN" heading would be a promise the screen cannot keep. */}
        {continueCard && (
          <>
            <SectionLabel>WEITERMACHEN</SectionLabel>
            <ContinueCard data={continueCard} />
          </>
        )}

        <div className={continueCard ? styles.spaced : undefined}>
          <div className={styles.sectionRow}>
            <SectionLabel>PROJEKTE</SectionLabel>
            {/* The drawer's project switcher is the design's route to /projects,
                but the drawer only exists inside a project. Without this link a
                signed-in user on Home cannot reach the screen that creates and
                manages projects at all. Hidden while empty, because the empty
                state below already carries that single call to action. */}
            {projects.length > 0 && (
              <Link href="/projects" className={styles.allProjects}>
                Alle Projekte
              </Link>
            )}
          </div>
        </div>
        {projects.length === 0 ? (
          // A brand-new account lands here. Before this, the section rendered its
          // heading and then nothing — the first screen of the product was a dead
          // end. The action deliberately only *navigates*: /projects owns the
          // create form, and one form is easier to keep correct than two.
          <EmptyState
            icon={<Icon icon={FolderPlus} size={24} />}
            title="Noch kein Projekt"
            description="Ein Projekt bündelt Listen, Katalog und Favoriten — z. B. „Haushalt“."
          >
            <Link href="/projects" className={styles.emptyAction}>
              Projekt anlegen
            </Link>
          </EmptyState>
        ) : (
          projects.map((project) => (
            <RowLink
              key={project.id}
              href={`/projects/${project.id}`}
              title={project.name}
              leading={<Avatar name={project.name} size={28} />}
              // Home shows only the list count; the member count is the Projekte
              // screen's job (handoff 3c vs. 3d).
              trailing={
                <span className={styles.rowCount}>{formatListCount(project.activeListCount)}</span>
              }
            />
          ))
        )}

        <div className={styles.footer}>
          {/* Slice 9: the entry point to /admin. The session flag is good enough to decide
              VISIBILITY; authorization is the page's own job (requireAdmin reads the flag
              live from the DB, so a stale token gets redirected). */}
          {session.user.isAdmin && (
            <Link href="/admin" className={styles.adminLink}>
              Verwaltung
            </Link>
          )}
          <span className={styles.footerSpacer} />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="text">
              Abmelden
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
