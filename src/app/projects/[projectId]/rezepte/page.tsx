import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { getProjectNav } from "@/lib/projects/nav";
import { recipeLabels } from "@/lib/recipes/labels";
import { createRecipe, listRecipes } from "@/lib/recipes/recipes";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { RecipeIndex } from "./RecipeIndex";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "./formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The recipes index screen (spec §5). MEMBER-LEVEL: recipes are project content like lists,
 * favourites and the catalog — every member cooks. Only the SETTINGS that turn the feature on are
 * owner-only.
 *
 * Two different "no" answers on purpose:
 *  - not a member -> redirect to /projects, because they must not learn the project exists;
 *  - feature off  -> notFound(), because the project exists and this screen does not. The nav is a
 *    convenience; the ROUTE is the gate (spec §5), and it re-checks on every render and every
 *    action — which is what makes "someone switched it off while your sheet was open" safe (§9).
 */
export default async function RecipesPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");
  if (!nav.recipesEnabled) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipeLabelSingular: true, recipeLabelPlural: true },
  });
  if (!project) redirect("/projects");
  const labels = recipeLabels(project);

  const recipes = await listRecipes(prisma, projectId);

  /**
   * Creates an empty recipe. Re-derives identity and re-checks BOTH membership and the feature
   * flag: a Server Action is an individually addressable POST endpoint, so a crafted request could
   * reach it without this page ever rendering — including after someone switched the feature off.
   */
  async function createRecipeAction(
    _prev: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const settings = await prisma.project.findUnique({
      where: { id: projectId },
      select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
    });
    if (!settings?.recipesEnabled) notFound();

    const name = String(formData.get("name") ?? "").trim();
    // Empty submission: silent no-op, the convention every other form here uses.
    if (!name) return RECIPE_FORM_IDLE;

    try {
      const created = await createRecipe(prisma, { projectId, name }, recipeLabels(settings));
      revalidatePath(`/projects/${projectId}/rezepte`);
      return { error: null, ok: true, recipeId: created.id };
    } catch (error) {
      // Only ApiError carries user-facing German copy; anything else is a real bug (re-thrown).
      if (error instanceof ApiError) return { error: error.message, ok: false, recipeId: null };
      throw error;
    }
  }

  return (
    <>
      <PageHeader title={labels.plural} leading={<DrawerTrigger />} />
      <main className={styles.content}>
        <RecipeIndex
          projectId={projectId}
          recipes={recipes}
          labels={labels}
          createAction={createRecipeAction}
        />
      </main>
    </>
  );
}
