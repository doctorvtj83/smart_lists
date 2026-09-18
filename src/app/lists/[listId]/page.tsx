import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { ArrowLeft, Check } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { getCatalogVocabulary } from "@/lib/catalog/vocabulary";
import { formatApplyResult } from "@/lib/format/plural";
import { requireListAccess } from "@/lib/lists/access";
import { applyRecipesToList, type RecipeSelection } from "@/lib/recipes/apply";
import { buildRecipeFromEntries, type DerivableEntry } from "@/lib/recipes/build";
import { createRecipeFromList } from "@/lib/recipes/derive";
import { recipeLabels } from "@/lib/recipes/labels";
import { listRecipes } from "@/lib/recipes/recipes";
import {
  allItemsChecked,
  completeList,
  deleteList,
  getListWithItems,
  renameList,
  reopenList,
} from "@/lib/lists/lists";
import { addEntryFromRow } from "@/lib/lists/addEntry";
import { knownCategories } from "@/lib/lists/categories";
import { computeCursor } from "@/lib/lists/delta";
import {
  applyOperation,
  assertValidUpdateItemValue,
  type UpdateItemOperation,
} from "@/lib/lists/operations";
import { formatGermanDate } from "@/lib/format/date";
import { parseGermanDecimal } from "@/lib/format/quantity";
import { Banner } from "@/components/ui/Banner";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import ListSyncPoller from "./ListSyncPoller";
import { ListBody } from "./ListBody";
import { ListMenu } from "./ListMenu";
import { ListTitle } from "./ListTitle";
import type { ListEntry } from "./EntryRow";
import { APPLY_FORM_IDLE, DERIVE_FORM_IDLE, ENTRY_FORM_IDLE, type ApplyFormState, type DeriveFormState, type EntryFormState } from "./formState";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components — must be awaited.
type Props = { params: Promise<{ listId: string }> };

/**
 * Turns a thrown domain error into the inline state the entry sheet renders.
 *
 * Only ApiError carries user-facing German copy. Anything else is a real bug and
 * is re-thrown on purpose: a crash disguised as a validation message next to a
 * text field is the worst of both worlds. (Same helper shape as the Katalog screen.)
 *
 * itemId scopes the error to the entry that produced it (Task 10 / CatalogBrowser's
 * articleId pattern) — without it a failed save would paint onto the next open sheet.
 */
function toEntryFormState(error: unknown, itemId: string | null): EntryFormState {
  if (error instanceof ApiError) {
    // merge: null — a failed operation merged nothing.
    return { error: error.message, ok: false, openEntryId: null, itemId, merge: null };
  }
  throw error;
}

/**
 * The list screen (handoff §10) — the core screen of the product.
 *
 * Server Component: it reads the session and calls the domain layer directly, no
 * HTTP round-trip. Everything interactive lives in `ListBody`, which receives
 * these Server Actions as props — so the mutation model (entry-level operations
 * through `applyOperation`) stays entirely server-owned, exactly as it was
 * before this slice replaced the add form.
 *
 * Slice 12 changed the interaction, not the data flow: `ListSyncPoller` below is
 * untouched, and its `router.refresh()` still re-pulls server truth. That works
 * because `router.refresh()` preserves client component state — `ListBody` keeps
 * its active chip and its half-typed entry while the entries around it change.
 */
