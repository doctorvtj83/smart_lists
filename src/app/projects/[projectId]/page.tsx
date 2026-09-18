import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ListChecks } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { deleteProject, renameProject } from "@/lib/projects/projects";
import { requireMembership, requireOwner } from "@/lib/projects/guard";
import { getProjectNav } from "@/lib/projects/nav";
import { listActiveListSummaries } from "@/lib/lists/summaries";
import { listFavorites } from "@/lib/favorites/favorites";
import { computeSuggestions, createListWithArticles } from "@/lib/suggestions/suggestions";
import { formatOpenCount } from "@/lib/format/plural";
import { createListWithRecipes, type RecipeSelection } from "@/lib/recipes/apply";
import { recipeLabels } from "@/lib/recipes/labels";
import { listRecipesForApply } from "@/lib/recipes/recipes";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowLink } from "@/components/ui/RowLink";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField } from "@/components/ui/TextField";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { ProjectTitle } from "./ProjectTitle";
import { DeleteProjectButton } from "./DeleteProjectButton";
import { NewListSheet } from "./NewListSheet";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The project screen, reduced to ONE concern: the project's open lists
 * (handoff screen 3e).
 *
 * Slice 11 moved members, favourites, the archive and the catalog link out into
 * their own screens behind the drawer. What is left is the working surface: name
 * the list, create it (pre-filled or empty), open one.
 *
 * Server Component: it reads the session and calls the domain layer directly,
 * no HTTP round-trip. The three client components it renders (ProjectTitle,
 * NewListSheet, DeleteProjectButton) receive Server Actions as props, so every
 * mutation stays server-owned.
 */
