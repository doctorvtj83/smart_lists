import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { requireOwner } from "@/lib/projects/guard";
import { getProjectNav } from "@/lib/projects/nav";
import { updateRecipeSettings } from "@/lib/projects/settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { RecipeSettingsForm } from "./RecipeSettingsForm";
import { type SettingsFormState } from "./formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The project settings screen (spec §4) — OWNER-ONLY, unlike every other project screen.
 *
 * Why owner-only: this configures the project itself (which features it has, what they are called),
 * which is the same class of decision as renaming or deleting it. Members configure CONTENT —
 * lists, catalog, favourites, recipes — and that stays member-level.
 *
 * A member who reaches this URL is redirected to the project rather than shown a 403 screen: they
 * are allowed to know the project exists, they just have nothing to do here.
 */
export default async function ProjectSettingsPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects"); // non-member / unknown / malformed alike
  if (nav.role !== "owner") redirect(`/projects/${projectId}`);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
  });
  if (!project) redirect("/projects");

  /**
   * Saves the whole recipes section in one action.
   *
   * It re-derives identity and re-checks OWNERSHIP: a Server Action is an individually addressable
   * POST endpoint, so a member could reach it without this page ever rendering for them. The guard
   * on the render is not a guard on the action (the defense-in-depth rule this codebase applies
   * everywhere).
   */
  async function saveAction(
    _prev: SettingsFormState,
    formData: FormData,
  ): Promise<SettingsFormState> {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);

    try {
      await updateRecipeSettings(prisma, projectId, {
        // The hidden input carries the client-side switch; anything but "on" is off.
        recipesEnabled: formData.get("recipesEnabled") === "on",
        recipeLabelSingular: String(formData.get("recipeLabelSingular") ?? ""),
        recipeLabelPlural: String(formData.get("recipeLabelPlural") ?? ""),
      });
      // The nav entry appears or disappears with the flag, and it is rendered by the LAYOUT — so
      // the whole project subtree has to revalidate, not just this page.
      revalidatePath(`/projects/${projectId}`, "layout");
      return { error: null, ok: true };
    } catch (error) {
      // Only ApiError carries user-facing German copy. Anything else is a real bug and is
      // re-thrown on purpose — a crash disguised as a validation message is the worst of both.
      if (error instanceof ApiError) return { error: error.message, ok: false };
      throw error;
    }
  }

  return (
    <>
      <PageHeader title="Einstellungen" leading={<DrawerTrigger />} />
      <main className={styles.content}>
        <SectionLabel>Funktionen</SectionLabel>
        <RecipeSettingsForm
          recipesEnabled={project.recipesEnabled}
          recipeLabelSingular={project.recipeLabelSingular}
          recipeLabelPlural={project.recipeLabelPlural}
          saveAction={saveAction}
        />
      </main>
    </>
  );
}
