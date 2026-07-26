import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { CATALOG_DATALIST_LIMIT, searchCatalog } from "@/lib/catalog/search";
import { prisma } from "@/lib/db";
import { requireListAccess } from "@/lib/lists/access";
import {
  allItemsChecked,
  completeList,
  deleteList,
  getListWithItems,
  type ListWithItems,
  reopenList,
} from "@/lib/lists/lists";
import { computeCursor } from "@/lib/lists/delta";
import { applyOperation } from "@/lib/lists/operations";
import ListSyncPoller from "./ListSyncPoller";

// Next.js 16: dynamic route params are a Promise in server components — must be awaited.
type Props = { params: Promise<{ listId: string }> };

// Groups the (sortIndex-ordered) items by category for display — the MVP's "group by category"
// view (MVP design §2). Pure presentation helper: the persisted order stays sortIndex; grouping
// happens at render time. Uncategorized entries collect under the German label "Ohne Kategorie".
function groupByCategory(items: ListWithItems["items"]) {
  const groups = new Map<string, ListWithItems["items"]>();
  for (const item of items) {
    const key = item.category ?? "Ohne Kategorie";
    // Map preserves insertion order, so categories appear in the order of their first item —
    // deterministic and stable without inventing a category-sorting rule (YAGNI for the MVP).
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

// Server Component: renders the list with its entries and the entry forms.
// Protects itself via requireListAccess; non-members / unknown lists are redirected to /projects.
export default async function ListDetailPage({ params }: Props) {
  const { listId } = await params;
  const session = await auth();
  // middleware.ts guarantees a session on this route; user.id is safe to assert.
  const userId = session!.user.id;

  // Guard: same rule as the REST routes. requireListAccess throws (404-style) for non-members,
  // unknown ids, and malformed ids — all of them land back on the projects overview. We KEEP its
  // result this time: it carries projectId, which the catalog read needs (no second list lookup).
  let projectId: string;
  try {
    ({ list: { projectId } } = await requireListAccess(prisma, listId, userId));
  } catch {
    redirect("/projects");
  }

  // Load the list (with items) and the project's catalog suggestions in parallel. The suggestions
  // populate the <datalist> below, giving the name input native autocomplete with zero client JS.
  const [list, suggestions] = await Promise.all([
    getListWithItems(prisma, listId),
    // "" = browse mode: render the whole catalog into the <datalist>. We pass the larger
    // CATALOG_DATALIST_LIMIT (not searchCatalog's short default) because a native datalist filters
    // client-side over exactly these options — anything not pre-rendered is never suggested, so the
    // browse must not be capped at the per-keystroke endpoint's 20. See CATALOG_DATALIST_LIMIT.
    searchCatalog(prisma, projectId, "", CATALOG_DATALIST_LIMIT),
  ]);
  // Deleted between guard and read (rare race) — same redirect as an unknown list.
  if (!list) redirect("/projects");

  const groups = groupByCategory(list.items);

  // Sync baseline for the poller (Slice 7): the cursor (newest entry updatedAt) and the id set AS
  // RENDERED. computeCursor is the SAME function the delta endpoint uses, so the client starts from a
  // cursor consistent with the server's — any change between this render and the first poll is seen.
  const initialCursor = computeCursor(list.items);
  const initialItemIds = list.items.map((item) => item.id);

  // Completion UI state. `isCompleted` switches the banner between "abschließen" and "wieder öffnen".
  // `suggestComplete` is the auto-suggest trigger: all entries checked on a still-open list — the
  // cue to prompt the user to finish it (MVP design §4.6). Both are derived, not stored.
  const isCompleted = list.status === "completed";
  const suggestComplete = !isCompleted && allItemsChecked(list.items);

  // --- Server actions. Each re-derives identity and re-runs the guard (defense in depth:
  // server actions are individually addressable POST endpoints, exactly like in Slice 2), and
  // every entry mutation goes through applyOperation — the SAME operations core as the REST
  // endpoint, so the mutation model is enforced no matter the transport. ---

  // Add an entry. The action generates the client UUID (the server action IS the client here;
  // the browser-side PWA client of a later slice will generate ids itself — same contract).
  async function addItem(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return; // Ignore empty submissions.
    // Optional quantity: empty input -> undefined (not sent), otherwise parse the decimal.
    // German keyboards produce "1,5" — accept the comma as decimal separator.
    const quantityRaw = String(formData.get("quantity") ?? "").trim().replace(",", ".");
    const quantity = quantityRaw ? Number(quantityRaw) : undefined;
    const unit = String(formData.get("unit") ?? "").trim() || undefined;
    const category = String(formData.get("category") ?? "").trim() || undefined;
    await applyOperation(prisma, l, {
      op: "add_item",
      itemId: randomUUID(), // stable entry identity, generated caller-side by convention
      name,
      quantity,
      unit,
      category,
    });
    revalidatePath(`/lists/${listId}`);
  }

  // Check/uncheck an entry. The form carries the TARGET state (not a toggle) — matching the
  // idempotent check_item semantics (replaying the action leaves the same state).
  async function toggleItem(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    const itemId = String(formData.get("itemId") ?? "");
    const checked = String(formData.get("checked") ?? "") === "true";
    if (!itemId) return;
    await applyOperation(prisma, l, { op: "check_item", itemId, checked });
    revalidatePath(`/lists/${listId}`);
  }

  // Remove an entry (idempotent: removing an already-removed entry is a no-op).
  async function removeItem(formData: FormData) {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    const itemId = String(formData.get("itemId") ?? "");
    if (!itemId) return;
    await applyOperation(prisma, l, { op: "remove_item", itemId });
    revalidatePath(`/lists/${listId}`);
  }

  // Complete the list (member-level). Manual completion AND the auto-suggest prompt both submit
  // this action (MVP design §4.6). completeList is idempotent, so a double submit is harmless.
  async function completeListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await completeList(prisma, l.id);
    revalidatePath(`/lists/${listId}`);
  }

  // Reopen the list — the "undo" of completion (MVP design §4.6, "mit Undo"). Member-level.
  async function reopenListAction() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await reopenList(prisma, l.id);
    revalidatePath(`/lists/${listId}`);
  }

  // Delete the whole list (member-level per the permission matrix), then back to the project.
  async function removeList() {
    "use server";
    const s = await auth();
    const { list: l } = await requireListAccess(prisma, listId, s!.user.id);
    await deleteList(prisma, l.id);
    // redirect() throws internally — do not wrap it in try/catch.
    redirect(`/projects/${l.projectId}`);
  }

  return (
    <main style={{ padding: 24 }}>
      {/* Slice 7 background sync: renders nothing. Every ~2s it asks the delta endpoint whether the
          list changed (another member's edit, a deletion, a rename/completion) and, if so, refreshes
          this server component to show the merged truth. Server-side LWW already resolved conflicts. */}
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
      {/* Back-link to the owning project for basic navigation. */}
      <p>
        <Link href={`/projects/${list.projectId}`}>← Zum Projekt</Link>
      </p>
      <h1>{list.name}</h1>

      {/* Completion controls (Slice 6, MVP design §4.6). A completed list shows an archive banner +
          undo; an open list shows the manual "abschließen" button, preceded by an auto-suggest
          prompt once every entry is checked. */}
      {isCompleted ? (
        <section>
          <p>
            ✓ Abgeschlossen
            {list.completedAt ? ` am ${list.completedAt.toLocaleDateString("de-DE")}` : ""}
          </p>
          <form action={reopenListAction}>
            <button type="submit">Wieder öffnen</button>
          </form>
        </section>
      ) : (
        <section>
          {/* Auto-suggest: shown only when all entries are checked (never on an empty list). */}
          {suggestComplete && <p>Alle Einträge sind abgehakt. Liste abschließen?</p>}
          <form action={completeListAction}>
            <button type="submit">Liste abschließen</button>
          </form>
        </section>
      )}

      {/* Add-entry form: name is required, the value fields are optional. The name input is wired to
          a native <datalist> (server-rendered from the project catalog) for zero-JS autocomplete —
          MVP design §4.4. Category/unit are left to inherit from the catalog default at add time, so
          leaving them blank still fills them on the created entry (flow-back keeps them current). */}
      <datalist id="catalog-suggestions">
        {suggestions.map((s) => (
          // Only the value is needed — the browser inserts it into the input on selection.
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      <form action={addItem}>
        <input name="name" placeholder="Artikel" aria-label="Artikel" list="catalog-suggestions" />
        <input name="quantity" placeholder="Menge" aria-label="Menge" inputMode="decimal" />
        <input name="unit" placeholder="Einheit" aria-label="Einheit" />
        <input name="category" placeholder="Kategorie" aria-label="Kategorie" />
        <button type="submit">Hinzufügen</button>
      </form>

      {/* Entries grouped by category (render-time grouping over the sortIndex order). */}
      {[...groups.entries()].map(([category, items]) => (
        <section key={category}>
          <h2>{category}</h2>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {/* Check/uncheck: the button submits the OPPOSITE of the current state. */}
                <form action={toggleItem} style={{ display: "inline" }}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="checked" value={item.checked ? "false" : "true"} />
                  <button type="submit" aria-label={item.checked ? "Abhaken rückgängig" : "Abhaken"}>
                    {item.checked ? "☑" : "☐"}
                  </button>
                </form>{" "}
                {/* The display name comes from the catalog item (article identity). */}
                <span style={{ textDecoration: item.checked ? "line-through" : "none" }}>
                  {item.catalogItem.name}
                  {/* Quantity/unit only when present — e.g. "Milch — 1,5 l". */}
                  {item.quantity !== null &&
                    ` — ${item.quantity.toLocaleString("de-DE")}${item.unit ? ` ${item.unit}` : ""}`}
                  {item.quantity === null && item.unit ? ` — ${item.unit}` : ""}
                </span>{" "}
                <form action={removeItem} style={{ display: "inline" }}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button type="submit">Löschen</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2>Liste löschen</h2>
      <form action={removeList}>
        <button type="submit">Liste löschen</button>
      </form>
    </main>
  );
}