export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  // The layout already guarded the render, but this page defines Server Actions
  // — individually addressable POST endpoints — so it re-checks for itself.
  // getProjectNav answers null for non-member / unknown / malformed alike.
  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  const isOwner = nav.role === "owner";

  // Three independent reads → Promise.all: one round-trip of latency, not three.
  // The suggestions and the favourite ids feed the sheet's preview; the summaries
  // feed the list rows.
  const [activeLists, suggestions, favorites] = await Promise.all([
    listActiveListSummaries(prisma, projectId),
    computeSuggestions(prisma, projectId),
    listFavorites(prisma, projectId),
  ]);

  // The sheet needs to know WHICH suggestions are favourites (for the ★ and the
  // ordering). Favourites are a subset of the suggestion set, so an id list is
  // all that has to cross the boundary.
  const favoriteIds = favorites.map((favorite) => favorite.catalogItemId);

  // The nav already carries `recipesEnabled` (Slice 18), but the sheet also needs the SINGULAR —
  // and the recipes themselves — so the two label columns are read here.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
  });
  const recipesEnabled = project?.recipesEnabled ?? false;
  const recipeSheetLabels = recipesEnabled && project ? recipeLabels(project) : null;
  // Off projects pay nothing for a feature they never enabled.
  const recipes = recipesEnabled ? await listRecipesForApply(prisma, projectId) : [];

  // --- Server Actions ---------------------------------------------------------
  // Each re-derives identity and re-checks permission (defense in depth).

  /**
   * Creates a list from the sheet's surviving selection and jumps into it.
   * Member-level: per the permission matrix every member may create lists.
   */
  async function createFromSheetAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (the convention across this app).

    // getAll: the sheet posts one `articleName` field per surviving chip. An
    // empty result is the legitimate "Leere Liste anlegen" case.
    const articleNames = formData.getAll("articleName").map((value) => String(value));

    // „<recipeId>:<count>“ — see the list screen's applyRecipesAction for the same parse.
    const selections: RecipeSelection[] = formData.getAll("selection").map((raw) => {
      const value = String(raw);
      const separator = value.indexOf(":");
      return { recipeId: value.slice(0, separator), count: Number(value.slice(separator + 1)) };
    });

    // No recipes chosen -> the untouched Slice 11 path. This is what keeps a project that never
    // enables the feature on exactly the code it runs today (ruling R3).
    if (selections.length === 0) {
      const list = await createListWithArticles(prisma, { projectId, name, articleNames });
      redirect(`/lists/${list.id}`);
    }

    // The feature is re-checked on submit: a Server Action is an individually addressable POST
    // endpoint, so disabling recipes while the sheet was open must not apply anything (spec §9).
    const settings = await prisma.project.findUnique({
      where: { id: projectId },
      select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
    });
    if (!settings?.recipesEnabled) notFound();

    const token = String(formData.get("applyToken") ?? "") || randomUUID();
    const list = await createListWithRecipes(
      prisma,
      { projectId, name, articleNames, selections, token },
      recipeLabels(settings),
    );
    // redirect() throws a special Next.js error internally — it must not be wrapped in try/catch,
    // and nothing may run after it.
    redirect(`/lists/${list.id}`);
  }

  /** The secondary „Leere Liste" row next to the hero card. Member-level. */
  async function createEmptyListAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    await createListWithArticles(prisma, { projectId, name, articleNames: [] });
    // "layout" scope: the drawer's Listen badge (activeListCount) lives in the
    // project layout via getProjectNav — a page-only revalidate would leave it stale.
    revalidatePath(`/projects/${projectId}`, "layout");
  }

  /** Inline rename. Owner-only (handoff: members see plain text). */
  async function renameAction(name: string) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);

    const trimmed = name.trim();
    if (!trimmed) return;

    await renameProject(prisma, projectId, trimmed);
    // "layout" scope, not the default: the drawer and the sidebar print the
    // project name too, and they live in the layout above this page.
    revalidatePath(`/projects/${projectId}`, "layout");
  }

  /** Deletes the project and leaves. Owner-only. */
  async function deleteAction() {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);
    await deleteProject(prisma, projectId);
    redirect("/projects");
  }

  // The hero copy differs between a project with lists and one without: the
  // empty state invites a FIRST list and does not promise pre-fill yet, because
  // there is no history to pre-fill from (handoff 5b).
  const hasLists = activeLists.length > 0;
  const newListSheet = (
    <NewListSheet
      suggestions={suggestions}
      favoriteIds={favoriteIds}
      recipes={recipes}
      labels={recipeSheetLabels}
      heroTitle={hasLists ? "Vorbefüllte Liste anlegen" : "Erste Liste anlegen"}
      heroSubtitle={
        hasLists
          ? "Startet mit Favoriten + häufigen Artikeln"
          : "Später auch vorbefüllt mit deinen Favoriten"
      }
      createAction={createFromSheetAction}
    />
  );

  return (
    <>
      {/* No hairline: the hero card carries the visual weight right below
          (handoff screen 3e). */}
      {/*
        PageHeader title decision (Task 10): the brief put `nav.projectName` in
        the <h1> AND rendered ProjectTitle in the content — that doubles the name
        on screen. Handoff 3e puts the (editable) name in the header row only
        (☰ · name · Rolle). Fix: empty PageHeader title so its flex:1 <h1> acts
        as the spacer from the prototype; ProjectTitle sits in `leading` next to
        the drawer trigger. Accessible name comes from InlineEdit's "Projektname"
        label (owner) / the visible text (member).
      */}
      <PageHeader
        title=""
        hairline={false}
        leading={
          <>
            <DrawerTrigger />
            <ProjectTitle name={nav.projectName} editable={isOwner} renameAction={renameAction} />
          </>
        }
        trailing={
          <span className={styles.role}>Deine Rolle: {isOwner ? "Owner" : "Mitglied"}</span>
        }
      />
      <main className={styles.content}>
        {hasLists ? (
          <>
            {newListSheet}

            {/* The quiet alternative to the hero: name it, get an empty list. */}
            <form action={createEmptyListAction} className={styles.emptyRow}>
              <div className={styles.emptyField}>
                <TextField name="name" aria-label="Listenname" placeholder="Listenname…" />
              </div>
              <Button type="submit" variant="secondary">
                Leere Liste
              </Button>
            </form>

            <div className={styles.section}>
              <SectionLabel>AKTIVE LISTEN</SectionLabel>
            </div>
            {activeLists.map((list) => (
              <RowLink
                key={list.id}
                href={`/lists/${list.id}`}
                title={list.name}
                trailing={<span className={styles.openCount}>{formatOpenCount(list.openCount)}</span>}
              />
            ))}
          </>
        ) : (
          // Empty state 5b: the hero card IS the action, directly under the copy.
          <div className={styles.empty}>
            <EmptyState
              icon={<Icon icon={ListChecks} size={22} />}
              title="Noch keine Liste"
              description="Sobald Listen abgeschlossen sind, kann Smart Lists neue Listen vorbefüllen."
            >
              {newListSheet}
            </EmptyState>
          </div>
        )}

        {/* Owner-only, and NOT rendered for members — never merely disabled. */}
        {isOwner && (
          <DeleteProjectButton projectName={nav.projectName} deleteAction={deleteAction} />
        )}
      </main>
    </>
  );
}
