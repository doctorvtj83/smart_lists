import Link from "next/link";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createProject, listProjectsForUser } from "@/lib/projects/projects";

// Server Component: runs entirely on the server, so it can read the session and
// call the DB core functions directly — no HTTP round-trip, no client-exposed secrets.
export default async function ProjectsPage() {
  const session = await auth();
  // middleware.ts guarantees an authenticated session on this route, so user.id is always present.
  const userId = session!.user.id;

  // Fetch the user's project memberships directly from the DB core (same function used by REST routes).
  const projects = await listProjectsForUser(prisma, userId);

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

  return (
    <main style={{ padding: 24 }}>
      <h1>Projekte</h1>

      {/* Inline create form — no JS needed; the server action handles the POST. */}
      <form action={create}>
        <input name="name" placeholder="Projektname" aria-label="Projektname" />
        <button type="submit">Projekt anlegen</button>
      </form>

      {/* List all projects the user is a member of, each linking to its detail page. */}
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
