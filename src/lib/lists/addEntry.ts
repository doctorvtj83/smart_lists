import type { List, ListItem, PrismaClient } from "@prisma/client";
import { normalizeName } from "@/lib/catalog/normalize";
import { UNCATEGORIZED_LABEL } from "./categories";
import { applyOperation } from "./operations";

/**
 * The trailing entry row's whole server-side meaning, in one function.
 *
 * The row itself only knows a name and which chip is active. Turning that into
 * an `add_item` operation involves two decisions the UI must not make on its
 * own, because both depend on catalog state:
 *
 *  1. WHICH CATEGORY the entry gets (handoff §10: the active chip overrides the
 *     catalog default; „Alle" inherits it).
 *  2. WHETHER THE ENTRY SHEET MUST OPEN — the design's „Neuer, unbekannter
 *     Artikel ohne Kategorie → Eintrag-Sheet öffnet sich direkt". "Unbekannt"
 *     has to be read BEFORE the add, because add_item creates the article as a
 *     side effect and afterwards everything looks known.
 *
 * Deliberately a thin wrapper around `applyOperation` rather than its own write:
 * the operations funnel stays the only way entries are created, so idempotent
 * replay, catalog get-or-create and flow-back all still apply (MVP design §4.5).
 */

export interface AddEntryFromRowInput {
  /** Client-generated UUID — the entry's stable identity (MVP design §3). */
  itemId: string;
  /** Exactly what the user typed. The catalog only ever receives the NAME. */
  name: string;
  /**
   * The active filter chip, or `null` for „Alle". `UNCATEGORIZED_LABEL` means the
   * user is filtered to the uncategorized bucket and wants the entry to stay
   * there — which is an explicit "no category", not "inherit".
   */
  activeCategory: string | null;
}

export interface AddEntryFromRowResult {
  item: ListItem;
  /** The cue for the UI to open the entry sheet on the category chips. */
  needsCategory: boolean;
}

export async function addEntryFromRow(
  db: PrismaClient,
  list: List,
  input: AddEntryFromRowInput,
): Promise<AddEntryFromRowResult> {
  // Read the article BEFORE adding: add_item creates it on first use, so after
  // the write there is no way left to tell a new article from an old one.
  const normalizedName = normalizeName(input.name);
  const knownArticle = normalizedName
    ? await db.catalogItem.findUnique({
        where: { projectId_normalizedName: { projectId: list.projectId, normalizedName } },
      })
    : null;

  // The three-way category rule. `undefined` is meaningful in add_item: it means
  // "not supplied", which is what makes the entry inherit the catalog default.
  const category =
    input.activeCategory === null
      ? undefined
      : input.activeCategory === UNCATEGORIZED_LABEL
        ? null
        : input.activeCategory;

  const item = await applyOperation(db, list, {
    op: "add_item",
    itemId: input.itemId,
    name: input.name,
    category,
  });

  // applyOperation returns null only for remove_item. Asserting it loudly beats
  // a non-null assertion, which would hide a future contract change.
  if (!item) throw new Error("add_item must return the created entry");

  return {
    item,
    // Both halves matter: a KNOWN article without a category is a choice the user
    // already made, and a new article that inherited a chip needs no prompt.
    needsCategory: knownArticle === null && item.category === null,
  };
}
