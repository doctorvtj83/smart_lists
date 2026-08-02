import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getProjectNav } from "@/lib/projects/nav";
import { listArchivedListSummaries } from "@/lib/lists/summaries";
import { formatGermanDate } from "@/lib/format/date";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The Archiv screen (handoff screen 3f / empty state 5g).
 *
 * Read-only by design: a completed list is reopened from the list screen itself,
 * not from here. That keeps the archive a calm surface — the design deliberately
 * drops the card look for quiet rows.
 *
 * No Server Actions, so the membership check is purely about the render; it is
 * still explicit rather than inherited from the layout, so the page is safe on
 * its own if it is ever moved.
 */
export default async function ArchivePage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  const lists = await listArchivedListSummaries(prisma, projectId);

  return (
    <>
      <PageHeader title="Archiv" leading={<DrawerTrigger />} />
      <main className={styles.content}>
        {lists.length === 0 ? (
          <div className={styles.empty}>
            <EmptyState
              icon={<Icon icon={Check} size={22} />}
              title="Noch nichts abgeschlossen"
              description="Abgeschlossene Listen landen hier — und machen die Vorschläge für neue Listen schlauer."
            />
          </div>
        ) : (
          <>
            <ul className={styles.rows}>
              {lists.map((list) => (
                <li key={list.id}>
                  {/* A plain link, not RowLink: the design explicitly drops the
                      card look here ("Ruhige Zeilen (kein Karten-Look)"). */}
                  <Link href={`/lists/${list.id}`} className={styles.row}>
                    <span className={styles.check} aria-hidden="true">
                      <Icon icon={Check} size={12} />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.name}>{list.name}</span>
                      {/* The date is only printed when the column holds one —
                          see ArchivedListSummary on why it is nullable. */}
                      {list.completedAt && (
                        <span className={styles.meta}>
                          Abgeschlossen am {formatGermanDate(list.completedAt)}
                        </span>
                      )}
                    </span>
                    <Icon icon={ChevronRight} size={16} className={styles.chevron} />
                  </Link>
                </li>
              ))}
            </ul>
            {/* Explains WHY the archive is kept — it feeds the N-of-M statistic. */}
            <p className={styles.footnote}>
              Abgeschlossene Listen speisen die Vorschläge für neue Listen.
            </p>
          </>
        )}
      </main>
    </>
  );
}
