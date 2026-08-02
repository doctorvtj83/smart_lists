import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { deleteProject, getProject, renameProject } from "@/lib/projects/projects";
import { addMember, listMembers, removeMember } from "@/lib/projects/membership";
import { requireMembership, requireOwner } from "@/lib/projects/guard";
import Link from "next/link";
import { createList, listLists } from "@/lib/lists/lists";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { CATALOG_DATALIST_LIMIT, searchCatalog } from "@/lib/catalog/search";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/favorites/favorites";
import { createPrefilledList } from "@/lib/suggestions/suggestions";
import { formatGermanDate } from "@/lib/format/date";

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
  const [project, members, activeLists, archivedLists, favorites, catalogSuggestions] =
    await Promise.all([
      getProject(prisma, projectId),
      listMembers(prisma, projectId),
      // Slice 6: split the project's lists into the working set ("Listen") and the archive ("Archiv").
      // Active = newest-created first; archive = newest-completed first (see listLists).
      listLists(prisma, projectId, "active"),
      listLists(prisma, projectId, "completed"),
      // Slice 5: the project's favorites (alphabetical) and the whole catalog for the favorite
      // datalist. We pass CATALOG_DATALIST_LIMIT (not searchCatalog's short default) because a native
      // <datalist> filters client-side over exactly the options we pre-render — same reasoning as the
      // list detail page; see CATALOG_DATALIST_LIMIT in search.ts.
      listFavorites(prisma, projectId),
      searchCatalog(prisma, projectId, "", CATALOG_DATALIST_LIMIT),
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

  // Create-prefilled-list action (Slice 5). MEMBER-level, like createListAction. Creates a list
  // seeded from the project's suggestions (favorites + N-of-M statistic), then navigates to it so the
  // user immediately sees the pre-filled entries and can remove the unwanted ones (MVP design §4.3,
  // step 4).
  async function createPrefilledListAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (same convention as the other actions).
    const list = await createPrefilledList(prisma, { projectId, name });
    // redirect() throws a special Next.js error internally — it must not be wrapped in try/catch,
    // and nothing may run after it.
    redirect(`/lists/${list.id}`);
  }

  // Add-favorite action (Slice 5). MEMBER-level: favorites/catalog upkeep is allowed for every
  // member (permission matrix, MVP design §6). Favoriting by NAME (not id) is friendlier and lets a
  // member favorite an article they have not listed yet — getOrCreateCatalogItem resolves the name
  // to the project's catalog row (creating it on first use), then addFavorite pins it.
  async function addFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const catalogItem = await getOrCreateCatalogItem(prisma, { projectId, name });
    await addFavorite(prisma, { projectId, catalogItemId: catalogItem.id });
    revalidatePath(`/projects/${projectId}`);
  }

  // Remove-favorite action (Slice 5). Member-level; idempotent (removeFavorite tolerates a missing
  // row). The hidden field carries the catalog item id of the favorite to drop.
  async function removeFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const catalogItemId = String(formData.get("catalogItemId") ?? "");
    if (!catalogItemId) return;
    await removeFavorite(prisma, { projectId, catalogItemId });
    revalidatePath(`/projects/${projectId}`);
  }

  return (
    <main style={{ padding: 24 }}>
      {/* Back-link to the projects overview — same pattern as the list page's "← Zum Projekt".
          Without this, the only ways back were the browser back button or typing /projects. */}
      <p>
        <Link href="/projects">← Zu meinen Projekten</Link>
      </p>
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
      {/* Slice 5: create a list already pre-filled from the project's suggestions (favorites +
          N-of-M statistic). A SEPARATE form from "Liste anlegen" above so the two intents stay
          explicit — the user chooses empty vs. pre-filled, we never guess. Member-level. */}
      <form action={createPrefilledListAction}>
        <input
          name="name"
          placeholder="Listenname (vorbefüllt)"
          aria-label="Vorbefüllte Liste anlegen"
        />
        <button type="submit">Vorbefüllte Liste anlegen</button>
      </form>
      <ul>
        {activeLists.map((l) => (
          <li key={l.id}>
            <Link href={`/lists/${l.id}`}>{l.name}</Link>
          </li>
        ))}
      </ul>

      {/* Slice 6: the archive of completed lists. Rendered only when non-empty so an all-active
          project shows no empty heading. Completed lists stay visible (and feed Slice 5's statistic)
          until deleted (MVP design §4.6). */}
      {archivedLists.length > 0 && (
        <>
          <h2>Archiv</h2>
          <ul>
            {archivedLists.map((l) => (
              <li key={l.id}>
                <Link href={`/lists/${l.id}`}>{l.name}</Link>
                {l.completedAt ? ` (${formatGermanDate(l.completedAt)})` : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Slice 5: the project's shared favorites — the always-suggested half of the pre-fill set.
          Every member may add/remove (member-level). Adding is by article name, backed by a
          <datalist> of the catalog for zero-JS autocomplete (same pattern as the list detail page);
          a brand-new name creates a catalog article and favorites it in one step. */}
      <h2>Favoriten</h2>
      <datalist id="favorite-suggestions">
        {catalogSuggestions.map((s) => (
          // Only the value is needed — the browser inserts it into the input on selection.
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      <form action={addFavoriteAction}>
        <input
          name="name"
          placeholder="Artikel"
          aria-label="Favorit hinzufügen"
          list="favorite-suggestions"
        />
        <button type="submit">Als Favorit</button>
      </form>
      <ul>
        {favorites.map((f) => (
          <li key={f.catalogItemId}>
            {/* The display name comes from the catalog item (article identity, MVP design §3.1),
                already flattened onto the lean FavoriteArticle shape by listFavorites. */}
            {f.name}{" "}
            <form action={removeFavoriteAction} style={{ display: "inline" }}>
              <input type="hidden" name="catalogItemId" value={f.catalogItemId} />
              <button type="submit">Entfernen</button>
            </form>
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
