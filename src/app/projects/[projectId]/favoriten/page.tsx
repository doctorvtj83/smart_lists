import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getProjectNav } from "@/lib/projects/nav";
import { requireMembership } from "@/lib/projects/guard";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/favorites/favorites";
import { getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { CATALOG_DATALIST_LIMIT, searchCatalog } from "@/lib/catalog/search";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { FavoritesEditor } from "./FavoritesEditor";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The Favoriten screen (handoff screen 3g) — the always-suggested half of the
 * pre-fill set, moved out of the old six-in-one project screen.
 *
 * Member-level throughout: favourites and catalog upkeep are allowed for every
 * member (permission matrix, MVP design § 6), so both actions use
 * requireMembership rather than requireOwner.
 */
export default async function FavoritesPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  // Two independent reads → one round-trip of latency. CATALOG_DATALIST_LIMIT
  // (not searchCatalog's short default) seeds the Autocomplete catalog; the
  // browser filters that array with buildAutocomplete on every keystroke.
  const [favorites, catalogItems] = await Promise.all([
    listFavorites(prisma, projectId),
    searchCatalog(prisma, projectId, "", CATALOG_DATALIST_LIMIT),
  ]);

  /**
   * Favourites by NAME, not by id: it is friendlier, and it lets a member
   * favourite an article nobody has listed yet — getOrCreateCatalogItem resolves
   * the name to the project's catalog row (creating it on first use), then
   * addFavorite pins it.
   */
  async function addFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions (the convention across this app).

    const catalogItem = await getOrCreateCatalogItem(prisma, { projectId, name });
    await addFavorite(prisma, { projectId, catalogItemId: catalogItem.id });
    revalidatePath(`/projects/${projectId}/favoriten`);
  }

  /** Idempotent: removeFavorite tolerates an already-missing row. */
  async function removeFavoriteAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const catalogItemId = String(formData.get("catalogItemId") ?? "");
    if (!catalogItemId) return;

    await removeFavorite(prisma, { projectId, catalogItemId });
    revalidatePath(`/projects/${projectId}/favoriten`);
  }

  return (
    <>
      <PageHeader title="Favoriten" leading={<DrawerTrigger />} />
      <main className={styles.content}>
        <FavoritesEditor
          favorites={favorites}
          // The whole catalog row, not just the name: the dropdown shows each
          // article's default category as its sub-label.
          articles={catalogItems}
          addAction={addFavoriteAction}
          removeAction={removeFavoriteAction}
        />
      </main>
    </>
  );
}
