import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { deleteProject, getProject, renameProject } from "@/lib/projects/projects";
import { addMember, listMembers, removeMember } from "@/lib/projects/membership";
import { requireMembership, requireOwner } from "@/lib/projects/guard";
import Link from "next/link";
import { createList, listLists } from "@/lib/lists/lists";

// Next.js 16: dynamic route params are a Promise in server components — must be awaited.
// This type reflects the new async params API introduced in Next.js 15/16.
type Props = { params: Promise<{ projectId: string }> };

// Server Component: renders entirely on the server with direct DB access.
// Protects itself via requireMembership; non-members are redirected to /projects.
export default async function ProjectDetailPage({ params }: Props) {
  // Await the params Promise — required in Next.js 16 (params is no longer a plain object).
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees session is present; user.id is safe to assert.
  const userId = session!.user.id;

  // Guard: a non-member must not see this page.
  // requireMembership throws an error if the user is not a member of this project.
  // We catch that error and redirect the user back to the projects list.
  // This mirrors the same guard used in the REST routes, so the access rule is consistent.
  let role;
  try {
    role = await requireMembership(prisma, projectId, userId);
  } catch {
    redirect("/projects");
  }

  // If we reach here, role is guaranteed to be "owner" | "member".
  // The two reads are independent, so run them in parallel (Promise.all) instead of sequentially —
  // one DB round-trip of latency instead of two.
  const [project, members, lists] = await Promise.all([
    getProject(prisma, projectId),
    listMembers(prisma, projectId),
    // Slice 3: the project's lists (newest first) render alongside the members.
    listLists(prisma, projectId),
  ]);

  // Convenience flag used to conditionally render owner-only UI sections.
  const isOwner = role === "owner";

  // --- Owner-only Server Actions ---
  // Each action re-derives identity from auth() and calls requireOwner (defense in depth).
  // This matters because server actions are individually addressable POST endpoints —
  // a malicious client could call them directly without going through this component.

  // Rename action: validates ownership, then updates the project name.
  async function rename(formData: FormData) {
    "use server";
    const s = await auth();
    // requireOwner throws if the caller is not the project owner.
    await requireOwner(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions.
    await renameProject(prisma, projectId, name);
    // Revalidate so the heading updates to the new name on the next render.
    revalidatePath(`/projects/${projectId}`);
  }

  // Delete action: removes the project entirely, then redirects to the list.
  // Note: redirect() throws a special Next.js error internally — it must not be caught.
  async function remove() {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    await deleteProject(prisma, projectId);
    // After deletion the page no longer exists; send the user back to the projects list.
    redirect("/projects");
  }

  // Invite action: looks up the user by email and adds them as a member.
  // addMember throws "Nutzer nicht gefunden" if the email has never logged in —
  // that propagates as a server error overlay in dev (expected guard behavior).
  async function invite(formData: FormData) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await addMember(prisma, { projectId, email });
    revalidatePath(`/projects/${projectId}`);
  }

  // Kick (remove member) action: takes a userId hidden field from the form.
  // The "Entfernen" button is only rendered for non-owner members, so this
  // should never be called on the project owner — but requireOwner guards it anyway.
  async function kick(formData: FormData) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    const memberUserId = String(formData.get("userId") ?? "");
    if (!memberUserId) return;
    await removeMember(prisma, { projectId, userId: memberUserId });
    revalidatePath(`/projects/${projectId}`);
  }

  // Create-list action (Slice 3). MEMBER-level, not owner-only: per the permission matrix
  // (MVP design §6) every member may create lists — so this re-checks membership, not ownership.
  async function createListAction(formData: FormData) {
    "use server";
    const s = await auth();
    // requireMembership (not requireOwner): any member may create lists in the project.
    await requireMembership(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (same convention as the other actions).
    await createList(prisma, { projectId, name });
    revalidatePath(`/projects/${projectId}`);
  }

  return (
    <main style={{ padding: 24 }}>
      {/* Project name as heading; project may be null if deleted concurrently, so use optional chaining. */}
      <h1>{project?.name}</h1>
      <p>Deine Rolle: {role === "owner" ? "Owner" : "Mitglied"}</p>

      <h2>Mitglieder</h2>
      <ul>
        {members.map((m) => (
          <li key={m.id}>
            {/* Display email and role label in German. */}
            {m.user.email} ({m.role === "owner" ? "Owner" : "Mitglied"})
            {/* Owners can remove non-owner members. The remove form posts to the kick action. */}
            {isOwner && m.role !== "owner" && (
              <form action={kick} style={{ display: "inline" }}>
                {/* Hidden field passes the target user's ID to the action. */}
                <input type="hidden" name="userId" value={m.userId} />
                <button type="submit">Entfernen</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {/* Slice 3: the project's lists. Visible and usable for EVERY member (member-level actions). */}
      <h2>Listen</h2>
      <form action={createListAction}>
        <input name="name" placeholder="Listenname" aria-label="Listenname" />
        <button type="submit">Liste anlegen</button>
      </form>
      <ul>
        {lists.map((l) => (
          <li key={l.id}>
            <Link href={`/lists/${l.id}`}>{l.name}</Link>
          </li>
        ))}
      </ul>

      {/* Owner-only controls: invite, rename, delete. Hidden from plain members. */}
      {isOwner && (
        <>
          <h2>Mitglied einladen</h2>
          <form action={invite}>
            <input name="email" placeholder="E-Mail" aria-label="E-Mail" />
            <button type="submit">Einladen</button>
          </form>

          <h2>Projekt umbenennen</h2>
          <form action={rename}>
            <input name="name" placeholder="Neuer Name" aria-label="Neuer Name" />
            <button type="submit">Umbenennen</button>
          </form>

          <h2>Projekt löschen</h2>
          <form action={remove}>
            <button type="submit">Projekt löschen</button>
          </form>
        </>
      )}
    </main>
  );
}
