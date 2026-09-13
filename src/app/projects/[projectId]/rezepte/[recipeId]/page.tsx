import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import { getProjectNav } from "@/lib/projects/nav";
import { recipeLabels, type RecipeLabels } from "@/lib/recipes/labels";
import {
  addRecipeItemFromRow,
  deleteRecipe,
  getRecipeWithItems,
  removeRecipeItem,
  renameRecipe,
  updateRecipeItem,
} from "@/lib/recipes/recipes";
import { parseGermanDecimal } from "@/lib/format/quantity";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackLink } from "@/components/ui/BackLink";
import { RecipeDetail, type RecipeLine } from "./RecipeDetail";
import { RecipeTitle } from "./RecipeTitle";
import { RecipeMenu } from "./RecipeMenu";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string; recipeId: string }> };

/**
 * One recipe: its lines, the trailing add row, and ⋮ Umbenennen / Löschen (spec §5).
 *
 * Member-level, like the index. The feature flag is re-checked here AND inside every action, which
 * is what makes spec §9's "feature turned off while a sheet is open" a clean 404 rather than a
 * write into a feature nobody can see any more.
 */
export default async function RecipeDetailPage({ params }: Props) {
  const { projectId, recipeId } = await params;
  const session = await auth();
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

  const recipe = await getRecipeWithItems(prisma, projectId, recipeId);
  // getRecipeWithItems already scopes by project, so a foreign id is indistinguishable from a
  // missing one — which is exactly the existence-hiding this 404 wants.
  if (!recipe) notFound();

  // Flatten the article name onto each line: a RecipeItem has no name column (spec §2).
  const lines: RecipeLine[] = recipe.items.map((item) => ({
    id: item.id,
    name: item.catalogItem.name,
    quantity: item.quantity,
    unit: item.unit,
  }));

  /**
   * The guard every action below shares: identity, membership, and the feature flag — because a
   * Server Action is an individually addressable POST endpoint that this page's render never gated.
   * Returns the project's labels so the cores can phrase their errors (ruling R4).
   */
  async function guard(): Promise<RecipeLabels> {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);
    const settings = await prisma.project.findUnique({
      where: { id: projectId },
      select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
    });
    if (!settings?.recipesEnabled) notFound();
    return recipeLabels(settings);
  }

  /** Maps a thrown domain error onto the inline form state; a non-ApiError is a real bug. */
  function toFormState(error: unknown): RecipeFormState {
    if (error instanceof ApiError) return { error: error.message, ok: false, recipeId };
    throw error;
  }

  async function addLineAction(
    _prev: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    "use server";
    const actionLabels = await guard();
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return RECIPE_FORM_IDLE; // empty submission: silent no-op

    try {
      // The SERVER parses "500 g Hackfleisch" — the row only ever sends raw text, so the split
      // rule lives in exactly one place (Task 5).
      await addRecipeItemFromRow(prisma, { projectId, recipeId, text }, actionLabels);
      revalidatePath(`/projects/${projectId}/rezepte/${recipeId}`);
      return { error: null, ok: true, recipeId };
    } catch (error) {
      return toFormState(error);
    }
  }

  async function updateLineAction(
    _prev: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    "use server";
    const actionLabels = await guard();
    const recipeItemId = String(formData.get("recipeItemId") ?? "");
    if (!recipeItemId) return RECIPE_FORM_IDLE;

    try {
      await updateRecipeItem(
        prisma,
        {
          projectId,
          recipeId,
          recipeItemId,
          // parseGermanDecimal reads "0,5" and returns null for an empty field — which is how an
          // unquantified line (Salz) is produced with no special UI (spec §7). NaN travels on
          // purpose: the core answers with the German validation message.
          quantity: parseGermanDecimal(String(formData.get("quantity") ?? "")),
          unit: String(formData.get("unit") ?? "") || null,
        },
        actionLabels,
      );
      revalidatePath(`/projects/${projectId}/rezepte/${recipeId}`);
      return { error: null, ok: true, recipeId };
    } catch (error) {
      return toFormState(error);
    }
  }

  async function removeLineAction(
    _prev: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    "use server";
    const actionLabels = await guard();
    const recipeItemId = String(formData.get("recipeItemId") ?? "");
    if (!recipeItemId) return RECIPE_FORM_IDLE;

    try {
      await removeRecipeItem(prisma, { projectId, recipeId, recipeItemId }, actionLabels);
      revalidatePath(`/projects/${projectId}/rezepte/${recipeId}`);
      return { error: null, ok: true, recipeId };
    } catch (error) {
      return toFormState(error);
    }
  }

  /**
   * Renames the recipe and returns only an expected German domain error to the client wrapper.
   *
   * This is not a useActionState action because InlineEdit is not a form. RecipeTitle keeps this
   * compact result in local state and passes it to InlineEdit's existing inline error boundary.
   */
  async function renameAction(name: string): Promise<string | null> {
    "use server";
    const actionLabels = await guard();
    const trimmed = name.trim();
    if (!trimmed) return null; // InlineEdit already refuses an empty value; belt and braces.

    try {
      await renameRecipe(prisma, { projectId, recipeId, name: trimmed }, actionLabels);
      // The index lists this name too, so the whole subtree revalidates.
      revalidatePath(`/projects/${projectId}/rezepte`, "layout");
      return null;
    } catch (error) {
      // ApiError messages are intentionally German and user-safe; unexpected failures still crash
      // so an infrastructure bug cannot masquerade as a validation result.
      if (error instanceof ApiError) return error.message;
      throw error;
    }
  }

  async function deleteAction() {
    "use server";
    const actionLabels = await guard();
    await deleteRecipe(prisma, { projectId, recipeId }, actionLabels);
    revalidatePath(`/projects/${projectId}/rezepte`, "layout");
    // There is nothing left to render here, so the user goes back to the index.
    redirect(`/projects/${projectId}/rezepte`);
  }

  return (
    <>
      <PageHeader
        // Empty title, exactly like the list screen (page.tsx:347): PageHeader's `title` is a
        // STRING, so an editable name cannot go there. The empty <h1> acts as a flex spacer and
        // the real, inline-editable name rides in `leading` next to the back arrow.
        title=""
        // A BackLink, not the drawer trigger: this screen is one level below /rezepte, and the
        // drawer is reachable from there.
        leading={
          <>
            <BackLink
              href={`/projects/${projectId}/rezepte`}
              // BackLink REQUIRES a German accessible name — composed, never hardcoded (spec §4).
              label={`Zu den ${labels.plural}`}
            />
            <RecipeTitle name={recipe.name} renameAction={renameAction} labels={labels} />
          </>
        }
        trailing={
          <RecipeMenu recipeName={recipe.name} labels={labels} deleteAction={deleteAction} />
        }
      />
      <main className={styles.content}>
        <RecipeDetail
          projectId={projectId}
          recipeId={recipeId}
          lines={lines}
          labels={labels}
          addLineAction={addLineAction}
          updateLineAction={updateLineAction}
          removeLineAction={removeLineAction}
        />
      </main>
    </>
  );
}