export default async function ListDetailPage({ params }: Props) {
  const { listId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route; user.id is safe to assert.
  const userId = session!.user.id;

  // Guard: same rule as the REST routes. requireListAccess throws (404-style) for
  // non-members, unknown ids and malformed ids — all of them land back on the
  // projects overview. We KEEP its result: it carries projectId, which the
  // catalog read needs (no second list lookup).
  let projectId: string;
  try {
    ({
      list: { projectId },
    } = await requireListAccess(prisma, listId, userId));
  } catch {
    redirect("/projects");
  }

  // Two independent reads → Promise.all: one round-trip of latency, not two.
  const [list, vocabulary] = await Promise.all([
    getListWithItems(prisma, listId),
    // The category chips and the parser's unit vocabulary — two short string
    // arrays. Before Slice 8 this read the whole catalog (CATALOG_DATALIST_LIMIT)
    // because the dropdown filtered it in the browser; the dropdown now fetches
    // per keystroke, so the rows themselves have no reader here any more.
    getCatalogVocabulary(prisma, projectId),
  ]);
  // Deleted between guard and read (rare race) — same redirect as an unknown list.
  if (!list) redirect("/projects");

  // The recipes feature is opt-in per project (spec §4), and this route sits OUTSIDE the project
  // layout, so it reads the two settings columns itself rather than through getProjectNav.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
  });
  const recipesEnabled = project?.recipesEnabled ?? false;
  const labels = project ? recipeLabels(project) : null;
  // Only read the recipes when there is a menu entry that could use them — an off project pays
  // nothing for a feature it never enabled.
  const recipes = recipesEnabled ? await listRecipes(prisma, projectId) : [];

  // Flatten to the client shape. The display NAME lives on the catalog item
  // (article identity, MVP design §3.1), so it is resolved here — the same
  // mapping the delta endpoint does for the wire.
  const entries: ListEntry[] = list.items.map((item) => ({
    id: item.id,
    name: item.catalogItem.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    checked: item.checked,
  }));

  // What the derive sheet needs: the article IDENTITY as well as the display name, because a
  // recipe line references the article, not the text (spec §2).
  const derivableEntries: DerivableEntry[] = list.items.map((item) => ({
    id: item.id,
    catalogItemId: item.catalogItemId,
    name: item.catalogItem.name,
    quantity: item.quantity,
    unit: item.unit,
  }));

  // The entry sheet's chips: what the catalog remembers ∪ what this list uses.
  const categories = knownCategories(
    vocabulary.categories,
    entries.map((entry) => entry.category),
  );

  // Sync baseline for the poller (Slice 7): the cursor (newest entry updatedAt)
  // and the id set AS RENDERED. computeCursor is the SAME function the delta
  // endpoint uses, so the client starts from a cursor consistent with the
  // server's — any change between this render and the first poll is seen.
  const initialCursor = computeCursor(list.items);
  const initialItemIds = list.items.map((item) => item.id);

  // Completion UI state. Both are derived, not stored (MVP design §4.6).
  const isCompleted = list.status === "completed";
  const suggestComplete = !isCompleted && allItemsChecked(list.items);

  // --- Server Actions ---------------------------------------------------------
  // Each re-derives identity and re-runs the guard (defense in depth: a Server
  // Action is an individually addressable POST endpoint). Every entry mutation
  // goes through applyOperation — the SAME operations core as the REST endpoint,
  // so the mutation model holds no matter the transport.

  /** The trailing row. Returns state so an invalid name lands inline. */
  async function addEntryAction(
    _prev: EntryFormState,
    formData: FormData,
  ): Promise<EntryFormState> {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const itemId = String(formData.get("itemId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    // Empty submission: silent no-op, the convention every form in this app uses.
    if (!itemId || !name) return ENTRY_FORM_IDLE;

    // An ABSENT category field means „Alle" is active → inherit the catalog
    // default. A present one is the active chip (possibly „Ohne Kategorie").
    const rawCategory = formData.get("category");
    const activeCategory = rawCategory === null ? null : String(rawCategory);

    try {
      const { item, needsCategory, merge } = await addEntryFromRow(prisma, l, {
        itemId,
        name,
        activeCategory,
      });
      revalidatePath(`/lists/${listId}`);
      // The design's rule: a brand-new article with no category opens its sheet. A merge never
      // does — the row already existed and already carries whatever category it has.
      return {
        error: null,
        ok: true,
        openEntryId: needsCategory ? item.id : null,
        itemId: item.id,
        // Slice 17: non-null when this add flowed into an existing row, so the body can say so.
        merge,
      };
    } catch (error) {
      return toEntryFormState(error, itemId);
    }
  }

  /**
   * The entry sheet's „Fertig". ONE update_item per changed field — the field
   * granularity Slice 7's per-field last-writer-wins depends on. A field the
   * sheet did not send is not touched, so a concurrent remote edit survives.
   *
   * Validate-then-apply: parse and assert EVERY provided field before the first
   * write. Applying in sequence without that gate left a partial update (and no
   * revalidate) when a later field failed after an earlier one had already
   * committed — the same "check meaning before mutating" rule add_item uses
   * inside applyOperation, lifted to the multi-op action.
   */
  async function updateEntryAction(
    _prev: EntryFormState,
    formData: FormData,
  ): Promise<EntryFormState> {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const itemId = String(formData.get("itemId") ?? "");
    if (!itemId) return ENTRY_FORM_IDLE;

    try {
      // Presence, not truthiness: "" is a meaningful value here — it CLEARS the
      // field, which is a legal update_item value (null on the column).
      const pending: UpdateItemOperation[] = [];
      if (formData.has("quantity")) {
        pending.push({
          op: "update_item",
          itemId,
          field: "quantity",
          // NaN survives on purpose: assertValidUpdateItemValue answers with the
          // German „Menge muss eine positive Zahl sein" rather than silently clearing.
          value: parseGermanDecimal(String(formData.get("quantity"))),
        });
      }
      if (formData.has("unit")) {
        pending.push({
          op: "update_item",
          itemId,
          field: "unit",
          value: String(formData.get("unit")).trim() || null,
        });
      }
      if (formData.has("category")) {
        pending.push({
          op: "update_item",
          itemId,
          field: "category",
          value: String(formData.get("category")).trim() || null,
        });
      }

      // Fail closed before any write so one bad field cannot leave siblings committed.
      for (const op of pending) {
        assertValidUpdateItemValue(op.field, op.value);
      }
      for (const op of pending) {
        await applyOperation(prisma, l, op);
      }
      revalidatePath(`/lists/${listId}`);
      return { error: null, ok: true, openEntryId: null, itemId, merge: null };
    } catch (error) {
      return toEntryFormState(error, itemId);
    }
  }

  /** The check circle. Carries the TARGET state, so replaying it is idempotent. */
  async function checkEntryAction(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const itemId = String(formData.get("itemId") ?? "");
    if (!itemId) return;

    await applyOperation(prisma, l, {
      op: "check_item",
      itemId,
      checked: String(formData.get("checked")) === "true",
    });
    revalidatePath(`/lists/${listId}`);
    // The project screen prints "N offen" per list and the drawer badge counts
    // active lists — both live above this route, so "layout" scope is required.
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /** Swipe-to-delete and the sheet's „Eintrag löschen". Idempotent by design. */
  async function removeEntryAction(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const itemId = String(formData.get("itemId") ?? "");
    if (!itemId) return;

    await applyOperation(prisma, l, { op: "remove_item", itemId });
    revalidatePath(`/lists/${listId}`);
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /** Complete the list — from the ⋮ menu or the all-checked banner. Idempotent. */
  async function completeListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await completeList(prisma, l.id);
    revalidatePath(`/lists/${listId}`);
    // The list leaves the project's active list and enters the archive.
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /** Reopen — the "undo" of completion (MVP design §4.6, "mit Undo"). */
  async function reopenListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await reopenList(prisma, l.id);
    revalidatePath(`/lists/${listId}`);
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /**
   * F3 fix: inline rename, member-level (MVP design §6 groups list rename with
   * create/complete/delete — all ✓ for Mitglied — unlike the project's name,
   * which is owner-only). `renameList`/`PATCH /api/lists/[listId]` already
   * existed and were tested; only the UI wiring was missing.
   */
  async function renameListAction(name: string) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);

    const trimmed = name.trim();
    if (!trimmed) return;

    await renameList(prisma, l.id, trimmed);
    revalidatePath(`/lists/${listId}`);
    // The project screen's AKTIVE LISTEN row shows this list by name and lives
    // above this route — "layout" scope, same reasoning as checkEntryAction.
    revalidatePath(`/projects/${l.projectId}`, "layout");
  }

  /**
   * The guard the recipe actions share: identity, list access (which resolves membership) and the
   * feature flag. A Server Action is an individually addressable POST endpoint that this page's
   * render never gated, so disabling recipes while a sheet is open must turn its next submit into
   * a 404 (spec §9).
   */
  async function requireRecipeAccess() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    const settings = await prisma.project.findUnique({
      where: { id: l.projectId },
      select: { recipesEnabled: true, recipeLabelSingular: true, recipeLabelPlural: true },
    });
    if (!settings?.recipesEnabled) notFound();
    return { list: l, labels: recipeLabels(settings) };
  }

  /** „Rezept hinzufügen“: applies the picker's selection. Member-level. */
  async function applyRecipesAction(
    _prev: ApplyFormState,
    formData: FormData,
  ): Promise<ApplyFormState> {
    "use server";
    const { list: l, labels: actionLabels } = await requireRecipeAccess();

    // Ruling R2: a missing token still applies, it is just not retry-safe. Never a 400 the user
    // cannot act on.
    const token = String(formData.get("applyToken") ?? "") || randomUUID();

    // „<recipeId>:<count>“ — a UUID contains no colon, so the first one is the separator.
    const selections: RecipeSelection[] = formData.getAll("selection").map((raw) => {
      const value = String(raw);
      const separator = value.indexOf(":");
      return {
        recipeId: value.slice(0, separator),
        // NaN survives deliberately: assertValidRecipeCount answers with the German
        // „Anzahl muss zwischen 1 und 99 liegen“ rather than a second, drifting rule here.
        count: Number(value.slice(separator + 1)),
      };
    });
    // Empty submission: silent no-op, the convention every form in this app uses.
    if (selections.length === 0) return APPLY_FORM_IDLE;

    try {
      const result = await applyRecipesToList(prisma, l, selections, token, actionLabels);
      revalidatePath(`/lists/${listId}`);
      // The project screen prints „N offen“ per list — it lives above this route.
      revalidatePath(`/projects/${l.projectId}`, "layout");
      return {
        error: null,
        ok: true,
        message: formatApplyResult(result.applied, result.added, result.merged),
      };
    } catch (error) {
      // Only ApiError carries user-facing German copy; anything else is a real bug and must not be
      // disguised as a validation message (the same rule as toEntryFormState above).
      if (error instanceof ApiError) return { error: error.message, ok: false, message: null };
      throw error;
    }
  }

  /** „Rezept aus Liste anlegen“: turns the ticked rows into a new recipe. Member-level. */
  async function createRecipeFromListAction(
    _prev: DeriveFormState,
    formData: FormData,
  ): Promise<DeriveFormState> {
    "use server";
    const { list: l, labels: actionLabels } = await requireRecipeAccess();

    // The render-time check is not authorization for a Server Action: a list reopened in another
    // tab must not produce a recipe from quantities that are being shopped again (ruling R9).
    if (l.status !== "completed") {
      return { error: "Die Liste ist nicht abgeschlossen", ok: false, createdName: null, lineCount: 0 };
    }

    const name = String(formData.get("name") ?? "").trim();
    // Empty submission: silent no-op, the convention every form in this app uses.
    if (!name) return DERIVE_FORM_IDLE;

    const entryIds = formData.getAll("entryId").map((value) => String(value));

    try {
      // Read the entries FRESH: the ones rendered into the sheet may be minutes old, and the
      // builder's duplicate check has to run against what the list actually holds.
      const fresh = await getListWithItems(prisma, l.id);
      if (!fresh) return DERIVE_FORM_IDLE;

      const lines = buildRecipeFromEntries(
        fresh.items.map((item) => ({
          id: item.id,
          catalogItemId: item.catalogItemId,
          name: item.catalogItem.name,
          quantity: item.quantity,
          unit: item.unit,
        })),
        entryIds.map((entryId) => ({
          entryId,
          // NaN travels on purpose: the builder answers with the German „Menge muss eine positive
          // Zahl sein" rather than a second validation rule here (see quantity.ts).
          quantity: parseGermanDecimal(String(formData.get(`quantity:${entryId}`) ?? "")),
          unit: String(formData.get(`unit:${entryId}`) ?? "") || null,
        })),
      );

      const recipe = await createRecipeFromList(
        prisma,
        { projectId: l.projectId, name, lines },
        actionLabels,
      );
      // The recipe index lives under the project layout and now has one row more.
      revalidatePath(`/projects/${l.projectId}/rezepte`);
      return { error: null, ok: true, createdName: recipe.name, lineCount: lines.length };
    } catch (error) {
      // Only ApiError carries user-facing German copy; anything else is a real bug and must not be
      // disguised as a validation message (the same rule as toEntryFormState above).
      if (error instanceof ApiError) {
        return { error: error.message, ok: false, createdName: null, lineCount: 0 };
      }
      throw error;
    }
  }

  /** Delete the whole list (member-level per the permission matrix). */
  async function deleteListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await deleteList(prisma, l.id);
    // redirect() throws internally — do not wrap it in try/catch.
    redirect(`/projects/${l.projectId}`);
  }

  return (
    <div className={[styles.screen, isCompleted ? styles.frozen : ""].filter(Boolean).join(" ")}>
      {/* Slice 7 background sync: renders nothing. Every ~2s it asks the delta
          endpoint whether the list changed (another member's edit, a deletion, a
          rename/completion) and, if so, refreshes this server component to show
          the merged truth. Server-side LWW already resolved conflicts. */}
      <ListSyncPoller
        listId={listId}
        initialCursor={initialCursor}
        initialItemIds={initialItemIds}
        initialList={{
          name: list.name,
          status: list.status,
          completedAt: list.completedAt ? list.completedAt.getTime() : null,
        }}
      />

      <PageHeader
        // F3 fix, same trick as the project page's PageHeader (see ProjectTitle):
        // an empty title lets the flex:1 <h1> act as a spacer, and the actual
        // (editable) name moves into `leading`, next to the back arrow.
        title=""
        // No drawer here: /lists/[listId] sits outside the project layout, so
        // handoff §10's back arrow is the navigation (see the plan's scope note).
        leading={
          <>
            <Link href={`/projects/${list.projectId}`} className={styles.back} aria-label="Zum Projekt">
              <Icon icon={ArrowLeft} size={18} />
            </Link>
            <ListTitle name={list.name} renameAction={renameListAction} />
          </>
        }
        trailing={
          <ListMenu
            listName={list.name}
            isCompleted={isCompleted}
            completeAction={completeListAction}
            deleteAction={deleteListAction}
            // Ruling R8: no entry at all unless the feature is on AND there is something to pick.
            recipeApply={
              recipesEnabled && labels && recipes.length > 0
                ? { labels, recipes, applyAction: applyRecipesAction }
                : undefined
            }
            recipeDerive={
              recipesEnabled && labels
                ? {
                    labels,
                    entries: derivableEntries,
                    units: vocabulary.units,
                    createAction: createRecipeFromListAction,
                  }
                : undefined
            }
          />
        }
      />

      {/* „Bewusst leise, kein Konfetti": one quiet banner, never both. */}
      {isCompleted ? (
        <div className={styles.banner}>
          <Banner
            tone="success"
            icon={<Icon icon={Check} size={14} />}
            action={
              <form action={reopenListAction}>
                <button type="submit" className={styles.bannerAction}>
                  Wieder öffnen
                </button>
              </form>
            }
          >
            {list.completedAt
              ? `Abgeschlossen am ${formatGermanDate(list.completedAt)}`
              : "Abgeschlossen"}
          </Banner>
        </div>
      ) : (
        suggestComplete && (
          <div className={styles.banner}>
            <Banner
              tone="info"
              icon={<Icon icon={Check} size={14} />}
              action={
                <form action={completeListAction}>
                  <button type="submit" className={styles.bannerAction}>
                    Abschließen
                  </button>
                </form>
              }
            >
              Alle Einträge sind abgehakt.
            </Banner>
          </div>
        )
      )}

      <ListBody
        entries={entries}
        projectId={projectId}
        units={vocabulary.units}
        categories={categories}
        frozen={isCompleted}
        addAction={addEntryAction}
        updateAction={updateEntryAction}
        checkAction={checkEntryAction}
        removeAction={removeEntryAction}
      />
    </div>
  );
}
