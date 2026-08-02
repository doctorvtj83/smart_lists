import { revalidatePath } from "next/cache";
import { FolderPlus } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/projects/projects";
import { listProjectSummaries } from "@/lib/projects/summaries";
import { formatProjectMeta } from "@/lib/format/plural";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowLink } from "@/components/ui/RowLink";
import { TextField } from "@/components/ui/TextField";
import styles from "./page.module.css";

// Server Component: runs entirely on the server, so it can read the session and
// call the DB core functions directly — no HTTP round-trip, no client-exposed secrets.
// Slice 14 restyles it to handoff screen 3d (empty state 5a) and swaps the plain
// project list for the summary read model that carries the meta line and the role.
export default async function ProjectsPage() {
  const session = await auth();
  // middleware.ts guarantees an authenticated session on this route, so user.id is always present.
  const userId = session!.user.id;

  // The summary read model (Slice 14) instead of listProjectsForUser: the design's
  // row cards need the two counts and the viewer's own role for the OWNER badge.
  const projects = await listProjectSummaries(prisma, userId);

  // Server Action: the <form action={create}> posts here on the server.
  // No client-side JS is required — Next.js progressive enhancement handles the form.
  // "use server" marks this function as a Server Action; Next.js serializes it and registers an endpoint.
  async function create(formData: FormData) {
    "use server";
    // Re-derive identity inside the action (defense in depth: never trust component-level state in actions,
    // because actions can be called from anywhere once registered).
    const s = await auth();
    const uid = s?.user?.id;
    if (!uid) return; // Should not happen behind middleware, but guard anyway.

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions silently.

    // Delegate to the same core function used by POST /api/projects — consistent business logic.
    await createProject(prisma, { name, ownerId: uid });

    // Tell Next.js to re-render this route's server component so the new project appears in the list.
    revalidatePath("/projects");
  }

  // The create row appears twice — inside the empty state and under the list — so
  // it is built once here rather than duplicated in both branches.
  const createRow = (
    <form action={create} className={styles.createRow}>
      <div className={styles.createField}>
        <TextField name="name" placeholder="Projektname" aria-label="Projektname" />
      </div>
      <Button type="submit">Anlegen</Button>
    </form>
  );

  return (
    <>
      <PageHeader title="Projekte" />
      <main className={styles.content}>
        {projects.length === 0 ? (
          // Empty state 5a. The action sits directly beneath the copy, which is the
          // shared empty-state pattern from the handoff.
          <div className={styles.empty}>
            <EmptyState
              icon={<Icon icon={FolderPlus} size={24} />}
              title="Noch kein Projekt"
              description="Ein Projekt bündelt Listen, Katalog und Favoriten — z. B. „Haushalt“."
            >
              {createRow}
            </EmptyState>
          </div>
        ) : (
          <>
            {projects.map((project) => (
              <RowLink
                key={project.id}
                href={`/projects/${project.id}`}
                title={project.name}
                meta={formatProjectMeta(project.activeListCount, project.memberCount)}
                leading={<Avatar name={project.name} />}
                // The badge marks the viewer's OWN ownership, which is why the role
                // comes from the summary (per-viewer) and not from project.ownerId.
                trailing={project.role === "owner" ? <Badge>OWNER</Badge> : undefined}
              />
            ))}
            {createRow}
          </>
        )}
      </main>
    </>
  );
}
