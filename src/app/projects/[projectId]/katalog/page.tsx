import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { requireMembership } from "@/lib/projects/guard";
import {
  createCatalogArticle,
  deleteCatalogArticle,
  listCatalog,
  updateCatalogArticle,
} from "@/lib/catalog/manage";
import { formatArticleCount } from "@/lib/format/plural";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { CatalogBrowser } from "./CatalogBrowser";
import { CATALOG_FORM_IDLE, type CatalogFormState } from "./formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * Turns a thrown domain error into the inline form state the screen renders.
 *
 * Only ApiError carries user-facing German copy. Anything else is a real bug and
 * is re-thrown on purpose: a crash disguised as a validation message next to a
 * text field is the worst of both worlds.
 */
function toFormState(error: unknown, articleId: string | null): CatalogFormState {
  if (error instanceof ApiError) {
    return { error: error.message, ok: false, createdId: null, articleId };
  }
  throw error;
}

/**
 * The Katalog screen (handoff § 8) — the project's memory, made visible.
 *
 * Server Component: it reads the session and calls the domain layer directly, no
 * HTTP round-trip (the pattern from every other screen in this app). This slice
 * ships NO REST endpoints for catalog management: the catalog screen is never
 * polled and never merged offline, so the reason lists have an operations API
 * does not apply. src/lib/catalog/manage.ts stays the seam if one is ever needed.
 */
export default async function CatalogPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route, so user.id is safe.
  const userId = session!.user.id;

  // A non-member must not learn that this project exists — same redirect as the
  // project detail page rather than an error screen.
  try {
    await requireMembership(prisma, projectId, userId);
  } catch {
    redirect("/projects");
  }

  const articles = await listCatalog(prisma, projectId);

  // --- Server Actions ---------------------------------------------------------
  // Both re-derive identity and re-check membership: a Server Action is an
  // individually addressable POST endpoint, so a crafted request could reach it
  // without ever rendering this page. Catalog upkeep is member-level (MVP design
  // § 6), so requireMembership — not requireOwner — is the right guard.
  // Both RETURN their error instead of throwing, because useActionState is what
  // puts the message inline on the field that caused it.

  async function createArticleAction(
    _prev: CatalogFormState,
    formData: FormData,
  ): Promise<CatalogFormState> {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const name = String(formData.get("name") ?? "").trim();
    // Empty submission: silent no-op, the convention every other form here uses.
    if (!name) return CATALOG_FORM_IDLE;

    try {
      const created = await createCatalogArticle(prisma, { projectId, name });
      revalidatePath(`/projects/${projectId}/katalog`);
      // createdId is what makes the browser open the new article's panel.
      return { error: null, ok: true, createdId: created.id, articleId: created.id };
    } catch (error) {
      return toFormState(error, null);
    }
  }

  async function editArticleAction(
    _prev: CatalogFormState,
    formData: FormData,
  ): Promise<CatalogFormState> {
    "use server";
    const s = await auth();
    await requireMembership(prisma, projectId, s!.user.id);

    const catalogItemId = String(formData.get("catalogItemId") ?? "");
    if (!catalogItemId) return CATALOG_FORM_IDLE;

    try {
      // One action, two intents — the submit button's name/value decides. Both
      // hit the same article, so they share the guard and the result shape.
      if (formData.get("intent") === "delete") {
        await deleteCatalogArticle(prisma, { projectId, catalogItemId });
      } else {
        await updateCatalogArticle(prisma, {
          projectId,
          catalogItemId,
          name: String(formData.get("name") ?? ""),
          // Empty strings are meaningful here: they CLEAR the default (see
          // updateCatalogArticle), which is why they are not filtered out.
          category: String(formData.get("category") ?? ""),
          unit: String(formData.get("unit") ?? ""),
        });
      }
      revalidatePath(`/projects/${projectId}/katalog`);
      return { error: null, ok: true, createdId: null, articleId: catalogItemId };
    } catch (error) {
      return toFormState(error, catalogItemId);
    }
  }

  return (
    <>
      <PageHeader
        title="Katalog"
        // Slice 11 replaces this back link with the ☰ drawer trigger; the slot is
        // the same one, which is why it exists.
        leading={
          <Link href={`/projects/${projectId}`} aria-label="Zum Projekt" className={styles.back}>
            <Icon icon={ChevronLeft} size={19} />
          </Link>
        }
        trailing={<span className={styles.count}>{formatArticleCount(articles.length)}</span>}
      />
      <main className={styles.content}>
        <CatalogBrowser
          articles={articles}
          createAction={createArticleAction}
          editAction={editArticleAction}
        />
      </main>
    </>
  );
}
