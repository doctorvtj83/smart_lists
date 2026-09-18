import { ApiError } from "@/lib/http/errors";
import { formatQuantityLabel } from "@/lib/format/quantity";

/**
 * Turning a completed list into a recipe draft (spec §7), as a pure function.
 *
 * Why pure: the flow it serves is a three-step sheet whose middle step is fully editable, and the
 * rules that can reject it — a duplicate article, an empty selection, a nonsense amount — are
 * exactly the ones a user hits repeatedly. Proving them without a database is what makes them
 * cheap to get right, and it is the same seam discipline `expandRecipe` follows on the way in.
 */

/** One row of the completed list, as the sheet presents it. */
export interface DerivableEntry {
  id: string;
  catalogItemId: string;
  /** The ARTICLE's display name — a ListItem has no name column (MVP design §3.1). */
  name: string;
  quantity: number | null;
  unit: string | null;
}

/** One ticked row, carrying the amount the user edited in step ② (D6). */
export interface DerivedLineInput {
  entryId: string;
  /** Already parsed with parseGermanDecimal; null = cleared = „just add it“ (D4). */
  quantity: number | null;
  unit: string | null;
}

/** One line of the recipe about to be created. `sortIndex` is implied by the array position. */
export interface RecipeDraftLine {
  catalogItemId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

/**
 * Validates a selection of list entries and orders it into recipe lines.
 *
 * THE RULE THAT NEEDS EXPLAINING — the duplicate refusal. A list may legitimately hold „1 l Milch“
 * and „500 ml Milch“ as two rows, because D1 refuses to merge across units. A recipe cannot:
 * `@@unique([recipeId, catalogItemId])` allows one line per article, and two lines would be
 * ambiguous under the multiplier anyway. Silently picking one of them would LOSE data the user can
 * see on screen, so the flow stops and says which article and which two amounts (spec §7).
 *
 * Ordering follows the ENTRIES, not the selection: a recipe built from a well-ordered list should
 * read in that order, and the order rows happened to be ticked in carries no meaning.
 */
export function buildRecipeFromEntries(
  entries: DerivableEntry[],
  selections: DerivedLineInput[],
): RecipeDraftLine[] {
  // An empty selection is the one case with no useful partial answer (spec §7).
  if (selections.length === 0) throw new ApiError(400, "Wähle mindestens einen Artikel");

  // Index the edits by entry id so the ordering loop below can stay a single pass over `entries`.
  const edits = new Map(selections.map((selection) => [selection.entryId, selection]));

  // Every selected id must belong to this list. A crafted form field naming a foreign entry is a
  // 404 for the same existence-hiding reason a foreign recipe id is.
  const known = new Set(entries.map((entry) => entry.id));
  for (const entryId of edits.keys()) {
    if (!known.has(entryId)) throw new ApiError(404, "Eintrag nicht gefunden");
  }

  const lines: RecipeDraftLine[] = [];
  // Remembers the FIRST selected row per article, so the duplicate message can quote both amounts.
  const byArticle = new Map<string, DerivableEntry>();

  for (const entry of entries) {
    const edit = edits.get(entry.id);
    if (!edit) continue; // not ticked

    const previous = byArticle.get(entry.catalogItemId);
    if (previous) {
      // Quote the amounts as they appear ON THE LIST, not as edited: those are what the user is
      // looking at while deciding which row to drop.
      const a = formatQuantityLabel(previous.quantity, previous.unit);
      const b = formatQuantityLabel(entry.quantity, entry.unit);
      // A row with neither quantity nor unit formats to "" — „(  und 500 ml)“ would read as a
      // rendering bug, so the parenthetical is dropped whenever it cannot be complete.
      const amounts = a && b ? ` (${a} und ${b})` : "";
      throw new ApiError(
        409,
        `${entry.name} ist zweimal ausgewählt${amounts} — bitte nur eine Zeile wählen`,
      );
    }
    byArticle.set(entry.catalogItemId, entry);

    // The same rule and the same sentence `addRecipeItem` uses, applied before anything is written
    // so the sheet can show it next to the field. NaN reaches here from parseGermanDecimal on
    // purpose — see quantity.ts.
    if (edit.quantity !== null && (!Number.isFinite(edit.quantity) || edit.quantity <= 0)) {
      throw new ApiError(400, "Menge muss eine positive Zahl sein");
    }

    const unit = edit.unit?.trim();
    lines.push({
      catalogItemId: entry.catalogItemId,
      name: entry.name,
      quantity: edit.quantity,
      // "" would be a unit the recipe row would then try to render.
      unit: unit ? unit : null,
    });
  }

  return lines;
}
